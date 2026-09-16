import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(file, deps, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name) => deps[name], ...globals });
  return exports;
}

test("support form validates, trims, prevents concurrent submits and confirms the real response category", async () => {
  const slots = []; let cursor = 0; const calls = []; let resolveSubmission; let rejectSubmission;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {},
  };
  const jsx = (type, props) => ({ type, props });
  const component = load("../app/support/support-form.tsx", {
    react, "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": {},
    "@/lib/inquiries": load("../lib/inquiries.ts", {}),
    "../orders/order-ui": { message: (error) => error.message, api: (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return new Promise((resolve, reject) => { resolveSubmission = resolve; rejectSubmission = reject; });
    } },
  });
  let tree;
  function render() { cursor = 0; tree = component.default(); }
  function nodes(node) { if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
  const setMessage = (value) => { nodes(tree).find((node) => node.type === "textarea").props.onChange({ target: { value } }); render(); };
  const submit = () => nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  render();
  for (const text of ["", "   ", "x".repeat(2001)]) { setMessage(text); await submit(); render(); assert.equal(calls.length, 0); }
  setMessage("  Where is my order?  ");
  const first = submit(); render(); assert.equal(nodes(tree).find((node) => node.type === "textarea").props.disabled, true);
  await submit(); assert.equal(calls.length, 1); assert.equal(calls[0].body.message, "Where is my order?"); assert.equal(calls[0].body.userId, undefined);
  resolveSubmission({ id: 1, message: "Where is my order?", predictedCategory: "Order Status Inquiry", createdAt: "2026-09-16T00:00:00Z" });
  await first; render(); assert.ok(JSON.stringify(tree).includes("Inquiry submitted successfully.")); assert.ok(JSON.stringify(tree).includes("Order Status Inquiry"));
  assert.equal(nodes(tree).find((node) => node.type === "textarea").props.value, "");
  setMessage("Please help"); const failed = submit(); rejectSubmission(new Error("Classification is temporarily unavailable. Please try again.")); await failed; render();
  assert.ok(JSON.stringify(tree).includes("temporarily unavailable")); assert.equal(nodes(tree).find((node) => node.type === "textarea").props.value, "Please help");
});
