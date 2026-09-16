import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("account forms use fixed endpoints, validate confirmation, and redirect by entry point", async () => {
  for (const props of [{}, { management: true }, { registration: true }]) {
    const slots = []; let cursor = 0; let target; const calls = [];
    const react = {
      useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = value; }]; },
      useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    };
    const jsx = (type, props) => ({ type, props });
    const dependencies = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "lucide-react": {}, "next/navigation": { useRouter: () => ({ replace: (path) => { target = path; }, refresh() {} }) } };
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL("../app/login/login-form.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
      exports, require: (name) => dependencies[name], FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key]; } },
      fetch: async (path, options) => { calls.push({ path, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) }; },
    });
    let tree;
    function render() { cursor = 0; tree = exports.default(props); }
    function nodes(node) { if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }
    const values = { email: "customer@example.test", password: "long-password-value", confirmPassword: "long-password-value", name: "Customer" };
    async function submit(data) { await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: data }); render(); }
    render();
    assert.ok(!nodes(tree).some((node) => node.props?.name === "role"));
    const passwordFields = props.registration ? ["password", "confirmPassword"] : ["password"];
    const input = (field) => nodes(tree).find((node) => node.type === "input" && node.props.name === field);
    const toggle = (field) => nodes(tree).find((node) => node.type === "button" && node.props["aria-controls"] === field);
    for (const field of passwordFields) {
      assert.equal(input(field).props.type, "password");
      assert.equal(toggle(field).props.type, "button");
      assert.equal(toggle(field).props["aria-label"], "Show password");
      toggle(field).props.onClick(); render();
      assert.equal(input(field).props.type, "text");
      assert.equal(toggle(field).props["aria-label"], "Hide password");
      assert.equal(input(field).props.required, true);
      assert.equal(input(field).props.minLength, props.registration ? 12 : undefined);
      assert.equal(input(field).props.maxLength, 256);
      for (const other of passwordFields.filter((other) => other !== field)) assert.equal(input(other).props.type, "password");
      toggle(field).props.onClick(); render();
      assert.equal(input(field).props.type, "password");
    }
    // Submit with visible passwords as well: input presentation must not affect the payload.
    for (const field of passwordFields) { toggle(field).props.onClick(); render(); }
    if (props.registration) { await submit({ ...values, confirmPassword: "wrong" }); assert.equal(calls.length, 0); assert.ok(JSON.stringify(tree).includes("Passwords must match.")); }
    await submit(values);
    assert.equal(calls[0].path, props.registration ? "/api/auth/register" : props.management ? "/api/auth/admin/login" : "/api/auth/login");
    assert.equal(calls[0].body.role, undefined);
    assert.equal(calls[0].body.password, values.password);
    if (props.registration) assert.equal(calls[0].body.confirmPassword, values.confirmPassword);
    assert.equal(target, props.registration ? "/login?registered=1" : props.management ? "/branches" : "/orders");
  }
});
