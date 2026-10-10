// Design tokens for builder websites. A website's look is a handful of choices
// (palette, fonts, corners, buttons, spacing, ...) turned into CSS variables
// here; sections only ever use the variables, so any section looks right in
// any combination. Add a palette or font pair by adding an entry: nothing
// else changes.

// bg = page, ink = text, tint = soft section background, night = dark-mode
// page, primary = buttons and highlights (onPrimary = text on it), accent =
// small touches.
export const PALETTES = [
  { id: "marigold", name: "Marigold", primary: "#D9480F", onPrimary: "#FFFFFF", accent: "#F2B705", bg: "#FFF8EE", ink: "#2B1A0E", tint: "#FFE8CC", night: "#1C120A" },
  { id: "rani", name: "Rani pink", primary: "#C2185B", onPrimary: "#FFFFFF", accent: "#FF8F00", bg: "#FFF5F8", ink: "#2A0F1A", tint: "#FCE1EA", night: "#1D0A12" },
  { id: "peacock", name: "Peacock", primary: "#0B7A75", onPrimary: "#FFFFFF", accent: "#E0A100", bg: "#F4FBFA", ink: "#0F2A2A", tint: "#D5EFEB", night: "#0A1C1C" },
  { id: "maroon", name: "Maroon & gold", primary: "#880D1E", onPrimary: "#FFFFFF", accent: "#C99A2E", bg: "#FFF8F1", ink: "#2A1215", tint: "#F7E3DC", night: "#1A0A0D" },
  { id: "indigo", name: "Neel", primary: "#3B3FB6", onPrimary: "#FFFFFF", accent: "#F2B705", bg: "#F6F6FF", ink: "#16173A", tint: "#E1E2FB", night: "#0E0F2C" },
  { id: "emerald", name: "Emerald", primary: "#0F7B4D", onPrimary: "#FFFFFF", accent: "#F59E0B", bg: "#F3FBF6", ink: "#0E2A1C", tint: "#D6F0E1", night: "#091B12" },
  { id: "ocean", name: "Ocean", primary: "#0369A1", onPrimary: "#FFFFFF", accent: "#F97316", bg: "#F5FAFF", ink: "#0C2236", tint: "#D9ECFA", night: "#071727" },
  { id: "luxe", name: "Black & gold", primary: "#A87B12", onPrimary: "#FFFFFF", accent: "#1F2937", bg: "#FAF7F0", ink: "#17150F", tint: "#EEE6D3", night: "#0F0E0B" },
  { id: "lavender", name: "Lavender", primary: "#6D28D9", onPrimary: "#FFFFFF", accent: "#EC4899", bg: "#FAF7FF", ink: "#1F1535", tint: "#EADFFD", night: "#140D24" },
  { id: "terracotta", name: "Terracotta", primary: "#B9472A", onPrimary: "#FFFFFF", accent: "#2F6F62", bg: "#FBF4EE", ink: "#2D1B13", tint: "#F2DCCD", night: "#1D120C" },
  { id: "mint", name: "Mint fresh", primary: "#0D8478", onPrimary: "#FFFFFF", accent: "#FB7185", bg: "#F0FDFA", ink: "#102A27", tint: "#C9F5EA", night: "#081F1C" },
  { id: "haldi", name: "Haldi", primary: "#A16207", onPrimary: "#FFFFFF", accent: "#166534", bg: "#FFFBEB", ink: "#2A2109", tint: "#FDEFC0", night: "#1B1606" },
  { id: "coral", name: "Coral", primary: "#E5383B", onPrimary: "#FFFFFF", accent: "#1D4ED8", bg: "#FFF7F5", ink: "#2B1210", tint: "#FFE0DA", night: "#1D0C0B" },
  { id: "mono", name: "Ink", primary: "#111827", onPrimary: "#FFFFFF", accent: "#E11D48", bg: "#FFFFFF", ink: "#111111", tint: "#F1F2F4", night: "#0B0B0C" },
];

