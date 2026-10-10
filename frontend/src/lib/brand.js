import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

// The shop's own details (Shop setup > General): logo, names, address, hours,
// map and review links, phones, WhatsApp, emails and social links. Every
// screen and every website reads them from here so a change in General shows
// everywhere. The server is the source of truth; the last answer is kept on
// the device so the next visit paints the right name at once.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const CACHE_KEY = "sf_brand";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_NAMES = {
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  hi: { mon: "सोम", tue: "मंगल", wed: "बुध", thu: "गुरु", fri: "शुक्र", sat: "शनि", sun: "रवि" },
};

// Used only until the first /public/brand answer arrives on a new device.
// Mirrors the defaults in backend/brand.py.
export const DEFAULT_BRAND = {
  shop_name: "Somani Fabs", shop_name_hi: "सोमानी फेब्स", short_name: "", short_name_hi: "",
  legal_name: "Shivnarayan Shivbhagwan Somani", legal_name_hi: "शिवनारायण शिवभगवान सोमानी",
  address_street: "Gol Pyau, opposite Maheshwari Bhawan", address_street_hi: "गोल प्याऊ, माहेश्वरी भवन के सामने",
  city: "Kuchaman City", city_hi: "कुचामन सिटी", state: "Rajasthan", state_hi: "राजस्थान",
  pincode: "341508", country: "India", country_hi: "भारत",
  hours: {}, hours_note: "", hours_note_hi: "",
  maps_url: "https://share.google/HySsDUkhfkwuHanY8", map_embed_url: "", reviews_url: "",
  phones: ["+91 94144 22558", "+91 74109 90092"], whatsapp: "", emails: [],
  instagram: "", facebook: "", youtube: "", x: "", linkedin: "", website: "",
  languages: [{ code: "hi", name: "हिंदी" }],
  classic: {
    tagline: "", tagline_hi: "", founded_year: "1962", accent_color: "#880D1E",
    description: "Suiting, shirting, kurta, dhoti and jacket fabric from 100+ brands, including Raymond, Siyaram's, Donear and Ramraj.",
    description_hi: "रेमंड, सियाराम्स, डोनियर और रामराज समेत 100+ ब्रांड का सूटिंग, शर्टिंग, कुर्ता, धोती और जैकेट का कपड़ा।",
    brands_count: "100+", founder: "Shivnarayan Somani, founder", founder_hi: "शिवनारायण सोमानी, संस्थापक",
    story_body: "Shivnarayan Somani opened the shop in 1962. Today the family still serves every customer the way he did: good cloth, an honest price and a promise we keep.",
    story_body_hi: "शिवनारायण सोमानी जी ने 1962 में यह दुकान खोली। आज भी परिवार हर ग्राहक की सेवा वैसे ही करता है: अच्छा कपड़ा, ईमानदार दाम और निभाया हुआ वादा।",
    locality: "Gol Pyau", locality_hi: "गोल प्याऊ", footer_note: "", footer_note_hi: "",
    seo_description: "Somani Fabs, Kuchaman City. Suiting, shirting, kurta-pyjama, dhoti and jacket fabric from Raymond, Siyaram's, Donear and Ramraj since 1962.",
    show_staff_login: true, show_brands: true, show_promise: true,
  },
  logo: "",
};

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null") || {}; } catch { return {}; }
}

function withExtras(b) {
  const brand = { ...DEFAULT_BRAND, ...b, classic: { ...DEFAULT_BRAND.classic, ...(b && b.classic) } };
  // An older cached copy may still carry free-text hours.
  if (!brand.hours || typeof brand.hours !== "object") brand.hours = {};
  // The logo URL is relative to the API server.
  brand.logo_src = brand.logo ? `${BACKEND}${brand.logo}` : "";
  return brand;
}

// Images saved by the website builder are served by the API server too.
export function mediaSrc(url) {
  return url && url.startsWith("/api/") ? `${BACKEND}${url}` : url || "";
}

// tel: link for a phone as typed: 10-digit numbers are Indian mobiles.
export function telHref(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10 && !String(phone).trim().startsWith("0")) return `tel:+91${d}`;
  return String(phone).trim().startsWith("+") ? `tel:+${d}` : `tel:${d}`;
}

export function waHref(number, text) {
  const d = String(number || "").replace(/\D/g, "");
  if (!d) return "";
  return text ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : `https://wa.me/${d}`;
}

// "+919414422558" -> "+91 94144 22558"
export function prettyMobile(v) {
  return String(v || "").replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");
}

// A field in the visitor's language; falls back to the main text.
export function pick(brand, key, lang) {
  return (lang && lang !== "en" && brand[`${key}_${lang}`]) || brand[key] || "";
}

// The shop's address in the standard Indian order. `style`:
//   "line"  one line: street, city, state PIN, country
//   "lines" [street, "city, state PIN", country] for stacked display
//   "short" "street, city" for headings and captions
export function formatAddress(b, lang, style = "line") {
  const p = (k) => pick(b, k, lang);
  const statePin = [p("state"), b.pincode].filter(Boolean).join(" ");
  const cityLine = [p("city"), statePin].filter(Boolean).join(", ");
  if (style === "lines") return [p("address_street"), cityLine, p("country")].filter(Boolean);
  if (style === "short") return [p("address_street"), p("city")].filter(Boolean).join(", ");
  return [p("address_street"), cityLine, p("country")].filter(Boolean).join(", ");
}

