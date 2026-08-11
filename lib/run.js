import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getRecentShippedOrders,
  isEligibleForReviewRequest,
  requestReview,
} from "./spapi.js";
import { hasBeenRequested, markAsRequested, totalRequestedCount } from "./state.js";
import { appendLogEntry, writeSummary } from "./publicLog.js";

const ORDERS_CACHE_FILE = fileURLToPath(new URL("../state/orders-cache.json", import.meta.url));
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

/**
 * The Orders endpoint has a very slow refill rate. Since the order list
 * barely changes minute to minute, we cache it and only re-fetch once the
 * cache goes stale, rather than re-paginating hundreds of orders on every
 * scheduled run.
 */
async function getOrdersWithCache(lookbackDays, marketplaceId, forceRefresh, log) {
  if (!forceRefresh) {
    try {
      const cached = JSON.parse(fs.readFileSync(ORDERS_CACHE_FILE, "utf-8"));
      const age = Date.now() - cached.fetchedAt;
      if (age < CACHE_MAX_AGE_MS) {
        log(`Using cached order list (${Math.round(age / 60000)} min old, ${cached.orders.length} orders).`);
        return cached.orders;
      }
    } catch {
      // no cache yet
    }
  }

  log(`Scanning shipped orders from the last ${lookbackDays} day(s)...`);
  const orders = await getRecentShippedOrders(lookbackDays, marketplaceId);
  ensureDir(ORDERS_CACHE_FILE);
  fs.writeFileSync(ORDERS_CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), orders }, null, 2));
  return orders;
}

/**
 * Runs one full pass: fetch orders -> check eligibility -> send requests -> log.
 * No artificial cap on how many orders get processed by default — every
 * eligible order in the scan window gets a request, unless you set
 * MAX_REQUESTS_PER_RUN explicitly as a safety limit.
 */
export async function runAutomation({ dryRun, forceRefresh, log }) {
  const marketplaceId = process.env.MARKETPLACE_ID;
  const lookbackDays = Number(process.env.LOOKBACK_DAYS || 15);
  const maxPerRun = Number(process.env.MAX_REQUESTS_PER_RUN || 100000); // effectively unlimited unless set

  const orders = await getOrdersWithCache(lookbackDays, marketplaceId, forceRefresh, log);
  log(`Found ${orders.length} shipped order(s) in window.`);

  let sent = 0;
  let skippedAlreadyRequested = 0;
  let skippedNotEligible = 0;
  let skippedErrors = 0;

  for (const order of orders) {
    if (sent >= maxPerRun) {
      log(`Hit MAX_REQUESTS_PER_RUN (${maxPerRun}), stopping this run.`);
      break;
    }

    const orderId = order.AmazonOrderId;

    if (hasBeenRequested(orderId)) {
      skippedAlreadyRequested++;
      continue;
    }

    let eligible;
    try {
      eligible = await isEligibleForReviewRequest(orderId, marketplaceId);
    } catch (err) {
      const msg = JSON.stringify(err.response?.data) || err.message;
      log(`Skipping order ${orderId} — eligibility check failed: ${msg}`);
      skippedErrors++;
      continue;
    }
    await sleep(1200); // Solicitations API has a very low rate limit

    if (!eligible) {
      skippedNotEligible++;
      continue;
    }

    if (dryRun) {
      log(`[DRY RUN] Would request review for order ${orderId}`);
      sent++;
    } else {
      try {
        await requestReview(orderId, marketplaceId);
        await sleep(1200);
        log(`Requested review for order ${orderId}`);
        markAsRequested(orderId);
        appendLogEntry({ orderId, status: "sent" });
        sent++;
      } catch (err) {
        const msg = JSON.stringify(err.response?.data) || err.message;
        log(`Skipping order ${orderId} — send failed: ${msg}`);
        appendLogEntry({ orderId, status: "error", message: msg });
        skippedErrors++;
      }
    }
  }

  const summary = {
    sent,
    skippedAlreadyRequested,
    skippedNotEligible,
    skippedErrors,
    totalRequestedAllTime: totalRequestedCount(),
  };

  log("\n--- Summary ---");
  log(`Requests sent: ${summary.sent}`);
  log(`Skipped (already requested): ${summary.skippedAlreadyRequested}`);
  log(`Skipped (not yet eligible): ${summary.skippedNotEligible}`);
  log(`Skipped (errors): ${summary.skippedErrors}`);
  log(`Total requested all-time: ${summary.totalRequestedAllTime}`);

  if (!dryRun) writeSummary(summary);

  return summary;
}