// Heading and body fonts. Fonts without Devanagari list one that has it next,
// so Hindi text gets a matching face instead of the system fallback.
export const FONTS = [
  { id: "modern", name: "Modern", head: "'Poppins', sans-serif", body: "'Poppins', sans-serif", weight: 700, families: ["Poppins:wght@400;500;600;700"] },
  { id: "editorial", name: "Editorial", head: "'Playfair Display', 'Rozha One', serif", body: "'Mukta', sans-serif", weight: 700, families: ["Playfair Display:wght@600;700;800", "Rozha One", "Mukta:wght@400;500;600;700"] },
  { id: "heritage", name: "Heritage", head: "'Eczar', serif", body: "'Hind', sans-serif", weight: 700, families: ["Eczar:wght@500;600;700", "Hind:wght@400;500;600"] },
  { id: "friendly", name: "Friendly", head: "'Baloo 2', sans-serif", body: "'Baloo 2', sans-serif", weight: 700, families: ["Baloo 2:wght@400;500;600;700;800"] },
  { id: "royal", name: "Royal", head: "'Yatra One', serif", body: "'Mukta', sans-serif", weight: 400, families: ["Yatra One", "Mukta:wght@400;500;600;700"] },
  { id: "elegant", name: "Elegant", head: "'Cormorant Garamond', 'Tiro Devanagari Hindi', serif", body: "'Martel Sans', sans-serif", weight: 600, families: ["Cormorant Garamond:wght@500;600;700", "Tiro Devanagari Hindi", "Martel Sans:wght@400;600;700"] },
  { id: "bold", name: "Bold", head: "'Anton', 'Teko', sans-serif", body: "'Hind', sans-serif", weight: 400, upper: true, families: ["Anton", "Teko:wght@500;600", "Hind:wght@400;500;600"] },
  { id: "clean", name: "Clean", head: "'Manrope', 'Mukta', sans-serif", body: "'Manrope', 'Mukta', sans-serif", weight: 800, families: ["Manrope:wght@400;500;600;700;800", "Mukta:wght@400;600;700"] },
  { id: "classic", name: "Classic", head: "'Martel', serif", body: "'Martel Sans', sans-serif", weight: 800, families: ["Martel:wght@600;700;800", "Martel Sans:wght@400;600;700"] },
  { id: "playful", name: "Playful", head: "'Fredoka', 'Baloo 2', sans-serif", body: "'Nunito', 'Baloo 2', sans-serif", weight: 600, families: ["Fredoka:wght@500;600;700", "Nunito:wght@400;600;700", "Baloo 2:wght@500;700"] },
];

export const RADII = [
  { id: "sharp", name: "Sharp", card: "2px", big: "4px", btn: "2px" },
  { id: "soft", name: "Soft", card: "12px", big: "20px", btn: "10px" },
  { id: "round", name: "Round", card: "22px", big: "32px", btn: "16px" },
  { id: "arch", name: "Arch", card: "22px", big: "999px 999px 24px 24px", btn: "999px" },
];

export const BUTTONS = [
  { id: "solid", name: "Solid" },
  { id: "pill", name: "Pill" },
  { id: "outline", name: "Outline" },
  { id: "pop", name: "Pop shadow" },
];

export const DENSITIES = [
  { id: "compact", name: "Compact", pad: "clamp(40px, 6vw, 64px)" },
  { id: "cozy", name: "Comfortable", pad: "clamp(56px, 8vw, 96px)" },
  { id: "airy", name: "Airy", pad: "clamp(72px, 11vw, 136px)" },
];

export const TEXTURES = [
  { id: "none", name: "None" },
  { id: "dots", name: "Dots" },
  { id: "jaali", name: "Jaali" },
  { id: "grain", name: "Grain" },
  { id: "waves", name: "Waves" },
];

export const MOTIONS = [
  { id: "none", name: "Still" },
  { id: "subtle", name: "Subtle" },
  { id: "lively", name: "Lively" },
];

export const MODES = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];

// One-tap looks: a full set of choices that work together.
export const LOOKS = [
  { id: "festive", name: "Festive", theme: { palette: "marigold", font: "royal", radius: "round", buttons: "pill", density: "cozy", texture: "jaali", motion: "lively", mode: "light" } },
  { id: "heritage", name: "Heritage", theme: { palette: "maroon", font: "editorial", radius: "arch", buttons: "pill", density: "cozy", texture: "none", motion: "subtle", mode: "light" } },
  { id: "modern", name: "Modern", theme: { palette: "indigo", font: "modern", radius: "soft", buttons: "solid", density: "cozy", texture: "none", motion: "subtle", mode: "light" } },
  { id: "luxe", name: "Luxe", theme: { palette: "luxe", font: "elegant", radius: "sharp", buttons: "outline", density: "airy", texture: "grain", motion: "subtle", mode: "dark" } },
  { id: "fresh", name: "Fresh", theme: { palette: "mint", font: "friendly", radius: "round", buttons: "pill", density: "cozy", texture: "dots", motion: "lively", mode: "light" } },
  { id: "bold", name: "Bold", theme: { palette: "coral", font: "bold", radius: "sharp", buttons: "pop", density: "compact", texture: "none", motion: "lively", mode: "light" } },
  { id: "minimal", name: "Minimal", theme: { palette: "mono", font: "clean", radius: "soft", buttons: "solid", density: "airy", texture: "none", motion: "subtle", mode: "light" } },
  { id: "earthy", name: "Earthy", theme: { palette: "terracotta", font: "heritage", radius: "soft", buttons: "solid", density: "cozy", texture: "grain", motion: "subtle", mode: "light" } },
  { id: "royal", name: "Royal", theme: { palette: "rani", font: "classic", radius: "arch", buttons: "pill", density: "cozy", texture: "jaali", motion: "lively", mode: "light" } },
  { id: "playful", name: "Playful", theme: { palette: "lavender", font: "playful", radius: "round", buttons: "pop", density: "cozy", texture: "waves", motion: "lively", mode: "light" } },
];

export const DEFAULT_THEME = LOOKS[2].theme;

const find = (list, id) => list.find((x) => x.id === id) || list[0];

