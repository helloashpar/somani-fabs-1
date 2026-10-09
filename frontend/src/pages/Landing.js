import React, { createContext, useContext, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Phone, Navigation, MapPin, ReceiptText, BadgeIndianRupee, Gem, RefreshCcw, Sparkle, Languages, Mail, Clock, MessageCircle, Instagram, Facebook, Youtube, Globe } from "lucide-react";
import { useBrand, pick, telHref, waHref } from "@/lib/brand";

// Public landing page, designed phone-first. Tokens and motifs (jharokha
// arch, leheriya ribbon, receipt edge) live under `.sf` in index.css.
// The shop's name, logo, contact, address and story come from Shop setup >
// General (useBrand), so they change here without a code change.

function fullAddress(b) {
  return [b.address_line1, b.address_line2].filter(Boolean).join(", ");
}
function directionsUrl(b) {
  return b.directions_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.shop_name}, ${fullAddress(b)}`)}`;
}
function mapEmbed(b) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${b.shop_name}, ${fullAddress(b)}`)}&output=embed`;
}
const BRANDS = [
  { name: "Raymond", src: "/images/brands/raymond.png", w: 313, h: 145 },
  { name: "Siyaram's", src: "/images/brands/siyarams.png", w: 214, h: 51 },
  { name: "Donear", src: "/images/brands/donear.png", w: 346, h: 116 },
  { name: "Ramraj", src: "/images/brands/ramraj.png", w: 325, h: 52 },
];

const px = (id, w = 800) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

// Visual data only; names and notes come from COPY so they follow the language.
// `pos` keeps faces in frame when the tall photos are cropped.
const FABRICS = [
  { img: "/images/fabrics/suiting.webp", w: 900, h: 1630, pos: "50% 12%", alt: "Man in a navy suit with a shawl lapel and bow tie" },
  { img: "/images/fabrics/shirting.webp", w: 900, h: 1382, pos: "50% 15%", alt: "Man in a printed white shirt and grey trousers" },
  { img: "/images/fabrics/kurta-pyjama.webp", w: 900, h: 1279, pos: "50% 18%", alt: "Man in a cream embroidered kurta-pyjama with a stole" },
  { img: "/images/fabrics/dhoti.webp", w: 900, h: 1458, pos: "50% 15%", alt: "Man in a white dhoti and shirt with a Rajasthani safa" },
  { img: "/images/fabrics/jacket.webp", w: 900, h: 1407, pos: "50% 25%", alt: "Man in a grey Nehru jacket over a pink shirt" },
];

const OCCASIONS = [
  { img: px(3998093, 900), alt: "Man in a white achkan adjusting his cufflinks", cls: "col-span-2 row-span-2 md:col-span-1" },
  { img: px(9824794, 600), alt: "Colourful rolls of fabric", cls: "" },
  { img: px(6765639, 600), alt: "Tailored suits on mannequins", cls: "" },
];

