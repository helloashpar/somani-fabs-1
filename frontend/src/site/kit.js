import React, { createContext, useContext, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ImagePlus, ArrowUp, ArrowDown, Shuffle, Copy, EyeOff, Trash2, Phone, MessageCircle, Navigation, Star, Mail, ArrowRight, ExternalLink } from "lucide-react";
import { telHref, waHref, directionsUrl, pick, mediaSrc } from "@/lib/brand";
import { SECTIONS } from "@/site/registry";
import { toneVars, textureStyle } from "@/site/theme";

// Building blocks every section uses: the site context, editable text,
// images, buttons and the section frame. In the builder's preview
// (`editing`) text is typed in place, images open the picker and the selected
// section gets a toolbar; on the live site they are plain HTML.

export const SiteCtx = createContext(null);
export const useSite = () => useContext(SiteCtx);
export const SectionCtx = createContext(null);
export const useSection = () => useContext(SectionCtx);

// Fixed words on the website in each language.
export const STR = {
  en: {
    call: "Call us", whatsapp: "WhatsApp us", directions: "Get directions", reviews: "See reviews", email: "Email us",
    more: "Learn more", open: "Open now", closed: "Closed now", hours: "Opening hours", address: "Address",
    phone: "Phone", follow: "Follow us", staff: "Staff login", ask: "Ask on WhatsApp", code: "Use code",
    valid: "Valid till", allReviews: "See all reviews on Google", rated: "Rated by customers on Google",
    menu: "Menu", language: "Language", contact: "Contact", visit: "Visit", rights: "All rights reserved",
    enquiry: "Hi! I saw your website and want to know more about", enquiryShop: "Hi! I saw your website.",
    addPhoto: "Add photo", addText: "Add text", noVideo: "Paste a YouTube link in the editor",
  },
  hi: {
    call: "फ़ोन करें", whatsapp: "WhatsApp करें", directions: "रास्ता देखें", reviews: "रिव्यू देखें", email: "ईमेल करें",
    more: "और जानें", open: "अभी खुला है", closed: "अभी बंद है", hours: "खुलने का समय", address: "पता",
    phone: "फ़ोन", follow: "हमसे जुड़ें", staff: "स्टाफ़ लॉगिन", ask: "WhatsApp पर पूछें", code: "कोड",
    valid: "तक मान्य", allReviews: "Google पर सभी रिव्यू देखें", rated: "Google पर ग्राहकों की रेटिंग",
    menu: "मेन्यू", language: "भाषा", contact: "संपर्क", visit: "पता", rights: "सर्वाधिकार सुरक्षित",
    enquiry: "नमस्ते! मैंने आपकी वेबसाइट देखी, मुझे इसके बारे में जानना है:", enquiryShop: "नमस्ते! मैंने आपकी वेबसाइट देखी।",
    addPhoto: "फ़ोटो जोड़ें", addText: "लिखें", noVideo: "एडिटर में YouTube लिंक डालें",
  },
};
export const useStr = () => STR[useSite().lang === "hi" ? "hi" : "en"];

// A field in the visitor's language (falls back to the main text).
export function tx(obj, key, lang) {
  if (!obj) return "";
  const v = lang && lang !== "en" ? obj[`${key}_${lang}`] : "";
  return String(v || obj[key] || "");
}

