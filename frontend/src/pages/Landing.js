import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLang, LANGS } from "@/i18n";
import { Globe, Phone, MapPin, ArrowRight, Scissors, Shirt, Layers, Sparkles } from "lucide-react";

const SHOP = "https://customer-assets.emergentagent.com/job_5cab469b-a854-4b1a-a54f-4b9839c20fae/artifacts/f1xaaed3_WhatsApp%20Image%202026-06-26%20at%202.47.57%20PM.jpeg";
const FAB1 = "https://images.unsplash.com/photo-1660845683010-63e7422420b9?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";
const ROLL = "https://images.pexels.com/photos/6766360/pexels-photo-6766360.jpeg?auto=compress&cs=tinysrgb&w=1200";

function LangToggle() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button data-testid="lang-toggle-btn" onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-[#1D3557] hover:bg-black/5 transition-colors">
        <Globe size={16} /> {LANGS.find((l) => l.id === lang)?.label}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-36 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
          {LANGS.map((l) => (
            <button key={l.id} data-testid={`lang-opt-${l.id}`} onClick={() => { setLang(l.id); setOpen(false); }}
              className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 ${lang === l.id ? "text-[#E07A5F] font-semibold" : "text-gray-700"}`}>
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const { t } = useLang();
  const brands = ["DONEAR", "RAYMOND", "SIYARAM'S", "APPARELS", "SUITINGS", "SHIRTINGS"];
  const sells = [
    { i: Layers, k: "sell_1", d: "sell_1d" },
    { i: Shirt, k: "sell_2", d: "sell_2d" },
    { i: Scissors, k: "sell_3", d: "sell_3d" },
    { i: Sparkles, k: "sell_4", d: "sell_4d" },
  ];

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#1A1A1A] font-body">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-40 glass border-b border-white/40">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="font-display font-black text-xl text-[#1D3557] tracking-tight">Somani Fabs</div>
          <div className="flex items-center gap-1 sm:gap-3">
            <a href="#about" className="hidden sm:block text-sm text-gray-700 hover:text-[#E07A5F] px-2">{t("nav_about")}</a>
            <a href="#collection" className="hidden sm:block text-sm text-gray-700 hover:text-[#E07A5F] px-2">{t("nav_collection")}</a>
            <a href="#visit" className="hidden sm:block text-sm text-gray-700 hover:text-[#E07A5F] px-2">{t("nav_visit")}</a>
            <LangToggle />
            <Link data-testid="admin-link" to="/admin" className="text-sm font-medium px-4 py-1.5 rounded-full bg-[#1D3557] text-white hover:bg-[#16273f] transition-colors">{t("nav_admin")}</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative h-[88vh] min-h-[560px] w-full overflow-hidden">
        <img src={SHOP} alt="Somani Fabs storefront" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 hero-overlay" />
        <div className="relative z-10 h-full max-w-6xl mx-auto px-5 flex flex-col justify-end pb-20">
          <p className="fade-up text-[#E9C46A] text-xs sm:text-sm tracking-[0.25em] uppercase mb-4">{t("hero_tag")}</p>
          <h1 className="fade-up font-display font-black text-white text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight">{t("hero_title")}</h1>
          <p className="fade-up mt-5 max-w-xl text-white/90 text-base sm:text-lg font-light leading-relaxed">{t("hero_sub")}</p>
          <div className="fade-up mt-8 flex flex-wrap gap-3">
            <a href="#collection" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#E07A5F] text-white font-medium hover:bg-[#cf6b51] transition-colors">{t("hero_cta")} <ArrowRight size={18} /></a>
            <a href="#visit" className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/60 text-white font-medium hover:bg-white/10 transition-colors">{t("hero_cta2")}</a>
          </div>
        </div>
      </section>

      {/* Brands marquee */}
      <div className="bg-[#1D3557] py-5 overflow-hidden">
        <div className="flex marquee whitespace-nowrap">
          {[...brands, ...brands].map((b, i) => (
            <span key={i} className="font-display text-white/80 text-xl mx-12 tracking-widest">{b}</span>
          ))}
        </div>
      </div>

      {/* About */}
      <section id="about" className="max-w-6xl mx-auto px-5 py-20 lg:py-28 grid md:grid-cols-12 gap-10 items-center">
        <div className="md:col-span-7">
          <p className="text-[#E07A5F] text-xs tracking-[0.2em] uppercase mb-4">{t("nav_about")}</p>
          <h2 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl text-[#1D3557] leading-tight mb-6">{t("about_title")}</h2>
          <p className="text-gray-600 text-base sm:text-lg font-light leading-relaxed">{t("about_p")}</p>
          <div className="mt-8 flex items-center gap-3 text-[#1D3557]">
            <Phone size={18} /><span className="font-medium">9414422558</span>
          </div>
        </div>
        <div className="md:col-span-5">
          <img src={FAB1} alt="Indian textile" className="rounded-2xl w-full h-80 object-cover shadow-xl" />
        </div>
      </section>

      {/* What we sell */}
      <section id="collection" className="bg-white py-20 lg:py-28 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-5">
          <p className="text-[#E07A5F] text-xs tracking-[0.2em] uppercase mb-3">{t("sell_sub")}</p>
          <h2 className="font-display font-black text-3xl sm:text-4xl text-[#1D3557] mb-12">{t("sell_title")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {sells.map((s, i) => (
              <div key={i} className="group p-7 rounded-2xl bg-[#FDFBF7] border border-gray-100 hover:border-[#E07A5F]/40 hover:-translate-y-1 transition-all duration-300">
                <s.i className="text-[#E07A5F] mb-5" size={30} />
                <h3 className="font-display font-bold text-xl text-[#1D3557] mb-2">{t(s.k)}</h3>
                <p className="text-gray-500 text-sm font-light leading-relaxed">{t(s.d)}</p>
              </div>
            ))}
          </div>
          <img src={ROLL} alt="Fabric rolls" className="mt-12 rounded-2xl w-full h-72 object-cover" />
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="max-w-6xl mx-auto px-5 py-20 lg:py-28">
        <div className="rounded-3xl bg-[#1D3557] text-white p-10 lg:p-16">
          <h2 className="font-display font-black text-3xl sm:text-4xl mb-8">{t("visit_title")}</h2>
          <div className="grid sm:grid-cols-2 gap-8">
            <div className="flex items-start gap-4">
              <MapPin className="text-[#E9C46A] shrink-0 mt-1" />
              <div><p className="text-white/60 text-xs uppercase tracking-widest mb-1">Address</p><p className="text-lg">{t("visit_addr")}</p></div>
            </div>
            <div className="flex items-start gap-4">
              <Phone className="text-[#E9C46A] shrink-0 mt-1" />
              <div><p className="text-white/60 text-xs uppercase tracking-widest mb-1">{t("visit_phone")}</p><p className="text-lg">9414422558</p></div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-10">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="font-display font-black text-lg text-[#1D3557]">Somani Fabs</div>
          <p className="text-gray-400 text-sm font-light">{t("footer_note")}</p>
          <p className="text-gray-400 text-xs">© {new Date().getFullYear()} Shivnarayan Shivbhagwan Somani</p>
        </div>
      </footer>
    </div>
  );
}