// Every visible string, in English and simple everyday Hindi. The small
// accent lines show the *other* language, so each section reads in both.
const COPY = {
  en: {
    skip: "Skip to fabrics",
    langLabel: "Language",
    call: "Call the shop",
    directions: "Directions",
    nav: ["Fabrics", "Our promise", "Story", "Visit"],
    heroLead: "The fabric house of",
    heroTail: "",
    est: "Est.",
    brandsMore: "and many more",
    brandsNote: "Plus many more names in suiting, shirting and ethnic wear. Ask us for yours.",
    fabricsTitle: "Choose your fabric",
    fabrics: [
      { name: "Suiting", note: "Suit lengths for weddings and office" },
      { name: "Shirting", note: "Plain, check and print" },
      { name: "Kurta-pyjama", note: "Festive and everyday" },
      { name: "Dhoti", note: "For pooja, weddings, daily wear" },
      { name: "Jacket", note: "Bandhgala, Nehru and blazer" },
    ],
    promiseTitle: "No bill? No problem.",
    promiseBody: "Found a problem with fabric you bought from us? Bring it back. We don't ask for the bill. If it's ours, we'll change it.",
    stamp: "No receipt needed",
    perks: ["Affordable prices", "Better quality fabric", "Easy exchange"],
    occasionsTitle: "Dressed for every day that matters",
    occasions: ["Weddings", "Festivals", "Office"],
    statYear: "The year we opened",
    statBrands: "Top brands under one roof",
    visitTitle: "Come visit us",
    tapToCall: "Tap to call",
    whatsapp: "WhatsApp us",
    email: "Email",
    hours: "Open",
    follow: "Follow us",
    staff: "Staff login",
  },
  hi: {
    skip: "कपड़ों पर जाएँ",
    langLabel: "भाषा",
    call: "फ़ोन करें",
    directions: "रास्ता देखें",
    nav: ["कपड़े", "हमारा वादा", "हमारी कहानी", "पता"],
    heroLead: "",
    heroTail: "की अपनी कपड़े की दुकान",
    est: "स्थापना",
    brandsMore: "और भी कई ब्रांड",
    brandsNote: "सूटिंग, शर्टिंग और कुर्ते के कपड़ों के और भी कई ब्रांड हैं। अपना पसंदीदा ब्रांड पूछिए।",
    fabricsTitle: "अपना कपड़ा चुनिए",
    fabrics: [
      { name: "सूटिंग", note: "शादी और ऑफ़िस के लिए सूट का कपड़ा" },
      { name: "शर्टिंग", note: "सादा, चेक और प्रिंट" },
      { name: "कुर्ता-पायजामा", note: "त्योहार और रोज़ के लिए" },
      { name: "धोती", note: "पूजा, शादी और रोज़ पहनने के लिए" },
      { name: "जैकेट", note: "बंदगला, नेहरू जैकेट और ब्लेज़र" },
    ],
    promiseTitle: "बिल नहीं? कोई बात नहीं।",
    promiseBody: "हमसे लिए कपड़े में कोई कमी निकले तो वापस ले आइए। हम बिल नहीं माँगते। कपड़ा हमारा है तो हम बदल देंगे।",
    stamp: "बिल की ज़रूरत नहीं",
    perks: ["सही दाम", "बढ़िया क्वालिटी", "आसानी से बदली"],
    occasionsTitle: "हर रस्म, हर त्योहार",
    occasions: ["शादी", "त्योहार", "दफ़्तर"],
    statYear: "दुकान की शुरुआत",
    statBrands: "ब्रांड, एक छत के नीचे",
    visitTitle: "दुकान पर पधारिए",
    tapToCall: "फ़ोन करने के लिए दबाएँ",
    whatsapp: "WhatsApp करें",
    email: "ईमेल",
    hours: "खुलने का समय",
    follow: "हमसे जुड़िए",
    staff: "स्टाफ़ लॉगिन",
  },
};

const LANG_KEY = "sf_site_lang"; // kept apart from the admin app's `sf_lang`
const LangCtx = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "hi") return saved;
  } catch {}
  return "hi"; // Hindi first for local customers; English is one tap away
}

// Lines built from the shop's details (Shop setup > General) in one language.
function brandCopy(b, lang) {
  const hi = lang === "hi";
  const p = (k) => pick(b, k, lang);
  const year = b.founded_year;
  const since = year ? (hi ? `${year} से` : `Since ${year}`) : "";
  const city = p("city");
  return {
    shop: p("shop_name"),
    // The header line shows the name in Devanagari, as a shop sign would.
    tagline: p("tagline") || [pick(b, "shop_name", "hi"), since].filter(Boolean).join(" · "),
    pill: [since, p("locality")].filter(Boolean).join(" · "),
    city,
    heroAccent: hi ? `The fabric house of ${b.city}` : `${pick(b, "city", "hi")} की अपनी कपड़े की दुकान`,
    heroSub: p("description"),
    brandsTitle: b.brands_count ? (hi ? `${b.brands_count} ब्रांड, एक छत के नीचे` : `${b.brands_count} brands under one roof`)
      : (hi ? "बढ़िया ब्रांड, एक छत के नीचे" : "Top brands under one roof"),
    storyKicker: pick(b, "legal_name", hi ? "en" : "hi"),
    storyTitle: hi ? `${year ? `${year} से ` : ""}${city} का भरोसेमंद नाम`
      : `A family name ${city} has trusted${year ? ` since ${year}` : ""}`,
    storyBody: p("story_body"),
    founder: p("founder"),
    address1: p("address_line1"),
    address2: p("address_line2"),
    hoursText: p("hours"),
    footerNote: p("footer_note"),
    mapTitle: hi ? `${p("shop_name")}, ${p("locality")}, ${city} का नक्शा` : `Map to ${b.shop_name}, ${b.locality}, ${b.city}`,
    footerLine: [p("legal_name"), city].filter(Boolean).join(" · "),
  };
}

