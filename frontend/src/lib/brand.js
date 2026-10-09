import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";

// The shop's own details (Shop setup > General): name, logo, contact, address,
// story and website options. Every screen reads them from here so a change in
// General shows everywhere. The server is the source of truth; the last answer
// is kept on the device so the next visit paints the right name at once.

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const CACHE_KEY = "sf_brand";

// Used only until the first /public/brand answer arrives on a new device.
// Mirrors the defaults in backend/brand.py.
export const DEFAULT_BRAND = {
  shop_name: "Somani Fabs", shop_name_hi: "सोमानी फेब्स", tagline: "", tagline_hi: "",
  legal_name: "Shivnarayan Shivbhagwan Somani", legal_name_hi: "शिवनारायण शिवभगवान सोमानी",
  founded_year: "1962", accent_color: "#880D1E",
  description: "Suiting, shirting, kurta, dhoti and jacket fabric from 100+ brands, including Raymond, Siyaram's, Donear and Ramraj.",
  description_hi: "रेमंड, सियाराम्स, डोनियर और रामराज समेत 100+ ब्रांड का सूटिंग, शर्टिंग, कुर्ता, धोती और जैकेट का कपड़ा।",
  brands_count: "100+", founder: "Shivnarayan Somani, founder", founder_hi: "शिवनारायण सोमानी, संस्थापक",
  story_body: "Shivnarayan Somani opened the shop in 1962. Today the family still serves every customer the way he did: good cloth, an honest price and a promise we keep.",
  story_body_hi: "शिवनारायण सोमानी जी ने 1962 में यह दुकान खोली। आज भी परिवार हर ग्राहक की सेवा वैसे ही करता है: अच्छा कपड़ा, ईमानदार दाम और निभाया हुआ वादा।",
  locality: "Gol Pyau", locality_hi: "गोल प्याऊ", city: "Kuchaman City", city_hi: "कुचामन सिटी",
  address_line1: "Gol Pyau, opposite Maheshwari Bhawan", address_line1_hi: "गोल प्याऊ, माहेश्वरी भवन के सामने",
  address_line2: "Kuchaman City, Rajasthan 341508", address_line2_hi: "कुचामन सिटी, राजस्थान 341508",
  directions_url: "https://share.google/HySsDUkhfkwuHanY8", hours: "", hours_hi: "",
  whatsapp: "", email: "", instagram: "", facebook: "", youtube: "", website: "",
  footer_note: "", footer_note_hi: "",
  seo_description: "Somani Fabs, Kuchaman City. Suiting, shirting, kurta-pyjama, dhoti and jacket fabric from Raymond, Siyaram's, Donear and Ramraj since 1962.",
  phones: ["+91 94144 22558", "+91 74109 90092"],
  show_staff_login: true, show_brands: true, show_promise: true,
  logo: "",
};

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null") || {}; } catch { return {}; }
}

function withExtras(b) {
  const brand = { ...DEFAULT_BRAND, ...b };
  // The logo URL is relative to the API server.
  brand.logo_src = brand.logo ? `${BACKEND}${brand.logo}` : "";
  return brand;
}

// tel: link for a phone as typed: 10-digit numbers are Indian mobiles.
export function telHref(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10 && !String(phone).trim().startsWith("0")) return `tel:+91${d}`;
  return String(phone).trim().startsWith("+") ? `tel:+${d}` : `tel:${d}`;
}

export function waHref(number) {
  const d = String(number || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}

// Pick the Hindi or English version of a field; Hindi falls back to English.
export function pick(brand, key, lang) {
  return (lang === "hi" && brand[`${key}_hi`]) || brand[key] || "";
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
  document.title = brand.city ? `${brand.shop_name}, ${brand.city}` : brand.shop_name;
  setMeta('meta[name="description"]', "content", brand.seo_description || brand.description || "");
  if (brand.logo_src) {
    setMeta('link[rel="icon"]', "href", brand.logo_src);
    setMeta('link[rel="apple-touch-icon"]', "href", brand.logo_src);
  }
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

export function useBrand() { return useContext(BrandCtx).brand; }
export function useBrandCtx() { return useContext(BrandCtx); }