export function directionsUrl(b) {
  return b.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.shop_name}, ${formatAddress(b)}`)}`;
}

// The map preview: the shop's name and address on Google Maps. (An embed
// code saved by older versions of General is no longer asked for or used.)
export function mapEmbedUrl(b) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${b.shop_name}, ${formatAddress(b)}`)}&output=embed`;
}

// "10:00" -> "10 AM", "20:30" -> "8:30 PM" (Hindi: "सुबह 10", "रात 8:30").
export function formatTime(hhmm, lang) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (Number.isNaN(h)) return "";
  const h12 = ((h + 11) % 12) + 1;
  const mm = m ? `:${String(m).padStart(2, "0")}` : "";
  if (lang === "hi") {
    const part = h < 12 ? "सुबह" : h < 16 ? "दोपहर" : h < 19 ? "शाम" : "रात";
    return `${part} ${h12}${mm}`;
  }
  return `${h12}${mm} ${h < 12 ? "AM" : "PM"}`;
}

export function hasHours(b) {
  return !!(b.hours && DAYS.every((d) => b.hours[d]));
}

// Days with the same times grouped: [{ days: "Mon–Sat", text: "10 AM – 8:30 PM" }, { days: "Sun", text: "Closed" }].
export function hoursRows(b, lang) {
  if (!hasHours(b)) return [];
  const names = DAY_NAMES[lang === "hi" ? "hi" : "en"];
  const closed = lang === "hi" ? "बंद" : "Closed";
  const text = (d) => (d.closed ? closed : `${formatTime(d.open, lang)} – ${formatTime(d.close, lang)}`);
  const rows = [];
  DAYS.forEach((day) => {
    const t = text(b.hours[day]);
    const last = rows[rows.length - 1];
    if (last && last.text === t) last.end = day;
    else rows.push({ start: day, end: day, text: t });
  });
  return rows.map((r) => ({ days: r.start === r.end ? names[r.start] : `${names[r.start]}–${names[r.end]}`, text: r.text, closed: r.text === closed }));
}

// One short line for headers and captions: "Mon–Sat 10 AM – 8:30 PM · Sun closed".
export function hoursSummary(b, lang) {
  return hoursRows(b, lang).map((r) => `${r.days} ${r.closed ? r.text.toLowerCase() : r.text}`).join(" · ");
}

// Open or closed right now, in India time. null when hours are not set.
export function openNow(b, at = new Date()) {
  if (!hasHours(b)) return null;
  const ist = new Date(at.getTime() + (at.getTimezoneOffset() + 330) * 60000);
  const day = DAYS[(ist.getDay() + 6) % 7];
  const d = b.hours[day];
  if (d.closed) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const o = toMin(d.open), c = toMin(d.close);
  return c > o ? mins >= o && mins < c : mins >= o || mins < c; // after midnight
}

// "Somani Fabs" -> "somani_fabs", for file names.
export function slug(name) {
  return (name || "shop").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "shop";
}

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(selector.startsWith("link") ? "link" : "meta");
    const [, k, v] = selector.match(/\[(\w+)="([^"]+)"\]/);
    el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

// Browser tab title, favicon and search description follow the shop.
function applyHead(brand) {
  // A builder website sets its own title and description.
  if (document.documentElement.dataset.siteMeta) return;
  document.title = brand.city ? `${brand.shop_name}, ${brand.city}` : brand.shop_name;
  setMeta('meta[name="description"]', "content", brand.classic.seo_description || brand.classic.description || "");
  if (brand.logo_src) {
    setMeta('link[rel="icon"]', "href", brand.logo_src);
    setMeta('link[rel="apple-touch-icon"]', "href", brand.logo_src);
  }
}

export function setPageMeta(title, description) {
  if (title) document.title = title;
  if (description) setMeta('meta[name="description"]', "content", description);
}

const BrandCtx = createContext({ brand: withExtras({}), refresh: () => Promise.resolve(), update: () => {} });

export function BrandProvider({ children }) {
  const [brand, setBrand] = useState(() => withExtras(readCache()));
  const update = useCallback((data) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* storage off */ }
    setBrand(withExtras(data));
  }, []);
  const refresh = useCallback(
    () => axios.get(`${BACKEND}/api/public/brand`).then((r) => update(r.data)).catch(() => {}),
    [update],
  );
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { applyHead(brand); }, [brand]);
  return <BrandCtx.Provider value={{ brand, refresh, update }}>{children}</BrandCtx.Provider>;
}

// For a page that is given the brand directly (the builder's preview frame).
export function BrandOverride({ brand, children }) {
  const parent = useContext(BrandCtx);
  return <BrandCtx.Provider value={{ ...parent, brand: withExtras(brand) }}>{children}</BrandCtx.Provider>;
}

export function useBrand() { return useContext(BrandCtx).brand; }
export function useBrandCtx() { return useContext(BrandCtx); }