// t = strings in the chosen language, o = the other language (accent lines).
function useCopy() {
  const { lang, setLang } = useContext(LangCtx);
  const b = useBrand();
  const other = lang === "en" ? "hi" : "en";
  return { lang, setLang, b, t: { ...COPY[lang], ...brandCopy(b, lang) }, o: { ...COPY[other], ...brandCopy(b, other) } };
}

const EASE = [0.16, 1, 0.3, 1];

function Reveal({ children, delay = 0, className = "", y = 28 }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const pill = "inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-base font-semibold transition-[transform,background-color,color] duration-200 active:scale-[0.97] cursor-pointer";

function CallButton({ className = "" }) {
  const { t, b } = useCopy();
  if (!b.phones.length) return null;
  return (
    <a href={telHref(b.phones[0])} className={`${pill} bg-[var(--sf-crimson)] text-white shadow-[0_10px_24px_-10px_rgba(136,13,30,0.7)] hover:bg-[var(--sf-crimson-press)] ${className}`}>
      <Phone size={18} strokeWidth={2} aria-hidden="true" /> {t.call}
    </a>
  );
}

function DirectionsButton({ className = "" }) {
  const { t, b } = useCopy();
  return (
    <a href={directionsUrl(b)} target="_blank" rel="noreferrer"
      className={`${pill} border-2 border-[var(--sf-ink)] bg-[var(--sf-card)] text-[var(--sf-ink)] hover:bg-[var(--sf-ink)] hover:text-white ${className}`}>
      <Navigation size={18} strokeWidth={2} aria-hidden="true" /> {t.directions}
    </a>
  );
}

// Each label is written in its own script, so a visitor who can't read
// English still recognises "हिंदी".
function LanguageSwitch() {
  const { lang, setLang, t, o } = useCopy();
  const opt = (code, label) => (
    <button type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}
      className={`min-h-[40px] cursor-pointer rounded-full px-3.5 text-[15px] font-semibold transition-colors duration-200 ${lang === code ? "bg-[var(--sf-crimson)] text-white shadow-[0_6px_14px_-8px_rgba(136,13,30,0.8)]" : "text-[var(--sf-crimson)] hover:bg-[var(--sf-blush-soft)]"}`}>
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={`${t.langLabel} / ${o.langLabel}`}
      className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--sf-card)] p-1 ring-1 ring-[var(--sf-line)]">
      <Languages size={17} strokeWidth={2} className="ml-1.5 mr-0.5 hidden text-[var(--sf-muted)] sm:block" aria-hidden="true" />
      {opt("hi", "हिंदी")}
      {opt("en", "English")}
    </div>
  );
}

// Logo (when one is uploaded) beside the shop name.
function ShopMark({ size = "h-9 w-9 sm:h-11 sm:w-11" }) {
  const { b } = useCopy();
  if (!b.logo_src) return null;
  return <img src={b.logo_src} alt="" className={`${size} shrink-0 rounded-xl object-contain`} />;
}

