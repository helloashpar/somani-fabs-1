import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { useBrand, BrandOverride, setPageMeta, pick } from "@/lib/brand";
import { api } from "@/lib/api";
import { SiteCtx, SectionCtx } from "@/site/kit";
import { RENDER, Floating } from "@/site/sections";
import { resolveTheme, themeVars, loadFont } from "@/site/theme";
import Landing from "@/pages/Landing";
import { isMultilingual } from "@/site/presets";

// Draws a builder website from its config. Used by the live site (/), the
// builder's preview frame (/site-frame) and the draft preview (/site-preview/:id).

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const LANG_KEY = "sf_site_lang";

// One broken section must never take the page down.
class Guard extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev) { if (prev.section !== this.props.section && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function SiteView({ config, brand, lang, setLang, editing = false, selected = null, send = () => {}, ui }) {
  const theme = useMemo(() => resolveTheme(config.theme), [config.theme]);
  const vars = useMemo(() => themeVars(config.theme), [config.theme]);
  useEffect(() => { loadFont(theme.font); }, [theme.font]);
  const ctx = { brand, lang, setLang, config, theme, editing, selected, send, ui };
  const sections = (config.sections || []).filter((s) => !s.hidden && RENDER[s.type]);
  return (
    <SiteCtx.Provider value={ctx}>
      <div className="site relative min-h-[100dvh]" style={vars} lang={lang}
        onClick={editing ? () => send({ type: "select", id: null }) : undefined}>
        {sections.map((s) => {
          const C = RENDER[s.type];
          return <Guard key={s.id} section={s}><SectionCtx.Provider value={s}><C s={s} /></SectionCtx.Provider></Guard>;
        })}
        {!sections.length && editing && (
          <div className="grid min-h-[60vh] place-items-center p-10 text-center text-[var(--s-muted)]">{(ui && ui.empty) || "Add a section from the panel to start."}</div>
        )}
        <Floating />
      </div>
    </SiteCtx.Provider>
  );
}

function initialLang(config) {
  if (!isMultilingual(config.settings)) return "en";
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "hi") return saved;
  } catch { /* storage off */ }
  return (config.settings && config.settings.default_lang) || "en";
}

// A published website on the shop's address.
export function LiveSite({ config }) {
  const brand = useBrand();
  const [chosen, setLang] = useState(() => initialLang(config));
  // A one-language website always shows its main text.
  const lang = isMultilingual(config.settings) ? chosen : "en";
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage off */ }
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => {
    const st = config.settings || {};
    document.documentElement.dataset.siteMeta = "1";
    const name = pick(brand, "shop_name", lang);
    setPageMeta(st.seo_title || (brand.city ? `${name}, ${pick(brand, "city", lang)}` : name), st.seo_description);
  }, [config, brand, lang]);
  return <SiteView config={config} brand={brand} lang={lang} setLang={setLang} />;
}

const CACHE = "sf_site_live";

// "/": the live website. The classic one is the shop's original page.
export default function PublicHome() {
  const [site, setSite] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { return null; }
  });
  useEffect(() => {
    axios.get(`${BACKEND}/api/public/website`).then((r) => {
      setSite(r.data);
      try { localStorage.setItem(CACHE, JSON.stringify(r.data)); } catch { /* storage off */ }
    }).catch(() => setSite((s) => s || { kind: "classic" }));
  }, []);
  if (!site) return <div className="min-h-[100dvh]" />;
  if (site.kind !== "builder" || !site.config) return <Landing />;
  return <LiveSite config={site.config} />;
}

// /site-preview/:id: a saved draft, for the owner (needs their sign-in).
export function DraftPreview() {
  const { id } = useParams();
  const [site, setSite] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get(`/websites/${id}`).then((r) => setSite(r.data)).catch(() => setError("Sign in to the admin app to preview this website."));
  }, [id]);
  if (error) return <p className="p-10 text-center text-gray-600">{error}</p>;
  if (!site) return <div className="min-h-[100dvh]" />;
  if (site.kind !== "builder") return <Landing />;
  return <LiveSite config={site.config} />;
}

// /site-frame: the builder's live preview, inside an iframe so phone and
// desktop layouts are real. The builder sends the config, brand and language;
// the frame sends back clicks, text typed in place and toolbar actions.
export function SiteFrame() {
  const [state, setState] = useState(null);
  const origin = window.location.origin;
  const send = useMemo(() => (msg) => window.parent.postMessage({ source: "site-frame", ...msg }, origin), [origin]);
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== origin || !e.data || e.data.source !== "site-builder") return;
      if (e.data.type === "render") setState(e.data);
      if (e.data.type === "scroll" && e.data.id) {
        const el = document.getElementById(e.data.id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("message", onMsg);
    send({ type: "ready" });
    return () => window.removeEventListener("message", onMsg);
  }, [origin, send]);
  if (!state) return <div className="min-h-[100dvh] bg-white" />;
  if (state.classic) return <BrandOverride brand={state.brand}><Landing /></BrandOverride>;
  return (
    <BrandOverride brand={state.brand}>
      <FrameView state={state} send={send} />
    </BrandOverride>
  );
}

function FrameView({ state, send }) {
  const brand = useBrand();
  return (
    <SiteView config={state.config} brand={brand} lang={state.lang} setLang={(l) => send({ type: "lang", lang: l })}
      editing={state.editing !== false} selected={state.selected} send={send} ui={state.ui} />
  );
}
