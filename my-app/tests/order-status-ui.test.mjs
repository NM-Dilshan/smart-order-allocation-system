import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function harness(file, dependencies, props = {}) {
  const slots = []; let cursor = 0; let mounted = false; const effects = [];
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback(fn) { return fn; },
    useEffect(fn) { if (!mounted) effects.push(fn); },
  };
  const jsx = (type, props) => ({ type, props }); const exports = {};
  const deps = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": {}, ...dependencies };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, AbortController, require: (name) => { if (!(name in deps)) throw new Error(name); return deps[name]; } });
  return { render() { cursor = 0; const tree = exports.default(props); mounted = true; return tree; }, effects };
}
function nodes(node) { if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
const flush = () => new Promise((resolve) => setImmediate(resolve));
const order = (id, status) => ({ id, status, branchId: 1, branch: { id: 1, name: "Branch" }, customerLatitude: 0, customerLongitude: 0, createdAt: "2026-09-16T00:00:00Z", items: [{ id: 1, quantity: 3, productId: 1, product: { id: 1, name: "Mouse", price: 2500 } }] });

test("completion confirmation blocks duplicate clicks and shows server errors", async () => {
  const calls = []; let resolve; let reject; let completed;
  const ui = harness("../app/orders/complete-order-dialog.tsx", {
    "../branches/branch-dialog": { default: "dialog" },
    "./order-ui": { message: (error) => error.message, api: (url, options) => { calls.push({ url, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); } },
  }, { order: order(1, "ALLOCATED"), onClose() {}, onComplete: (value) => { completed = value; } });
  let tree = ui.render(); assert.ok(tree.props.title.includes("Mark Order #1 as Completed?")); assert.equal(calls.length, 0);
  const button = nodes(tree).find((node) => node.type === "button" && JSON.stringify(node).includes("Mark as Completed"));
  button.props.onClick(); button.props.onClick(); tree = ui.render();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/orders/1/complete"); assert.equal(calls[0].options.method, "POST");
  assert.ok(nodes(tree).filter((node) => node.type === "button").every((node) => node.props.disabled));
  const final = order(1, "COMPLETED"); resolve(final); await flush(); tree = ui.render(); assert.equal(completed, final);
  nodes(tree).find((node) => node.type === "button" && JSON.stringify(node).includes("Mark as Completed")).props.onClick();
  reject(new Error("Only allocated orders can be marked as completed.")); await flush(); tree = ui.render();
  assert.ok(nodes(tree).some((node) => node.props?.role === "alert")); assert.ok(JSON.stringify(tree).includes("Only allocated orders"));
});

test("management renders actions only for allocated orders and refreshes completion status", async () => {
  let remote = [order(1, "ALLOCATED"), order(2, "COMPLETED"), order(3, "CANCELLED"), order(4, "PENDING")];
  const ui = harness("../app/orders/order-manager.tsx", {
    "./cancel-order-dialog": { default: "cancel-dialog" }, "./complete-order-dialog": { default: "complete-dialog" }, "./order-form": { default: "order-form" },
    "./order-ui": { api: async () => remote, message: String },
  }, { canManage: true, canOrder: false });
  ui.render(); ui.effects.forEach((effect) => effect()); await flush(); let tree = ui.render();
  const row = (id) => nodes(tree).find((node) => node.type === "tr" && node.props.children?.[0]?.props.children?.[1] === id);
  assert.equal(nodes(row(1)).filter((node) => node.type === "button").length, 2);
  for (const id of [2, 3, 4]) assert.equal(nodes(row(id)).filter((node) => node.type === "button").length, 0);
  assert.ok(!nodes(tree).some((node) => node.type === "select"));
  nodes(row(1)).find((node) => node.type === "button" && JSON.stringify(node).includes("Mark as Completed")).props.onClick(); tree = ui.render();
  remote = remote.map((item) => item.id === 1 ? { ...item, status: "COMPLETED" } : item);
  nodes(tree).find((node) => node.type === "complete-dialog").props.onComplete(remote[0]); await flush(); tree = ui.render();
  assert.ok(JSON.stringify(tree).includes("COMPLETED. Inventory unchanged."));
  assert.equal(nodes(row(1)).filter((node) => node.type === "button").length, 0);
});

test("customer My Orders renders current COMPLETED status with no management actions", async () => {
  const ui = harness("../app/my-orders/my-orders.tsx", {
    "../orders/order-ui": { api: async () => [order(1, "COMPLETED")], message: String },
    "@/lib/customer-orders": { orderTotal: (value) => value.items.reduce((total, item) => total + item.product.price * item.quantity, 0) },
  });
  ui.render(); ui.effects.forEach((effect) => effect()); await flush(); const tree = ui.render();
  assert.ok(JSON.stringify(tree).includes("COMPLETED"));
  const buttons = nodes(tree).filter((node) => node.type === "button");
  assert.ok(!buttons.some((node) => /Mark as Completed|Cancel Order/.test(JSON.stringify(node))));
  assert.ok(!nodes(tree).some((node) => node.type === "select"));
});
