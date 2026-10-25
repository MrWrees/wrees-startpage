(() => {
  const properties = {
    mSurface: "--bg-color",
    mSurfaceVariant: "--card-bg",
    mOnSurface: "--fg-color",
    mOnSurfaceVariant: "--muted",
    mPrimary: "--pink-accent",
    mSecondary: "--mauve-accent",
    mTertiary: "--cyan-accent"
  };
  try {
    const stored = localStorage.getItem("wrees-startpage.palette.v1");
    if (typeof stored !== "string" || stored.length > 2048) {
      return;
    }
    const raw = JSON.parse(stored);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return;
    }
    const colors = {};
    for (const key of Object.keys(properties)) {
      if (!Object.hasOwn(raw, key) || typeof raw[key] !== "string" || !/^#[0-9a-f]{6}$/iu.test(raw[key])) {
        return;
      }
      colors[key] = raw[key];
    }
    for (const [key, property] of Object.entries(properties)) {
      document.documentElement.style.setProperty(property, colors[key]);
    }
    document.documentElement.style.setProperty("--green-accent", colors.mSecondary);
    globalThis.startpageCachedPalette = Object.freeze(colors);
  } catch {
  }
})();
