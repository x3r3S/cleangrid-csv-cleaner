# Implementation notes

## The pipeline

The interface is a thin layer over functions in `src/domain.mjs`:

1. `parseCsv` handles quoted fields, escaped quotes and source row numbers.
2. `suggestColumnMapping` matches a short, explicit alias list. It does not use fuzzy guesses.
3. `cleanDataset` normalizes values, records rule reasons and classifies each row. The UI calls it only when Company and Email are mapped, so an incomplete required schema cannot masquerade as eight bad records. Contact, Phone and Country are optional: if one is not mapped, its normalized value remains blank and the audit records that exact skip.
4. `buildReadyCsv` exports only the `ready` queue and escapes CSV values again.

At export time only, cells whose first non-whitespace/control character is `=`, `+`, `-` or `@` receive a leading apostrophe. This keeps spreadsheet applications from interpreting imported text as a formula without changing the normalized values shown in the workspace.

That split keeps the cleanup rules testable without a browser.

## Decisions I would discuss before a real import

- A phone outside the conservative E.164 shape (`+`, non-zero first digit, 8–15 digits) is **review**, not rejection. The placeholder check is exact: after punctuation is removed from the source, eight or more copies of one digit with no other digit are also held. This is format triage only; it does not verify country allocation, carriers or reachability.
- A malformed email is blocking because it is also the primary duplicate key in this recipe.
- Duplicate detection happens after trimming and lowercasing email addresses.
- Missing company or email values are blocking. The source row stays visible for correction.
- Missing Company or Email mappings pause the entire classification and ready export. Missing Contact, Phone or Country mappings do not; the UI and audit name the optional field skipped. When Phone is skipped, no phone validation result is implied and the audit says its normalization and E.164-shape checks did not run.
- Country-specific phone handling currently covers DE, GB and US prefixes. Other values keep their digits and leading `+` but need connector-specific rules before production use.

## Local data boundary

The selected file is read with the browser File API. Processing happens in memory. Downloads are created with object URLs, and the application makes no fetch request or external write.

The visible file picker is a native file input occupying the complete button surface rather than a `display: none` input behind a non-focusable label. This keeps the OS chooser in normal keyboard order and preserves Enter/Space activation. The records table is a labelled, focusable horizontal-scroll region; at mobile widths a visible hint names the off-screen Status and Rule result columns.

## Checks

`tests/domain.test.mjs` covers parsing, required/optional mapping coverage, normalization, phone-shape rules, classification, duplicate detection, summaries, CSV escaping and audit generation. It also proves that skipping Phone avoids phone classification and that restoring it brings the review result and full audit wording back. `scripts/verify-evidence.mjs` adds a fixture-level guard: it runs the checked-in awkward CSV through the same domain functions and compares both output queues with the expected files.

The browser suite covers integration seams the domain tests cannot see. It changes Company and Email to **Not mapped**, checks the live `4/5` status, disabled ready export and pending audit download, then restores each mapping. It separately skips and restores Contact, Phone and Country, verifies that export remains enabled, reads the Phone-skip audit JSON and confirms the original `3 / 2 / 3` counts return. It also reads the downloaded ready CSV, tabs to and activates the native file chooser with Enter and Space, checks the labelled horizontal table region and its mobile hint, proves it can scroll from the keyboard, checks key text sizes and three formerly low-contrast text/background pairs at `≥ 4.5:1`, asserts required/optional accessible names for all five mapping selects, verifies Source and CI links, and checks global page overflow at 1440 × 900 and 390 × 844. These are specific regressions, not an accessibility certification.

## Known edges

- Delimiter detection is intentionally out of scope; input is comma-delimited CSV.
- Duplicate rules use normalized email first, then company plus phone when email is absent.
- The browser session is not durable storage.
- Phone validation is shape-level. A production import would need an agreed numbering library and, only with permission, an external verification service.
- A production connector would need authentication, permission checks, idempotency and an agreed retention policy.
