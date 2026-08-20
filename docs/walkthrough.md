# Three-minute walkthrough

This pass uses the checked-in file, so every result is repeatable.

1. Start CleanGrid and choose `evidence/input/messy-customer-import.csv`.
2. Check the suggested mapping: Company Name, Full Name, E-mail, Mobile and Market should point to the five clean fields.
3. Confirm the summary reads **8 parsed / 3 ready / 2 review / 3 rejected**.
4. Select row 4. Its casing and phone format differ from row 2, but the normalized email matches. The row should say `Duplicate of row 2` and remain out of the export.
5. Open the Review filter. Row 6 has a short phone number. Row 9 contains `(000) 000-0000`: punctuation is removed, leaving ten copies of one digit, so it matches the explicit placeholder rule. Both stay visible for a person to check and neither reaches the export.
6. Open Rejected. Row 7 has an invalid email shape; row 8 has no company name.
7. Download the ready CSV and compare it with `evidence/expected/ready.csv`. It has one header plus three data rows and does not contain Bright Mile.

To check the mapping guard, set either Company or Email to **Not mapped**. The badge should change from `5/5 mapped` to `4/5 mapped`, the row table should pause, and the export button should say **Complete mapping to export**. Remap the field and the 3 / 2 / 3 result should return.

The important behaviour is not the green count. It is that every held row has a readable reason and the exported file contains only rows that passed.