function Header() {
  const { t, b } = useCopy();
  const links = [["#fabrics", 0], ["#promise", 1], ["#story", 2], ["#visit", 3]].filter(([h]) => h !== "#promise" || b.show_promise);
  return (
    <header className="sticky top-0 z-40 bg-[color-mix(in_srgb,var(--sf-bg)_90%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <ShopMark />
          <span className="flex min-w-0 flex-col leading-none">
            <span className={`sf-display truncate text-[var(--sf-crimson)] sm:text-[26px] ${b.logo_src ? "text-[21px]" : "text-[24px]"}`}>{b.shop_name}</span>
            <span className="mt-0.5 truncate text-[13px] font-medium text-[var(--sf-muted)]">{t.tagline}</span>
          </span>
        </a>
        <div className="flex items-center gap-6">
          <nav aria-label="Sections" className="hidden items-center gap-6 lg:flex">
            {links.map(([href, i]) => (
              <a key={href} href={href} className="text-[15px] font-medium text-[var(--sf-muted)] transition-colors hover:text-[var(--sf-crimson)]">{t.nav[i]}</a>
            ))}
          </nav>
          <LanguageSwitch />
          <CallButton className="hidden min-h-[44px] px-5 text-[15px] md:inline-flex" />
        </div>
      </div>
      <div className="sf-leheriya" aria-hidden="true" />
    </header>
  );
}

