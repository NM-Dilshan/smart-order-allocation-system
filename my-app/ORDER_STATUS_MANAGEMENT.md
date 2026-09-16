# ADMIN/STAFF order status management

Management can now mark an allocated order as completed from `/orders`. Customer placement still allocates and deducts stock through the existing allocation service; cancellation still uses the original cancellation service. No Prisma migration or dependency change was required because OrderStatus already contains COMPLETED.

## Status rules

| Current state | Action | Result | Inventory |
| --- | --- | --- | --- |
| New successful customer order | Existing allocation process | ALLOCATED | Existing conditional transactional deduction |
| ALLOCATED | ADMIN/STAFF Mark as Completed | COMPLETED | Unchanged |
| ALLOCATED | Existing ADMIN/STAFF Cancel Order | CANCELLED | Restore to actual allocated branch once |
| PENDING | Manual completion/cancellation | Rejected | Unchanged |
| COMPLETED | Completion/cancellation | Rejected; terminal | Unchanged |
| CANCELLED | Completion/cancellation | Rejected; terminal | Unchanged |

There is no generic status dropdown or manual PENDING ? ALLOCATED action. The normal placement route validates, allocates, deducts stock, and creates ALLOCATED directly in one transaction. PENDING remains an existing schema default for historical or externally created orders, not a new operational allocation queue. One historical PENDING order was observed before live verification and left untouched. It is displayed with no status-changing controls. No stock history or allocation decision is invented for it.

## Endpoint and authorization

`POST /api/orders/[id]/complete` uses the existing `withManagement` guard, including session/database role verification and same-origin mutation protection.

- ADMIN and STAFF can complete ALLOCATED orders and retain existing cancellation access.
- CUSTOMER receives 403 on management completion and cancellation APIs. The current management-only cancellation policy is unchanged.
- Guest receives 401.
- Invalid ID: 400. Missing order: 404. Non-ALLOCATED status: 409.
- Success: 200 and the updated order, with existing branch/item/product selections and `Cache-Control: no-store`.
- Database conflicts: sanitized 409. Other database failures: sanitized 500.

No request body chooses the next status, branch, or owner. This endpoint performs exactly one operation: ALLOCATED ? COMPLETED. It does not expose database details or secrets.

## Concurrency and stock safety

`lib/order-completion.ts` runs inside a Prisma ReadCommitted transaction and acquires `SELECT ... FOR UPDATE` on the same Order row used by the cancellation service. It reads the current status while holding that lock, requires ALLOCATED, and performs a conditional update whose where clause also includes `status: ALLOCATED`.

The lock is held until commit or rollback. Two completion requests serialize: the winner completes, and the next sees COMPLETED and returns 409. Completion racing with cancellation shares the same lock: whichever transition commits first wins; the other sees a terminal state and returns 409.

Completion never accesses inventory. Stock already deducted during allocation remains unchanged (10 ? 7 on allocation, then 7 ? 7 on completion). Cancellation still invokes `lib/order-cancellation.ts`, restores the allocated branch's inventory inside its existing transaction, and rejects completed/cancelled orders. No second cancellation implementation or direct generic status setter was introduced.

All existing row-lock, transaction rollback, double-cancellation, conditional deduction, and restoration protections remain intact. Completing an order naturally removes it from the existing ALLOCATED-only workload count; the workload calculation and 0.7 distance / 0.3 workload allocation algorithm themselves are unchanged.

## UI and customer view

For ALLOCATED management rows, `/orders` shows Mark as Completed and the existing Cancel Order action (cancellation retains its allocated-branch requirement). Completion opens the existing dialog pattern with the order number, fulfillment confirmation, Cancel, and Mark as Completed.

The completion dialog uses a pending ref and disabled buttons to prevent duplicate submissions, shows a processing indicator, displays sanitized API errors, and returns the server-updated order on success. Management updates the row immediately, refreshes the list, and shows a success message. Both completion and cancellation use the shared status-success feedback area.

COMPLETED, CANCELLED, and historical PENDING rows have no status-changing buttons. Existing product quantities/prices, branch, coordinates, and creation date remain visible. No arbitrary dropdown or branch reassignment control was added.

