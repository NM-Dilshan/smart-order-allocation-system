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
    if (props.registration) { await submit({ ...values, confirmPassword: "wrong" }); assert.equal(calls.length, 0); assert.ok(JSON.stringify(tree).includes("Passwords must match.")); }
    await submit(values);
    assert.equal(calls[0].path, props.registration ? "/api/auth/register" : props.management ? "/api/auth/admin/login" : "/api/auth/login");
    assert.equal(calls[0].body.role, undefined);
    assert.equal(target, props.registration ? "/login?registered=1" : props.management ? "/branches" : "/orders");
  }
});
