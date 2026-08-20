# Changelog

## 2026-08-20 — mapping and phone review pass

- **Mapping state:** `5/5 mapped` was static HTML. The count now comes from the current selects; a missing Company or Email pauses classification and disables the ready export.
- **Pending audit:** the UI and downloaded JSON previously built their events separately. Both now use one audit-state builder, which reports 8 parsed rows, `classification: "pending"`, and `MAPPING_REQUIRED` while a required mapping is absent.
- **Phone normalization:** `(000) 000-0000` was treated as an international `00` prefix. Prefix detection now reads the original text. E.164 shape rejects a zero first digit, and the placeholder rule holds source values containing at least eight copies of one digit and no other digit after punctuation removal.
- **Fixture evidence:** the checked-in result changed from `4 ready / 1 review / 3 rejected` to `3 ready / 2 review / 3 rejected`; the all-zero source row is not exported.
- **Browser regression:** three Chromium tests cover both mapping gaps, pending and complete downloads, all five mapping names, Source/CI link destinations and visibility, and global page width at 390 px. CI runs the same gate.
