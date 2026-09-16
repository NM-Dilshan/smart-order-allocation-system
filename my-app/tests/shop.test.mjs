import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, dependencies, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name) => { if (!(name in dependencies)) throw new Error(name); return dependencies[name]; }, ...globals,
  });
  return exports;
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
function text(node) {
  if (node == null) return "";
  if (typeof node !== "object") return String(node);
  if (typeof node.type === "function") return text(node.type(node.props));
  return [node.props?.children].flat(Infinity).map(text).join("");
}
const products = [{ id: 1, name: "Mouse", price: 2500 }, { id: 2, name: "Keyboard", price: 4500 }];

// Render the real provider, pages, catalog and form with independent hook slots.
function application({ catalog = products, failCatalog = false } = {}) {
  let active; let currentCart; let geo; let catalogFailed = failCatalog; let unavailable = false; let deferred = false;
  const calls = []; const navigations = []; const pendingResponses = [];
  const react = {
    useState(initial) { const i = active.cursor++; const slots = active.slots; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = active.cursor++; const slots = active.slots; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useReducer(reducer, initial) { const i = active.cursor++; const slots = active.slots; if (!(i in slots)) slots[i] = initial; return [slots[i], (action) => { slots[i] = reducer(slots[i], action); }]; },
    useEffect(fn, deps) { const i = active.cursor++; const prior = active.effects[i]; if (!prior || deps.some((value, index) => value !== prior.deps[index])) active.effects[i] = { fn, deps, pending: true, cleanup: prior?.cleanup }; },
    createContext: () => ({ Provider: "CartProvider" }), useContext: () => currentCart,
  };
  const jsx = (type, props) => ({ type, props });
  const runtime = { jsx, jsxs: jsx };
  const ui = { input: "input", primary: "primary", secondary: "secondary", message: (error) => error.message, api: async (url, options) => {
    if (url === "/api/products") { if (catalogFailed) throw new Error("Products could not be loaded. Please retry."); return catalog; }
    calls.push({ url, body: JSON.parse(options.body) });
    if (deferred) return new Promise((resolve) => pendingResponses.push(resolve));
    return url.endsWith("availability")
      ? unavailable ? { available: false, message: "No single branch currently has enough stock to fulfill this order." } : { available: true, bestAvailableBranch: { branchId: 1, branchName: "Preview Branch", distanceKm: 3.4, workload: 2 } }
      : { id: 10, allocation: { branchId: 2, branchName: "Final Branch", distanceKm: 4, workload: 1 } };
  } };
  const cartState = load("../app/cart/cart-state.ts", {});
  const provider = load("../app/cart/cart-provider.tsx", { react, "react/jsx-runtime": runtime, "./cart-state": cartState });
  const summary = load("../app/cart/order-summary.tsx", { "react/jsx-runtime": runtime });
  const catalogModule = load("../app/shop/product-catalog.tsx", { "react/jsx-runtime": runtime, "lucide-react": {}, "../orders/order-ui": ui, "../cart/order-summary": summary });
  const useProducts = load("../app/shop/use-products.ts", { react, "../orders/order-ui": ui }, { AbortController });
  const common = { react, "react/jsx-runtime": runtime, "next/link": { default: "Link" }, "next/navigation": { useRouter: () => ({ push: (path) => navigations.push(path) }) }, "lucide-react": {}, "../cart/cart-provider": provider, "../orders/order-ui": ui };
  const shop = load("../app/shop/customer-shop.tsx", { ...common, "./product-catalog": catalogModule, "./use-products": useProducts }).default;
  const cart = load("../app/cart/customer-cart.tsx", { ...common, "./cart-provider": provider, "./order-summary": summary, "../shop/use-products": useProducts }).default;
  const checkout = load("../app/checkout/customer-checkout.tsx", { ...common, "../orders/order-form": { default: "OrderForm" } }).default;
  const form = load("../app/orders/order-form.tsx", { ...common, "../branches/branch-dialog": { default: "dialog" }, "./order-ui": ui, "../cart/order-summary": summary }, {
    AbortController, navigator: { geolocation: { getCurrentPosition(cb) { geo = cb; } } }, document: { getElementById: () => null },
  }).default;
  function renderer(component) {
    const state = { cursor: 0, slots: [], effects: [] }; let tree;
    return {
      render(props = {}) { active = state; state.cursor = 0; tree = component(props); return tree; },
      async effects() { for (const effect of state.effects.filter(Boolean)) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.fn(); effect.pending = false; } await new Promise(setImmediate); },
      get tree() { return tree; },
    };
  }
  const providerView = renderer(provider.default);
  const views = { shop: renderer(shop), cart: renderer(cart), checkout: renderer(checkout), form: renderer(form) };
  const h = {
    render(page) {
      currentCart = providerView.render({ children: null }).props.value;
      if (page === "form") {
        const checkoutTree = views.checkout.render();
        const props = nodes(checkoutTree).find((n) => n.type === "OrderForm")?.props;
        return props ? views.form.render(props) : checkoutTree;
      }
      return views[page].render();
    },
    async load(page) { h.render(page); await views[page].effects(); return h.render(page); },
    find(page, predicate) { return nodes(h.render(page)).find(predicate); },
    click(page, label) { const button = h.find(page, (n) => n.type === "button" && (n.props["aria-label"] === label || text(n) === label)); assert.ok(button, label); button.props.onClick(); return h.render(page); },
    input(id, value) { h.find("form", (n) => n.props?.id === id).props.onChange({ target: { value } }); h.render("form"); },
    async submit() { await h.render("form").props.onSubmit({ preventDefault() {} }); h.render("form"); },
    get cart() { h.render("shop"); return currentCart; }, calls, navigations,
    get preview() { return text(h.render("form")).includes("Preview Branch"); },
    resolveCatalog() { catalogFailed = false; }, unavailable() { unavailable = true; }, defer() { deferred = true; },
    resolvePreview() { pendingResponses.shift()({ available: true, bestAvailableBranch: { branchName: "Preview Branch", distanceKm: 1, workload: 0 } }); },
    location() { h.click("form", "Use Current Location"); geo({ coords: { latitude: 3, longitude: 4 } }); h.render("form"); },
  };
  h.render("shop"); return h;
}

