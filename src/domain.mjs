const HEADER_ALIASES = Object.freeze({
  company: ["company", "company name", "organization", "organisation", "business"],
  contact: ["contact", "contact name", "full name", "name", "person"],
  email: ["email", "email address", "e mail", "mail"],
  phone: ["phone", "phone number", "telephone", "mobile"],
  country: ["country", "market", "region"]
});

const REQUIRED_FIELDS = Object.freeze(["company", "email"]);

export function canonicalizeHeader(value = "") {
  return String(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function parseCsv(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text).replace(/\r\n?/g, "\n");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (character === "\n" && !quoted) {
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((value) => value.trim());
  const records = rows.slice(1).map((values, rowIndex) => {
    const record = { __row: rowIndex + 2 };
    headers.forEach((header, columnIndex) => {
      record[header] = values[columnIndex] ?? "";
    });
    return record;
  });

  return { headers, rows: records };
}

export function suggestColumnMapping(headers = []) {
  const normalized = headers.map((header) => ({ raw: header, key: canonicalizeHeader(header) }));
  return Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([target, aliases]) => {
      const match = normalized.find(({ key }) => aliases.includes(key));
      return [target, match?.raw ?? ""];
    })
  );
}

export function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

export function normalizePhone(value = "", country = "") {
  const raw = String(value).trim();
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  const normalizedCountry = String(country).trim().toUpperCase();
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (normalizedCountry === "DE" && digits.startsWith("0")) digits = `49${digits.slice(1)}`;
  if (normalizedCountry === "GB" && digits.startsWith("0")) digits = `44${digits.slice(1)}`;
  if (normalizedCountry === "US" && digits.length === 10) digits = `1${digits}`;
  return digits ? `+${digits}` : "";
}

export function normalizeCompany(value = "") {
  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b(gmbh|ltd|llc|inc)\b/gi, (suffix) => suffix.toUpperCase());
}

export function cleanDataset(rows = [], mapping = {}) {
  const seen = new Map();

  return rows.map((source, index) => {
    const normalized = {
      company: normalizeCompany(source[mapping.company] ?? ""),
      contact: String(source[mapping.contact] ?? "").trim().replace(/\s+/g, " "),
      email: normalizeEmail(source[mapping.email] ?? ""),
      phone: normalizePhone(source[mapping.phone] ?? "", source[mapping.country] ?? ""),
      country: String(source[mapping.country] ?? "").trim().toUpperCase()
    };

    const reasons = [];
    if (!normalized.company) reasons.push("MISSING_COMPANY");
    if (!normalized.email) reasons.push("MISSING_EMAIL");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) reasons.push("INVALID_EMAIL");
    if (normalized.phone && normalized.phone.replace(/\D/g, "").length < 8) reasons.push("INVALID_PHONE");

    const key = normalized.email || `${canonicalizeHeader(normalized.company)}|${normalized.phone}`;
    if (key && seen.has(key)) reasons.push(`DUPLICATE_OF_ROW_${seen.get(key)}`);
    else if (key) seen.set(key, source.__row ?? index + 2);

    const blocking = reasons.some((reason) => reason.startsWith("MISSING_") || reason === "INVALID_EMAIL");
    const duplicate = reasons.some((reason) => reason.startsWith("DUPLICATE_"));
    const status = duplicate || blocking ? "rejected" : reasons.length ? "review" : "ready";

    return {
      row: source.__row ?? index + 2,
      source,
      normalized,
      status,
      reasons: reasons.length ? reasons : ["NORMALIZED"]
    };
  });
}

export function summarizeResults(results = []) {
  return results.reduce(
    (summary, result) => {
      summary.total += 1;
      summary[result.status] += 1;
      return summary;
    },
    { total: 0, ready: 0, review: 0, rejected: 0 }
  );
}

export function createAuditTrail(results = [], fileName = "local.csv", timestamp = "2026-08-19T08:00:00.000Z") {
  const summary = summarizeResults(results);
  return [
    { at: timestamp, event: "FILE_PARSED", detail: `${fileName} · ${summary.total} rows` },
    { at: timestamp, event: "RULES_APPLIED", detail: "Whitespace, casing, phone and email normalization" },
    { at: timestamp, event: "DEDUPE_COMPLETED", detail: `${summary.rejected} rejected · deterministic key` },
    { at: timestamp, event: "EXPORT_READY", detail: `${summary.ready} ready · ${summary.review} review` }
  ];
}

const SPREADSHEET_FORMULA_PREFIX = /^[\s\p{Cc}\p{Cf}]*[=+\-@]/u;

function escapeCsv(value) {
  const source = String(value ?? "");
  const text = SPREADSHEET_FORMULA_PREFIX.test(source) ? `'${source}` : source;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildReadyCsv(results = []) {
  const headers = ["company", "contact", "email", "phone", "country"];
  const rows = results
    .filter(({ status }) => status === "ready")
    .map(({ normalized }) => headers.map((header) => escapeCsv(normalized[header])).join(","));
  return [headers.join(","), ...rows].join("\n");
}

export function hasRequiredMappings(mapping = {}) {
  return REQUIRED_FIELDS.every((field) => Boolean(mapping[field]));
}
