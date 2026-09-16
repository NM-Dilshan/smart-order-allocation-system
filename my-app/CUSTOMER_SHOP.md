# Customer shopping flow

Authenticated customers browse `/shop`, review their selections at `/cart`, and
provide location/check availability/place orders at `/checkout`. Each page has
its own customer session/role guard. Customer `/orders` redirects to `/shop`;
management continues using `/orders` and `/products` for administration.

## Catalog and cart

The catalog reuses `/api/products`. Cards show names, formatted prices, package
placeholders, Add to Cart and Buy Now. Product has no image field; persistent
product-image management can be added later as a separate change. No external
images, dependencies, schema changes or migrations are introduced.

Add to Cart adds quantity 1, remains on `/shop`, and announces feedback. Adding
the same product again increases its quantity without creating another row.
The header count is the sum of all cart quantities.

The cart page shows only selected items, with +/- and direct quantity inputs,
removal, clearing, subtotals and a total. Quantities stay within 1–2147483647.
Empty carts cannot proceed to checkout. Missing/deleted products must be removed
before cart checkout; product-loading failures provide a safe retry.

## State and Buy Now

CustomerCartProvider uses React context and a reducer in the root layout. It is
mounted only for customers and keyed by the authenticated customer ID. Cart IDs
and quantities survive client-side navigation, including My Orders and Support.
Prices and product details are read from the product API on the relevant page;
the cart never stores authoritative price, stock or branch data.

Buy Now creates a separate temporary selection of the clicked product x1 and
navigates directly to `/checkout`. The regular cart remains intact. Checkout
from `/cart` replaces that temporary selection with the regular cart.

This implementation intentionally uses in-memory state. Browser reloads, closing
the tab, or logging out discard it. It is not synchronized across tabs and does
not persist to PostgreSQL or localStorage.

## Checkout and placement

Checkout renders a read-only Order Summary, not a full catalog or editable cart.
It reuses OrderForm's manual/geolocation functionality, validation, availability
preview and final POST. An item/location signature and cart revision invalidate
old previews, including edits that return to the original selection. Availability
results are local to checkout and are never saved in the provider. Late responses
cannot approve a changed selection.

`/api/orders/availability` still calls the existing single-branch allocation
service. The Best Available Branch card shows the returned branch, distance and
workload. Customers cannot manually choose a branch. Unavailable orders keep
Check Availability as the action and cannot advance to Place Order.

`/api/orders` independently validates the session/items, recalculates allocation,
checks stock, conditionally deducts inventory and creates the order/items in the
existing transaction. The client submits only product IDs, quantities and
location; it never submits a trusted price, stock total or branch choice.
Server authentication, authorization and business rules are unchanged.

After placement, checkout shows the Order ID and actual allocated branch with
links to My Orders and Shop. Cart purchases remove only submitted quantities,
preserving unrelated products or additions made while the request was pending.
Buy Now clears its temporary selection and leaves the regular cart intact.

## Responsive layout and validation

Shop cards use one column on mobile, two on tablet and three/four on desktop.
Cart and checkout use focused layouts with wrapping controls and 44px targets.
The existing mobile header menu also includes the Cart count.

Tests exercise the real provider/page/form handlers, navigation, Buy Now,
quantity changes, totals, missing products, preview invalidation, late responses,
purchase clearing and customer page guards. Existing allocation/stock fixtures
confirm that combined stock is not fulfillment and only a branch stocking every
requested item is eligible. Browser visual verification is not available in the
current environment.

Validation: TypeScript, targeted ESLint, all 61 application tests and all 12
Python AI tests passed. Subprocess-based tests ran outside the Windows sandbox.
The saved-model loader reports existing joblib/NumPy deprecation warnings.
