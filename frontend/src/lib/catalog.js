import { api } from "@/lib/api";

// The fabric catalog without images (names, codes, categories...). It is small
// text, so it is fetched once and searched in the browser: every keystroke is
// instant. Thumbnails load lazily from their own cached URL. Screens show
// cachedCatalog() at once and swap in loadCatalog()'s fresh copy.
let cache = null; // { at, items }
let inflight = null;

export function loadCatalog({ force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < 60000) return Promise.resolve(cache.items);
  if (!inflight) {
    inflight = api.get("/catalog")
      .then((r) => { cache = { at: Date.now(), items: prep(r.data) }; return cache.items; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function cachedCatalog() { return cache?.items || null; }
export function invalidateCatalog() { cache = null; }

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const thumbUrl = (it) => `${API}/catalog/${it.id}/thumb?v=${it.v || 0}`;

const norm = (s) => (s || "").toLowerCase();
const alnum = (s) => norm(s).replace(/[^0-9a-z]/g, "");

function prep(items) {
  return items.map((it) => ({
    ...it,
    _name: norm(it.name),
    _code: alnum(it.code),
    _all: norm([it.name, it.code, it.category, it.garment_type, it.description, it.keywords].join(" ")),
  }));
}

// Every word must match somewhere. Best first: exact code, name start, word
// start in the name, then anywhere (description, keywords...).
export function searchCatalog(items, query, category = "") {
  const words = norm(query).split(/\s+/).filter(Boolean);
  const pool = category ? items.filter((it) => it.category === category) : items;
  if (!words.length) return pool;
  const q = norm(query).trim();
  const qCode = alnum(query);
  const scored = [];
  for (const it of pool) {
    if (!words.every((w) => it._all.includes(w) || (it._code && alnum(w) && it._code.includes(alnum(w))))) continue;
    let s = 0;
    if (qCode && it._code === qCode) s += 100;
    else if (qCode && it._code.startsWith(qCode)) s += 60;
    if (it._name === q) s += 80;
    else if (it._name.startsWith(q)) s += 50;
    else if (words.every((w) => it._name.includes(w))) s += it._name.split(/\s+/).some((p) => p.startsWith(words[0])) ? 30 : 20;
    scored.push([s, it]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1]._name.localeCompare(b[1]._name)).map((x) => x[1]);
}

// Categories with their item counts, most used first.
export function catalogCategories(items) {
  const m = new Map();
  for (const it of items) if (it.category) m.set(it.category, (m.get(it.category) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

// Recently used fabrics on this device, for one-tap picks.
const RECENT_KEY = "sf_recent_fabrics";
export function recentIds() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
export function pushRecent(id) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 12))); } catch { /* storage off */ }
}

// Try-on categories. A "single" category holds styles (Kurta, Trousers...) and
// takes one photo; `position` is where it is worn. A "group" combines single
// categories (`members`), one photo each, and always shows their current styles.
export const SLOT_ORDER = ["top", "bottom", "third"];

export function singleCategories(cats) {
  return cats.filter((c) => c.kind === "single")
    .sort((a, b) => SLOT_ORDER.indexOf(a.position) - SLOT_ORDER.indexOf(b.position) || (a.order || 0) - (b.order || 0));
}

// What staff can photograph: each single category, then each non-empty group,
// with `parts` = the single categories that need a photo.
export function tryOnTemplates(cats) {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const singles = singleCategories(cats).map((c) => ({ ...c, parts: [c] }));
  const groups = cats.filter((c) => c.kind === "group")
    .map((c) => ({ ...c, parts: (c.members || []).map((m) => byId.get(m)).filter(Boolean) }))
    .filter((c) => c.parts.length > 0)
    .sort((a, b) => a.parts.length - b.parts.length || (a.order || 0) - (b.order || 0));
  return [...singles, ...groups];
}

let catsCache = null;
export function cachedCategories() { return catsCache; }
export function loadCategories() {
  return api.get("/config/categories").then((r) => { catsCache = r.data; return r.data; });
}

// Gallery photo -> centre-cropped square JPEG, so phones never upload 10 MB.
export function fileToSquareJpeg(file, px = 800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const out = Math.min(px, side);
      const c = document.createElement("canvas");
      c.width = out; c.height = out;
      c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that photo")); };
    img.src = url;
  });
}
