import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadyCsv,
  canonicalizeHeader,
  cleanDataset,
  createAuditTrail,
  hasRequiredMappings,
  normalizeCompany,
  normalizeEmail,
  normalizePhone,
  parseCsv,
  suggestColumnMapping,
  summarizeResults
} from "../src/domain.mjs";

test("parses quoted CSV cells and records source rows", () => {
  const parsed = parseCsv('Company,Email\n"North, Studio",hello@north.example');
  assert.deepEqual(parsed.headers, ["Company", "Email"]);
  assert.equal(parsed.rows[0].Company, "North, Studio");
  assert.equal(parsed.rows[0].__row, 2);
});

test("rejects malformed CSV with an unclosed quote", () => {
  assert.throws(() => parseCsv('Company,Email\n"North,hello@north.example'), /unclosed/i);
});

test("suggests deterministic mappings from common header aliases", () => {
  const mapping = suggestColumnMapping(["Company Name", "Full_Name", "E-mail", "Mobile", "Market"]);
  assert.deepEqual(mapping, {
    company: "Company Name",
    contact: "Full_Name",
    email: "E-mail",
    phone: "Mobile",
    country: "Market"
  });
  assert.equal(hasRequiredMappings(mapping), true);
});

test("normalizes core values without inventing missing data", () => {
  assert.equal(canonicalizeHeader("  Company_Name "), "company name");
  assert.equal(normalizeCompany("  nord  studio gmbh "), "nord studio GMBH");
  assert.equal(normalizeEmail(" Sales@Studio.Example "), "sales@studio.example");
  assert.equal(normalizePhone("+49 000 000 0000", "DE"), "+490000000000");
  assert.equal(normalizePhone("", "DE"), "");
});

test("classifies ready, review and rejected rows with explicit reasons", () => {
  const rows = [
    { __row: 2, Company: "North", Email: "a@north.example", Phone: "+49 000 000 0000", Country: "DE" },
    { __row: 3, Company: "East", Email: "b@east.example", Phone: "123", Country: "DE" },
    { __row: 4, Company: "West", Email: "not-an-email", Phone: "", Country: "GB" }
  ];
  const results = cleanDataset(rows, { company: "Company", email: "Email", phone: "Phone", country: "Country" });
  assert.deepEqual(results.map(({ status }) => status), ["ready", "review", "rejected"]);
  assert.deepEqual(results[1].reasons, ["INVALID_PHONE"]);
  assert.deepEqual(results[2].reasons, ["INVALID_EMAIL"]);
});

test("detects duplicate emails after normalization", () => {
  const rows = [
    { __row: 8, Company: "A", Email: "Team@company.example" },
    { __row: 9, Company: "A", Email: " team@company.example " }
  ];
  const results = cleanDataset(rows, { company: "Company", email: "Email" });
  assert.equal(results[0].status, "ready");
  assert.equal(results[1].status, "rejected");
  assert.deepEqual(results[1].reasons, ["DUPLICATE_OF_ROW_8"]);
});

test("summarizes classifications without mutating results", () => {
  const results = [{ status: "ready" }, { status: "ready" }, { status: "review" }, { status: "rejected" }];
  const snapshot = structuredClone(results);
  assert.deepEqual(summarizeResults(results), { total: 4, ready: 2, review: 1, rejected: 1 });
  assert.deepEqual(results, snapshot);
});

test("exports only ready normalized rows with CSV escaping", () => {
  const csv = buildReadyCsv([
    { status: "ready", normalized: { company: "North, Studio", contact: "Mara", email: "m@sample.example", phone: "+49123", country: "DE" } },
    { status: "review", normalized: { company: "Skip", contact: "", email: "s@sample.example", phone: "", country: "" } }
  ]);
  assert.match(csv, /^company,contact,email,phone,country\n/);
  assert.match(csv, /"North, Studio",Mara,m@sample\.example,'\+49123,DE/);
  assert.doesNotMatch(csv, /Skip/);
});

test("neutralizes spreadsheet formula prefixes only in the CSV export", () => {
  const normalized = {
    company: "=1+1",
    contact: "@SUM(A1:A2)",
    email: "safe@fixture.example",
    phone: "  +49123",
    country: "\t-1"
  };
  const record = { status: "ready", normalized: { ...normalized } };
  const csv = buildReadyCsv([record]);

  assert.equal(csv.split("\n")[1], "'=1+1,'@SUM(A1:A2),safe@fixture.example,'  +49123,'\t-1");
  assert.deepEqual(record.normalized, normalized);
});

test("leaves an ordinary minus inside an exported value unchanged", () => {
  const csv = buildReadyCsv([
    { status: "ready", normalized: { company: "North - West", contact: "Mara", email: "m@fixture.example", phone: "", country: "DE" } }
  ]);

  assert.equal(csv.split("\n")[1], "North - West,Mara,m@fixture.example,,DE");
});

test("creates an audit trail that records no external action", () => {
  const audit = createAuditTrail(
    [{ status: "ready" }, { status: "review" }, { status: "rejected" }],
    "leads.csv",
    "2026-08-19T10:00:00.000Z"
  );
  assert.equal(audit.length, 4);
  assert.equal(audit[0].detail, "leads.csv · 3 rows");
  assert.equal(audit.at(-1).detail, "1 ready · 1 review");
  assert.equal(audit.some((entry) => "external" in entry), false);
});

test("requires both company and email mappings", () => {
  assert.equal(hasRequiredMappings({ company: "Company", email: "Email" }), true);
  assert.equal(hasRequiredMappings({ company: "Company", email: "" }), false);
});
