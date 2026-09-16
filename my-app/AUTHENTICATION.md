# Authentication

User.role defaults to CUSTOMER. ADMIN and STAFF have the same management access.
Public registration creates CUSTOMER accounts only. No public role-assignment endpoint is provided.
See [CUSTOMER_AUTHENTICATION.md](CUSTOMER_AUTHENTICATION.md) for customer flows, authorization, verification, and the current file manifest.

## Local setup

Apply migrations with `npx prisma migrate deploy --config prisma7.config.ts`.
Provision an administrator from PowerShell in my-app:

```powershell
$env:BOOTSTRAP_EMAIL = Read-Host 'Administrator email'
$secret = Read-Host 'Administrator password (at least 12 characters)' -AsSecureString
$env:BOOTSTRAP_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
try { node scripts/setup-auth.mjs } finally { Remove-Item Env:BOOTSTRAP_PASSWORD; Remove-Item Env:BOOTSTRAP_EMAIL }
```

The script creates or updates the specified account as ADMIN. It hashes the
password with scrypt and adds a random AUTH_SECRET and localhost AUTH_ORIGIN to
.env only if missing; it never prints secrets. Restart Next.js afterward.
BOOTSTRAP_NAME is optional. Do not save bootstrap passwords in source files.
Existing plaintext/unsupported password formats cannot log in; re-provision
the intended management account. STAFF roles can be assigned directly by the
database owner. Never grant management roles to the assessment customer.

## Environment

DATABASE_URL, AUTH_SECRET (32+ random characters), AUTH_ORIGIN (exact origin).
Use HTTPS and NODE_ENV=production in production. .env files remain ignored.
No environment variables are exposed through NEXT_PUBLIC names.

## Access

- /branches, /products and /inventory require ADMIN or STAFF on the server.
- Branch and inventory APIs require management access for all methods.
- Product write APIs require management access; product GETs remain public.
- Administrative order list/detail GETs and cancellation POST require management access.
- /orders is a role-aware landing page. POST /api/orders requires CUSTOMER authentication.
- /my-orders and /api/my-orders (including detail reads) require CUSTOMER authentication
  and constrain database queries to the authenticated user.
- Product reads and availability checks remain public; exact inventory counts are not returned.
- /login is the customer entry point; /admin/login accepts ADMIN/STAFF only.
- /register and POST /api/auth/register create CUSTOMER accounts with scrypt passwords.
- `/support` and inquiry submission/history require CUSTOMER access. Inquiry ownership comes from the session.
- `/admin/inquiries` and `GET /api/inquiries` require ADMIN/STAFF. See [AI integration](ai/INTEGRATION.md).
- Authenticated writes require an Origin header exactly matching AUTH_ORIGIN.

Normal guest placement is retired in favor of authenticated customer ordering.
lib/assessment-customer.ts remains an unused historical helper; no active route calls it.
Existing assessment orders are retained for management and never reassigned to new accounts.
Reserved assessment email addresses cannot register or sign in.
Management credentials never change allocation, deduction or cancellation logic.

## Sessions and limits

iron-session encrypts/authenticates an HttpOnly, SameSite=Strict cookie with an
eight-hour lifetime. Cookies are Secure in production. Each protected request
checks the current database role and a password fingerprint, so role removal,
account deletion and password changes invalidate authorization immediately.
Logout deletes the browser cookie. Stateless sessions cannot individually revoke
a copied cookie; rotate AUTH_SECRET or change the user's password to revoke it.
Login throttling allows five attempts per email per 15 minutes per server process;
a multi-instance deployment needs a shared rate limiter at the application edge.
Registration uses the same limiter with a separate registration key per email.
Production abuse controls should also cover public registration and availability checks.

Historical development orders created before Step 7 did not deduct inventory.
Clean/reset those test orders before final testing; cancelling them can restore
stock never deducted. No automatic destructive cleanup is performed.

## Manual checks

1. Visit management pages logged out: redirected to /admin/login.
2. POST to a protected API logged out: 401.
3. Try invalid credentials: generic Invalid email or password message.
4. Sign in with the provisioned account, then exercise management operations.
5. Confirm a CUSTOMER or a removed management role cannot access management APIs.
6. Send a protected mutation with a foreign Origin: 403.
7. Logout, then retry protected pages and APIs: blocked.
8. Register and sign in as a customer, place an order, and check My Orders. Then sign in as management and cancel once.
9. Retry cancellation: 409 and no second restoration.

## Historical Step 9 file manifest

Created (paths relative to my-app):

```text
.env.example
AUTHENTICATION.md
lib/auth.ts
lib/passwords.mjs
lib/login-limit.ts
lib/assessment-customer.ts
app/api/auth/login/route.ts
app/api/auth/logout/route.ts
app/api/auth/session/route.ts
app/auth-controls.tsx
app/management-access.tsx
app/login/page.tsx
app/login/login-form.tsx
app/branches/layout.tsx
app/products/layout.tsx
app/inventory/layout.tsx
scripts/setup-auth.mjs
tests/auth.test.mjs
prisma/migrations/20260916000100_add_user_role/migration.sql
```

Modified:

```text
package.json
package-lock.json
prisma/schema.prisma
app/api/branches/route.ts
app/api/branches/[id]/route.ts
app/api/products/route.ts
app/api/products/[id]/route.ts
app/api/inventory/route.ts
app/api/inventory/[id]/route.ts
app/api/orders/route.ts
app/api/orders/[id]/route.ts
app/api/orders/[id]/cancel/route.ts
app/orders/page.tsx
app/orders/order-manager.tsx
tests/allocation.test.mjs
tests/order-stock.test.mjs
tests/order-cancellation.test.mjs
```

Generated Prisma files with content changes:

```text
app/generated/prisma/commonInputTypes.ts
app/generated/prisma/enums.ts
app/generated/prisma/internal/class.ts
app/generated/prisma/internal/prismaNamespace.ts
app/generated/prisma/internal/prismaNamespaceBrowser.ts
app/generated/prisma/models/User.ts
```

Historical Step 9 verification (superseded by CUSTOMER_AUTHENTICATION.md): 20 tests pass across auth/allocation/stock/cancellation, TypeScript
and targeted ESLint pass. Auth tests use real iron-session encryption and scrypt
with a mocked database/cookie store. Existing business tests simulate database
transactions, not real concurrent PostgreSQL sessions. Live logged-out page/API
access checks pass. Live administrator login and browser interactions require
the local provisioning step and were not tested. npm reports four high-severity
dependency advisories; no automatic breaking upgrades were applied.
