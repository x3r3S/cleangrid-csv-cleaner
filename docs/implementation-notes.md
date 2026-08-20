# Implementation notes

## The pipeline

The interface is a thin layer over functions in `src/domain.mjs`:

1. `parseCsv` handles quoted fields, escaped quotes and source row numbers.
2. `suggestColumnMapping` matches a short, explicit alias list. It does not use fuzzy guesses.
3. `cleanDataset` normalizes values, records rule reasons and classifies each row. The UI calls it only when Company and Email are mapped, so an incomplete schema cannot masquerade as eight bad records.
4. `buildReadyCsv` exports only the `ready` queue and escapes CSV values again.

At export time only, cells whose first non-whitespace/control character is `=`, `+`, `-` or `@` receive a leading apostrophe. This keeps spreadsheet applications from interpreting imported text as a formula without changing the normalized values shown in the workspace.

That split keeps the cleanup rules testable without a browser.

## Decisions I would discuss before a real import

- A phone outside the conservative E.164 shape (`+`, non-zero first digit, 8–15 digits) is **review**, not rejection. The placeholder check is exact: after punctuation is removed from the source, eight or more copies of one digit with no other digit are also held. This is format triage only; it does not verify country allocation, carriers or reachability.
- A malformed email is blocking because it is also the primary duplicate key in this recipe.
- Duplicate detection happens after trimming and lowercasing email addresses.
- Missing company or email values are blocking. The source row stays visible for correction.
- Country-specific phone handling currently covers DE, GB and US prefixes. Other values keep their digits and leading `+` but need connector-specific rules before production use.

## Local data boundary

The selected file is read with the browser File API. Processing happens in memory. Downloads are created with object URLs, and the application makes no fetch request or external write.

## Checks

`tests/domain.test.mjs` covers parsing, mapping, normalization, phone-shape rules, classification, duplicate detection, summaries, CSV escaping and audit generation. `scripts/verify-evidence.mjs` adds a fixture-level guard: it runs the checked-in awkward CSV through the same domain functions and compares both output queues with the expected files.

The browser suite covers integration seams the domain tests cannot see. It changes Company and Email to **Not mapped**, checks the live `4/5` status, disabled ready export, and pending audit download, restores each mapping, and reads the downloaded ready CSV. It asserts the accessible name of all five mapping selects, the visible Source and CI links at desktop and 390 × 844 viewports, their exact destinations, and the absence of global page overflow at 390 px. These are specific regressions, not an accessibility certification.

## Known edges

- Delimiter detection is intentionally out of scope; input is comma-delimited CSV.
- Duplicate rules use normalized email first, then company plus phone when email is absent.
- The browser session is not durable storage.
- Phone validation is shape-level. A production import would need an agreed numbering library and, only with permission, an external verification service.
- A production connector would need authentication, permission checks, idempotency and an agreed retention policy.
