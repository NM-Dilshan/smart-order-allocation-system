import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Render the real form with a minimal hook/JSX harness; exercise its event handlers.
test("form invalidates previews on all allocation edits and submits current coordinates", async () => {
  const slots = []; let cursor = 0; const effects = []; const calls = [];
  let geo;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn) { cursor++; if (!effects.length) effects.push(fn); },
  };
  const jsx = (type, props) => ({ type, props });
  const final = { id: 10, allocation: { branchId: 2, branchName: "Final Branch" } }; let completed;
  const deps = {
    "../cart/order-summary": { default: "OrderSummary" },
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": {}, "../branches/branch-dialog": { default: "dialog" },
    "./order-ui": { api: async (url, options) => {
      if (url === "/api/products") return [{ id: 1, name: "Mouse" }, { id: 2, name: "Keyboard" }];
      calls.push(JSON.parse(options.body));
      return url.endsWith("availability") ? { available: true, bestAvailableBranch: { branchId: 1, branchName: "Preview Branch", distanceKm: 2, workload: 1 } } : final;
    }, message: String },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../app/orders/order-form.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: (name) => deps[name], AbortController, navigator: { geolocation: { getCurrentPosition: (cb) => { geo = cb; } } }, document: { getElementById: () => null },
  });
  let tree;
  function render() { cursor = 0; tree = exports.default({ onClose() {}, onComplete(order) { completed = order; } }); }
  function nodes(node) { if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap((child) => nodes(child))]; }
  const find = (predicate) => nodes(tree).find(predicate);
  const input = (id, value) => { find((n) => n.props?.id === id).props.onChange({ target: { value } }); render(); };
  const submit = async () => { await find((n) => n.type === "form").props.onSubmit({ preventDefault() {} }); render(); };
  const hasPreview = () => JSON.stringify(tree).includes("Preview Branch");
  render(); effects[0](); await new Promise((resolve) => setImmediate(resolve)); render();
  input("order-latitude", "0"); input("order-longitude", "0"); input("order-product-0", "1");
  await submit(); assert.ok(hasPreview()); assert.equal(calls[0].customerLatitude, 0);
  for (const [id, value] of [["order-quantity-0", "3"], ["order-latitude", "1"], ["order-longitude", "2"], ["order-product-0", "2"]]) {
    input(id, value); assert.ok(!hasPreview()); await submit(); assert.ok(hasPreview());
  }
  find((n) => n.props?.id === "order-items").props.onClick(); render(); assert.ok(!hasPreview());
  find((n) => n.props?.["aria-label"] === "Remove item 2").props.onClick(); render(); await submit(); assert.ok(hasPreview());
  find((n) => n.type === "button" && JSON.stringify(n).includes("Use Current Location")).props.onClick();
  geo({ coords: { latitude: 3, longitude: 4 } }); render(); assert.ok(!hasPreview());
  await submit(); assert.ok(hasPreview()); await submit(); assert.equal(completed, final);
  assert.equal(calls.at(-1).customerLatitude, 3); assert.equal(calls.at(-1).branchId, undefined);
});

