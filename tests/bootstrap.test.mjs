import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { colorProperties } from "../extension/validation.js";

const source = readFileSync(new URL("../extension/bootstrap.js", import.meta.url), "utf8");

function bootstrap(stored, unavailable = false) {
  const properties = {};
  const context = vm.createContext({
    document: { documentElement: { style: { setProperty(key, value) { properties[key] = value; } } } },
    localStorage: { getItem(key) {
      assert.equal(key, "wrees-startpage.palette.v1");
      if (unavailable) {
        throw new Error("Storage unavailable");
      }
      return stored;
    } }
  });
  vm.runInContext(source, context);
  return { context, properties };
}

test("startup cache restores only the seven validated colors before page rendering", () => {
  const colors = Object.fromEntries(Object.keys(colorProperties).map(key => [key, "#aAbB09"]));
  const { context, properties } = bootstrap(JSON.stringify({ ...colors, username: "private", unexpected: "url(https://example.org)" }));
  assert.deepEqual(properties, { ...Object.fromEntries(Object.entries(colorProperties).map(([key, property]) => [property, colors[key]])), "--green-accent": colors.mSecondary });
  assert.deepEqual(JSON.parse(JSON.stringify(context.startpageCachedPalette)), colors);
  assert.ok(Object.isFrozen(context.startpageCachedPalette));
});

test("missing, corrupt, oversized and CSS-injecting caches apply no partial palette", () => {
  const colors = Object.fromEntries(Object.keys(colorProperties).map(key => [key, "#112233"]));
  for (const stored of [null, "not JSON", "[]", "null", JSON.stringify({}), " ".repeat(2049), JSON.stringify({ ...colors, mTertiary: "#fff; color:red" }), JSON.stringify({ ...colors, mPrimary: "url(https://example.org)" })]) {
    const { context, properties } = bootstrap(stored);
    assert.deepEqual(properties, {});
    assert.equal(context.startpageCachedPalette, undefined);
  }
  assert.deepEqual(bootstrap(null, true).properties, {});
});
