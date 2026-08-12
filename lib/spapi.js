import axios from "axios";
import { getAccessToken } from "./auth.js";

function baseUrl() {
  return process.env.SPAPI_BASE_URL || "https://sellingpartnerapi-eu.amazon.com";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withQuotaRetry(fn, { retries = 6, baseDelayMs = 5000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = err.response?.data?.errors?.[0]?.code;
      if (code === "QuotaExceeded" && attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
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

async function spapiPost(path, params) {
  return withQuotaRetry(async () => {
    const accessToken = await getAccessToken();
    const response = await axios.post(`${baseUrl()}${path}`, {}, {
      params,
      headers: {
        "x-amz-access-token": accessToken,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  });
}
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
      await sleep(1500);
    }
  } while (nextToken);

  return orders;
}

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
    { marketplaceIds: marketplaceId }
  );
}
