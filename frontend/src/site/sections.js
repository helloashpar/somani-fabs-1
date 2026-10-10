import React, { useState } from "react";
import { Menu, X, Languages, Star, MapPin, Clock, Phone, Mail, MessageCircle, Instagram, Facebook, Youtube, Twitter, Linkedin, Globe, Check, ChevronDown, Quote as QuoteIcon, Sparkles } from "lucide-react";
import { pick, telHref, waHref, prettyMobile, formatAddress, mapEmbedUrl, hoursRows, hoursSummary, openNow, hasHours, formatTime, DAYS, DAY_NAMES } from "@/lib/brand";
import { ICONS } from "@/site/registry";
import { isMultilingual } from "@/site/presets";
import { useSite, useStr, useSection, useHas, useItems, useFact, T, Img, Action, QuickAction, Reveal, Container, Heading, Section, fill, tx, btnClass } from "@/site/kit";

// Every section type in every layout. Each reads its own content (T, Img,
// Action) and the shop's facts from General (brand). Colours, fonts, corners
// and spacing come only from theme variables, so all combinations work.

const NAV = {
  en: { about: "About", products: "Products", gallery: "Gallery", testimonials: "Reviews", offer: "Offers", contact: "Visit", faq: "FAQ", team: "Team", video: "Video", features: "Why us" },
  hi: { about: "हमारे बारे में", products: "प्रोडक्ट", gallery: "गैलरी", testimonials: "रिव्यू", offer: "ऑफ़र", contact: "पता", faq: "सवाल", team: "टीम", video: "वीडियो", features: "ख़ासियत" },
};

function ShopName({ className = "" }) {
  const { brand, lang } = useSite();
  const fact = useFact("shop_name");
  return <span {...fact} className={`s-head ${className}`}>{pick(brand, "shop_name", lang)}</span>;
}

function Logo({ className = "h-10 w-10" }) {
  const { brand } = useSite();
  const fact = useFact("logo");
  if (!brand.logo_src) return null;
  return <img {...fact} src={brand.logo_src} alt="" className={`${className} shrink-0 rounded-[calc(var(--s-radius)*0.6)] object-contain`} />;
}

function OpenBadge({ className = "" }) {
  const { brand } = useSite();
  const str = useStr();
  const open = openNow(brand);
  const fact = useFact("hours");
  if (open === null) return null;
  return (
    <span {...fact} className={`inline-flex items-center gap-2 rounded-full bg-[var(--t-card)] px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-[var(--t-line)] ${className}`}>
      <span className={`h-2 w-2 rounded-full ${open ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.2)]" : "bg-rose-500"}`} />
      {open ? str.open : str.closed}
    </span>
  );
}

