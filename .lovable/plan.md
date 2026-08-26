# Ledger Symmetry and Integrity Repair

## Confirmed findings

- Payment deletion currently inserts a reversal from `payments_received.amount` before checking whether an original linked ledger row exists.
- It then deletes linked ledger rows, and the current payment foreign key also cascades ledger deletion. Both behaviors erase evidence instead of preserving an append-only trail.
- New Bill and Payments Received are multi-request client workflows, so a bill/payment can be saved even if a later ledger insert fails.
- The live INV-1354 audit found one confirmed phantom reversal: Cash in Hand `-AED 395`, with no original linked `+AED 395` entry. The replacement AED 345 payment has a valid linked `+AED 345` entry.
- Account running totals currently equal their stored ledger sums, but Cash in Hand is economically understated by AED 395 because the phantom reversal is part of that sum.

## Build

### 1. Make ledger events traceable and append-only

- Add explicit ledger metadata for event role (`forward`, `reversal`, `correction`), the original entry being reversed, and a durable payment reference that remains after a payment is removed.
- Change the payment foreign key so deleting a payment cannot cascade-delete ledger history.
- Add an integrity audit table that records each check, warnings, corrections, totals, and affected accounts/bills for the admin report.
- Lock down all new routines to signed-in users and preserve existing row-level access rules.

### 2. Centralize financial writes in atomic database routines

- Replace the client-side New Bill finalize/edit payment sequence with an atomic routine that writes the payment, allocation, bill paid amount/status, and both ledger sides together. If a positive payment has no cash/bank forward row, the transaction fails.
- Replace standalone Payments Received writes with the same atomic payment-posting primitive.
- Match payment activity strictly by exact payment reference. Counter-payment replacement will calculate the active net amount for that bill and payment event, ignoring fully reversed history.
- Keep stock/document behavior unchanged except for calling the atomic financial routine at the correct point.

### 3. Make every reversal symmetric

- Rewrite Payment Delete to lock the payment and inspect only its exact linked active forward entries.
- Reverse the amounts and accounts found in those forward rows—not `bill.amount_paid` or a broad bill match.
- If no active forward row exists, make no ledger deduction and write an integrity warning to the audit result/deletion log.
- Update Bill Edit reconciliation and Void Bill to use the same exact-entry reversal primitive.
- Never delete or modify original forward/reversal ledger rows; append reversal rows linked to their originals.

### 4. One-time historical cleanup

- Run a dry audit over all ledger history using explicit links where available and tightly matched legacy payment-deletion records where old rows lack links.
- Append correction entries for confirmed phantom reversals only; do not remove historical rows.
- Recalculate every account as `opening_balance + full corrected ledger sum` in one controlled operation.
- Store and display the run summary: phantom count, total AED corrected, account count, warnings, and affected entries.
- Specifically verify INV-1354 shows the historical `-395`, appended `+395` correction, and valid linked `+345` payment. Expected Cash in Hand after this known correction, before any later activity, is current balance plus AED 395.

### 5. Admin Ledger Integrity Check

- Add a Settings action that runs the same audit on demand and shows the latest summary/details.
- Detect both directions: unmatched reversal/correction events and active forward payments that should have been reversed after payment deletion or bill voiding.
- Default the check to report-only; only the explicit repair action appends corrections and recalculates balances.

## Technical details

- Database functions will lock affected bills/payments/accounts and execute financial changes in one transaction.
- Active amount is calculated as forward entry amount plus all linked reversals/corrections; zero-net history is not treated as an active payment.
- Legacy detection will use deletion-log payment IDs and timestamps/account/amount only where exact historical links were destroyed; ambiguous cases are warnings and are not auto-corrected.
- Generated database types will be refreshed by the migration before frontend integration.

## Verification

- Add tests for first payment, repeated edit, fully reversed then repaid, missing-forward deletion, partial payment, multi-bill allocation, void, and rollback on ledger failure.
- Run the integrity scan before and after cleanup and verify no confirmed phantom reversal remains.
- Re-query INV-1354, its payment/deletion history, Cash in Hand ledger, and every account’s recomputed balance.
- Exercise New Bill, Payments Received, Delete Payment, Bill Edit, Void Bill, and Settings integrity check in the authenticated preview.
