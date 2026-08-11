import "dotenv/config";
import { runAutomation } from "./lib/run.js";

const dryRun = process.argv.includes("--dry-run");
const forceRefresh = process.argv.includes("--refresh-orders");

runAutomation({ dryRun, forceRefresh, log: console.log }).catch((err) => {
  console.error("Run failed:", err.response?.data || err.message);
  process.exit(1);
});