export function resolveTheme(theme = {}) {
  const t = { ...DEFAULT_THEME, ...theme };
  return {
    ...t,
    p: find(PALETTES, t.palette), f: find(FONTS, t.font), r: find(RADII, t.radius),
    d: find(DENSITIES, t.density), b: find(BUTTONS, t.buttons).id,
  };
}

const mix = (a, b, pct) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

// CSS variables for the page. Sections pick a "tone" (page, tint, brand,
// dark) and read --t-* variables, which the tone sets from these.
export function themeVars(theme) {
  const { p, f, r, d, mode } = resolveTheme(theme);
  const dark = mode === "dark";
  const bg = dark ? p.night : p.bg;
  const ink = dark ? "#F6F1E9" : p.ink;
  const primary = dark ? mix(p.primary, "#ffffff", 82) : p.primary;
  return {
    "--s-bg": bg,
    "--s-ink": ink,
    "--s-muted": mix(ink, bg, 68),
    "--s-line": mix(ink, bg, 14),
    "--s-card": dark ? mix(bg, "#ffffff", 92) : mix(bg, "#ffffff", 35),
    "--s-tint": dark ? mix(bg, p.primary, 86) : p.tint,
    "--s-primary": primary,
    "--s-on-primary": p.onPrimary,
    "--s-accent": p.accent,
    "--s-night": dark ? mix(p.night, "#000000", 60) : p.night,
    "--s-primary-press": mix(primary, "#000000", 84),
    "--s-font-head": f.head,
    "--s-font-body": f.body,
    "--s-head-weight": String(f.weight),
    "--s-head-transform": f.upper ? "uppercase" : "none",
    "--s-head-tracking": f.upper ? "0.01em" : "-0.015em",
    "--s-radius": r.card,
    "--s-radius-big": r.big,
    "--s-radius-btn": r.btn,
    "--s-pad": d.pad,
  };
}

// Variables for one section, from its tone.
export function toneVars(tone) {
  switch (tone) {
    case "tint":
      return { "--t-bg": "var(--s-tint)", "--t-ink": "var(--s-ink)", "--t-muted": "var(--s-muted)", "--t-card": "var(--s-card)", "--t-line": "var(--s-line)", "--t-hi": "var(--s-primary)", "--t-btn": "var(--s-primary)", "--t-on-btn": "var(--s-on-primary)" };
    case "brand":
      return { "--t-bg": "var(--s-primary)", "--t-ink": "var(--s-on-primary)", "--t-muted": "color-mix(in srgb, var(--s-on-primary) 80%, transparent)", "--t-card": "color-mix(in srgb, var(--s-on-primary) 12%, transparent)", "--t-line": "color-mix(in srgb, var(--s-on-primary) 24%, transparent)", "--t-hi": "var(--s-accent)", "--t-btn": "var(--s-on-primary)", "--t-on-btn": "var(--s-primary)" };
    case "dark":
      return { "--t-bg": "var(--s-night)", "--t-ink": "#F7F3EC", "--t-muted": "rgba(247,243,236,0.72)", "--t-card": "rgba(255,255,255,0.07)", "--t-line": "rgba(255,255,255,0.14)", "--t-hi": "var(--s-accent)", "--t-btn": "var(--s-primary)", "--t-on-btn": "var(--s-on-primary)" };
    default:
      return { "--t-bg": "var(--s-bg)", "--t-ink": "var(--s-ink)", "--t-muted": "var(--s-muted)", "--t-card": "var(--s-card)", "--t-line": "var(--s-line)", "--t-hi": "var(--s-primary)", "--t-btn": "var(--s-primary)", "--t-on-btn": "var(--s-on-primary)" };
  }
}

// Background decoration for a section (used on tinted, brand and dark tones).
export function textureStyle(texture) {
  const c = "color-mix(in srgb, var(--t-ink) 9%, transparent)";
  switch (texture) {
    case "dots":
      return { backgroundImage: `radial-gradient(${c} 1.2px, transparent 1.3px)`, backgroundSize: "18px 18px" };
    case "jaali":
      return { backgroundImage: `radial-gradient(circle at 50% 50%, transparent 9px, ${c} 9.5px, ${c} 10.5px, transparent 11px), radial-gradient(circle at 0 0, transparent 9px, ${c} 9.5px, ${c} 10.5px, transparent 11px)`, backgroundSize: "28px 28px" };
    case "grain":
      return { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.07'/%3E%3C/svg%3E\")" };
    case "waves":
      return { backgroundImage: `repeating-radial-gradient(circle at 0 100%, transparent 0 22px, ${c} 22px 23px)`, backgroundSize: "60px 60px" };
    default:
      return {};
  }
}

// Google Fonts stylesheet for the chosen pair (one <link>, swapped on change).
export function loadFont(fontId) {
  const f = find(FONTS, fontId);
  if (typeof document === "undefined") return;
  const href = `https://fonts.googleapis.com/css2?${f.families.map((x) => `family=${x.replace(/ /g, "+")}`).join("&")}&display=swap`;
  const id = `site-font-${f.id}`;
  if (!document.getElementById(id)) {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

// Every font pair at once: the Design panel shows each name in its own font.
export function loadAllFonts() {
  FONTS.forEach((f) => loadFont(f.id));
}
