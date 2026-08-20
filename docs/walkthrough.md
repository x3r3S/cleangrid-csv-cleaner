# Three-minute walkthrough

This pass uses the checked-in file, so every result is repeatable.

1. Start CleanGrid and choose `evidence/input/messy-customer-import.csv`.
2. Check the suggested mapping: Company Name, Full Name, E-mail, Mobile and Market should point to the five clean fields.
3. Confirm the summary reads **8 parsed / 4 ready / 1 review / 3 rejected**.
4. Select row 4. Its casing and phone format differ from row 2, but the normalized email matches. The row should say `Duplicate of row 2` and remain out of the export.
5. Open the Review filter and inspect row 6. Its short phone number is preserved for a person to check rather than silently repaired.
6. Open Rejected. Row 7 has an invalid email shape; row 8 has no company name.
7. Download the ready CSV and compare it with `evidence/expected/ready.csv`.

The important behaviour is not the green count. It is that every held row has a readable reason and the exported file contains only rows that passed.
