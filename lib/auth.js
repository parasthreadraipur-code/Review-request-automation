import axios from "axios";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

let cachedToken = null;
let cachedTokenExpiry = 0;

export async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  const { LWA_CLIENT_ID, LWA_CLIENT_SECRET, LWA_REFRESH_TOKEN } = process.env;

  if (!LWA_CLIENT_ID || !LWA_CLIENT_SECRET || !LWA_REFRESH_TOKEN) {
    throw new Error(
      "Missing LWA credentials. Check LWA_CLIENT_ID, LWA_CLIENT_SECRET, and LWA_REFRESH_TOKEN are set (in .env locally, or as repo Secrets on GitHub)."
    );
  }

  const response = await axios.post(
    LWA_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: LWA_REFRESH_TOKEN,
      client_id: LWA_CLIENT_ID,
      client_secret: LWA_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = response.data.access_token;
  cachedTokenExpiry = now + (response.data.expires_in - 120) * 1000;

  return cachedToken;
}