test("shop displays catalog only; Add to Cart stays on shop, prevents duplicate rows and updates cart", async () => {
  const h = application(); assert.match(text(h.render("shop")), /Loading products/); await h.load("shop");
  assert.equal(nodes(h.render("shop")).filter((n) => n.type === "article").length, 2);
  assert.equal(nodes(h.render("shop")).filter((n) => n.type === "input" || n.type === "form").length, 0);
  h.click("shop", "Add Mouse to cart"); h.click("shop", "Add Mouse to cart"); h.click("shop", "Add Keyboard to cart");
  assert.equal(h.cart.items.length, 2); assert.equal(h.cart.items[0].quantity, 2); assert.equal(h.cart.count, 3);
  assert.match(text(h.render("shop")), /Keyboard added to cart/); assert.deepEqual(h.navigations, []); assert.equal(h.calls.length, 0);
  await h.load("cart"); assert.match(text(h.render("cart")), /Order TotalRs\. 9,500\.00/);
});

test("cart edits quantities, totals and removal; an empty cart cannot checkout", async () => {
  const h = application(); await h.load("shop"); h.click("shop", "Add Mouse to cart"); h.click("shop", "Add Keyboard to cart"); await h.load("cart");
  assert.equal(h.find("cart", (n) => n.props?.["aria-label"] === "Decrease Mouse quantity").props.disabled, true);
  h.click("cart", "Increase Mouse quantity"); assert.match(text(h.render("cart")), /Subtotal: Rs\. 5,000\.00/);
  assert.match(text(h.render("cart")), /Order TotalRs\. 9,500\.00/);
  h.click("cart", "Decrease Mouse quantity"); assert.match(text(h.render("cart")), /Order TotalRs\. 7,000\.00/);
  for (const value of [0, -1, 1.5, 2147483648]) { h.cart.quantity(1, value); assert.equal(h.cart.items[0].quantity, 1); }
  h.click("cart", "Remove Mouse"); assert.match(text(h.render("cart")), /Order TotalRs\. 4,500\.00/);
  h.click("cart", "Remove Keyboard"); assert.match(text(h.render("cart")), /Your Cart is Empty/);
  assert.equal(nodes(h.render("cart")).some((n) => n.type === "button" && text(n) === "Checkout"), false);
  assert.equal(nodes(h.render("checkout")).some((n) => n.type === "OrderForm"), false);
});

