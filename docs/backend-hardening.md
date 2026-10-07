# Backend integrity and query changes

This change preserves the existing JSON monetary/date representation and list/detail response shapes. It adds database-backed retry and cleanup state; it does not require Redis or another service.

## Deployment

1. Use Node 22 (`nvm use`). Generate the Prisma client and build with `npm run build`.
   The lockfile includes the app's Drive/scheduling dependencies. Prisma CLI is a production dependency so Docker uses the locked version for migrations.
2. Configure distinct `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`; production requires at least 32 characters each. Existing refresh tokens stored with bcrypt are intentionally invalidated: users must sign in again.
3. `GOOGLE_CLIENT_ID` must be configured to enable Google sign-in. There is no unsigned development fallback. Google sign-in only accepts existing active staff. Staff creation now requires an explicit password, and only a super admin can create or modify super admins.
4. Configure R2 in production. Persistent local storage is allowed only with `ALLOW_LOCAL_STORAGE=true`. Local document URLs are signed and expire after one hour; fetch the document/treatment again for a fresh URL. The public files endpoint no longer accepts bare keys.
5. Set `CLINIC_TIMEZONE` (default `Asia/Kolkata`). The same zone controls calendar boundaries, coupon validity, document-number years and the nightly Drive schedule.
6. Apply `prisma migrate deploy` before starting the new application. The normal production command already does this. The new migration is transactional and preserves existing discounts and document-number maxima. It refuses duplicate coupon usage per invoice or duplicate plan session numbers rather than deleting history. If it stops on that preflight, reconcile those records and resolve the failed migration before retrying. No migration has been run against the application's configured database during development.

The migration adds query indexes, counters, optional request idempotency metadata, coupon snapshots, a durable file cleanup queue, Drive retry state, and a shared Drive job lease. Existing doctor foreign-key deletion behavior is preserved. New-write database checks are added as `NOT VALID` so invalid historical records are not rewritten or silently discarded.

## Behavior and compatibility

- Partial invoice edits preserve omitted items and fields. Explicit `null` clears nullable invoice fields. Amounts are rounded to two decimals and calculations use exact decimal/minor-unit arithmetic. Numeric API values and existing float columns are retained; an eventual database decimal conversion requires a separate historical-data audit.
- Partial patient edits preserve omitted medical-history arrays; partial product/service edits preserve their active status. Defaults are applied only when creating records.
- Invoice `discount` retains the existing maximum-of-manual-and-coupon policy, not stacking. Manual and coupon amounts are now tracked separately. Unchanged coupon redemptions keep their recorded amount on ordinary edits even after expiry/deactivation. Changing items or patient rechecks eligibility. Existing clients that round-trip an unchanged combined `discount` are supported.
- Category/package coupons require every invoice line to qualify. Mixed eligible/ineligible lines are rejected instead of applying a restricted coupon to the entire subtotal. First-visit coupons require no previous completed appointment or non-cancelled/non-draft invoice. These rules are enforced server-side.
- Invoice/payment creation accepts an optional `idempotencyKey` in its JSON body (1–128 characters). Reuse the same key for retries of the same request. A different payload with the same key is rejected. Without a key, separate submissions are separate business events.
- Payments and stock changes commit atomically with their totals/history. Overpayments remain supported as negative balances to preserve the existing behavior. Invoices with recorded payments cannot be hard-deleted. Stock withdrawals exceeding availability are rejected; editing product quantity creates an adjustment entry.
- Lead conversion and plan acceptance can be retried safely. Treatment plans, appointments and treatments cannot be reassigned to another patient. Billed plan items cannot be replaced. Completed sittings cannot be rescheduled, including by shifting later sessions. Only proposed plans can be declined; cancelling an accepted course requires an explicit cancellation workflow rather than leaving active sessions behind.
- JSON booleans must be actual booleans; strings such as `"false"` are rejected. Date-only fields must contain real `YYYY-MM-DD` dates. Invoice quantities/instalment numbers must be integers. Invoice lines and generated plan sessions are bounded.
- Global revenue reports require SUPER_ADMIN. Operational invoice/payment reads require SUPER_ADMIN, ADMIN, ACCOUNTANT or RECEPTIONIST.
- Uploads accept JPEG, PNG, WebP, GIF or PDF with matching file signatures. SVG and unsupported image formats are rejected. Database deletions enqueue file cleanup; a minute worker performs idempotent deletion with retries and checks remaining references. Replacing images invalidates backup state, and stale sync work cannot mark a newer key synced.
- Drive backup document identities include the document ID. Previously overwritten backups cannot be reconstructed from Drive alone; retained source objects can be resynced. Failures get backoff and cannot continuously occupy the oldest pending slots. A database lease prevents overlapping workers across instances; the existing per-run limit remains 200 documents and 200 treatments.

## Query changes

Reports aggregate in PostgreSQL and retrieve only monthly/status/service groups. Six-month series are bounded, and future-month payments no longer inflate the current month. Recent activity considers six records per source before selecting the newest six. Related patient/doctor/service queries select only the fields needed by existing mappers. Session and service creation uses bulk writes. List sorts use stable ID tie-breakers. Matching date, patient, invoice, stock, coupon and pending-sync indexes are included.

Trigram search indexes, caching, connection-pool sizing, date-column conversion, cursor pagination and smaller list response contracts are deliberately deferred until query plans/data sizes and frontend requirements justify them. Appointment-overlap policy and automatic stock deduction from invoices are not assumed; existing workflows remain in control of those decisions.

## Verification

- `npm test -- --runInBand`: unit tests for authentication, authorization, input validation, calendar boundaries, money, signed files and dashboard behavior.
- `TEST_DATABASE_URL=postgresql://.../skinedit_test npm run test:integration`: integration tests use real PostgreSQL transactions and mock only external storage/Drive calls. The suite **truncates its database**, refuses non-local URLs or names not ending in `_test`, and skips when the environment variable is absent. Migrate the isolated database first.
- `npm run build`: Prisma generation and Nest compilation.

Production query latency improvements have not been benchmarked. Verify representative query plans and monitor transaction retries after rollout.