function RatingBadge({ className = "" }) {
  const { brand, editing } = useSite();
  const str = useStr();
  const fact = useFact("reviews");
  if (!brand.reviews_url) return null;
  return (
    <a href={brand.reviews_url} target="_blank" rel="noreferrer" onClick={editing ? (e) => e.preventDefault() : undefined} {...fact}
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--t-card)] px-3.5 py-1.5 text-[13.5px] font-semibold ring-1 ring-[var(--t-line)] ${className}`}>
      <span className="flex text-amber-500">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={13} fill="currentColor" strokeWidth={0} />)}</span> {str.reviews}
    </a>
  );
}

function Buttons({ className = "", size = "lg", center }) {
  return (
    <div className={`flex flex-wrap gap-3 ${center ? "justify-center" : ""} ${className}`}>
      <Action k="cta" kind="primary" size={size} />
      <Action k="cta2" kind="secondary" size={size} />
    </div>
  );
}

function Stars({ n = 5, className = "" }) {
  return <span className={`flex gap-0.5 text-amber-500 ${className}`} aria-label={`${n} stars`}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={16} fill={i < n ? "currentColor" : "none"} strokeWidth={i < n ? 0 : 1.5} />)}</span>;
}

// ---------- Top ----------
function Announce({ s }) {
  const { lang, brand } = useSite();
  const text = fill(tx(s.content, "text", lang), brand, lang);
  if (s.variant === "marquee") {
    const row = Array.from({ length: 6 }, () => text);
    return (
      <Section section={s} pad={false}>
        <div className="overflow-hidden py-2.5">
          <div className="s-marquee flex w-max gap-10 text-[14px] font-semibold" style={{ "--s-marquee": "28s" }}>
            {[...row, ...row].map((x, i) => <span key={i} className="flex items-center gap-10">{i === 0 ? <T k="text" /> : x}<Sparkles size={14} className="text-[var(--t-hi)]" /></span>)}
          </div>
        </div>
      </Section>
    );
  }
  return (
    <Section section={s} pad={false}>
      <Container className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 py-2.5 text-center text-[14px] font-semibold">
        <T k="text" />
        <Action k="cta" kind="secondary" size="sm" icon={false} className="!min-h-[30px] !px-3 !text-[13px]" />
      </Container>
    </Section>
  );
}

// The English / हिंदी switch in the header, in the style chosen in the
// website's settings.
export function LangSwitch({ kind = "button", lang, setLang, label }) {
  const other = lang === "hi" ? "en" : "hi";
  const flip = () => setLang(other);
  if (kind === "toggle") {
    return (
      <span role="group" aria-label={label} className="inline-flex h-10 items-center rounded-full p-1 text-[13.5px] font-semibold ring-1 ring-[var(--t-line)]">
        {[["en", "EN"], ["hi", "हिं"]].map(([l, t]) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}
            className={`h-8 rounded-full px-3 transition-colors ${lang === l ? "bg-[var(--t-btn)] text-[var(--t-on-btn)]" : "text-[var(--t-muted)]"}`}>{t}</button>
        ))}
      </span>
    );
  }
  if (kind === "text") {
    return (
      <button type="button" onClick={flip} aria-label={label} lang={other}
        className="inline-flex h-10 items-center px-1 text-[14.5px] font-semibold underline decoration-2 underline-offset-4 decoration-[var(--t-hi)]">{other === "hi" ? "हिंदी" : "English"}</button>
    );
  }
  if (kind === "icon") {
    return (
      <button type="button" onClick={flip} aria-label={label} title={other === "hi" ? "हिंदी" : "English"}
        className="relative grid h-10 w-10 place-items-center rounded-full ring-1 ring-[var(--t-line)] hover:bg-[var(--t-card)]">
        <Languages size={17} aria-hidden="true" />
        <span className="absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--t-btn)] px-1 text-[10px] font-bold text-[var(--t-on-btn)]" lang={other}>{other === "hi" ? "हि" : "EN"}</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={flip} aria-label={label}
      className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold ring-1 ring-[var(--t-line)] hover:bg-[var(--t-card)]">
      <Languages size={16} aria-hidden="true" /> <span lang={other}>{other === "hi" ? "हिंदी" : "English"}</span>
    </button>
  );
}

function Header({ s }) {
  const { lang, setLang, config, editing } = useSite();
  const str = useStr();
  const [open, setOpen] = useState(false);
  const c = s.content;
  const links = c.show_menu === false ? [] : config.sections
    .filter((x) => !x.hidden && NAV.en[x.type])
    .filter((x, i, all) => all.findIndex((y) => y.type === x.type) === i)
    .slice(0, 5)
    .map((x) => ({ href: `#${x.id}`, label: NAV[lang === "hi" ? "hi" : "en"][x.type] }));
  const st = config.settings || {};
  const showLang = isMultilingual(st) && st.language_switch !== false;
  const transparent = c.transparent;
  const LangBtn = showLang ? <LangSwitch kind={st.lang_style} lang={lang} setLang={setLang} label={str.language} /> : null;
  const Brand = (
    <a href="#top" onClick={editing ? (e) => e.preventDefault() : undefined} className={`flex min-w-0 items-center gap-2.5 ${s.variant === "centered" ? "flex-col gap-1.5 text-center" : ""}`}>
      <Logo className={s.variant === "centered" ? "h-12 w-12" : "h-10 w-10"} />
      <span className="min-w-0">
        <ShopName className={`block truncate ${s.variant === "centered" ? "text-[28px]" : "text-[22px] sm:text-[24px]"}`} />
        {tx(c, "tagline", lang) && <T k="tagline" className="block truncate text-[12.5px] font-medium text-[var(--t-muted)]" />}
      </span>
    </a>
  );
  const Nav = ({ className = "" }) => (
    <nav aria-label={str.menu} className={`items-center gap-6 ${className}`}>
      {links.map((l) => <a key={l.href} href={l.href} onClick={editing ? (e) => e.preventDefault() : () => setOpen(false)} className="text-[15px] font-medium text-[var(--t-muted)] transition-colors hover:text-[var(--t-ink)]">{l.label}</a>)}
    </nav>
  );
  const Burger = links.length > 0 && (
    <button type="button" onClick={() => setOpen((o) => !o)} aria-label={str.menu} aria-expanded={open}
      className="grid h-10 w-10 place-items-center rounded-full ring-1 ring-[var(--t-line)] lg:hidden">{open ? <X size={18} /> : <Menu size={18} />}</button>
  );
  const pos = transparent ? "absolute inset-x-0 top-0 z-40" : "sticky top-0 z-40";
  const bg = transparent ? "bg-gradient-to-b from-black/50 to-transparent" : "bg-[color-mix(in_srgb,var(--t-bg)_88%,transparent)] backdrop-blur-md border-b border-[var(--t-line)]";
  const toneStyle = transparent ? { "--t-ink": "#fff", "--t-muted": "rgba(255,255,255,.85)", "--t-line": "rgba(255,255,255,.35)", "--t-card": "rgba(255,255,255,.12)", "--t-bg": "transparent" } : undefined;
  return (
    <Section section={s} pad={false} className={`${pos} ${transparent ? "!bg-transparent" : ""}`} style={toneStyle}>
      <div className={bg} id="top">
        {s.variant === "centered" ? (
          <Container className="py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="hidden w-40 lg:block">{LangBtn}</div>
              <div className="flex-1 lg:flex lg:justify-center">{Brand}</div>
              <div className="flex items-center justify-end gap-2 lg:w-40"><span className="lg:hidden">{LangBtn}</span><Action k="cta" kind="primary" size="sm" className="hidden sm:inline-flex" />{Burger}</div>
            </div>
            {links.length > 0 && <Nav className="mt-3 hidden justify-center border-t border-[var(--t-line)] pt-3 lg:flex" />}
          </Container>
        ) : s.variant === "split" ? (
          <Container className="grid h-[72px] grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Nav className="hidden lg:flex" />
            <div className="col-start-1 lg:col-start-2">{Brand}</div>
            <div className="flex items-center justify-end gap-2">{LangBtn}<Action k="cta" kind="primary" size="sm" className="hidden sm:inline-flex" />{Burger}</div>
          </Container>
        ) : s.variant === "minimal" ? (
          <Container className="flex h-16 items-center justify-between gap-3">
            {Brand}
            <div className="flex items-center gap-2">{LangBtn}<Action k="cta" kind="primary" size="sm" /></div>
          </Container>
        ) : (
          <Container className="flex h-[72px] items-center justify-between gap-4">
            {Brand}
            <div className="flex items-center gap-5">
              <Nav className="hidden lg:flex" />
              {LangBtn}
              <Action k="cta" kind="primary" size="sm" className="hidden sm:inline-flex" />
              {Burger}
            </div>
          </Container>
        )}
        {open && (
          <div className="border-t border-[var(--t-line)] bg-[var(--s-bg)] text-[var(--s-ink)] lg:hidden">
            <Container className="flex flex-col py-2">
              {links.map((l) => <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-[var(--s-line)] py-3.5 text-[17px] font-medium last:border-0">{l.label}</a>)}
              <Action k="cta" kind="primary" className="my-3" />
            </Container>
          </div>
        )}
      </div>
    </Section>
  );
}

// ---------- Story ----------
function Badges({ center }) {
  const { content } = useSection();
  if (!content.show_hours && !content.show_rating) return null;
  return (
    <div className={`mb-6 flex flex-wrap gap-2 ${center ? "justify-center" : ""}`}>
      {content.show_hours && <OpenBadge />}
      {content.show_rating && <RatingBadge />}
    </div>
  );
}

function HeroText({ center, light, size = "xl" }) {
  const has = useHas();
  const big = size === "xxl" ? "text-[3rem] sm:text-7xl lg:text-[5.6rem]" : "text-[2.6rem] sm:text-6xl lg:text-[4.4rem]";
  return (
    <div className={center ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      <Reveal><Badges center={center} /></Reveal>
      {has("kicker") && <Reveal><T k="kicker" as="p" className={`mb-4 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.18em] ${light ? "text-white/85" : "text-[var(--t-hi)]"}`} ph="Small line" /></Reveal>}
      <Reveal delay={0.05}><T k="title" as="h1" className={`s-head block ${big}`} ph="Your big headline" /></Reveal>
      {has("subtitle") && <Reveal delay={0.1}><T k="subtitle" as="p" className={`mt-6 block text-[18px] leading-relaxed sm:text-xl ${light ? "text-white/85" : "text-[var(--t-muted)]"} ${center ? "mx-auto max-w-2xl" : ""}`} ph="A line about what makes you special" /></Reveal>}
      <Reveal delay={0.15}><Buttons className="mt-9" center={center} /></Reveal>
    </div>
  );
}

const blobs = (
  <>
    <span aria-hidden="true" className="s-decor s-float pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[var(--s-primary)] opacity-20 blur-3xl" />
    <span aria-hidden="true" className="s-decor s-float pointer-events-none absolute -right-20 top-40 h-80 w-80 rounded-full bg-[var(--s-accent)] opacity-25 blur-3xl" style={{ animationDelay: "1.5s" }} />
  </>
);

function Hero({ s }) {
  const v = s.variant;
  // Without a photo every layout but the full-photo one is centred text.
  if (s.content.show_image === false && v !== "fullbleed") {
    return (
      <Section section={s} className="overflow-hidden">
        {blobs}
        <Container className="relative py-6"><HeroText center size="xxl" /></Container>
      </Section>
    );
  }
  if (v === "fullbleed") {
    return (
      <Section section={s} pad={false} style={{ "--t-ink": "#fff", "--t-muted": "rgba(255,255,255,.85)", "--t-card": "rgba(255,255,255,.14)", "--t-line": "rgba(255,255,255,.3)" }}>
        <div className="relative flex min-h-[88svh] items-end overflow-hidden">
          <Img className="!absolute inset-0" rounded={false} eager style={{ position: "absolute" }} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
          <Container className="relative pb-16 pt-40 text-white sm:pb-24"><HeroText light size="xxl" /></Container>
        </div>
      </Section>
    );
  }
  if (v === "centered") {
    return (
      <Section section={s} className="overflow-hidden">
        {blobs}
        <Container className="relative">
          <HeroText center size="xxl" />
          <Reveal delay={0.2}><Img className="mx-auto mt-14 aspect-[16/7] w-full !rounded-[var(--s-radius-big)] shadow-[0_40px_80px_-40px_rgba(0,0,0,.45)]" eager seed={1} /></Reveal>
        </Container>
      </Section>
    );
  }
  if (v === "collage") {
    return (
      <Section section={s} className="overflow-hidden">
        <Container className="grid items-center gap-12 md:grid-cols-[1.05fr_1fr]">
          <HeroText />
          <Reveal delay={0.1} className="relative grid h-[460px] grid-cols-2 grid-rows-2 gap-3 sm:h-[540px]">
            <Img className="row-span-2 h-full" eager seed={0} />
            <Img k="image2" className="h-full" seed={2} />
            <Img k="image3" className="h-full" seed={4} />
            <span className="s-decor absolute -bottom-5 left-1/2 grid h-24 w-24 -translate-x-1/2 place-items-center rounded-full bg-[var(--s-accent)] text-center text-[12px] font-bold uppercase leading-tight text-[var(--s-ink)] shadow-xl ring-8 ring-[var(--t-bg)]">
              <Sparkles size={26} />
            </span>
          </Reveal>
        </Container>
      </Section>
    );
  }
  if (v === "arch") {
    return (
      <Section section={s} className="overflow-hidden">
        <Container className="grid items-center gap-12 md:grid-cols-2">
          <HeroText />
          <Reveal delay={0.1} className="relative mx-auto w-full max-w-[420px]">
            <span aria-hidden="true" className="s-decor absolute -inset-4 rounded-t-full border-2 border-dashed border-[var(--t-hi)] opacity-40" />
            <Img className="aspect-[4/5] w-full !rounded-b-[var(--s-radius)] !rounded-t-full border-[6px] border-[var(--t-card)] shadow-[0_30px_60px_-30px_rgba(0,0,0,.5)]" eager />
            <span className="absolute -bottom-4 -left-4 rounded-[var(--s-radius)] bg-[var(--s-primary)] px-5 py-3 text-[var(--s-on-primary)] shadow-xl"><ShopName className="text-xl" /></span>
          </Reveal>
        </Container>
      </Section>
    );
  }
  if (v === "poster") {
    return (
      <Section section={s} className="overflow-hidden">
        <Container>
          <Reveal><Badges /></Reveal>
          <T k="kicker" as="p" className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--t-hi)]" />
          <Reveal delay={0.05}><T k="title" as="h1" className="s-head mt-3 block text-[3.2rem] leading-[0.95] sm:text-[6.5rem] lg:text-[8.5rem]" ph="Big bold headline" /></Reveal>
          <div className="mt-10 grid items-end gap-8 md:grid-cols-[1fr_1.2fr]">
            <Reveal delay={0.1}><Img className="aspect-[4/3] w-full" eager /></Reveal>
            <Reveal delay={0.15}>
              <T k="subtitle" as="p" className="block max-w-lg text-xl leading-relaxed text-[var(--t-muted)]" />
              <Buttons className="mt-8" />
            </Reveal>
          </div>
        </Container>
      </Section>
    );
  }
  // split
  return (
    <Section section={s} className="overflow-hidden">
      <Container className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr] md:gap-16">
        <HeroText />
        <Reveal delay={0.1} className="relative">
          <span aria-hidden="true" className="s-decor absolute -right-6 -top-6 h-40 w-40 rounded-full bg-[var(--s-accent)] opacity-60 blur-2xl" />
          <span aria-hidden="true" className="s-decor absolute -bottom-6 -left-6 h-full w-full rounded-[var(--s-radius-big)] bg-[var(--s-tint)]" />
          <Img className="relative aspect-[4/5] w-full !rounded-[var(--s-radius-big)] shadow-[0_30px_70px_-35px_rgba(0,0,0,.55)]" eager />
          <HoursChip />
        </Reveal>
      </Container>
    </Section>
  );
}

