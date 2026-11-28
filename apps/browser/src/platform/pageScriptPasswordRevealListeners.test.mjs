import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync(new URL("../../../../packages/ardiacore/ios/page_script.js", import.meta.url), "utf8");
const start = script.indexOf("  const typedByUser = new WeakSet();");
const end = script.indexOf("  let pageNotification = null;", start);
assert.ok(start > 0 && end > start, "page_script.js has the password reveal listeners");
const source = script.slice(start, end);

function page() {
  const timers = [];
  const documentListeners = {};
  const windowListeners = {};
  const closestCalls = [];
  class HTMLInputElement {
    constructor(type) {
      this.type = type;
      this.value = "";
      this.selectionStart = 0;
      this.selectionEnd = 0;
    }
    getBoundingClientRect() {
      return { left: 0, right: 300, top: 0, height: 30, width: 300 };
    }
    closest(selector) {
      closestCalls.push(selector);
      return null;
    }
    focus() {}
    setSelectionRange() {}
  }
  const shadowButton = {
    style: {},
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
  };
  const documentElement = { appendChild(host) { this.eye = host; } };
  const document = {
    activeElement: null,
    documentElement,
    addEventListener: (type, fn) => (documentListeners[type] ??= []).push(fn),
    createElement: () => ({
      style: {},
      isConnected: true,
      attachShadow: () => ({ querySelector: () => shadowButton, set innerHTML(_) {} }),
      contains: () => false,
    }),
  };
  const addEventListener = (type, fn) => (windowListeners[type] ??= []).push(fn);
  const setTimeout = (fn) => timers.push(fn);
  const getComputedStyle = () => ({ direction: "ltr", borderRightWidth: "1px", paddingRight: "8px", color: "rgb(0, 0, 0)" });
  const guard = (fn) =>
    function () {
      try {
        return Reflect.apply(fn, this, arguments);
      } catch (e) {}
    };
  const fieldProviders = { hasOwnToggle: () => false };
  new Function(
    "document",
    "addEventListener",
    "setTimeout",
    "requestAnimationFrame",
    "getComputedStyle",
    "HTMLInputElement",
    "guard",
    "fieldProviders",
    source,
  )(document, addEventListener, setTimeout, (fn) => fn(), getComputedStyle, HTMLInputElement, guard, fieldProviders);
  const fire = (type, event) => {
    for (const fn of documentListeners[type] ?? []) fn(event);
  };
  return { document, fire, timers, closestCalls, shadowButton, HTMLInputElement };
}

test("with no password shown, leaving a field schedules nothing and a click looks up nothing", () => {
  const p = page();
  const field = new p.HTMLInputElement("text");
  for (let i = 0; i < 50; i++) {
    p.document.activeElement = field;
    p.fire("focusin", { target: field });
    p.fire("focusout", { target: field });
    p.fire("click", { target: field });
  }
  assert.equal(p.timers.length, 0);
  assert.deepEqual(p.closestCalls, []);
});

test("once the eye shows on a typed password, leaving the field still hides it on the next turn", () => {
  const p = page();
  const field = new p.HTMLInputElement("password");
  field.value = "hunter2";
  p.document.activeElement = field;
  p.fire("input", { target: field, isTrusted: true });
  assert.equal(p.timers.length, 0);
  p.fire("focusout", { target: field });
  assert.equal(p.document.documentElement.eye.style.display, "block");
  p.document.activeElement = null;
  assert.equal(p.timers.length, 1, "a shown eye is checked again after focus moves");
  p.timers.shift()();
  assert.equal(p.document.documentElement.eye.style.display, "none");
});

test("a revealed password is hidden again when the page's own button is clicked", () => {
  const p = page();
  const field = new p.HTMLInputElement("password");
  field.value = "hunter2";
  p.document.activeElement = field;
  p.fire("input", { target: field, isTrusted: true });
  p.shadowButton.listeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(field.type, "text", "the eye reveals the password");
  const submit = { closest: () => submit };
  p.fire("click", { target: submit });
  assert.equal(field.type, "password", "a click on a page button conceals it");
});
