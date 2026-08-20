# Implementation notes

## The pipeline

The interface is a thin layer over functions in `src/domain.mjs`:

1. `parseCsv` handles quoted fields, escaped quotes and source row numbers.
2. `suggestColumnMapping` matches a short, explicit alias list. It does not use fuzzy guesses.
3. `cleanDataset` normalizes values, records rule reasons and classifies each row.
4. `buildReadyCsv` exports only the `ready` queue and escapes CSV values again.

At export time only, cells whose first non-whitespace/control character is `=`, `+`, `-` or `@` receive a leading apostrophe. This keeps spreadsheet applications from interpreting imported text as a formula without changing the normalized values shown in the workspace.

That split keeps the cleanup rules testable without a browser.

## Decisions I would discuss before a real import

- A short phone number is **review**, not rejection. Some internal extensions are legitimate, so the tool refuses to invent a replacement.
- A malformed email is blocking because it is also the primary duplicate key in this recipe.
- Duplicate detection happens after trimming and lowercasing email addresses.
- Missing company or email values are blocking. The source row stays visible for correction.
- Country-specific phone handling currently covers DE, GB and US prefixes. Other values keep their digits and leading `+` but need connector-specific rules before production use.

## Local data boundary

The selected file is read with the browser File API. Processing happens in memory. Downloads are created with object URLs, and the application makes no fetch request or external write.

## Checks

`tests/domain.test.mjs` covers parsing, mapping, normalization, classification, duplicate detection, summaries, CSV escaping and audit generation. `scripts/verify-evidence.mjs` adds a fixture-level guard: it runs the checked-in awkward CSV through the same domain functions and compares both output queues with the expected files.

## Known edges

- Delimiter detection is intentionally out of scope; input is comma-delimited CSV.
- Duplicate rules use normalized email first, then company plus phone when email is absent.
- The browser session is not durable storage.
- A production connector would need authentication, permission checks, idempotency and an agreed retention policy.
