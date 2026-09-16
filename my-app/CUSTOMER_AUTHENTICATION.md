# Customer accounts and order ownership

## Entry points and flows

- `/register`: name (1?100 characters), normalized email, password (12?256 characters), and matching confirmation. A successful registration redirects to `/login?registered=1`; it does not automatically sign in.
- `POST /api/auth/register`: origin checked, validated, throttled, and always writes `role: CUSTOMER`. Client role/id/hash fields are ignored. Duplicate normalized email returns a safe 409. Reserved `@smart-order.invalid` addresses are rejected.
- `/login` ? `POST /api/auth/login`: only CUSTOMER credentials succeed; success redirects to `/orders`.
- `/admin/login` ? `POST /api/auth/admin/login`: only ADMIN/STAFF credentials succeed; success redirects to `/branches`.
- Both login endpoints delegate to `lib/login.ts`, using the existing User table, scrypt verification, and iron-session. Valid credentials for the wrong entry point return the same `Invalid email or password.` message as invalid credentials. ADMIN/STAFF provisioning stays in the existing controlled script/database-owner workflow.
- One shared session cookie means the latest successful login selects the current account for both areas.

## Authorization and navigation

| Area/action | Visitor | CUSTOMER | ADMIN/STAFF |
| --- | --- | --- | --- |
| Registration and login entry points | Public | Public APIs; page redirects when already signed in | Public APIs; page redirects when already signed in |
| Public product reads / availability preview | Allowed | Allowed | Allowed |
| Place order (`POST /api/orders`) | 401 | Allowed, with valid origin | 403 |
| My Orders APIs, including detail | 401 | Own orders only | 403 |
| Administrative order reads / cancellation | 401 | 403 | Allowed |
| Branch/inventory APIs and product writes | 401 | 403 | Allowed |
| Management pages | Redirect to admin login | Redirect to admin login | Allowed |

Visitors see Customer Login, Register, and Admin / Staff Login links. Customers see Place Order, My Orders, and Logout. Management sees Branches, Products, Inventory, Order Administration, and Logout. These links do not grant access: every protected API checks the session and current database role.

`/orders` remains a public landing page, but its creation form is rendered only for authenticated customers. Management uses the same page for order administration. `/my-orders` checks CUSTOMER authorization on the server before rendering.

## Ownership and customer information

`POST /api/orders` receives the authenticated customer from `withCustomer`. `Order.userId` comes exclusively from that server-side user; client `userId` and `branchId` are ignored. Products and quantities are validated again, allocation is recalculated, and stock is deducted in the existing transaction.

`GET /api/my-orders` queries `where: { userId: authenticatedUser.id }`. `GET /api/my-orders/[id]` queries both order ID and authenticated user ID. Other customers' IDs return 404. Query-string user IDs have no effect. Responses use a customer-specific Prisma select, with no user records, credentials, or inventory quantities, and `Cache-Control: no-store`.

My Orders shows date, status, products, quantity, unit price, subtotal, total, allocated branch, and coordinates. Subtotal is current Product.price ? quantity; total is the sum. Prices are not historical snapshots, so changing a product price changes displayed totals. No schema change or payment feature was added.

Exact inventory quantities were removed from the availability response and customer form. The existing scored Best Available Branch preview remains, and every allocation input edit still invalidates it.

## Guest ordering and cancellation decisions

Normal guest placement is disabled as requested in the preferred target flow. The former assessment fallback was part of the previous implementation; no separate continuing guest requirement was found. The historical helper remains on disk but no route imports it. Historical assessment orders remain management-visible and are not assigned to new customers.

Customer cancellation remains management-only, as explicitly allowed by the request. My Orders directs customers to staff for cancellation. Customers cannot invoke the cancellation API, even for their own orders. ADMIN/STAFF retain their existing cancellation permissions. This avoids expanding cancellation policy and leaves the tested shared restoration service unchanged.

## Security and preserved business rules

- Existing salted scrypt hashing and constant-time verification; no plaintext passwords in storage or responses.
- Same iron-session cookie: encrypted/authenticated, HttpOnly, SameSite=Strict, Secure in production, eight-hour lifetime.
- Current user and role are checked against the database. Password fingerprint changes invalidate authorization. Authenticated mutations and auth endpoints require the configured Origin.
- Logout destroys the shared cookie for every role; customer logout returns to `/login`, management logout to `/admin/login`.
- No JWT, localStorage/sessionStorage tokens, second authentication system, new dependency, schema change, or migration.
- Allocation unchanged: complete-order stock eligibility ? Haversine distance ? ALLOCATED workload ? existing normalization ? distance 0.7 + workload 0.3 ? deterministic winner. No manual branch selection.
- Safe stock deduction unchanged: RepeatableRead transaction, conditional quantity check/decrement, affected-row verification, rollback on failure.
- Cancellation service unchanged: order row lock, actual-branch restoration, atomic transaction, status checks, double/concurrent cancellation protection.