test("Buy Now checks out exactly one product at quantity 1 and retains the regular cart", async () => {
  const h = application(); await h.load("shop"); h.click("shop", "Add Keyboard to cart"); h.click("shop", "Buy Mouse now");
  assert.deepEqual(h.navigations, ["/checkout"]); assert.equal(h.cart.selection.mode, "buy-now");
  assert.equal(h.cart.selection.items.length, 1); assert.equal(h.cart.selection.items[0].productId, 1); assert.equal(h.cart.selection.items[0].quantity, 1);
  await h.load("form"); const tree = h.render("form"); assert.match(text(tree), /Order SummaryMouse/); assert.doesNotMatch(text(tree), /Keyboard|Add to Cart|Buy Now/);
  h.input("order-latitude", "0"); h.input("order-longitude", "0"); await h.submit(); await h.submit();
  assert.match(text(h.render("checkout")), /Order Placed SuccessfullyOrder #10Allocated BranchFinal Branch/);
  assert.equal(h.cart.items.length, 1); assert.equal(h.cart.items[0].productId, 2); assert.equal(h.cart.selection.mode, "cart");
});

test("cart checkout uses selected summary and existing APIs; edits invalidate previews; success clears purchase", async () => {
  const h = application(); await h.load("shop"); h.click("shop", "Add Mouse to cart"); await h.load("cart"); h.click("cart", "Checkout");
  assert.deepEqual(h.navigations, ["/checkout"]); await h.load("form");
  assert.doesNotMatch(text(h.render("form")), /Keyboard|Add to Cart|Buy Now/);
  assert.equal(nodes(h.render("form")).filter((n) => n.type === "select").length, 0);
  h.input("order-latitude", "0"); h.input("order-longitude", "0"); await h.submit(); assert.equal(h.preview, true);
  h.click("cart", "Increase Mouse quantity"); assert.equal(h.preview, false); await h.submit();
  h.click("shop", "Add Keyboard to cart"); assert.equal(h.preview, false); await h.submit();
  h.click("cart", "Remove Keyboard"); assert.equal(h.preview, false); await h.submit();
  h.input("order-latitude", "1"); assert.equal(h.preview, false); await h.submit();
  h.input("order-longitude", "2"); assert.equal(h.preview, false); await h.submit();
  h.location(); assert.equal(h.preview, false); await h.submit(); assert.equal(h.preview, true); await h.submit();
  assert.deepEqual(h.calls.at(-1), { url: "/api/orders", body: { customerLatitude: 3, customerLongitude: 4, items: [{ productId: 1, quantity: 2 }] } });
  assert.ok(h.calls.slice(0, -1).every((call) => call.url === "/api/orders/availability")); assert.equal(h.cart.count, 0);
  assert.match(text(h.render("checkout")), /Order #10Allocated BranchFinal Branch/);
});

test("unavailable orders never place; late availability responses cannot approve an edited cart", async () => {
  const h = application(); await h.load("shop"); h.click("shop", "Add Mouse to cart"); h.cart.quantity(1, 25); await h.load("form");
  h.input("order-latitude", "0"); h.input("order-longitude", "0"); h.unavailable(); await h.submit(); await h.submit();
  assert.match(text(h.render("form")), /No single branch/); assert.ok(h.calls.every((call) => call.url === "/api/orders/availability"));
  const late = application(); await late.load("shop"); late.click("shop", "Add Mouse to cart"); await late.load("form");
  late.input("order-latitude", "0"); late.input("order-longitude", "0"); late.defer(); const request = late.submit();
  late.cart.quantity(1, 2); late.resolvePreview(); await request; assert.equal(late.preview, false);
});

test("cart checkout replaces Buy Now; completion removes only purchased snapshot quantities", () => {
  const h = application(); h.cart.add(1); h.cart.add(2); h.cart.buyNow(1); h.cart.checkoutCart();
  const snapshot = h.cart.selection; assert.equal(snapshot.mode, "cart"); assert.equal(snapshot.items.length, 2);
  h.cart.add(1); h.cart.add(3); h.cart.complete(snapshot);
  assert.equal(h.cart.items.length, 2); assert.equal(h.cart.items[0].productId, 1); assert.equal(h.cart.items[0].quantity, 1); assert.equal(h.cart.items[1].productId, 3);
  assert.equal(application().cart.count, 0);
  const buy = application(); buy.cart.add(2); buy.cart.buyNow(1);
  const purchase = buy.cart.selection; buy.cart.add(3); buy.cart.complete(purchase);
  assert.equal(buy.cart.selection.mode, "cart"); assert.equal(buy.cart.items.length, 2);
  buy.cart.buyNow(1); const oldPurchase = buy.cart.selection; buy.cart.buyNow(2); buy.cart.complete(oldPurchase);
  assert.equal(buy.cart.selection.mode, "buy-now"); assert.equal(buy.cart.selection.items[0].productId, 2);
});

test("catalog loading, empty, errors and retry are safe; deleted cart products block checkout", async () => {
  const empty = application({ catalog: [] }); await empty.load("shop"); assert.match(text(empty.render("shop")), /No products are currently available/);
  const h = application({ failCatalog: true }); await h.load("shop"); assert.match(text(h.render("shop")), /Products could not be loaded/);
  h.resolveCatalog(); h.click("shop", "Retry products"); await h.load("shop"); assert.equal(nodes(h.render("shop")).filter((n) => n.type === "article").length, 2);
  const missing = application(); missing.cart.add(999); await missing.load("cart");
  assert.match(text(missing.render("cart")), /no longer available/); assert.equal(missing.find("cart", (n) => n.type === "button" && text(n) === "Checkout").props.disabled, true);
  await missing.load("form"); missing.input("order-latitude", "0"); missing.input("order-longitude", "0"); await missing.submit(); assert.equal(missing.calls.length, 0);
});

test("shop, cart and checkout server pages allow only CUSTOMER", async () => {
  for (const [path, dependency, target] of [["shop", "./customer-shop", "/products"], ["cart", "./customer-cart", "/products"], ["checkout", "./customer-checkout", "/orders"]]) {
    let current = null; const jsx = (type, props) => ({ type, props });
    const page = load(`../app/${path}/page.tsx`, { "react/jsx-runtime": { jsx, jsxs: jsx }, [dependency]: { default: path }, "@/lib/auth": { getCurrentUser: async () => current, isCustomerUser: (user) => user.role === "CUSTOMER" }, "next/navigation": { redirect(url) { throw new Error(`redirect:${url}`); } } }).default;
    await assert.rejects(page(), /redirect:\/login/);
    for (const role of ["ADMIN", "STAFF"]) { current = { role, management: true }; await assert.rejects(page(), (error) => error.message === `redirect:${target}`); }
    current = { role: "CUSTOMER", management: false }; assert.equal((await page()).type, path);
  }
});

test("existing availability API rejects combined stock and selects one branch fulfilling every product", async () => {
  const allocation = load("../lib/allocation.ts", {});
  const stock = load("../lib/order-stock.ts", {});
  const next = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
  const orders = load("../lib/orders.ts", { "next/server": next, "@/lib/order-stock": stock, "@/app/generated/prisma/client": { Prisma: {} } });
  let branches = [{ id: 1, name: "Colombo", stock: { 1: 10 } }, { id: 2, name: "Kandy", stock: { 1: 20 } }, { id: 3, name: "Galle", stock: { 1: 5 } }];
  const db = {
    product: { findMany: async ({ where }) => where.id.in.map((id) => ({ id })) },
    branch: { findMany: async ({ where }) => branches.filter((branch) => where.AND.every(({ inventories: { some } }) => (branch.stock[some.productId] ?? 0) >= some.quantity.gte)).map((branch) => ({ ...branch, latitude: 0, longitude: 0 })) },
    order: { groupBy: async () => [] },
  };
  const route = load("../app/api/orders/availability/route.ts", { "next/server": next, "@/lib/db": { prisma: db }, "@/lib/allocation": allocation, "@/lib/orders": orders });
  const check = (items) => route.POST({ json: async () => ({ customerLatitude: 0, customerLongitude: 0, items }) });
  assert.equal((await check([{ productId: 1, quantity: 25 }])).body.available, false);
  branches = [{ id: 1, name: "Colombo", stock: { 1: 20, 2: 2 } }, { id: 2, name: "Kandy", stock: { 1: 10, 2: 8 } }];
  const result = await check([{ productId: 1, quantity: 10 }, { productId: 2, quantity: 5 }]);
  assert.equal(result.body.available, true); assert.equal(result.body.bestAvailableBranch.branchName, "Kandy");
});
