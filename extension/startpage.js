import { colorProperties, normalizeColors, normalizeConfig } from "./validation.js";

const api = globalThis.browser;
const hostName = "io.github.wrees.startpage";
let config = normalizeConfig();
let paletteBusy = false;
let paletteFailures = 0;
let nextPaletteAttempt = 0;

function renderConfig() {
  document.getElementById("host-name").textContent = config.hostname;
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

async function refreshPalette() {
  if (!config.noctalia || document.hidden || paletteBusy || Date.now() < nextPaletteAttempt || !api?.runtime) {
    return;
  }
  paletteBusy = true;
  try {
    const response = await api.runtime.sendNativeMessage(hostName, { op: "palette" });
    const colors = response?.ok === true ? normalizeColors(response.colors) : null;
    if (!colors) {
      throw new Error("Palette unavailable");
    }
    for (const [key, property] of Object.entries(colorProperties)) {
      document.documentElement.style.setProperty(property, colors[key]);
    }
    document.documentElement.style.setProperty("--green-accent", colors.mSecondary);
    paletteFailures = 0;
    nextPaletteAttempt = Date.now() + 5000;
    document.getElementById("theme-status").textContent = "NOCTALIA";
  } catch {
    paletteFailures = Math.min(paletteFailures + 1, 5);
    nextPaletteAttempt = Date.now() + Math.min(5000 * 2 ** paletteFailures, 60000);
    document.getElementById("theme-status").textContent = "LOCAL PALETTE";
  } finally {
    paletteBusy = false;
  }
}

async function loadConfig() {
  try {
    config = normalizeConfig(await api.storage.managed.get(null));
  } catch {
    config = normalizeConfig();
  }
  renderConfig();
  nextPaletteAttempt = 0;
  await refreshPalette();
}

document.getElementById("search-form").addEventListener("submit", (event) => {
  if (!document.getElementById("search-query").value.trim()) {
    event.preventDefault();
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

renderConfig();
updateClock();
void loadConfig();
setInterval(() => {
  if (!document.hidden) {
    updateClock();
  }
}, 1000);
setInterval(() => void refreshPalette(), 5000);
