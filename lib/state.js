import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const STATE_FILE = fileURLToPath(new URL("../state/requested-orders.json", import.meta.url));

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(state) {
  ensureDir(STATE_FILE);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function hasBeenRequested(orderId) {
  return Boolean(load()[orderId]);
}

export function markAsRequested(orderId) {
  const state = load();
  state[orderId] = new Date().toISOString();
  save(state);
}

export function totalRequestedCount() {
  return Object.keys(load()).length;
}
