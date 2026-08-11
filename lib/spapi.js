import axios from "axios";
import { getAccessToken } from "./auth.js";

function baseUrl() {
  return process.env.SPAPI_BASE_URL || "https://sellingpartnerapi-eu.amazon.com";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a request a few times with growing delays if Amazon says we've
 * exceeded quota. Orders and Solicitations each have their own separate,
 * fairly strict rate limit, so this wraps any call rather than being
 * specific to one endpoint.
 */
async function withQuotaRetry(fn, { retries = 6, baseDelayMs = 5000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = err.response?.data?.errors?.[0]?.code;
      if (code === "QuotaExceeded" && attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 5s,10s,20s,40s,80s,160s
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

async function spapiGet(path, params) {
  return withQuotaRetry(async () => {
    const accessToken = await getAccessToken();
    const response = await axios.get(`${baseUrl()}${path}`, {
      params,
      headers: { "x-amz-access-token": accessToken },
    });
    return response.data;
  });
}

async function spapiPost(path, body) {
  return withQuotaRetry(async () => {
    const accessToken = await getAccessToken();
    const response = await axios.post(`${baseUrl()}${path}`, body || {}, {
      headers: { "x-amz-access-token": accessToken },
    });
    return response.data;
  });
}

/**
 * Fetches ALL orders shipped within the lookback window, following
 * pagination until Amazon has no more pages — no artificial cap on how
 * many orders get pulled in.
 */
export async function getRecentShippedOrders(lookbackDays, marketplaceId) {
  const createdAfter = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  let orders = [];
  let nextToken = null;

  do {
    const params = nextToken
      ? { NextToken: nextToken }
      : {
          MarketplaceIds: marketplaceId,
          OrderStatuses: "Shipped",
          CreatedAfter: createdAfter,
        };

    const data = await spapiGet("/orders/v0/orders", params);
    const payload = data.payload || {};
    orders = orders.concat(payload.Orders || []);
    nextToken = payload.NextToken || null;
    if (nextToken) {
      await sleep(1500); // space out pagination pages — Orders API is tightly rate-limited
    }
  } while (nextToken);

  return orders;
}

/**
 * Asks Amazon directly whether an order is currently eligible for a review
 * request. This is the authoritative check — Amazon knows real delivery
 * data that we structurally can't access ourselves, so we defer to it
 * entirely rather than approximating a delivery-based timer.
 */
export async function isEligibleForReviewRequest(amazonOrderId, marketplaceId) {
  try {
    const data = await spapiGet(
      `/solicitations/v1/orders/${amazonOrderId}`,
      { marketplaceIds: marketplaceId }
    );
    const actions = (data._links?.actions || []).map((a) => a.name);
    return actions.includes("productReviewAndSellerFeedback");
  } catch (err) {
    if (err.response?.status === 404) {
      return false;
    }
    throw err;
  }
}

export async function requestReview(amazonOrderId, marketplaceId) {
  return spapiPost(
    `/solicitations/v1/orders/${amazonOrderId}/solicitations/productReviewAndSellerFeedback`,
    { marketplaceIds: [marketplaceId] }
  );
}
