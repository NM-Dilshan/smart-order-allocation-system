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
const inquiry = (id, status) => ({ id, status, message: "Where is my order?", predictedCategory: "Order Status Inquiry", confidence: 0.4895, createdAt: "2026-09-16T00:00:00Z", adminReply: status === "RESOLVED" ? "Your order is being processed." : null, repliedAt: status === "RESOLVED" ? "2026-09-16T01:00:00Z" : null, user: { name: "Customer", email: "customer@example.test" }, repliedBy: status === "RESOLVED" ? { name: "Admin", email: "admin@example.test" } : null });
const inquiryExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../lib/inquiries.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: inquiryExports });

test("manual reply dialog validates, blocks duplicate submission and preserves text on server conflict", async () => {
  const calls = []; let resolve; let reject; let completed;
  const ui = harness("../app/admin/inquiries/reply-dialog.tsx", {
    "../../branches/branch-dialog": { default: "dialog" }, "@/lib/inquiries": inquiryExports,
    "../../orders/order-ui": { message: (error) => error.message, api: (url, options) => { calls.push({ url, options }); return new Promise((yes, no) => { resolve = yes; reject = no; }); } },
  }, { inquiry: inquiry(1, "OPEN"), onClose() {}, onReply: (value) => { completed = value; } });
  let tree = ui.render();
  const enter = (value) => { nodes(tree).find((node) => node.type === "textarea").props.onChange({ target: { value } }); tree = ui.render(); };
  const submit = () => nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  for (const text of ["", "  ", "x".repeat(2001)]) { enter(text); await submit(); tree = ui.render(); assert.equal(calls.length, 0); }
  enter("  Your order is being processed.  "); const first = submit(); await submit(); tree = ui.render();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/inquiries/1/reply");
  assert.deepEqual(JSON.parse(calls[0].options.body), { reply: "Your order is being processed." });
  assert.ok(nodes(tree).filter((node) => ["button", "textarea"].includes(node.type)).every((node) => node.props.disabled));
  resolve(inquiry(1, "RESOLVED")); await first; tree = ui.render(); assert.equal(completed.status, "RESOLVED");
  const failed = submit(); reject(new Error("This inquiry has already been resolved. Refresh to see the reply.")); await failed; tree = ui.render();
  assert.ok(nodes(tree).some((node) => node.props?.role === "alert"));
  assert.ok(nodes(tree).find((node) => node.type === "textarea").props.value.includes("Your order is being processed."));
});

test("management shows reply metadata, filters statuses and removes Reply after resolution", async () => {
  const ui = harness("../app/admin/inquiries/inquiry-manager.tsx", {
    "./reply-dialog": { default: "reply-dialog" }, "@/lib/inquiries": inquiryExports,
    "../../orders/order-ui": { api: async () => [inquiry(1, "OPEN"), inquiry(2, "RESOLVED")], message: String },
  });
  ui.render(); ui.effects.forEach((effect) => effect()); await flush(); let tree = ui.render();
  const button = (text) => nodes(tree).find((node) => node.type === "button" && node.props.children === text);
  assert.equal(nodes(tree).filter((node) => node.type === "button" && node.props.children === "Reply").length, 1);
  assert.ok(JSON.stringify(tree).includes("admin@example.test"));
  button("Resolved").props.onClick(); tree = ui.render(); assert.equal(button("Reply"), undefined);
  button("Open").props.onClick(); tree = ui.render(); assert.equal(nodes(tree).filter((node) => node.type === "article").length, 1);
  button("Reply").props.onClick(); tree = ui.render();
  nodes(tree).find((node) => node.type === "reply-dialog").props.onReply(inquiry(1, "RESOLVED")); tree = ui.render();
  assert.equal(button("Reply"), undefined); assert.ok(JSON.stringify(tree).includes("Reply sent."));
  button("All").props.onClick(); tree = ui.render(); assert.equal(nodes(tree).filter((node) => node.type === "article").length, 2);
});

test("customer support history displays waiting and resolved replies without reply controls", async () => {
  const ui = harness("../app/support/support-form.tsx", {
    "@/lib/inquiries": inquiryExports,
    "../orders/order-ui": { api: async () => [inquiry(1, "OPEN"), inquiry(2, "RESOLVED")], message: String },
  });
  ui.render(); ui.effects.forEach((effect) => effect()); await flush(); const tree = ui.render();
  const serialized = JSON.stringify(tree);
  for (const text of ["OPEN", "RESOLVED", "Waiting for support response.", "Support Reply", "Your order is being processed.", "Replied:"]) assert.ok(serialized.includes(text));
  assert.ok(!serialized.includes("admin@example.test"));
  assert.ok(!nodes(tree).some((node) => node.type === "button" && /Send Reply|^Reply$/.test(String(node.props.children))));
});
