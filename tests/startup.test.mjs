import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { colorProperties, normalizeColors, normalizeConfig } from "../extension/validation.js";

const source = readFileSync(new URL("../extension/startpage.js", import.meta.url), "utf8").replace(/^import[^\n]+\n/u, "");
const colors = Object.fromEntries(Object.keys(colorProperties).map(key => [key, "#123456"]));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function settle() {
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
}

function page({ managed = Promise.resolve({}), palette = Promise.reject(new Error("No host")), cached = null, searchError = false } = {}) {
  palette.catch(() => {});
  const attributes = new Set(["data-loading", "data-starting"]);
  const properties = {};
  const elements = new Map();
  const handlers = {};
  const writes = [];
  const removed = [];
  const searches = [];
  const nativeCalls = [];
  const timers = new Map();
  const frames = [];
  let nextTimer = 0;
  const element = () => ({ textContent: "", value: "", children: [], append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, focus() {}, addEventListener(name, handler) { handlers[name] = handler; } });
  const document = {
    hidden: false,
    hasFocus: () => false,
    documentElement: { removeAttribute(name) { attributes.delete(name); }, style: { setProperty(name, value) { properties[name] = value; }, removeProperty(name) { delete properties[name]; } } },
    getElementById(name) { if (!elements.has(name)) elements.set(name, element()); return elements.get(name); },
    createElement: element,
    createDocumentFragment: element,
    addEventListener() {}
  };
  if (cached) {
    for (const [key, property] of Object.entries(colorProperties)) properties[property] = cached[key];
    properties["--green-accent"] = cached.mSecondary;
  }
  const context = vm.createContext({
    document, colorProperties, normalizeColors, normalizeConfig,
    startpageCachedPalette: cached,
    browser: {
      storage: { managed: { get: () => managed }, onChanged: { addListener() {} } },
      runtime: { sendNativeMessage(...args) { nativeCalls.push(args); return palette; } },
      search: { search(details) { searches.push(JSON.parse(JSON.stringify(details))); return searchError ? Promise.reject(new Error("Unavailable")) : Promise.resolve(); } }
    },
    localStorage: { setItem(key, value) { writes.push({ key, value }); }, removeItem(key) { removed.push(key); } },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() {},
    requestAnimationFrame(fn) { frames.push(fn); }
  });
  vm.runInContext(source, context);
  return { attributes, properties, elements, handlers, writes, removed, searches, nativeCalls, timers, frames, document };
}

test("first visible state waits for managed settings and a fresh palette", async () => {
  const managed = deferred();
  const palette = deferred();
  const state = page({ managed: managed.promise, palette: palette.promise });
  assert.ok(state.attributes.has("data-loading"));
  assert.equal(state.nativeCalls.length, 0);
  managed.resolve({ username: "wrees", hostname: "Alpha", noctalia: true, searchEngine: "Google" });
  await settle();
  assert.equal(state.nativeCalls.length, 1);
  assert.ok(state.attributes.has("data-loading"));
  palette.resolve({ ok: true, colors: { ...colors, unexpected: "private" } });
  await settle();
  assert.ok(!state.attributes.has("data-loading"));
  assert.ok(state.attributes.has("data-starting"));
  assert.equal(state.elements.get("terminal-host").textContent, "Alpha:~#");
  assert.equal(state.elements.get("prompt-identity").textContent, "wrees@Alpha");
  assert.match(state.elements.get("search-query").placeholder, /Google/u);
  assert.equal(state.properties["--bg-color"], colors.mSurface);
  assert.equal(state.elements.get("theme-status").textContent, "NOCTALIA");
  assert.deepEqual(JSON.parse(state.writes[0].value), colors);
  state.frames.shift()();
  state.frames.shift()();
  assert.ok(!state.attributes.has("data-starting"));
});

test("a hung native host falls back to cache and a late reply cannot repaint the page", async () => {
  const palette = deferred();
  const state = page({ managed: Promise.resolve({ noctalia: true }), palette: palette.promise, cached: colors });
  await settle();
  assert.ok(state.attributes.has("data-loading"));
  assert.equal(state.timers.size, 1);
  [...state.timers.values()][0]();
  await settle();
  assert.ok(!state.attributes.has("data-loading"));
  assert.equal(state.elements.get("theme-status").textContent, "CACHED PALETTE");
  palette.resolve({ ok: true, colors: { ...colors, mSurface: "#ffffff" } });
  await settle();
  assert.equal(state.properties["--bg-color"], colors.mSurface);
  assert.equal(state.writes.length, 0);
});

test("disabling Noctalia clears cached colors and never starts a native process", async () => {
  const state = page({ cached: colors });
  await settle();
  assert.deepEqual(state.properties, {});
  assert.deepEqual(state.removed, ["wrees-startpage.palette.v1"]);
  assert.equal(state.nativeCalls.length, 0);
  assert.ok(!state.attributes.has("data-loading"));
});

test("unavailable managed storage cannot leave the page permanently hidden", async () => {
  const state = page({ managed: new Promise(() => {}) });
  [...state.timers.values()][0]();
  await settle();
  assert.ok(!state.attributes.has("data-loading"));
  assert.match(state.elements.get("search-query").placeholder, /DuckDuckGo/u);
  assert.equal(state.nativeCalls.length, 0);
});

test("only explicit nonempty searches reach the chosen browser engine in the current tab", async () => {
  const state = page({ managed: Promise.resolve({ searchEngine: "Google" }) });
  await settle();
  const event = { preventDefault() {} };
  state.elements.get("search-query").value = "  ";
  await state.handlers.submit(event);
  assert.equal(state.searches.length, 0);
  state.elements.get("search-query").value = "  a & b <script>  ";
  await state.handlers.submit(event);
  assert.deepEqual(state.searches, [{ query: "a & b <script>", engine: "Google", disposition: "CURRENT_TAB" }]);
});

test("an unavailable engine shows a text error and never silently sends the query elsewhere", async () => {
  const state = page({ managed: Promise.resolve({ searchEngine: "<img src=x>" }), searchError: true });
  await settle();
  state.elements.get("search-query").value = "query";
  await state.handlers.submit({ preventDefault() {} });
  assert.equal(state.searches.length, 1);
  assert.match(state.elements.get("search-error").textContent, /<img src=x>/u);
});