// Round seal with the founding year; the ring of text turns slowly.
function Seal({ className = "" }) {
  const { t, b } = useCopy();
  if (!b.founded_year) return null;
  return (
    <div className={`grid h-28 w-28 place-items-center rounded-full bg-[var(--sf-rose)] text-white shadow-[0_12px_30px_-12px_rgba(90,10,25,0.45)] sm:h-32 sm:w-32 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="sf-spin absolute h-full w-full">
        <defs><path id="sf-seal-ring" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" /></defs>
        <text fontSize="10.5" fontWeight="700" letterSpacing="2.6" fill="currentColor" fontFamily="Mukta, sans-serif">
          <textPath href="#sf-seal-ring" textLength="286" lengthAdjust="spacing">{`${b.shop_name} · ${b.city} · `.toUpperCase()}</textPath>
        </text>
      </svg>
      <div className="text-center leading-none">
        <span className="block text-[11px] font-bold uppercase tracking-wider">{t.est}</span>
        <span className="sf-display block text-[28px]">{b.founded_year}</span>
      </div>
    </div>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  const { t, b } = useCopy();
  const rise = (i) => ({
    initial: reduce ? false : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, delay: 0.05 + i * 0.08, ease: EASE },
  });
  const lead = "mt-1 block text-[22px] font-semibold text-[var(--sf-muted)] sm:text-2xl";
  return (
    <section id="top" className="relative overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[var(--sf-blush-soft)] blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-[55%] h-64 w-64 rounded-full bg-[var(--sf-aqua)] blur-2xl" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 md:grid-cols-2 md:items-center md:gap-12 md:pb-20 md:pt-14">
        <div className="text-center md:text-left">
          {t.pill && <motion.p {...rise(0)} className="inline-flex items-center gap-2 rounded-full bg-[var(--sf-aqua)] px-4 py-1.5 text-sm font-semibold text-[var(--sf-crimson)]">
            <Sparkle size={14} fill="currentColor" stroke="none" aria-hidden="true" /> {t.pill}
          </motion.p>}
          <motion.h1 {...rise(1)} className="mt-5">
            <span className="sf-display block text-[2.4rem] leading-tight text-[var(--sf-crimson)] sm:text-5xl">{t.shop}</span>
            {t.heroLead && <span className={lead}>{t.heroLead}</span>}
            <span className="sf-display mt-1 block text-[3rem] leading-[1.15] text-[var(--sf-rose)] sm:text-6xl lg:text-[4.5rem]">{t.city}</span>
            {t.heroTail && <span className={lead}>{t.heroTail}</span>}
          </motion.h1>
          <motion.div {...rise(2)} aria-hidden="true" className="sf-leheriya mx-auto mt-5 h-2 w-28 rounded-full md:mx-0" />
          <motion.p {...rise(2)} className="sf-display mt-4 text-[22px] text-[var(--sf-crimson)] sm:text-2xl">{t.heroAccent}</motion.p>
          <motion.p {...rise(3)} className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-[var(--sf-muted)] sm:text-lg md:mx-0">
            {t.heroSub}
          </motion.p>
          <motion.div {...rise(4)} className="mt-8 hidden flex-wrap gap-3 md:flex">
            <CallButton />
            <DirectionsButton />
          </motion.div>
        </div>

        {/* Arch collage: shopfront, a smaller arch of suiting, the seal. */}
        <div className="relative mx-auto w-full max-w-[420px] pb-10 pl-10 sm:pl-14">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, delay: 0.15, ease: EASE }}
            className="sf-arch overflow-hidden border-[6px] border-[var(--sf-card)] bg-[var(--sf-blush-soft)] shadow-[0_30px_60px_-30px_rgba(90,10,25,0.5)]"
          >
            <img src="/images/shopfront.jpg" alt={`${b.shop_name} shopfront at ${b.locality}, ${b.city}`}
              width="1133" height="1388" fetchPriority="high" className="aspect-[4/5] w-full object-cover" />
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.45, ease: EASE }}
            className="sf-arch absolute bottom-0 left-0 w-[38%] overflow-hidden border-[5px] border-[var(--sf-card)] shadow-[0_20px_40px_-20px_rgba(90,10,25,0.55)]"
          >
            <img src={px(6766360, 500)} alt="" className="aspect-[3/4] w-full object-cover" />
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.6, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.7 }}
            className="absolute -right-2 top-6 sm:-right-6"
          >
            <Seal className="relative" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function LogoCard({ b }) {
  return (
    <div className="grid h-20 w-44 shrink-0 place-items-center rounded-2xl bg-[var(--sf-card)] px-5 shadow-[0_10px_24px_-18px_rgba(90,10,25,0.5)] ring-1 ring-[var(--sf-line)] sm:h-24 sm:w-52">
      <img src={b.src} alt={b.name} width={b.w} height={b.h} loading="lazy" className="max-h-12 w-auto max-w-full object-contain sm:max-h-14" />
    </div>
  );
}

function BrandWall() {
  const { t, o } = useCopy();
  const row = [...BRANDS, ...BRANDS];
  return (
    <section aria-labelledby="brands-title" className="bg-[var(--sf-aqua-soft)] py-14 md:py-20">
      <Reveal className="px-4 text-center">
        <p className="sf-display text-lg text-[var(--sf-rose)]">{o.brandsTitle}</p>
        <h2 id="brands-title" className="sf-display mt-1 text-[2.25rem] leading-[1.15] sm:text-5xl">{t.brandsTitle}</h2>
      </Reveal>
      <ul className="sr-only">{BRANDS.map((b) => <li key={b.name}>{b.name}</li>)}<li>{t.brandsMore}</li></ul>
      <div className="sf-marquee-wrap mt-10 overflow-hidden" aria-hidden="true">
        <div className="sf-marquee flex w-max gap-4 pr-4">
          {[...row, ...row].map((b, i) => <LogoCard key={i} b={b} />)}
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-xl px-4 text-center text-[17px] text-[var(--sf-muted)]">{t.brandsNote}</p>
    </section>
  );
}

// Accent line above the heading shows the other language, unless `kicker` is given.
function SectionTitle({ k, kicker, className = "" }) {
  const { t, o } = useCopy();
  return (
    <div className={className}>
      <p className="sf-display text-lg text-[var(--sf-crimson)]">{kicker ?? o[k]}</p>
      <h2 className="sf-display mt-1 text-[2.25rem] leading-[1.15] sm:text-5xl">{t[k]}</h2>
    </div>
  );
}

function FabricCard({ f, i, wide, delay }) {
  const { t, o } = useCopy();
  return (
    <Reveal delay={delay} className={wide ? "col-span-2 mx-auto w-[64%] sm:w-[50%] lg:col-span-1 lg:w-auto" : ""}>
      <figure className="group">
        <div className="sf-arch overflow-hidden border-[5px] border-[var(--sf-card)] bg-[var(--sf-aqua-soft)] shadow-[0_18px_40px_-24px_rgba(90,10,25,0.5)]">
          <img src={f.img} alt={f.alt} width={f.w} height={f.h} loading="lazy" style={{ objectPosition: f.pos }}
            className="aspect-[3/4] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]" />
        </div>
        <figcaption className={`mt-3 px-1 ${wide ? "text-center lg:text-left" : ""}`}>
          <span className="sf-display block text-[22px] leading-snug sm:text-2xl">{t.fabrics[i].name}</span>
          <span className="block text-[15px] font-semibold text-[var(--sf-crimson)]">{o.fabrics[i].name}</span>
          <span className="mt-0.5 block text-[15px] leading-snug text-[var(--sf-muted)]">{t.fabrics[i].note}</span>
        </figcaption>
      </figure>
    </Reveal>
  );
}

function Fabrics() {
  return (
    <section id="fabrics" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
      <Reveal><SectionTitle k="fabricsTitle" /></Reveal>
      <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-5 lg:gap-x-5">
        {FABRICS.map((f, i) => <FabricCard key={f.img} f={f} i={i} wide={i === 0} delay={(i % 2) * 0.08} />)}
      </div>
    </section>
  );
}

function OurPromise() {
  const { lang, t, o } = useCopy();
  const perks = [BadgeIndianRupee, Gem, RefreshCcw];
  return (
    <section id="promise" className="scroll-mt-20 bg-[var(--sf-blush-soft)] px-4 py-16 sm:px-6 md:py-24">
      <Reveal className="mx-auto max-w-3xl">
        <div className="sf-receipt relative overflow-hidden rounded-t-[32px] bg-[var(--sf-card)] px-6 pt-10 text-center sm:px-12 sm:pt-14">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--sf-crimson)] text-white">
            <ReceiptText size={30} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <p className="sf-display mt-6 text-xl text-[var(--sf-crimson)]">{o.promiseTitle}</p>
          <h2 className="sf-display mt-1 text-[2.4rem] leading-[1.15] sm:text-6xl">{t.promiseTitle}</h2>
          <p className="mx-auto mt-5 max-w-[34ch] text-[17px] leading-relaxed text-[var(--sf-muted)] sm:text-lg">{t.promiseBody}</p>
          {/* Letter-spacing breaks Devanagari joins, so only English gets tracking. */}
          <div className={`mx-auto mt-7 inline-block -rotate-6 rounded-xl border-[3px] border-[var(--sf-crimson)] px-4 py-1.5 font-bold text-[var(--sf-crimson)] ${lang === "en" ? "text-sm uppercase tracking-[0.14em]" : "text-base"}`}>
            {t.stamp}
          </div>
          <div className="mx-auto mt-10 border-t-2 border-dashed border-[var(--sf-line)] pt-8">
            <ul className="flex flex-wrap justify-center gap-2.5">
              {perks.map((Icon, n) => (
                <li key={n} className="flex items-center justify-center gap-2 rounded-full bg-[var(--sf-aqua)] px-4 py-2.5 text-[15px] font-semibold">
                  <Icon size={18} strokeWidth={2} className="text-[var(--sf-crimson)]" aria-hidden="true" /> {t.perks[n]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Occasions() {
  const { t, o } = useCopy();
  return (
    <section className="bg-[var(--sf-aqua-soft)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <Reveal><SectionTitle k="occasionsTitle" className="max-w-xl" /></Reveal>
        <div className="mt-10 grid auto-rows-[170px] grid-cols-2 gap-4 sm:auto-rows-[220px] md:grid-cols-[1.3fr_1fr] md:auto-rows-[240px]">
          {OCCASIONS.map((x, i) => (
            <Reveal key={x.img} delay={i * 0.08} className={`relative overflow-hidden rounded-[28px] ${x.cls}`}>
              <img src={x.img} alt={x.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(90,10,25,0.78)] via-[rgba(90,10,25,0.12)] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <span className="block text-[15px] font-semibold text-[var(--sf-blush)]">{o.occasions[i]}</span>
                <span className="sf-display block text-[26px] leading-snug sm:text-3xl">{t.occasions[i]}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Story() {
  const { t, b } = useCopy();
  return (
    <section id="story" className="mx-auto grid max-w-6xl scroll-mt-20 items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-16 md:py-24">
      <Reveal className="relative mx-auto w-full max-w-[340px]">
        <div className="sf-arch bg-[var(--sf-flamingo)] p-2.5 shadow-[0_30px_60px_-30px_rgba(90,10,25,0.55)]">
          <div className="sf-arch overflow-hidden border-4 border-[var(--sf-card)]">
            <img src="/images/founder-shivnarayan-somani.jpg" alt={`Portrait of the founder of ${b.shop_name}`}
              loading="lazy" width="960" height="1280" className="aspect-[3/4] w-full object-cover object-top grayscale" />
          </div>
        </div>
        <p className="mt-4 text-center text-[15px] font-medium text-[var(--sf-muted)]">{t.founder}</p>
      </Reveal>
      <Reveal delay={0.1}>
        <SectionTitle k="storyTitle" kicker={t.storyKicker} />
        <p className="mt-5 text-[17px] leading-relaxed text-[var(--sf-muted)] sm:text-lg">{t.storyBody}</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          {b.founded_year && (
            <div className="rounded-3xl bg-[var(--sf-blush-soft)] p-5">
              <span className="sf-display block text-4xl text-[var(--sf-crimson)]">{b.founded_year}</span>
              <span className="mt-1 block text-[15px] font-medium text-[var(--sf-muted)]">{t.statYear}</span>
            </div>
          )}
          {b.brands_count && (
            <div className="rounded-3xl bg-[var(--sf-aqua)] p-5">
              <span className="sf-display block text-4xl text-[var(--sf-crimson)]">{b.brands_count}</span>
              <span className="mt-1 block text-[15px] font-medium text-[var(--sf-muted)]">{t.statBrands}</span>
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}

// A tappable contact row in the Visit section.
function ContactCard({ href, icon: Icon, label, value, external }) {
  const { lang } = useCopy();
  return (
    <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="group flex min-h-[64px] items-center gap-4 rounded-[28px] bg-[var(--sf-card)] p-4 pr-6 ring-1 ring-[var(--sf-line)] transition-[transform,box-shadow] duration-200 hover:shadow-[0_16px_30px_-20px_rgba(136,13,30,0.6)] active:scale-[0.98]">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--sf-crimson)] text-white">
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold text-[var(--sf-muted)] ${lang === "en" ? "text-[13px] uppercase tracking-wider" : "text-[15px]"}`}>{label}</span>
        <span className="sf-display block break-words text-2xl leading-tight">{value}</span>
      </span>
    </a>
  );
}