function HoursChip() {
  const { brand, lang } = useSite();
  const str = useStr();
  const sum = hoursSummary(brand, lang);
  const fact = useFact("hours");
  if (!sum) return null;
  return (
    <span {...fact} className="absolute -bottom-5 right-4 max-w-[85%] rounded-[var(--s-radius)] bg-[var(--t-bg)] px-4 py-3 shadow-xl ring-1 ring-[var(--t-line)]">
      <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[var(--t-hi)]"><Clock size={13} /> {str.hours}</span>
      <span className="mt-0.5 block text-[14px] font-medium">{sum}</span>
    </span>
  );
}

function About({ s }) {
  const v = s.variant;
  const has = useHas();
  const items = useItems();
  if (v === "centered" || v === "quote") {
    return (
      <Section section={s}>
        <Container narrow className="text-center">
          {v === "quote" && <QuoteIcon size={56} className="mx-auto mb-6 text-[var(--t-hi)] opacity-80" />}
          <Heading center />
          <Reveal delay={0.1}><T k="body" as="p" className={`mt-6 block leading-relaxed ${v === "quote" ? "s-head text-[1.6rem] sm:text-[2.1rem] !leading-snug" : "text-[18px] text-[var(--t-muted)]"}`} ph="Tell your story" /></Reveal>
          {has("signature") && <Reveal delay={0.15}><T k="signature" as="p" className="mt-8 block text-[15px] font-semibold text-[var(--t-hi)]" ph="Signed by" /></Reveal>}
        </Container>
      </Section>
    );
  }
  if (v === "timeline") {
    return (
      <Section section={s}>
        <Container className="grid gap-12 md:grid-cols-2">
          <div>
            <Heading />
            <Reveal delay={0.1}><T k="body" as="p" className="mt-6 block text-[17px] leading-relaxed text-[var(--t-muted)]" /></Reveal>
          </div>
          <ol className="relative border-l-2 border-[var(--t-line)] pl-8">
            {items.map((_, i) => (
              <Reveal as="li" key={i} delay={i * 0.06} className="relative mb-9 last:mb-0">
                <span className="absolute -left-[41px] top-1 h-4 w-4 rounded-full border-4 border-[var(--t-bg)] bg-[var(--t-hi)] ring-2 ring-[var(--t-hi)]" />
                <T k="year" item={i} as="span" className="s-head block text-3xl text-[var(--t-hi)]" />
                <T k="title" item={i} as="span" className="mt-1 block text-[17px] font-medium" />
              </Reveal>
            ))}
          </ol>
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
        <Reveal className="relative">
          <Img className="aspect-[4/5] w-full" seed={3} />
          <span aria-hidden="true" className="absolute -bottom-5 -right-5 -z-0 h-28 w-28 rounded-[var(--s-radius)] bg-[var(--s-accent)] opacity-70" />
        </Reveal>
        <div>
          <Heading />
          <Reveal delay={0.1}><T k="body" as="p" className="mt-6 block whitespace-pre-line text-[17px] leading-relaxed text-[var(--t-muted)]" ph="Tell your story" /></Reveal>
          {has("signature") && <Reveal delay={0.15}><T k="signature" as="p" className="s-head mt-8 block text-2xl text-[var(--t-hi)]" /></Reveal>}
        </div>
      </Container>
    </Section>
  );
}

function FeatureIcon({ name, className = "" }) {
  const I = ICONS[name] || ICONS.sparkles;
  return <span className={`grid shrink-0 place-items-center rounded-[var(--s-radius)] ${className}`}><I size={24} strokeWidth={1.9} /></span>;
}

function Features({ s }) {
  const v = s.variant;
  const items = useItems();
  if (v === "bento") {
    return (
      <Section section={s}>
        <Container>
          <Heading />
          <div className="mt-12 grid auto-rows-[minmax(180px,auto)] gap-4 md:grid-cols-3">
            {items.map((it, i) => {
              const big = i === 0;
              return (
                <Reveal key={i} delay={i * 0.05} className={`flex flex-col justify-between rounded-[var(--s-radius-big)] p-7 ${big ? "bg-[var(--s-primary)] text-[var(--s-on-primary)] md:row-span-2" : "bg-[var(--t-card)] ring-1 ring-[var(--t-line)]"} ${i === 3 ? "md:col-span-2" : ""}`}>
                  <FeatureIcon name={it.icon} className={`h-14 w-14 ${big ? "bg-white/15" : "bg-[var(--s-tint)] text-[var(--s-primary)]"}`} />
                  <div className="mt-8">
                    <T k="title" item={i} as="h3" className={`s-head block ${big ? "text-4xl" : "text-2xl"}`} />
                    <T k="text" item={i} as="p" className={`mt-2 block text-[16px] leading-relaxed ${big ? "opacity-85" : "text-[var(--t-muted)]"}`} />
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>
    );
  }
  if (v === "list") {
    return (
      <Section section={s}>
        <Container className="grid gap-12 md:grid-cols-[1fr_1.2fr]">
          <Heading />
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((it, i) => (
              <Reveal as="li" key={i} delay={i * 0.05} className="flex gap-4 border-t border-[var(--t-line)] pt-5">
                <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--t-hi)] text-[var(--s-on-primary)]"><Check size={16} strokeWidth={3} /></span>
                <span>
                  <T k="title" item={i} as="span" className="block text-[18px] font-semibold" />
                  <T k="text" item={i} as="span" className="mt-1 block text-[15.5px] leading-relaxed text-[var(--t-muted)]" />
                </span>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>
    );
  }
  const cards = v === "cards";
  return (
    <Section section={s}>
      <Container>
        <Heading center />
        <div className={`mt-12 grid gap-5 sm:grid-cols-2 ${items.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 0.06} className={cards ? "rounded-[var(--s-radius-big)] bg-[var(--t-card)] p-7 ring-1 ring-[var(--t-line)] transition-transform hover:-translate-y-1" : "text-center"}>
              <FeatureIcon name={it.icon} className={`h-14 w-14 bg-[var(--t-hi)] text-[var(--s-on-primary)] ${cards ? "" : "mx-auto !rounded-full"}`} />
              <T k="title" item={i} as="h3" className="s-head mt-5 block text-[1.45rem]" />
              <T k="text" item={i} as="p" className="mt-2 block text-[15.5px] leading-relaxed text-[var(--t-muted)]" />
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function TextSection({ s }) {
  const center = s.variant === "centered";
  return (
    <Section section={s}>
      <Container narrow className={center ? "text-center" : ""}>
        <Heading center={center} />
        <Reveal delay={0.1}><T k="body" as="p" className="mt-6 block whitespace-pre-line text-[17.5px] leading-relaxed text-[var(--t-muted)]" ph="Your text" /></Reveal>
      </Container>
    </Section>
  );
}

// ---------- Showcase ----------
function enquiryText(str, title) {
  return `${str.enquiry} ${title}`;
}

function ProductMeta({ i, it, center }) {
  const { lang, brand } = useSite();
  const str = useStr();
  const section = useSection();
  const title = fill(tx(it, "title", lang), brand, lang);
  return (
    <div className={`mt-4 ${center ? "text-center" : ""}`}>
      <div className={`flex items-start gap-3 ${center ? "justify-center" : "justify-between"}`}>
        <T k="title" item={i} as="h3" className="s-head block text-[1.35rem]" />
        {it.price && !center && <T k="price" item={i} as="span" className="shrink-0 pt-1 text-[16px] font-bold text-[var(--t-hi)]" />}
      </div>
      <T k="text" item={i} as="p" className="mt-1 block text-[15px] leading-relaxed text-[var(--t-muted)]" />
      {it.price && center && <T k="price" item={i} as="p" className="mt-1 block text-[16px] font-bold text-[var(--t-hi)]" />}
      {section.content.enquire && <QuickAction action="whatsapp" kind="secondary" size="sm" className="mt-3" text={enquiryText(str, title)} label={str.ask} />}
    </div>
  );
}

function Tag({ i, it }) {
  if (!it.tag && !it.tag_hi) return null;
  return <T k="tag" item={i} className="absolute left-3 top-3 z-10 rounded-full bg-[var(--s-accent)] px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-[var(--s-ink)]" />;
}

function Products({ s }) {
  const v = s.variant;
  const items = useItems();
  if (v === "menu") {
    return (
      <Section section={s}>
        <Container narrow>
          <Heading center />
          <ul className="mt-12 grid gap-x-12 gap-y-6 sm:grid-cols-2">
            {items.map((it, i) => (
              <Reveal as="li" key={i} delay={(i % 2) * 0.05}>
                <div className="flex items-baseline gap-3">
                  <T k="title" item={i} as="span" className="s-head text-[1.3rem]" />
                  <span className="mb-1 flex-1 border-b-2 border-dotted border-[var(--t-line)]" />
                  <T k="price" item={i} as="span" className="font-bold text-[var(--t-hi)]" ph="₹" />
                </div>
                <T k="text" item={i} as="p" className="mt-1 block text-[15px] text-[var(--t-muted)]" />
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>
    );
  }
  if (v === "scroll") {
    return (
      <Section section={s}>
        <Container><Heading /></Container>
        <div className="s-no-scrollbar mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 sm:px-8 lg:px-[max(2rem,calc((100vw-72rem)/2+2rem))]">
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 0.04} className="w-[72vw] max-w-[300px] shrink-0 snap-start">
              <div className="relative"><Tag i={i} it={it} /><Img item={i} className="aspect-[3/4] w-full" seed={i} /></div>
              <ProductMeta i={i} it={it} />
            </Reveal>
          ))}
        </div>
      </Section>
    );
  }
  if (v === "overlay") {
    return (
      <Section section={s}>
        <Container>
          <Heading />
          <div className="mt-12 grid auto-rows-[260px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it, i) => (
              <Reveal key={i} delay={(i % 3) * 0.05} className={`group relative overflow-hidden rounded-[var(--s-radius-big)] ${i === 0 ? "sm:row-span-2" : ""}`}>
                <Img item={i} className="!absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105" rounded={false} seed={i} style={{ position: "absolute" }} />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <Tag i={i} it={it} />
                <div className="absolute inset-x-0 bottom-0 p-6 text-white">
                  <T k="title" item={i} as="h3" className="s-head block text-[1.7rem]" />
                  <T k="text" item={i} as="p" className="mt-1 block text-[15px] text-white/85" />
                  {it.price && <T k="price" item={i} as="p" className="mt-2 block font-bold text-[var(--s-accent)]" />}
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>
    );
  }
  const arches = v === "arches";
  return (
    <Section section={s}>
      <Container>
        <Heading center={arches} />
        <div className={`mt-12 grid grid-cols-2 gap-x-5 gap-y-10 ${items.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {items.map((it, i) => (
            <Reveal key={i} delay={(i % 4) * 0.05} className="group">
              <div className="relative">
                <Tag i={i} it={it} />
                <Img item={i} seed={i}
                  className={`aspect-[3/4] w-full transition-transform duration-500 group-hover:-translate-y-1 ${arches ? "!rounded-t-full !rounded-b-[var(--s-radius)] border-[5px] border-[var(--t-card)] shadow-[0_18px_40px_-24px_rgba(0,0,0,.5)]" : ""}`} />
              </div>
              <ProductMeta i={i} it={it} center={arches} />
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Gallery({ s }) {
  const v = s.variant;
  const items = useItems();
  const cap = (i) => <T k="caption" item={i} as="figcaption" className="mt-2 block text-[14px] text-[var(--t-muted)]" ph="Caption" />;
  const has = useHas();
  if (v === "strip") {
    return (
      <Section section={s}>
        <Container><Heading /></Container>
        <div className="s-no-scrollbar mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:px-8">
          {items.map((_, i) => (
            <figure key={i} className="w-[80vw] max-w-[420px] shrink-0 snap-center">
              <Img item={i} className="aspect-[4/3] w-full" seed={i} />
              {has("caption", i) && cap(i)}
            </figure>
          ))}
        </div>
      </Section>
    );
  }
  const grid = {
    grid: "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3",
    masonry: "columns-2 gap-3 sm:gap-4 lg:columns-3 [&>*]:mb-3 sm:[&>*]:mb-4",
    mosaic: "grid grid-cols-2 auto-rows-[150px] gap-3 sm:auto-rows-[200px] sm:gap-4 lg:grid-cols-4",
  }[v] || "grid grid-cols-2 gap-4 lg:grid-cols-3";
  const ratio = (i) => (v === "masonry" ? ["aspect-[3/4]", "aspect-square", "aspect-[4/5]", "aspect-[4/3]"][i % 4] : v === "mosaic" ? "h-full" : "aspect-square");
  const span = (i) => (v === "mosaic" ? ["col-span-2 row-span-2", "", "", "row-span-2", "", "col-span-2"][i % 6] : "");
  return (
    <Section section={s}>
      <Container>
        <Heading />
        <div className={`mt-12 ${grid}`}>
          {items.map((_, i) => (
            <Reveal as="figure" key={i} delay={(i % 3) * 0.05} className={`break-inside-avoid ${span(i)}`}>
              <Img item={i} className={`w-full ${ratio(i)}`} seed={i} />
              {v !== "mosaic" && has("caption", i) && cap(i)}
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Offer({ s }) {
  const v = s.variant;
  const has = useHas();
  const str = useStr();
  const Code = has("code") && (
    <span className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-current px-4 py-2 text-[15px] font-bold">
      {str.code} <T k="code" className="tracking-widest" ph="CODE" />
    </span>
  );
  const Until = has("until") && <p className="mt-3 text-[14px] opacity-80">{str.valid} <T k="until" ph="date" /></p>;
  if (v === "ticket") {
    return (
      <Section section={s}>
        <Container narrow>
          <Reveal className="relative overflow-hidden rounded-[var(--s-radius-big)] bg-[var(--s-bg)] p-8 text-center text-[var(--s-ink)] shadow-2xl sm:p-12">
            <span aria-hidden="true" className="absolute -left-5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-[var(--t-bg)]" />
            <span aria-hidden="true" className="absolute -right-5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-[var(--t-bg)]" />
            <T k="kicker" as="p" className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--s-primary)]" />
            <T k="title" as="h2" className="s-head mt-2 block text-5xl text-[var(--s-primary)] sm:text-6xl" ph="Offer" />
            <T k="text" as="p" className="mx-auto mt-4 block max-w-md text-[17px] text-[var(--s-muted)]" />
            <div className="mx-auto my-7 border-t-2 border-dashed border-[var(--s-line)]" />
            <div className="flex flex-wrap items-center justify-center gap-4 text-[var(--s-primary)]">{Code}<Action k="cta" kind="primary" /></div>
            {Until}
          </Reveal>
        </Container>
      </Section>
    );
  }
  if (v === "split") {
    return (
      <Section section={s}>
        <Container className="grid items-center gap-10 md:grid-cols-2">
          <Reveal><Img className="aspect-[4/3] w-full" /></Reveal>
          <Reveal delay={0.1}>
            <T k="kicker" as="p" className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--t-hi)]" />
            <T k="title" as="h2" className="s-head mt-2 block text-5xl sm:text-6xl" />
            <T k="text" as="p" className="mt-4 block text-[17px] text-[var(--t-muted)]" />
            <div className="mt-7 flex flex-wrap items-center gap-4">{Code}<Action k="cta" kind="primary" /></div>
            {Until}
          </Reveal>
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s} className="overflow-hidden">
      <span aria-hidden="true" className="s-decor absolute -left-16 -top-16 h-56 w-56 rounded-full bg-[var(--t-hi)] opacity-30 blur-2xl" />
      <span aria-hidden="true" className="s-decor absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-white opacity-10 blur-2xl" />
      <Container narrow className="relative text-center">
        <Reveal>
          <T k="kicker" as="p" className="text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--t-hi)]" />
          <T k="title" as="h2" className="s-head mt-3 block text-[3rem] sm:text-7xl" ph="Offer" />
          <T k="text" as="p" className="mx-auto mt-5 block max-w-xl text-[18px] text-[var(--t-muted)]" />
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">{Code}<Action k="cta" kind="primary" size="lg" /></div>
          {Until}
        </Reveal>
      </Container>
    </Section>
  );
}

function YouTube({ url }) {
  const str = useStr();
  const m = String(url || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  if (!m) return <div className="grid aspect-video w-full place-items-center rounded-[var(--s-radius-big)] bg-[var(--t-card)] text-[var(--t-muted)] ring-1 ring-[var(--t-line)]">{str.noVideo}</div>;
  return <iframe title="Video" src={`https://www.youtube-nocookie.com/embed/${m[1]}`} loading="lazy" allowFullScreen className="aspect-video w-full rounded-[var(--s-radius-big)] border-0 shadow-xl" />;
}

function Video({ s }) {
  if (s.variant === "split") {
    return (
      <Section section={s}>
        <Container className="grid items-center gap-10 md:grid-cols-[1fr_1.4fr]">
          <Heading />
          <Reveal delay={0.1}><YouTube url={s.content.url} /></Reveal>
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container>
        <Heading center />
        <Reveal delay={0.1} className="mt-10"><YouTube url={s.content.url} /></Reveal>
      </Container>
    </Section>
  );
}

// ---------- Trust ----------
function Testimonials({ s }) {
  const v = s.variant;
  const items = useItems();
  const str = useStr();
  const { brand, editing } = useSite();
  const more = s.content.reviews_button && brand.reviews_url && (
    <Reveal className="mt-10 text-center"><QuickAction action="reviews" kind="secondary" label={str.allReviews} /></Reveal>
  );
  const Card = ({ i, it, className = "" }) => (
    <figure className={`flex h-full flex-col rounded-[var(--s-radius-big)] bg-[var(--t-card)] p-7 ring-1 ring-[var(--t-line)] ${className}`}>
      <Stars n={Number(it.rating) || 5} />
      <T k="quote" item={i} as="blockquote" className="mt-4 block flex-1 text-[16.5px] leading-relaxed" ph="What did they say?" />
      <figcaption className="mt-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--t-hi)] text-[15px] font-bold text-[var(--s-on-primary)]">{String(it.name || "?").slice(0, 1)}</span>
        <span><T k="name" item={i} className="block font-semibold" /><T k="place" item={i} className="block text-[13.5px] text-[var(--t-muted)]" /></span>
      </figcaption>
    </figure>
  );
  if (v === "spotlight") {
    const [first, ...rest] = items;
    return (
      <Section section={s}>
        <Container narrow className="text-center">
          <Heading center />
          {first && (
            <Reveal delay={0.1} className="mt-10">
              <QuoteIcon size={48} className="mx-auto text-[var(--t-hi)]" />
              <T k="quote" item={0} as="blockquote" className="s-head mt-4 block text-[1.7rem] !leading-snug sm:text-[2.3rem]" />
              <div className="mt-6 flex flex-col items-center gap-1"><Stars n={Number(first.rating) || 5} /><T k="name" item={0} className="mt-2 font-semibold" /><T k="place" item={0} className="text-[14px] text-[var(--t-muted)]" /></div>
            </Reveal>
          )}
        </Container>
        {rest.length > 0 && (
          <Container className="mt-12 grid gap-5 md:grid-cols-2">
            {rest.map((it, j) => <Reveal key={j} delay={j * 0.05}><Card i={j + 1} it={it} /></Reveal>)}
          </Container>
        )}
        {more}
      </Section>
    );
  }
  if (v === "wall") {
    const row = editing ? items.map((it, i) => ({ it, i })) : [...items, ...items].map((it, i) => ({ it, i: i % items.length }));
    return (
      <Section section={s} className="overflow-hidden">
        <Container><Heading center /></Container>
        <div className={`mt-12 ${editing ? "" : "[mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]"}`}>
          <div className={`flex w-max gap-5 px-5 ${editing ? "flex-wrap !w-auto justify-center" : "s-marquee"}`} style={{ "--s-marquee": `${Math.max(30, items.length * 9)}s` }}>
            {row.map(({ it, i }, n) => <div key={n} className="w-[330px] shrink-0"><Card i={i} it={it} /></div>)}
          </div>
        </div>
        {more}
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container>
        <Heading center />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {items.map((it, i) => <Reveal key={i} delay={i * 0.06}><Card i={i} it={it} /></Reveal>)}
        </div>
        {more}
      </Container>
    </Section>
  );
}

function Stats({ s }) {
  const v = s.variant;
  const items = useItems();
  const has = useHas();
  return (
    <Section section={s} style={v === "band" ? { "--t-bg": "var(--s-primary)", "--t-ink": "var(--s-on-primary)", "--t-muted": "color-mix(in srgb, var(--s-on-primary) 80%, transparent)", "--t-line": "color-mix(in srgb, var(--s-on-primary) 25%, transparent)" } : undefined}>
      <Container>
        {has("title") && <T k="title" as="h2" className="s-head mb-10 block text-center text-3xl sm:text-4xl" ph="Heading (optional)" />}
        <div className={`grid grid-cols-2 gap-5 ${{ 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" }[items.length] || "lg:grid-cols-4"} ${v === "row" ? "divide-[var(--t-line)] lg:divide-x" : ""}`}>
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 0.06} className={v === "cards" ? "rounded-[var(--s-radius-big)] bg-[var(--t-card)] p-6 text-center ring-1 ring-[var(--t-line)]" : "px-4 text-center"}>
              <T k="value" item={i} as="span" className={`s-head block ${v === "band" ? "text-6xl sm:text-7xl" : "text-5xl sm:text-6xl"} ${v === "band" ? "" : "text-[var(--t-hi)]"}`} ph="100+" />
              <T k="label" item={i} as="span" className="mt-2 block text-[15px] font-medium text-[var(--t-muted)]" ph="Label" />
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Brands({ s }) {
  const items = useItems();
  const { editing } = useSite();
  const has = useHas();
  const Tile = ({ it, i }) => (
    <div className="grid h-24 w-44 shrink-0 place-items-center rounded-[var(--s-radius)] bg-[var(--t-card)] px-5 ring-1 ring-[var(--t-line)] sm:w-auto">
      {it.image ? <Img item={i} rounded={false} className="h-12 w-28 [&>img]:!object-contain" /> : <T k="name" item={i} className="s-head text-center text-xl text-[var(--t-muted)]" ph="Brand" />}
    </div>
  );
  if (s.variant === "marquee" && !editing) {
    const row = [...items, ...items, ...items];
    return (
      <Section section={s} className="overflow-hidden">
        {has("title") && <T k="title" as="h2" className="s-head mb-10 block px-5 text-center text-3xl" />}
        <div className="[mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <div className="s-marquee flex w-max gap-4">{[...row, ...row].map((it, n) => <Tile key={n} it={it} i={n % items.length} />)}</div>
        </div>
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container>
        {has("title") && <T k="title" as="h2" className="s-head mb-10 block text-center text-3xl" ph="Heading" />}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{items.map((it, i) => <Reveal key={i} delay={i * 0.04}><Tile it={it} i={i} /></Reveal>)}</div>
      </Container>
    </Section>
  );
}

function Team({ s }) {
  const items = useItems();
  const cards = s.variant === "cards";
  return (
    <Section section={s}>
      <Container>
        <Heading center />
        <div className={`mt-12 grid grid-cols-2 gap-x-5 gap-y-10 ${items.length % 3 === 0 ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
          {items.map((_, i) => (
            <Reveal key={i} delay={i * 0.05} className={`text-center ${cards ? "rounded-[var(--s-radius-big)] bg-[var(--t-card)] p-4 pb-6 ring-1 ring-[var(--t-line)]" : ""}`}>
              <Img item={i} seed={i} className={cards ? "aspect-[4/5] w-full" : "mx-auto aspect-square w-36 !rounded-full ring-4 ring-[var(--t-card)] sm:w-44"} />
              <T k="name" item={i} as="h3" className="s-head mt-4 block text-xl" />
              <T k="role" item={i} as="p" className="mt-0.5 block text-[14.5px] text-[var(--t-hi)]" />
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

function Faq({ s }) {
  const items = useItems();
  const { editing } = useSite();
  if (s.variant === "columns") {
    return (
      <Section section={s}>
        <Container>
          <Heading />
          <dl className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {items.map((_, i) => (
              <Reveal key={i} delay={(i % 2) * 0.05}>
                <T k="q" item={i} as="dt" className="s-head block text-[1.3rem]" />
                <T k="a" item={i} as="dd" className="mt-2 block text-[16px] leading-relaxed text-[var(--t-muted)]" />
              </Reveal>
            ))}
          </dl>
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container narrow>
        <Heading center />
        <div className="mt-10 divide-y divide-[var(--t-line)] border-y border-[var(--t-line)]">
          {items.map((_, i) => (
            <details key={i} open={editing || i === 0} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left [&::-webkit-details-marker]:hidden">
                <T k="q" item={i} className="text-[18px] font-semibold" />
                <ChevronDown size={20} className="shrink-0 text-[var(--t-hi)] transition-transform group-open:rotate-180" />
              </summary>
              <T k="a" item={i} as="p" className="mt-3 block text-[16px] leading-relaxed text-[var(--t-muted)]" />
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}

// ---------- Contact ----------
function Cta({ s }) {
  const v = s.variant;
  if (v === "card") {
    return (
      <Section section={s} style={{ "--t-bg": "var(--s-bg)" }}>
        <Container>
          <Reveal className="relative overflow-hidden rounded-[var(--s-radius-big)] bg-[var(--s-primary)] px-7 py-14 text-center text-[var(--s-on-primary)] sm:px-14" >
            <span aria-hidden="true" className="s-decor absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[var(--s-accent)] opacity-50 blur-2xl" />
            <span aria-hidden="true" className="s-decor absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-white opacity-10 blur-xl" />
            <div className="relative" style={{ "--t-btn": "var(--s-on-primary)", "--t-on-btn": "var(--s-primary)", "--t-ink": "var(--s-on-primary)" }}>
              <T k="title" as="h2" className="s-head block text-4xl sm:text-5xl" ph="Heading" />
              <T k="text" as="p" className="mx-auto mt-4 block max-w-xl text-[18px] opacity-90" />
              <Buttons className="mt-8" center />
            </div>
          </Reveal>
        </Container>
      </Section>
    );
  }
  if (v === "split") {
    return (
      <Section section={s}>
        <Container className="grid items-center gap-10 md:grid-cols-2">
          <Reveal><Img className="aspect-[4/3] w-full" seed={5} /></Reveal>
          <Reveal delay={0.1}>
            <T k="title" as="h2" className="s-head block text-4xl sm:text-5xl" ph="Heading" />
            <T k="text" as="p" className="mt-4 block text-[18px] text-[var(--t-muted)]" />
            <Buttons className="mt-8" />
          </Reveal>
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s} className="overflow-hidden">
      <Container narrow className="text-center">
        <Reveal>
          <T k="title" as="h2" className="s-head block text-4xl sm:text-6xl" ph="Heading" />
          <T k="text" as="p" className="mx-auto mt-5 block max-w-xl text-[18px] text-[var(--t-muted)]" />
          <Buttons className="mt-9" center />
        </Reveal>
      </Container>
    </Section>
  );
}

// The week, one row per day, today in bold.
function HoursTable() {
  const { brand, lang } = useSite();
  if (!hasHours(brand)) return null;
  const now = new Date();
  const today = DAYS[(new Date(now.getTime() + (now.getTimezoneOffset() + 330) * 60000).getDay() + 6) % 7];
  const names = DAY_NAMES[lang === "hi" ? "hi" : "en"];
  const text = (h) => (h.closed ? (lang === "hi" ? "बंद" : "Closed") : `${formatTime(h.open, lang)} – ${formatTime(h.close, lang)}`);
  return (
    <table className="w-full text-[15px]">
      <tbody>
        {DAYS.map((d) => (
          <tr key={d} className={d === today ? "font-semibold text-[var(--t-ink)]" : "text-[var(--t-muted)]"}>
            <td className="py-1 pr-4">{names[d]}{d === today && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--t-hi)] align-middle" />}</td>
            <td className="py-1 text-right">{text(brand.hours[d])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InfoRow({ icon: I, label, children, fact }) {
  const props = useFact(fact);
  return (
    <div {...(fact ? props : {})} className="flex gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--t-card)] text-[var(--t-hi)] ring-1 ring-[var(--t-line)]"><I size={19} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-muted)]">{label}</p>
        <div className="mt-1 text-[16px] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function ContactInfo({ showHours = true }) {
  const { brand, lang, editing } = useSite();
  const str = useStr();
  const lines = formatAddress(brand, lang, "lines");
  const note = pick(brand, "hours_note", lang);
  const stop = editing ? (e) => e.preventDefault() : undefined;
  return (
    <div className="space-y-6">
      <InfoRow icon={MapPin} label={str.address} fact="address"><address className="not-italic">{lines.map((l, i) => <span key={i} className={`block ${i === 0 ? "font-semibold" : ""}`}>{l}</span>)}</address></InfoRow>
      {showHours && hoursRows(brand, lang).length > 0 && (
        <InfoRow icon={Clock} label={str.hours} fact="hours"><HoursTable />{note && <p className="mt-2 text-[14px] text-[var(--t-muted)]">{note}</p>}</InfoRow>
      )}
      {brand.phones.length > 0 && (
        <InfoRow icon={Phone} label={str.phone} fact="phones">{brand.phones.map((p) => <a key={p} href={telHref(p)} onClick={stop} className="block font-semibold hover:text-[var(--t-hi)]">{p}</a>)}</InfoRow>
      )}
      {brand.emails.length > 0 && (
        <InfoRow icon={Mail} label="Email" fact="emails">{brand.emails.map((e) => <a key={e} href={`mailto:${e}`} onClick={stop} className="block break-all hover:text-[var(--t-hi)]">{e}</a>)}</InfoRow>
      )}
    </div>
  );
}

function MapFrame({ className = "" }) {
  const { brand, lang, editing } = useSite();
  const fact = useFact("maps");
  // In the builder the map is not interactive: a tap opens the shop details.
  if (editing) {
    return (
      <span {...fact} className={`relative block ${className}`}>
        <iframe title="Map" src={mapEmbedUrl(brand)} loading="lazy" className="pointer-events-none absolute inset-0 h-full w-full border-0" />
      </span>
    );
  }
  return <iframe title={`Map: ${pick(brand, "shop_name", lang)}`} src={mapEmbedUrl(brand)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className={`w-full border-0 ${className}`} />;
}

function Contact({ s }) {
  const v = s.variant;
  const c = s.content;
  const { brand, lang } = useSite();
  const str = useStr();
  const fa = useFact("address");
  const fh = useFact("hours");
  const fp = useFact("phones");
  const fw = useFact("whatsapp");
  const actions = (
    <div className="flex flex-wrap gap-3">
      <QuickAction action="directions" kind="primary" />
      <QuickAction action="whatsapp" kind="secondary" />
      <QuickAction action="call" kind="secondary" />
    </div>
  );
  if (v === "compact") {
    return (
      <Section section={s}>
        <Container narrow className="text-center">
          <Heading center />
          <Reveal delay={0.1}>
            <p {...fa} className="mt-6 flex items-start justify-center gap-2 text-[17px]"><MapPin size={20} className="mt-0.5 shrink-0 text-[var(--t-hi)]" /> {formatAddress(brand, lang)}</p>
            {c.show_hours && hoursSummary(brand, lang) && <p {...fh} className="mt-2 flex items-center justify-center gap-2 text-[15.5px] text-[var(--t-muted)]"><Clock size={17} /> {hoursSummary(brand, lang)}</p>}
            <div className="mt-8 flex justify-center">{actions}</div>
          </Reveal>
        </Container>
      </Section>
    );
  }
  if (v === "bigmap") {
    return (
      <Section section={s} pad={false}>
        <div className="relative">
          {c.show_map !== false && <MapFrame className="h-[560px] sm:h-[620px]" />}
          <Container className={c.show_map !== false ? "absolute inset-x-0 bottom-6 sm:bottom-auto sm:top-10" : "py-16"}>
            <Reveal className="max-w-md rounded-[var(--s-radius-big)] bg-[var(--t-bg)] p-7 shadow-2xl ring-1 ring-[var(--t-line)]">
              <T k="kicker" as="p" className="text-[13px] font-bold uppercase tracking-[0.16em] text-[var(--t-hi)]" />
              <T k="title" as="h2" className="s-head mt-2 block text-3xl" />
              <p {...fa} className="mt-3 text-[15.5px] text-[var(--t-muted)]">{formatAddress(brand, lang)}</p>
              {c.show_hours && hoursSummary(brand, lang) && <p {...fh} className="mt-2 text-[14.5px] font-medium">{hoursSummary(brand, lang)}</p>}
              <div className="mt-6">{actions}</div>
            </Reveal>
          </Container>
        </div>
      </Section>
    );
  }
  if (v === "cards") {
    const card = "rounded-[var(--s-radius-big)] bg-[var(--t-card)] p-6 ring-1 ring-[var(--t-line)]";
    const wa = brand.whatsapp || brand.phones[0];
    return (
      <Section section={s}>
        <Container>
          <Heading center />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Reveal className={card}><div {...fa}><MapPin className="text-[var(--t-hi)]" /><p className="mt-4 text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-muted)]">{str.address}</p><p className="mt-1 text-[15.5px]">{formatAddress(brand, lang)}</p></div></Reveal>
            {c.show_hours && hoursRows(brand, lang).length > 0 && <Reveal delay={0.05} className={card}><div {...fh}><Clock className="text-[var(--t-hi)]" /><p className="mt-4 text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-muted)]">{str.hours}</p><div className="mt-1 space-y-0.5 text-[15px]">{hoursRows(brand, lang).map((r) => <p key={r.days}><span className="font-semibold">{r.days}</span> · {r.text}</p>)}</div></div></Reveal>}
            {brand.phones[0] && <Reveal delay={0.1} className={card}><div {...fp}><Phone className="text-[var(--t-hi)]" /><p className="mt-4 text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-muted)]">{str.phone}</p>{brand.phones.map((p) => <a key={p} href={telHref(p)} className="mt-1 block text-[16px] font-semibold">{p}</a>)}</div></Reveal>}
            {wa && <Reveal delay={0.15} className={card}><div {...fw}><MessageCircle className="text-[var(--t-hi)]" /><p className="mt-4 text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-muted)]">WhatsApp</p><a href={waHref(wa)} target="_blank" rel="noreferrer" className="mt-1 block text-[16px] font-semibold">{prettyMobile(brand.whatsapp) || wa}</a></div></Reveal>}
          </div>
          {c.show_map !== false && <Reveal delay={0.1} className="mt-5 overflow-hidden rounded-[var(--s-radius-big)] ring-1 ring-[var(--t-line)]"><MapFrame className="h-[380px]" /></Reveal>}
          <div className="mt-8 flex justify-center">{actions}</div>
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container className={`grid gap-10 ${c.show_map !== false ? "md:grid-cols-[1fr_1.15fr]" : ""}`}>
        <div>
          <Heading />
          <Reveal delay={0.05} className="mt-9"><ContactInfo showHours={c.show_hours !== false} /></Reveal>
          <Reveal delay={0.1} className="mt-9">{actions}</Reveal>
        </div>
        {c.show_map !== false && <Reveal delay={0.1} className="min-h-[360px] overflow-hidden rounded-[var(--s-radius-big)] ring-1 ring-[var(--t-line)]"><MapFrame className="h-full min-h-[360px]" /></Reveal>}
      </Container>
    </Section>
  );
}

const SOCIAL = [
  { key: "instagram", icon: Instagram, label: "Instagram" },
  { key: "facebook", icon: Facebook, label: "Facebook" },
  { key: "youtube", icon: Youtube, label: "YouTube" },
  { key: "x", icon: Twitter, label: "X" },
  { key: "linkedin", icon: Linkedin, label: "LinkedIn" },
  { key: "website", icon: Globe, label: "Website" },
];

function Social({ className = "" }) {
  const { brand } = useSite();
  const fact = useFact("social");
  const list = SOCIAL.filter((x) => brand[x.key]);
  if (!list.length) return null;
  return (
    <ul {...fact} className={`flex flex-wrap gap-2 ${className}`}>
      {list.map((x) => (
        <li key={x.key}>
          <a href={brand[x.key]} target="_blank" rel="noreferrer" aria-label={x.label}
            className="grid h-11 w-11 place-items-center rounded-full bg-[var(--t-card)] ring-1 ring-[var(--t-line)] transition-colors hover:bg-[var(--t-hi)] hover:text-[var(--s-on-primary)]">
            <x.icon size={18} />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Footer({ s }) {
  const { brand, lang, editing } = useSite();
  const str = useStr();
  const c = s.content;
  const has = useHas();
  const fa = useFact("address");
  const fl = useFact("legal_name");
  const fh = useFact("hours");
  const fp = useFact("phones");
  const year = new Date().getFullYear();
  const bottom = (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--t-line)] pt-6 text-[14px] text-[var(--t-muted)] sm:flex-row">
      <span {...fl}>© {year} {pick(brand, "legal_name", lang) || pick(brand, "shop_name", lang)}</span>
      <span className="flex items-center gap-5">
        {has("note") && <T k="note" ph="Note (like GST number)" />}
        {c.show_staff !== false && <a href="/admin" onClick={editing ? (e) => e.preventDefault() : undefined} className="hover:text-[var(--t-ink)]">{str.staff}</a>}
      </span>
    </div>
  );
  if (s.variant === "giant") {
    return (
      <Section section={s} className="overflow-hidden">
        <Container>
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <p {...fa} className="max-w-sm text-[15.5px] text-[var(--t-muted)]">{formatAddress(brand, lang)}</p>
            <Social />
          </div>
          <ShopName className="my-10 block break-words text-[17vw] leading-[0.85] sm:text-[12vw] lg:text-[10rem]" />
          {bottom}
        </Container>
      </Section>
    );
  }
  if (s.variant === "columns") {
    return (
      <Section section={s}>
        <Container>
          <div className="grid gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-3"><Logo className="h-12 w-12" /><ShopName className="text-3xl" /></div>
              <p {...fa} className="mt-4 max-w-sm text-[15.5px] text-[var(--t-muted)]">{formatAddress(brand, lang)}</p>
              <Social className="mt-6" />
            </div>
            <div {...fh}>
              <p className="text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-hi)]">{str.hours}</p>
              <div className="mt-3 space-y-1 text-[15px]">{hoursRows(brand, lang).map((r) => <p key={r.days}><span className="font-semibold">{r.days}</span> <span className="text-[var(--t-muted)]">{r.text}</span></p>)}</div>
            </div>
            <div {...fp}>
              <p className="text-[12.5px] font-bold uppercase tracking-wider text-[var(--t-hi)]">{str.contact}</p>
              <div className="mt-3 space-y-1 text-[15px]">
                {brand.phones.map((p) => <a key={p} href={telHref(p)} className="block hover:text-[var(--t-hi)]">{p}</a>)}
                {brand.emails.map((e) => <a key={e} href={`mailto:${e}`} className="block break-all hover:text-[var(--t-hi)]">{e}</a>)}
              </div>
            </div>
          </div>
          {bottom}
        </Container>
      </Section>
    );
  }
  return (
    <Section section={s}>
      <Container>
        <div className="flex flex-col items-center gap-5 pb-8 text-center">
          <div className="flex items-center gap-3"><Logo className="h-12 w-12" /><ShopName className="text-3xl" /></div>
          <p {...fa} className="max-w-md text-[15px] text-[var(--t-muted)]">{formatAddress(brand, lang)}</p>
          <Social />
        </div>
        {bottom}
      </Container>
    </Section>
  );
}

export const RENDER = {
  announce: Announce, header: Header, hero: Hero, about: About, features: Features, products: Products,
  gallery: Gallery, offer: Offer, testimonials: Testimonials, stats: Stats, brands: Brands, team: Team,
  video: Video, faq: Faq, text: TextSection, cta: Cta, contact: Contact, footer: Footer,
};

// Floating WhatsApp button and the phone call bar (website settings).
export function Floating() {
  const { brand, config, editing, theme } = useSite();
  const str = useStr();
  const st = config.settings || {};
  const wa = brand.whatsapp || (brand.phones || [])[0];
  const fw = useFact("whatsapp");
  const fp = useFact("phones");
  return (
    <>
      {st.whatsapp_button && wa && (
        <a href={waHref(wa, str.enquiryShop)} target="_blank" rel="noreferrer" aria-label={str.whatsapp} onClick={editing ? (e) => e.preventDefault() : undefined} {...fw}
          className={`fixed right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_-8px_rgba(37,211,102,.7)] transition-transform hover:scale-105 ${st.call_bar ? "bottom-24 md:bottom-6" : "bottom-6"}`}>
          <MessageCircle size={26} fill="currentColor" strokeWidth={0} /><span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-20" />
        </a>
      )}
      {st.call_bar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--s-line)] bg-[color-mix(in_srgb,var(--s-bg)_94%,transparent)] px-4 pt-3 backdrop-blur-md md:hidden"
          style={{ ...{ "--t-btn": "var(--s-primary)", "--t-on-btn": "var(--s-on-primary)", "--t-ink": "var(--s-ink)", "--t-line": "var(--s-line)", "--t-bg": "var(--s-bg)" }, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          <div className="grid grid-cols-[1.3fr_1fr] gap-3">
            <a href={brand.phones[0] ? telHref(brand.phones[0]) : "#"} {...fp} className={`${btnClass(theme.b, "primary")} w-full`}><Phone size={18} /> {str.call}</a>
            <QuickAction action="directions" kind="secondary" className="w-full !px-3" label={str.visit} />
          </div>
        </div>
      )}
    </>
  );
}

