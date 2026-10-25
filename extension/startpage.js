import { colorProperties, normalizeColors, normalizeConfig } from "./validation.js";

const api = globalThis.browser;
const hostName = "io.github.wrees.startpage";
let config = normalizeConfig();
const paletteCacheKey = "wrees-startpage.palette.v1";
let cachedPalette = normalizeColors(globalThis.startpageCachedPalette);
let paletteTask = null;
let startupReady = false;
let configRevision = 0;
let paletteFailures = 0;
let nextPaletteAttempt = 0;

function renderConfig() {
  document.getElementById("host-name").textContent = config.hostname;
  document.getElementById("terminal-host").textContent = `${config.hostname}:~#`;
  document.getElementById("search-label").textContent = `Search ${config.searchEngine}`;
  document.getElementById("search-query").placeholder = `Type here to search ${config.searchEngine}…`;
  document.getElementById("search-error").textContent = "";
  document.getElementById("prompt-identity").textContent = `${config.username}@${config.hostname}`;
  const grid = document.getElementById("categories");
  const fragment = document.createDocumentFragment();
  for (const category of config.categories) {
    const box = document.createElement("section");
    box.className = "category-box";
    const heading = document.createElement("h2");
    heading.textContent = category.title;
    const list = document.createElement("ul");
    for (const link of category.links) {
      const item = document.createElement("li");
      const anchor = document.createElement("a");
      anchor.textContent = link.title;
      anchor.href = link.url;
      anchor.rel = "noreferrer noopener";
      anchor.referrerPolicy = "no-referrer";
      item.append(anchor);
      list.append(item);
    }
    box.append(heading, list);
    fragment.append(box);
  }
  grid.replaceChildren(fragment);
}

function updateClock() {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit" });
  const time = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  document.getElementById("live-date").textContent = `${date.toUpperCase()} // ${time}`;
  const hours = now.getHours();
  document.getElementById("greeting-text").textContent = hours < 12
    ? "good_morning.sh"
    : hours < 18 ? "good_afternoon.sh" : "good_evening.sh";
}

async function withTimeout(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Request timed out")), milliseconds);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function applyPalette(colors) {
  for (const [key, property] of Object.entries(colorProperties)) {
    document.documentElement.style.setProperty(property, colors[key]);
  }
  document.documentElement.style.setProperty("--green-accent", colors.mSecondary);
}

function clearPalette() {
  for (const property of [...Object.values(colorProperties), "--green-accent"]) {
    document.documentElement.style.removeProperty(property);
  }
  cachedPalette = null;
  try {
    localStorage.removeItem(paletteCacheKey);
  } catch {
  }
  document.getElementById("theme-status").textContent = "LOCAL PALETTE";
}

async function refreshPalette(initial = false) {
  if (!config.noctalia || (!initial && (!startupReady || document.hidden)) || Date.now() < nextPaletteAttempt || !api?.runtime) {
    return;
  }
  if (paletteTask) {
    return paletteTask;
  }
  paletteTask = (async () => {
    try {
      const response = await withTimeout(api.runtime.sendNativeMessage(hostName, { op: "palette" }), 1000);
      const colors = response?.ok === true ? normalizeColors(response.colors) : null;
      if (!colors) {
        throw new Error("Palette unavailable");
      }
      if (!config.noctalia) {
        return;
      }
      applyPalette(colors);
      cachedPalette = colors;
      try {
        localStorage.setItem(paletteCacheKey, JSON.stringify(colors));
      } catch {
      }
      paletteFailures = 0;
      nextPaletteAttempt = Date.now() + 5000;
      document.getElementById("theme-status").textContent = "NOCTALIA";
    } catch {
      if (!config.noctalia) {
        return;
      }
      paletteFailures = Math.min(paletteFailures + 1, 5);
      nextPaletteAttempt = Date.now() + Math.min(5000 * 2 ** paletteFailures, 60000);
      document.getElementById("theme-status").textContent = cachedPalette ? "CACHED PALETTE" : "LOCAL PALETTE";
    }
  })();
  try {
    await paletteTask;
  } finally {
    paletteTask = null;
  }
}

async function loadConfig() {
  const revision = ++configRevision;
  let nextConfig;
  try {
    nextConfig = normalizeConfig(await withTimeout(api.storage.managed.get(null), 1000));
  } catch {
    nextConfig = normalizeConfig();
  }
  if (revision !== configRevision) {
    return;
  }
  config = nextConfig;
  if (!config.noctalia) {
    clearPalette();
  }
  renderConfig();
  updateClock();
  nextPaletteAttempt = 0;
  await refreshPalette(true);
  if (revision !== configRevision) {
    return;
  }
  const firstLoad = !startupReady;
  startupReady = true;
  document.documentElement.removeAttribute("data-loading");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.documentElement.removeAttribute("data-starting");
  }));
  if (firstLoad && document.hasFocus()) {
    document.getElementById("search-query").focus({ preventScroll: true });
  }
}

document.getElementById("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.getElementById("search-query").value.trim();
  if (!startupReady || !query || query.length > 2048) {
    return;
  }
  const error = document.getElementById("search-error");
  error.textContent = "";
  try {
    await api.search.search({ query, engine: config.searchEngine, disposition: "CURRENT_TAB" });
  } catch {
    error.textContent = `Search engine "${config.searchEngine}" is unavailable in this browser.`;
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateClock();
    void refreshPalette();
  }
});

api?.storage?.onChanged.addListener((_changes, area) => {
  if (area === "managed") {
    void loadConfig();
  }
});

void loadConfig();
setInterval(() => {
  if (!document.hidden) {
    updateClock();
  }
}, 1000);
setInterval(() => void refreshPalette(), 5000);
