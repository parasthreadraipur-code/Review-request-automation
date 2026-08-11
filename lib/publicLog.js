import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const LOG_FILE = fileURLToPath(new URL("../docs/log.json", import.meta.url));
const SUMMARY_FILE = fileURLToPath(new URL("../docs/summary.json", import.meta.url));
const MAX_LOG_ENTRIES = 2000; // keeps the repo/page from growing unbounded

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function appendLogEntry(entry) {
  ensureDir(LOG_FILE);
  let log = [];
  try {
    log = JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  } catch {
    // no log yet
  }
  log.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (log.length > MAX_LOG_ENTRIES) log = log.slice(0, MAX_LOG_ENTRIES);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

export function writeSummary(summary) {
  ensureDir(SUMMARY_FILE);
  fs.writeFileSync(
    SUMMARY_FILE,
    JSON.stringify({ ...summary, lastRunAt: new Date().toISOString() }, null, 2)
  );
}