Customer My Orders and existing detail APIs already read status from the server. They show COMPLETED after refresh/reopening, without completion or management cancellation controls. No live push/polling behavior was added; use the existing Refresh button to see another user's changes.

## AI and security separation

Customer Support AI remains classification and inquiry persistence only. Inquiry messages cannot invoke completion or cancellation. No AI endpoint, model, training data, classifier, or inference logic was changed.

No JWT, payment/shipping integration, new role system, or alternative allocation/cancellation implementation was added. Existing iron-session, HttpOnly cookie settings, scrypt, role/ownership checks, and customer/management separation remain unchanged.

## Verification

- **40 application tests pass**, including 10 new status/service/UI tests and all existing allocation, availability, stock, cancellation, authentication, ownership, support, and real Python AI integration tests.
- **12 Python tests pass** for the existing classifier and stdin protocol.
- TypeScript and targeted ESLint pass.
- New tests cover ADMIN and STAFF completion, CUSTOMER/guest denial, invalid IDs, missing orders, terminal/PENDING conflicts, rollback/error sanitization, inventory invariance, duplicate completion, completion/cancellation races, dialog duplicate-click protection, management action visibility, and read-only customer status display.
- Live HTTP/PostgreSQL verification used temporary customer/management accounts, a temporary product/branch/inventory record, and orders allocated through the real placement API. It verified 10 ? 7 deduction, completion retaining 7, cancellation restoring 10 once, completion of cancelled orders and cancellation of completed orders rejected, and CUSTOMER/guest denial.
- Live concurrent requests verified one 200 and one 409 for duplicate completion and completion versus cancellation, with stock matching the winning terminal state.
- Live My Orders returned the completed status for the owning customer. Authenticated `/orders`, `/my-orders`, `/admin/inquiries`, and `/inventory` returned 200.
- All temporary test users, items, orders, product, branch, and inventory records were removed afterward. No historical order was completed/cancelled or cleaned up.

Commands from `my-app`:

```powershell
node -e "for (const f of require('node:fs').readdirSync('./tests').filter(f=>f.endsWith('.test.mjs'))) import('./tests/'+f)"
python -m unittest discover -s ai\tests -v
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js lib/order-completion.ts 'app/api/orders/[id]/complete/route.ts' app/orders/complete-order-dialog.tsx app/orders/order-manager.tsx tests/order-status.test.mjs tests/order-status-ui.test.mjs
```

The AI regression tests require permission to spawn Python; they were run with that permission in the restricted environment. Existing joblib/NumPy deprecation warnings remain visible and non-failing. No test failures remain. Actual browser click-through/visual testing was not performed; the UI tests exercise real component handlers, and live checks use HTTP requests plus the real database.

## Manual browser checklist

- [ ] Sign in as ADMIN, open Orders, and confirm only ALLOCATED rows show completion/cancellation actions.
- [ ] Open completion confirmation, choose Cancel, and verify no status change.
- [ ] Confirm completion; check the loading state, success notice, updated row, and removed actions.
- [ ] Compare Inventory before/after completion; it must be unchanged.
- [ ] Repeat with STAFF credentials.
- [ ] Complete the same order from two open management tabs; only one transition succeeds.
- [ ] Cancel a different allocated order; verify restoration once and no completion action afterward.
- [ ] Verify completed orders cannot be cancelled and cancelled orders cannot be completed.
- [ ] Sign in as the customer and Refresh My Orders; confirm the updated status and no management controls.
- [ ] Confirm historical PENDING orders are displayed without manual allocation/completion controls.
- [ ] Check mobile wrapping, keyboard focus, dialog behavior, and Customer Support/Inquiry Management.

## Exact file manifest

Created, relative to `my-app`:

```text
ORDER_STATUS_MANAGEMENT.md
lib/order-completion.ts
app/api/orders/[id]/complete/route.ts
app/orders/complete-order-dialog.tsx
tests/order-status.test.mjs
tests/order-status-ui.test.mjs
```

Modified:

```text
app/orders/order-manager.tsx
```

No schema, migration, dependency, authentication, customer-history, allocation, cancellation-service, inventory, or AI files were changed for this enhancement. Earlier uncommitted changes from previous work were preserved.