// "+919414422558" -> "+91 94144 22558"
function prettyMobile(v) {
  return v.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");
}

function Visit() {
  const { t, b } = useCopy();
  return (
    <section id="visit" className="scroll-mt-20 px-4 pb-16 sm:px-6 md:pb-24">
      <div className="mx-auto max-w-6xl">
        <Reveal><SectionTitle k="visitTitle" /></Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-[1fr_1.2fr]">
          <Reveal className="flex flex-col gap-4">
            <div className="rounded-[28px] bg-[var(--sf-card)] p-6 ring-1 ring-[var(--sf-line)]">
              <div className="flex gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--sf-blush-soft)] text-[var(--sf-crimson)]">
                  <MapPin size={22} strokeWidth={2} aria-hidden="true" />
                </span>
                <address className="text-[17px] not-italic leading-relaxed">
                  <span className="font-semibold">{t.address1}</span><br />
                  {t.address2}
                  {t.hoursText && (
                    <span className="mt-2 flex items-center gap-1.5 text-[15px] text-[var(--sf-muted)]">
                      <Clock size={16} strokeWidth={2} aria-hidden="true" /> {t.hours}: {t.hoursText}
                    </span>
                  )}
                </address>
              </div>
              <DirectionsButton className="mt-5 w-full" />
            </div>
            {b.phones.map((p) => <ContactCard key={p} href={telHref(p)} icon={Phone} label={t.tapToCall} value={p} />)}
            {b.whatsapp && <ContactCard href={waHref(b.whatsapp)} icon={MessageCircle} label={t.whatsapp} value={prettyMobile(b.whatsapp)} external />}
            {b.email && <ContactCard href={`mailto:${b.email}`} icon={Mail} label={t.email} value={b.email} />}
          </Reveal>
          <Reveal delay={0.1} className="relative min-h-[320px] overflow-hidden rounded-[28px] bg-[var(--sf-aqua-soft)] ring-1 ring-[var(--sf-line)]">
            <iframe title={t.mapTitle} src={mapEmbed(b)}
              loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 h-full w-full border-0" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const SOCIAL = [
  { key: "instagram", icon: Instagram, label: "Instagram" },
  { key: "facebook", icon: Facebook, label: "Facebook" },
  { key: "youtube", icon: Youtube, label: "YouTube" },
  { key: "website", icon: Globe, label: "Website" },
];

function Footer() {
  const { t, b } = useCopy();
  const social = SOCIAL.filter((s) => b[s.key]);
  return (
    <footer>
      <div className="sf-leheriya" aria-hidden="true" />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 pb-28 pt-10 text-center sm:px-6 md:flex-row md:justify-between md:pb-10 md:text-left">
        <div className="flex flex-col items-center gap-3 md:flex-row">
          <ShopMark size="h-12 w-12" />
          <div>
            <span className="sf-display block text-2xl text-[var(--sf-crimson)]">{b.shop_name}</span>
            {t.footerLine && <span className="block text-[15px] text-[var(--sf-muted)]">{t.footerLine}</span>}
            {t.footerNote && <span className="mt-1 block max-w-md text-[15px] text-[var(--sf-muted)]">{t.footerNote}</span>}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          {social.length > 0 && (
            <ul aria-label={t.follow} className="flex items-center gap-2">
              {social.map((s) => (
                <li key={s.key}>
                  <a href={b[s.key]} target="_blank" rel="noreferrer" aria-label={s.label}
                    className="grid h-11 w-11 place-items-center rounded-full bg-[var(--sf-card)] text-[var(--sf-crimson)] ring-1 ring-[var(--sf-line)] transition-colors hover:bg-[var(--sf-crimson)] hover:text-white">
                    <s.icon size={19} strokeWidth={2} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-5 text-[15px] text-[var(--sf-muted)]">
            <span>© {new Date().getFullYear()} {b.shop_name}</span>
            {b.show_staff_login && <a href="/admin" className="py-2 transition-colors hover:text-[var(--sf-crimson)]">{t.staff}</a>}
          </div>
        </div>
      </div>
    </footer>
  );
}

// Thumb-reach action bar on phones; desktop uses the header and hero buttons.
function MobileActionBar() {
  const { b } = useCopy();
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sf-line)] bg-[color-mix(in_srgb,var(--sf-bg)_92%,transparent)] px-4 pt-3 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className={`grid gap-3 ${b.phones.length ? "grid-cols-[1.4fr_1fr]" : "grid-cols-1"}`}>
        <CallButton className="w-full" />
        <DirectionsButton className="w-full px-4" />
      </div>
    </div>
  );
}

export default function Landing() {
  const [lang, setLang] = useState(initialLang);
  const brand = useBrand();
  // The shop's colour replaces the crimson accent across the page.
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accent_color || "") ? brand.accent_color : null;
  const theme = accent ? { "--sf-crimson": accent, "--sf-crimson-press": `color-mix(in srgb, ${accent} 80%, black)` } : undefined;
  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    const prev = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = prev; };
  }, [lang]);

  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <div lang={lang} className="sf min-h-[100dvh] antialiased" style={theme}>
        <a href="#fabrics" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">{COPY[lang].skip}</a>
        <Header />
        <main>
          <Hero />
          {brand.show_brands && <BrandWall />}
          <Fabrics />
          {brand.show_promise && <OurPromise />}
          <Occasions />
          <Story />
          <Visit />
        </main>
        <Footer />
        <MobileActionBar />
      </div>
    </LangCtx.Provider>
  );
}
