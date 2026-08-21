# Changelog

## 2026-08-21 — duplicate mapping safety

- **Fail-closed mapping:** one source column can no longer silently feed multiple CRM fields. A duplicate assignment blocks classification and ready export until every mapped source is unique.
- **Accessible recovery:** both conflicting selects expose `aria-invalid`, reference a visible alert and return to the normal state as soon as either field is remapped.
- **Audit truth:** blocked downloads report `classification: "blocked"`, the exact source and target fields in `duplicateSources`, and `MAPPING_CONFLICT` without claiming that cleanup rules ran.
- **Regression coverage:** a domain test rejects direct classification with a duplicate mapping, while Chromium exercises the blocked and recovered flow at 1440 × 900 and 390 × 844.

## 2026-08-21 — optional mapping clarity

- **Required boundary:** Company and Email still block classification and ready export while either mapping is absent.
- **Optional boundary:** Contact, Phone and Country may be skipped. The live mapping status, schema summary, progress label and audit trail name each skipped optional field instead of presenting an ambiguous generic ready state.
- **Phone accuracy:** when Phone is not mapped, normalized phone values stay blank and the UI plus audit explicitly say that phone normalization and E.164-shape checks did not run. Restoring Phone returns the original `3 ready / 2 review / 3 rejected` result.
- **Accessible labels:** every mapping control now exposes whether its target is required or optional, with matching visible field metadata.
- **Keyboard file choice:** the visible Choose local CSV control now contains a full-size native file input. It participates in normal Tab order, has a visible focus ring and opens from Enter or Space.
- **Mobile table discovery:** a narrow-screen hint explicitly directs users to swipe for Status and Rule result; the labelled records region also supports horizontal keyboard scrolling.
- **Readability and contrast:** primary workspace text sizes were raised on wide and mobile layouts. The former `--quiet` text color, which measured roughly `2.62–3.15:1` across its light backgrounds, was replaced with a darker token that stays above `5.18:1`; the muted token now stays above `5.36:1` on the same checked backgrounds.
- **Regression coverage:** focused domain and Chromium tests exercise required blocking, every optional skip, downloaded Phone-skip audit JSON, restoration to the unchanged full `5/5` state, native keyboard file choice, responsive table guidance, text size, contrast and page overflow.

## 2026-08-20 — mapping and phone review pass

- **Mapping state:** `5/5 mapped` was static HTML. The count now comes from the current selects; a missing Company or Email pauses classification and disables the ready export.
- **Pending audit:** the UI and downloaded JSON previously built their events separately. Both now use one audit-state builder, which reports 8 parsed rows, `classification: "pending"`, and `MAPPING_REQUIRED` while a required mapping is absent.
- **Phone normalization:** `(000) 000-0000` was treated as an international `00` prefix. Prefix detection now reads the original text. E.164 shape rejects a zero first digit, and the placeholder rule holds source values containing at least eight copies of one digit and no other digit after punctuation removal.
- **Fixture evidence:** the checked-in result changed from `4 ready / 1 review / 3 rejected` to `3 ready / 2 review / 3 rejected`; the all-zero source row is not exported.
- **Browser regression:** three Chromium tests cover both mapping gaps, pending and complete downloads, all five mapping names, Source/CI link destinations and visibility, and global page width at 390 px. CI runs the same gate.
