import { defaults } from "./defaults.js";

export const colorProperties = Object.freeze({
  mSurface: "--bg-color",
  mSurfaceVariant: "--card-bg",
  mOnSurface: "--fg-color",
  mOnSurfaceVariant: "--muted",
  mPrimary: "--pink-accent",
  mSecondary: "--mauve-accent",
  mTertiary: "--cyan-accent"
});

export function safeText(value, fallback, limit = 120) {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) {
    return fallback;
  }
  return value.trim() || fallback;
}

export function safeURL(value) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f\\]/u.test(value)) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const own = (key) => Object.hasOwn(source, key) ? source[key] : undefined;
  const inputCategories = Array.isArray(own("categories")) ? own("categories") : defaults.categories;
  let remaining = 100;
  const categories = inputCategories.slice(0, 8).flatMap((category) => {
    if (!category || typeof category !== "object" || !Array.isArray(category.links)) {
      return [];
    }
    const links = category.links.slice(0, 30).flatMap((link) => {
      if (!link || typeof link !== "object" || remaining === 0) {
        return [];
      }
      const url = safeURL(link.url);
      const title = safeText(link.title, "", 100);
      if (!url || !title) {
        return [];
      }
      remaining -= 1;
      return [{ title, url }];
    });
    return links.length ? [{ title: safeText(category.title, "Links"), links }] : [];
  });
  return {
    username: safeText(own("username"), defaults.username, 64),
    hostname: safeText(own("hostname"), defaults.hostname, 64),
    noctalia: own("noctalia") === true,
    searchEngine: safeText(own("searchEngine"), defaults.searchEngine, 80),
    categories
  };
}

export function normalizeColors(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const colors = {};
  for (const key of Object.keys(colorProperties)) {
    if (!Object.hasOwn(raw, key) || typeof raw[key] !== "string" || !/^#[0-9a-f]{6}$/iu.test(raw[key])) {
      return null;
    }
    colors[key] = raw[key];
  }
  return colors;
}
