import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeColors, normalizeConfig, safeText, safeURL } from "../extension/validation.js";

test("bookmarks come only from managed configuration and can be replaced or cleared", () => {
  assert.deepEqual(normalizeConfig().categories, []);
  assert.deepEqual(normalizeConfig({ categories: null }).categories, []);
  assert.deepEqual(normalizeConfig({ categories: "invalid" }).categories, []);
  const first = [{ title: "Work", links: [{ title: "Docs", url: "https://example.com/docs" }] }];
  const second = [{ title: "Study", links: [{ title: "Notes", url: "https://example.org/notes" }] }];
  assert.deepEqual(normalizeConfig({ categories: first }).categories, first);
  assert.deepEqual(normalizeConfig({ categories: second }).categories, second);
  assert.deepEqual(normalizeConfig({ categories: [] }).categories, []);
  assert.deepEqual(normalizeConfig(Object.create({ categories: first })).categories, []);
});

test("links reject executable, local, plaintext, credentialed and malformed URLs", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<script>x</script>", "file:///etc/passwd", "http://example.com", "https://u:p@example.com", "https://example.com\n.evil", "https:\\example.com", null, {}]) {
    assert.equal(safeURL(url), null);
  }
  assert.equal(safeURL("https://example.com/path?q=hello"), "https://example.com/path?q=hello");
});

test("configuration is bounded and ignores inherited identity settings", () => {
  const config = normalizeConfig(Object.assign(Object.create({ noctalia: true, username: "inherited" }), {
    hostname: "<img src=x onerror=alert(1)>",
    categories: Array.from({ length: 50 }, () => ({ title: "Links", links: Array.from({ length: 100 }, () => ({ title: "Link", url: "https://example.com" })) }))
  }));
  assert.equal(config.username, "user");
  assert.equal(config.noctalia, false);
  assert.equal(config.hostname, "<img src=x onerror=alert(1)>");
  assert.ok(config.categories.length <= 8);
  assert.ok(config.categories.flatMap((c) => c.links).length <= 100);
  assert.equal(safeText("a".repeat(500), "fallback"), "fallback");
  assert.equal(safeText("bad\u0000value", "fallback"), "fallback");
});

test("palette values cannot inject CSS or omit required colors", () => {
  const keys = ["mSurface", "mSurfaceVariant", "mOnSurface", "mOnSurfaceVariant", "mPrimary", "mSecondary", "mTertiary"];
  const valid = Object.fromEntries(keys.map((key) => [key, "#aAbB09"]));
  assert.deepEqual(normalizeColors(valid), valid);
  assert.equal(normalizeColors({ ...valid, mPrimary: "url(https://attacker.invalid)" }), null);
  assert.equal(normalizeColors({ ...valid, mPrimary: "#fff; color:red" }), null);
  assert.equal(normalizeColors({}), null);
});

test("manifest overrides both pages and exposes only storage, native messaging and search", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url)));
  assert.deepEqual(manifest.permissions.toSorted(), ["nativeMessaging", "search", "storage"]);
  assert.equal(manifest.chrome_url_overrides.newtab, "index.html");
  assert.equal(manifest.chrome_settings_overrides.homepage, "index.html");
  for (const key of ["host_permissions", "content_scripts", "background", "web_accessible_resources", "externally_connectable"]) {
    assert.equal(Object.hasOwn(manifest, key), false);
  }
  const policy = manifest.content_security_policy.extension_pages;
  assert.ok(policy.includes("connect-src 'none'"));
  assert.ok(policy.includes("script-src 'self'"));
  assert.ok(policy.includes("form-action 'none'"));
  assert.ok(!policy.includes("unsafe-"));
  const html = readFileSync(new URL("../extension/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(`content="${policy}"`));
  assert.ok(!/<script[^>]*>\s*[^<\s]/u.test(html));
  const source = readFileSync(new URL("../extension/startpage.js", import.meta.url), "utf8");
  assert.ok(!/innerHTML|outerHTML|document\.write|\beval\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket/u.test(source));
});

test("search engine defaults to DuckDuckGo and rejects malformed or inherited settings", () => {
  assert.equal(normalizeConfig().searchEngine, "DuckDuckGo");
  assert.equal(normalizeConfig({ searchEngine: "Google" }).searchEngine, "Google");
  for (const searchEngine of [null, {}, "", "  ", "a".repeat(81), "Google\nInjected"]) {
    assert.equal(normalizeConfig({ searchEngine }).searchEngine, "DuckDuckGo");
  }
  assert.equal(normalizeConfig(Object.create({ searchEngine: "Google" })).searchEngine, "DuckDuckGo");
});
