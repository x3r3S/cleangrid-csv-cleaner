import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildReadyCsv,
  cleanDataset,
  parseCsv,
  suggestColumnMapping,
  summarizeResults
} from "../src/domain.mjs";

const readRelative = (path) => readFile(new URL(path, import.meta.url), "utf8");

const sourceCsv = await readRelative("../evidence/input/messy-customer-import.csv");
const expectedReadyCsv = (await readRelative("../evidence/expected/ready.csv")).trimEnd();
const expectedHeld = JSON.parse(await readRelative("../evidence/expected/review-and-rejected.json"));

const parsed = parseCsv(sourceCsv);
const mapping = suggestColumnMapping(parsed.headers);
const results = cleanDataset(parsed.rows, mapping);
const summary = summarizeResults(results);
const heldRows = results
  .filter(({ status }) => status !== "ready")
  .map(({ row, normalized, status, reasons }) => ({
    row,
    company: normalized.company,
    email: normalized.email,
    status,
    reasons
  }));

assert.deepEqual(summary, expectedHeld.summary, "classification summary changed");
assert.deepEqual(heldRows, expectedHeld.heldRows, "review/rejected evidence changed");
assert.equal(buildReadyCsv(results), expectedReadyCsv, "ready export changed");

console.log("CleanGrid evidence verified");
console.log(`Rows: ${summary.total} | ready: ${summary.ready} | review: ${summary.review} | rejected: ${summary.rejected}`);
console.log(`Fixture: ${fileURLToPath(new URL("../evidence/input/messy-customer-import.csv", import.meta.url))}`);