// {shop_name}, {city}, ... filled from Shop setup > General.
export function fill(text, brand, lang) {
  if (!text || !text.includes("{")) return text;
  const vars = {
    shop_name: pick(brand, "shop_name", lang), short_name: pick(brand, "short_name", lang) || pick(brand, "shop_name", lang),
    city: pick(brand, "city", lang), state: pick(brand, "state", lang), owner: pick(brand, "legal_name", lang),
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// Text from the section's content: plain on the site, typed in place in the builder.
export function T({ k, as: Tag = "span", className = "", item, list = "items", ph }) {
  const { lang, editing, brand, send } = useSite();
  const section = useSection();
  const ref = useRef(null);
  const src = item !== undefined ? ((section.content[list] || [])[item] || {}) : section.content;
  const raw = tx(src, k, lang);
  // Untranslated text is shown in the main language, so its {city} etc. are too.
  const shown = fill(raw, brand, lang !== "en" && src[`${k}_${lang}`] ? lang : "en");
  if (!editing) return shown ? <Tag className={className}>{shown}</Tag> : null;
  const key = lang && lang !== "en" ? `${k}_${lang}` : k;
  const onFocus = () => { if (ref.current) ref.current.innerText = (lang !== "en" && src[key]) || (lang === "en" ? raw : ""); };
  const onBlur = () => {
    const v = ref.current.innerText.replace(/ /g, " ").trim();
    const before = lang !== "en" ? src[key] || "" : raw;
    if (v !== before) send({ type: "edit", id: section.id, key, item, list, value: v });
    else ref.current.innerText = shown || "";
  };
  return (
    <Tag key={`${lang}:${shown}`} ref={ref} data-editable="1" data-empty={shown ? undefined : "1"} contentEditable suppressContentEditableWarning
      spellCheck={false} className={className} onFocus={onFocus} onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === "Enter" && Tag !== "p" && Tag !== "div") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") e.currentTarget.blur(); }}
      onClick={(e) => e.stopPropagation()}>
      {shown || ph || STR.en.addText}
    </Tag>
  );
}

// True when a text field has something to show (editing shows empty ones too).
export function useHas() {
  const { lang, editing } = useSite();
  const section = useSection();
  return (k, item, list = "items") => {
    if (editing) return true;
    const src = item !== undefined ? ((section.content[list] || [])[item] || {}) : section.content;
    return !!tx(src, k, lang);
  };
}

// A photo from the section. Empty: a soft pattern in the theme's colours, so
// a new website looks finished before any photo is added.
export function Img({ k = "image", item, list = "items", className = "", alt = "", style, rounded = true, seed = 0, eager }) {
  const { editing, send } = useSite();
  const section = useSection();
  const src = item !== undefined ? (((section.content[list] || [])[item] || {})[k]) : section.content[k];
  const pick = () => send({ type: "image", id: section.id, key: k, item, list });
  const cls = `${rounded ? "rounded-[var(--s-radius)]" : ""} ${className}`;
  const onClick = editing ? (e) => { e.stopPropagation(); pick(); } : undefined;
  if (src) {
    return (
      <span className={`relative block overflow-hidden ${cls} ${editing ? "cursor-pointer group/img" : ""}`} style={style} onClick={onClick}>
        <img src={mediaSrc(src)} alt={alt} loading={eager ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover" />
        {editing && <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover/img:bg-black/30 group-hover/img:opacity-100"><span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-900 shadow">Change photo</span></span>}
      </span>
    );
  }
  const angle = [135, 160, 110, 200, 45, 75][seed % 6];
  return (
    <span onClick={onClick} style={{ ...style, background: `linear-gradient(${angle}deg, color-mix(in srgb, var(--s-primary) 78%, var(--s-bg)), color-mix(in srgb, var(--s-accent) 70%, var(--s-bg)))` }}
      className={`relative block overflow-hidden ${cls} ${editing ? "cursor-pointer" : ""}`} aria-hidden={!alt}>
      <span className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.55) 1.2px, transparent 1.4px)", backgroundSize: "16px 16px" }} />
      <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/20 blur-xl" />
      {editing && <span className="absolute inset-0 grid place-items-center"><span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-gray-900 shadow"><ImagePlus size={14} /> Add photo</span></span>}
    </span>
  );
}

const ACTION_ICON = { call: Phone, whatsapp: MessageCircle, directions: Navigation, reviews: Star, email: Mail, section: ArrowRight, link: ExternalLink };

// Where a button goes, from the shop's details. null when it can't work
// (e.g. WhatsApp with no number), so the button is left out.
export function actionHref(action, brand, { link, str, text } = {}) {
  switch (action) {
    case "call": return brand.phones && brand.phones[0] ? { href: telHref(brand.phones[0]), label: str.call } : null;
    case "whatsapp": {
      const n = brand.whatsapp || (brand.phones || [])[0];
      return n ? { href: waHref(n, text || str.enquiryShop), label: str.whatsapp, external: true } : null;
    }
    case "directions": return { href: directionsUrl(brand), label: str.directions, external: true };
    case "reviews": return brand.reviews_url ? { href: brand.reviews_url, label: str.reviews, external: true } : null;
    case "email": return brand.emails && brand.emails[0] ? { href: `mailto:${brand.emails[0]}`, label: str.email } : null;
    case "section": return link ? { href: link.startsWith("#") ? link : `#${link}`, label: str.more } : null;
    case "link": return link && /^https?:\/\//.test(link) ? { href: link, label: str.more, external: true } : null;
    default: return null;
  }
}

// Button classes for the theme's button style (`style` = theme.b).
export function btnClass(style, kind, size = "md") {
  const sz = size === "lg" ? "min-h-[54px] px-7 text-[17px]" : size === "sm" ? "min-h-[40px] px-4 text-[14px]" : "min-h-[48px] px-6 text-[15.5px]";
  const shape = style === "pill" ? "rounded-full" : "rounded-[var(--s-radius-btn)]";
  const base = `inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 active:scale-[0.97] ${sz} ${shape}`;
  if (style === "pop") {
    return kind === "primary"
      ? `${base} border-2 border-[var(--t-ink)] bg-[var(--t-btn)] text-[var(--t-on-btn)] shadow-[4px_4px_0_var(--t-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--t-ink)]`
      : `${base} border-2 border-[var(--t-ink)] bg-[var(--t-bg)] text-[var(--t-ink)] shadow-[4px_4px_0_var(--t-ink)] hover:-translate-x-0.5 hover:-translate-y-0.5`;
  }
  if (style === "outline") {
    return kind === "primary"
      ? `${base} border-2 border-[var(--t-btn)] text-[var(--t-btn)] hover:bg-[var(--t-btn)] hover:text-[var(--t-on-btn)]`
      : `${base} border border-[var(--t-line)] text-[var(--t-ink)] hover:border-[var(--t-ink)]`;
  }
  return kind === "primary"
    ? `${base} bg-[var(--t-btn)] text-[var(--t-on-btn)] shadow-[0_10px_24px_-12px_var(--t-btn)] hover:brightness-110`
    : `${base} border-2 border-[color-mix(in_srgb,var(--t-ink)_22%,transparent)] text-[var(--t-ink)] hover:border-[var(--t-ink)]`;
}

// A button set in the section: content[k] is the action, content[k_label] an
// optional label (translatable), content[k_link] the link for section / link.
export function Action({ k = "cta", kind = "primary", size, className = "", text, icon = true }) {
  const { brand, lang, editing, theme } = useSite();
  const str = useStr();
  const section = useSection();
  const c = section.content;
  const a = actionHref(c[k], brand, { link: c[`${k}_link`], str, text });
  if (!a) return null;
  const label = fill(tx(c, `${k}_label`, lang), brand, lang !== "en" && c[`${k}_label_${lang}`] ? lang : "en") || a.label;
  const Icon = ACTION_ICON[c[k]];
  return (
    <a href={a.href} {...(a.external ? { target: "_blank", rel: "noreferrer" } : {})} className={`${btnClass(theme.b, kind, size)} ${className}`}
      onClick={editing ? (e) => e.preventDefault() : undefined}>
      {icon && Icon && <Icon size={18} strokeWidth={2.2} aria-hidden="true" />} {label}
    </a>
  );
}

// A fixed action not stored in content (contact cards, floating buttons).
export function QuickAction({ action, kind = "primary", size, className = "", text, label }) {
  const { brand, editing, theme } = useSite();
  const str = useStr();
  const a = actionHref(action, brand, { str, text });
  if (!a) return null;
  const Icon = ACTION_ICON[action];
  return (
    <a href={a.href} {...(a.external ? { target: "_blank", rel: "noreferrer" } : {})} className={`${btnClass(theme.b, kind, size)} ${className}`}
      onClick={editing ? (e) => e.preventDefault() : undefined}>
      {Icon && <Icon size={18} strokeWidth={2.2} aria-hidden="true" />} {label || a.label}
    </a>
  );
}

const EASE = [0.16, 1, 0.3, 1];

// Fades a block in as it scrolls into view (none in the editor or when the
// visitor prefers less motion).
export function Reveal({ children, delay = 0, className = "", as = "div" }) {
  const { theme, editing } = useSite();
  const reduce = useReducedMotion();
  const M = motion[as] || motion.div;
  if (editing || reduce || theme.motion === "none") {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const lively = theme.motion === "lively";
  return (
    <M className={className} initial={{ opacity: 0, y: lively ? 36 : 18, scale: lively ? 0.98 : 1 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }} transition={{ duration: lively ? 0.8 : 0.6, delay, ease: EASE }}>
      {children}
    </M>
  );
}

export function Container({ children, className = "", narrow }) {
  return <div className={`mx-auto w-full ${narrow ? "max-w-3xl" : "max-w-6xl"} px-5 sm:px-8 ${className}`}>{children}</div>;
}

// Kicker, heading and text of a section.
export function Heading({ center, className = "", size = "md", kicker = "kicker", title = "title", subtitle = "subtitle" }) {
  const has = useHas();
  const big = size === "lg" ? "text-[2.4rem] sm:text-5xl lg:text-[3.6rem]" : "text-[2rem] sm:text-[2.6rem] lg:text-5xl";
  return (
    <Reveal className={`${center ? "mx-auto text-center" : ""} max-w-2xl ${className}`}>
      {has(kicker) && <T k={kicker} as="p" className="mb-3 inline-block text-[13px] font-bold uppercase tracking-[0.16em] text-[var(--t-hi)]" ph="Small line" />}
      {has(title) && <T k={title} as="h2" className={`s-head block ${big}`} ph="Heading" />}
      {has(subtitle) && <T k={subtitle} as="p" className={`mt-4 block text-[17px] leading-relaxed text-[var(--t-muted)] ${center ? "mx-auto" : ""} max-w-xl`} ph="Text under the heading" />}
    </Reveal>
  );
}

// The frame of every section: its tone (colours), texture, spacing and, in
// the builder, the selection outline and toolbar.
export function Section({ section, children, pad = true, className = "", style }) {
  const { theme, editing, selected, send } = useSite();
  const def = SECTIONS[section.type];
  const tone = (section.style && section.style.tone) || def.tone;
  const textured = tone !== "page" && theme.texture && theme.texture !== "none";
  const isSel = editing && selected === section.id;
  return (
    <SectionCtx.Provider value={section}>
      <section id={section.id} data-section={section.id}
        style={{ ...toneVars(tone), ...style }}
        onClick={editing ? (e) => { e.stopPropagation(); send({ type: "select", id: section.id }); } : undefined}
        className={`relative scroll-mt-20 bg-[var(--t-bg)] text-[var(--t-ink)] ${editing ? "cursor-pointer" : ""} ${className}`}>
        {textured && <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={textureStyle(theme.texture)} />}
        <div className="relative" style={pad ? { paddingBlock: "var(--s-pad)" } : undefined}>{children}</div>
        {editing && (
          <span aria-hidden="true" className={`pointer-events-none absolute inset-0 z-30 transition ${isSel ? "shadow-[inset_0_0_0_3px_#16a34a]" : "hover:shadow-[inset_0_0_0_2px_rgba(22,163,74,.55)]"}`} />
        )}
        {isSel && <Toolbar section={section} send={send} />}
      </section>
    </SectionCtx.Provider>
  );
}

function Toolbar({ section, send }) {
  const def = SECTIONS[section.type];
  const b = (icon, label, action) => {
    const I = icon;
    return (
      <button type="button" title={label} aria-label={label} onClick={(e) => { e.stopPropagation(); send({ type: "action", id: section.id, action }); }}
        className="grid h-8 w-8 place-items-center rounded-lg text-white hover:bg-white/15"><I size={15} /></button>
    );
  };
  return (
    <div className="absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-[#16a34a] p-1 font-[Geist,system-ui,sans-serif] shadow-xl" onClick={(e) => e.stopPropagation()}>
      <span className="px-2 text-xs font-semibold text-white">{def.name}</span>
      {b(ArrowUp, "Move up", "up")}
      {b(ArrowDown, "Move down", "down")}
      {def.variants.length > 1 && b(Shuffle, "Next layout", "variant")}
      {b(Copy, "Duplicate", "duplicate")}
      {b(EyeOff, "Hide", "hide")}
      {b(Trash2, "Delete", "delete")}
    </div>
  );
}

// The section's list of items (cards, photos, reviews, ...).
export function useItems(list = "items") {
  const section = useSection();
  return section.content[list] || [];
}
