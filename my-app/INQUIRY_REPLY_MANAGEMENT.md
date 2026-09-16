# Customer inquiry reply and resolution

Implemented one manual support reply per inquiry. Customers submit inquiries through the existing local ML classifier; ADMIN or STAFF writes the final reply. Sending a reply resolves the inquiry. No reopening, editing, second reply, or customer reply-to-reply is provided.

## Database and migration

Applied `20260916000300_add_inquiry_reply` using `prisma migrate deploy --config prisma7.config.ts`.

- Added `InquiryStatus` with `OPEN` and `RESOLVED`.
- Added `CustomerInquiry.status` with default `OPEN`.
- Added nullable `adminReply`, `repliedAt`, and `repliedById`.
- Added optional `repliedBy` relation to User, with the inverse `User.inquiryReplies`. Customer ownership uses the named `InquiryCustomer` relation; responder uses `InquiryResponder`.
- No existing inquiry fields or data were removed. Both existing inquiries were verified as OPEN with null reply metadata after migration.
- Prisma client regenerated. The development server was restarted to load the new client.

## Endpoint and permissions

`POST /api/inquiries/[id]/reply`

```json
{ "reply": "Your order is currently being processed." }
```

ADMIN and STAFF are authorized by the existing management guard, encrypted session, database role check, and request-origin check. CUSTOMER receives 403; guests receive 401. The server reads the responder ID from the authenticated session. Client-supplied fields other than `reply`, including `status` and `repliedById`, receive 400.

Replies are trimmed and must contain 1–2000 characters. Malformed JSON, invalid integer IDs, missing/blank/non-string/overlong replies receive 400. Missing inquiries receive 404. Resolved inquiries receive 409. Unexpected failures return sanitized 500 responses without database or authentication details.

The service uses a ReadCommitted transaction containing a conditional update with `where: { id, status: "OPEN" }`. The reply, server timestamp, responder ID and RESOLVED status are written together. PostgreSQL rechecks the condition after waiting on a concurrent updater. Only one request changes the row; the loser receives 409 and cannot overwrite the winning reply. The updated inquiry is read inside the same transaction and returned with explicitly selected safe fields.

## User interfaces and privacy

`/admin/inquiries` shows customer name/email, message, category, confidence, status, submitted date, saved reply, responder email and reply date. OPEN inquiries have a Reply dialog with validation, busy state, duplicate-submit protection, errors and success feedback. RESOLVED inquiries have no Reply button. All/Open/Resolved buttons filter the latest 100 loaded inquiries.

`/support` shows each inquiry's status. OPEN inquiries display “Waiting for support response.” RESOLVED inquiries display “Support Reply”, its text, and reply date. The existing Refresh button retrieves current status. History continues to query `where: { userId: authenticatedUser.id }` in the backend; another customer's data is never sent for client-side filtering. Responder account metadata is omitted from customer responses.

Navigation is unchanged. AI still classifies messages and stores actual category/confidence only. It does not generate or send replies, resolve inquiries, or access order data. The saved model was not retrained. Allocation, scoring, inventory, cancellation/restoration, and order-status code were not modified for this feature.

## Verification

- Prisma validation and client generation: passed.
- TypeScript `tsc --noEmit`: passed.
- Targeted ESLint for changed source and test files: passed.
- Full Node suite: 48 passed, 0 failed. Includes real local ML bridge, inquiry API, authentication, ownership, allocation, stock, cancellation and order-status regression tests.
- Python suite: 12 passed, 0 failed.
- New tests cover ADMIN/STAFF attribution, guest/customer denial, origin checks, validation and forged metadata, missing inquiries, sanitized errors, repeated/concurrent replies, customer ownership and safe response fields, dialog duplicate prevention/errors, management filters and customer history rendering.
- Live HTTP/PostgreSQL verification passed for actual classifier submissions, both management roles, saved reply metadata, repeated reply 409, concurrent replies [200,409], owner-only history, and authenticated HTTP 200 responses from /support and /admin/inquiries. Temporary test users and inquiries were removed.
- `git diff --check`: passed after removing generator-produced trailing whitespace.

Warnings and limitations: the first live submission failed because the existing dev server held the previous generated Prisma client; restarting fixed that. A subsequent live run returned a sanitized 500; its underlying cause was not confirmed. A diagnostic rerun completed the full workflow successfully. Existing joblib/NumPy shape-assignment deprecation warnings remain non-failing. Development logs also recorded a pg concurrent-query deprecation warning. These are recorded rather than suppressed. No visual browser automation was performed; HTTP and component-handler checks are not browser visual checks. History refresh is manual, and filters cover the latest 100 inquiries.

## Manual browser checklist

- [ ] Sign in as a customer, open Customer Support, and submit “Where is my order?”. Confirm predicted category and OPEN status.
- [ ] Sign in as ADMIN, open Customer Inquiries, filter Open, and click Reply. Check dialog focus, keyboard dismissal and mobile layout.
- [ ] Enter “Your order is currently being processed.” and Send Reply. Confirm busy state, success message, RESOLVED status, responder/date and no Reply button.
- [ ] Sign back in as the original customer and refresh support history. Confirm the saved Support Reply and reply date.
- [ ] Sign in as another customer and confirm the first customer's inquiry and reply are absent.
- [ ] Repeat on a new inquiry as STAFF. Open the same inquiry in two management sessions and confirm the second send reports conflict.

## Exact file manifest

Paths below are relative to `my-app`. Earlier uncommitted work was preserved.

Created:

- `lib/inquiry-reply.ts`
- `app/api/inquiries/[id]/reply/route.ts`
- `app/admin/inquiries/reply-dialog.tsx`
- `prisma/migrations/20260916000300_add_inquiry_reply/migration.sql`
- `tests/inquiry-reply.test.mjs`
- `tests/inquiry-reply-ui.test.mjs`
- `INQUIRY_REPLY_MANAGEMENT.md`

Modified:

- `prisma/schema.prisma`
- `lib/inquiries.ts`
- `app/api/inquiries/route.ts`
- `app/admin/inquiries/inquiry-manager.tsx`
- `app/support/support-form.tsx`
- `tests/inquiries.test.mjs`

Prisma generation rewrote these generated files (unrelated model outputs retain their existing content):

- `app/generated/prisma/browser.ts`
- `app/generated/prisma/client.ts`
- `app/generated/prisma/commonInputTypes.ts`
- `app/generated/prisma/enums.ts`
- `app/generated/prisma/internal/class.ts`
- `app/generated/prisma/internal/prismaNamespace.ts`
- `app/generated/prisma/internal/prismaNamespaceBrowser.ts`
- `app/generated/prisma/models.ts`
- `app/generated/prisma/models/Branch.ts`
- `app/generated/prisma/models/BranchInventory.ts`
- `app/generated/prisma/models/CustomerInquiry.ts`
- `app/generated/prisma/models/Order.ts`
- `app/generated/prisma/models/OrderItem.ts`
- `app/generated/prisma/models/Product.ts`
- `app/generated/prisma/models/User.ts`

The existing `/api/my-inquiries` route needs no source change: its ownership predicate is unchanged and its shared selection now includes status, reply and reply date.
