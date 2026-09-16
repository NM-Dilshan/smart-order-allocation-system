import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function harness(file, user = null) {
  const slots = []; let cursor = 0; let pathname = "/orders"; let focused = false;
  const calls = []; const redirects = []; let ok = true; let refreshed = false;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = value; }]; },
      useRef() { const i = cursor++; if (!(i in slots)) slots[i] = { current: { focus() { focused = true; } } }; return slots[i]; },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": { Menu: "Menu", X: "X", LogOut: "LogOut" },
    "next/link": { default: "Link" }, "./auth-controls": { default: "AuthControls" },
    "next/navigation": { usePathname: () => pathname, useRouter: () => ({ replace: (path) => redirects.push(path), refresh() { refreshed = true; } }) },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name) => dependencies[name], fetch: async (path, options) => { calls.push({ path, options }); return { ok }; },
  });
  return { render(props = { user }) { cursor = 0; return exports.default(props); }, route(path) { pathname = path; }, get focused() { return focused; }, calls, redirects, get refreshed() { return refreshed; }, fail() { ok = false; } };
}
function nodes(node) { return !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
const user = (role) => ({ name: "Test User", email: "test@example.test", role, management: role === "ADMIN" || role === "STAFF", customer: role === "CUSTOMER" });

test("guest, customer, admin and staff receive only their appropriate navigation", () => {
  for (const [role, expected] of [[null, ["Customer Login", "Register"]], ["CUSTOMER", ["Place Order", "My Orders", "Support"]], ["ADMIN", ["Branches", "Products", "Inventory", "Orders", "Inquiries"]], ["STAFF", ["Branches", "Products", "Inventory", "Orders", "Inquiries"]]]) {
    const h = harness("../app/application-header.tsx", role ? user(role) : null);
    const tree = h.render();
    const nav = nodes(tree).find((n) => n.type === "nav");
    assert.deepEqual(nodes(nav).filter((n) => n.type === "Link").map((n) => n.props.children), expected);
    assert.equal(nodes(tree).filter((n) => n.type === "AuthControls").length, role ? 1 : 0);
    if (role === "ADMIN" || role === "STAFF") assert.ok(nodes(tree).some((n) => n.type === "span" && n.props.children === role));
  }
});

test("active routes and mobile menu toggle, link closing, route closing and Escape focus", () => {
  const h = harness("../app/application-header.tsx", user("CUSTOMER"));
  const toggle = (tree) => nodes(tree).find((n) => n.type === "button");
  const panel = (tree) => nodes(tree).find((n) => n.props?.id === "application-navigation");
  let tree = h.render(); assert.equal(toggle(tree).props["aria-expanded"], false);
  toggle(tree).props.onClick(); tree = h.render(); assert.equal(toggle(tree).props["aria-expanded"], true);
  assert.ok(panel(tree).props.className.startsWith("flex"));
  nodes(tree).find((n) => n.type === "Link" && n.props.href === "/my-orders").props.onClick();
  tree = h.render(); assert.equal(toggle(tree).props["aria-expanded"], false);
  toggle(tree).props.onClick(); h.route("/support"); tree = h.render(); assert.equal(toggle(tree).props["aria-expanded"], false);
  toggle(tree).props.onClick(); tree = h.render(); tree.props.onKeyDown({ key: "Escape" });
  assert.equal(h.focused, true); assert.equal(toggle(h.render()).props["aria-expanded"], false);
  for (const path of ["/orders", "/my-orders", "/support", "/support/history"]) {
    h.route(path); const active = nodes(h.render()).filter((n) => n.props?.["aria-current"] === "page");
    assert.equal(active.length, 1); assert.equal(active[0].props.href, path === "/support/history" ? "/support" : path);
  }
});

test("existing logout POST and role redirects still work and failures remain retryable", async () => {
  for (const management of [false, true]) {
    const h = harness("../app/auth-controls.tsx"); const props = { name: "Test", management };
    await nodes(h.render(props)).find((n) => n.type === "button").props.onClick();
    // The event starts the existing async handler without returning its promise.
    await new Promise(setImmediate);
    assert.equal(h.calls[0].path, "/api/auth/logout"); assert.equal(h.calls[0].options.method, "POST");
    assert.deepEqual(h.redirects, [management ? "/admin/login" : "/login"]); assert.equal(h.refreshed, true);
  }
  const h = harness("../app/auth-controls.tsx"); h.fail();
  const props = { name: "Test" }; nodes(h.render(props)).find((n) => n.type === "button").props.onClick(); await new Promise(setImmediate);
  assert.ok(nodes(h.render(props)).some((n) => n.props?.role === "alert")); assert.equal(h.redirects.length, 0);
});

test("management page guard still blocks guests and customers and accepts ADMIN and STAFF", async () => {
  let current = null;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/auth": { getCurrentUser: async () => current },
    "next/navigation": { redirect(path) { throw new Error(`redirect:${path}`); } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../app/management-access.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name) => dependencies[name] });
  for (const role of [null, "CUSTOMER", "ADMIN", "STAFF"]) {
    current = role ? user(role) : null;
    if (!current?.management) await assert.rejects(exports.default({ children: "protected" }), /redirect:\/admin\/login/);
    else assert.equal((await exports.default({ children: "protected" })).props.children, "protected");
  }
});