## Local configuration

The existing local `.env` lacked authentication settings. Missing AUTH_SECRET was generated securely and AUTH_ORIGIN was set to `http://localhost:3000`; existing values were preserved. Secrets are not included in this document or committed. Use the configured origin when opening the app. Production must use its exact HTTPS origin and a strong secret. See AUTHENTICATION.md for controlled management provisioning.

## Verification

- TypeScript and targeted ESLint pass.
- 25 automated tests pass across registration, login roles, real iron-session/scrypt behavior, form submission/redirects, ownership, allocation, stock deduction, and cancellation.
- Business tests cover authenticated user ID overriding a forged client ID, forbidden management access, other-customer detail denial, final recalculation, stock deduction, rollback, and cancellation safety.
- Live HTTP checks: `/register`, `/login`, `/admin/login`, `/orders` return 200; guest `/my-orders` redirects to `/login`; guest management pages redirect to `/admin/login`; private APIs return 401.
- Live database/API checks with a temporary customer: registration forced CUSTOMER despite ADMIN input, scrypt hash storage, duplicate 409, customer rejected at management login, successful customer session, cookie flags, ownership-filtered reads, denied management APIs, authenticated pages, and logout. Temporary account deleted afterward; no inventory/order data changed.
- The first live registration attempt returned 403 because local auth configuration was absent. It passed after the missing settings were added.
- Actual browser interaction/visual testing and live multi-connection stock concurrency were not performed. The form tests exercise real handlers with a hook harness; database business tests model transactions. Live ADMIN/STAFF credentials were not used; their login and authorization paths are covered by automated tests.

Run tests without child-process isolation in restricted Windows environments:

```powershell
node -e "for (const f of require('node:fs').readdirSync('./tests').filter(f=>f.endsWith('.test.mjs'))) import('./tests/'+f)"
node node_modules/typescript/bin/tsc --noEmit
```

## Manual browser checklist

- [ ] Register with matching passwords; verify customer-login redirect and success message.
- [ ] Try duplicate email, malformed email, short password, and mismatched confirmation.
- [ ] Sign in as a customer, check role-aware navigation, and place a multi-product order using Current Location.
- [ ] Change quantity or coordinates after a preview; confirm it disappears and requires another check.
- [ ] Confirm actual final branch and updated My Orders items, prices, totals, and status.
- [ ] Sign in as a second customer; confirm first customer's orders cannot be listed or retrieved by ID.
- [ ] Try customer credentials at Admin / Staff Login and management credentials at Customer Login; expect generic rejection.
- [ ] Sign in as ADMIN and STAFF through `/admin/login`; verify all management pages and order administration.
- [ ] Cancel an allocated order as management; check restoration once and rejection on retry.
- [ ] Logout from both roles; confirm protected pages/APIs cannot be accessed with the cleared session.
- [ ] Check mobile layout, keyboard focus, loading/error states, and browser geolocation permission denial.

## File manifest

Created (relative to `my-app`):

```text
CUSTOMER_AUTHENTICATION.md
lib/login.ts
lib/customer-orders.ts
app/api/auth/admin/login/route.ts
app/api/auth/register/route.ts
app/api/my-orders/route.ts
app/api/my-orders/[id]/route.ts
app/admin/login/page.tsx
app/register/page.tsx
app/my-orders/page.tsx
app/my-orders/my-orders.tsx
tests/customer-auth.test.mjs
tests/auth-form.test.mjs
```

Modified:

```text
AUTHENTICATION.md
lib/auth.ts
app/api/auth/login/route.ts
app/api/orders/route.ts
app/api/orders/availability/route.ts
app/auth-controls.tsx
app/management-access.tsx
app/login/page.tsx
app/login/login-form.tsx
app/orders/page.tsx
app/orders/order-manager.tsx
app/orders/order-form.tsx
tests/auth.test.mjs
tests/allocation.test.mjs
tests/order-stock.test.mjs
.env (ignored local configuration; missing values only)
```

Existing limitations retained: the in-memory per-email rate limiter is process-local; production multi-instance deployments need shared abuse controls. Stateless copied session cookies are not individually revoked by browser logout; changing the password or rotating AUTH_SECRET invalidates them. Historical pre-deduction assessment orders should not be cancelled as inventory tests without reviewing their stock history. No destructive cleanup of historical data was performed.
