import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Shuffle, Phone, MessageCircle, Navigation, Sun, Moon, Sparkles } from "lucide-react";
import { useBrand } from "@/lib/brand";
import { ICONS } from "@/site/registry";
import { PALETTES, FONTS, RADII, LOOKS, loadAllFonts } from "@/site/theme";
import { PACKS, VIBES, buildSite } from "@/site/presets";
import { Button } from "@/admin/ui";
import Frame from "@/admin/website/Frame";

// The style quiz: a few taps (what you sell, the feel, colour, lettering,
// shape, main action, light or dark) and the owner sees a finished website
// built from the design system. Rules, not AI: free to run as often as liked.

const STEPS = ["pack", "vibe", "palette", "font", "radius", "goal", "mode", "result"];

function Tile({ on, onClick, children, className = "", testid }) {
  return (
    <button type="button" data-testid={testid} onClick={onClick} aria-pressed={on}
      className={`relative rounded-2xl border-2 bg-white text-left transition active:scale-[0.98] ${on ? "border-brand-600 ring-4 ring-brand-500/15" : "border-gray-200 hover:border-gray-300 hover:shadow-card"} ${className}`}>
      {children}
      {on && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-700 text-white"><Check size={14} strokeWidth={3} /></span>}
    </button>
  );
}

export default function Quiz({ initialName, onCancel, onCreate, creating }) {
  const brand = useBrand();
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ pack: "", vibe: "", palette: "", font: "", radius: "", goal: "", mode: "light" });
  const [alt, setAlt] = useState(false);
  const [name, setName] = useState(initialName);
  useEffect(() => { loadAllFonts(); }, []);

  const id = STEPS[step];
  const set = (k, v) => {
    setA((x) => {
      const next = { ...x, [k]: v };
      // Picking a feel suggests matching colours, lettering and corners.
      if (k === "vibe" || (k === "pack" && x.vibe)) {
        const vibe = VIBES.find((y) => y.id === next.vibe);
        const pack = PACKS.find((p) => p.id === next.pack);
        const lookId = vibe && pack && vibe.looks.includes(pack.look) ? pack.look : vibe ? vibe.looks[0] : pack.look;
        const look = LOOKS.find((l) => l.id === lookId).theme;
        return { ...next, palette: look.palette, font: look.font, radius: look.radius, mode: look.mode, look: lookId };
      }
      return next;
    });
    if (step < STEPS.length - 1 && ["pack", "vibe", "goal"].includes(k)) setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 180);
  };
  const ok = id === "result" || id === "mode" || !!a[id];
  const config = useMemo(() => (id === "result" ? buildSite({
    pack: a.pack, vibe: a.vibe, look: a.look, goal: a.goal, alt,
    theme: { palette: a.palette, font: a.font, radius: a.radius, mode: a.mode },
  }) : null), [id, a, alt]);

  const vibeLooks = (VIBES.find((v) => v.id === a.vibe) || VIBES[1]).looks;
  const suggestedPalettes = useMemo(() => {
    const first = vibeLooks.map((l) => LOOKS.find((x) => x.id === l).theme.palette);
    return [...new Set([...first, ...PALETTES.map((p) => p.id)])].map((pid) => PALETTES.find((p) => p.id === pid));
  }, [vibeLooks]);
  const pal = PALETTES.find((p) => p.id === a.palette) || PALETTES[0];

  const body = {
    pack: (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {PACKS.map((p) => {
          const I = ICONS[p.icon];
          return (
            <Tile key={p.id} testid={`quiz-pack-${p.id}`} on={a.pack === p.id} onClick={() => set("pack", p.id)} className="p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><I size={22} /></span>
              <span className="mt-3 block font-semibold text-gray-900">{p.name}</span>
            </Tile>
          );
        })}
      </div>
    ),
    vibe: (
      <div className="grid gap-3 sm:grid-cols-2">
        {VIBES.map((v) => {
          const look = LOOKS.find((l) => l.id === v.looks[0]).theme;
          const p = PALETTES.find((x) => x.id === look.palette);
          const f = FONTS.find((x) => x.id === look.font);
          const dark = look.mode === "dark";
          return (
            <Tile key={v.id} testid={`quiz-vibe-${v.id}`} on={a.vibe === v.id} onClick={() => set("vibe", v.id)} className="overflow-hidden">
              <span className="relative block h-36 overflow-hidden p-5" style={{ background: dark ? p.night : p.bg, color: dark ? "#F6F1E9" : p.ink }}>
                <span className="absolute -right-6 -top-6 h-28 w-28 rounded-full opacity-60 blur-xl" style={{ background: p.primary }} />
                <span className="absolute -bottom-8 right-16 h-20 w-20 rounded-full opacity-60 blur-xl" style={{ background: p.accent }} />
                <span className="relative block text-[28px] leading-tight" style={{ fontFamily: f.head, fontWeight: f.weight, textTransform: f.upper ? "uppercase" : "none" }}>{brand.shop_name}</span>
                <span className="relative mt-3 inline-block px-4 py-1.5 text-xs font-semibold" style={{ background: p.primary, color: p.onPrimary, borderRadius: look.radius === "sharp" ? 2 : 999 }}>Visit us</span>
              </span>
              <span className="block p-4"><span className="block font-semibold text-gray-900">{v.name}</span><span className="block text-sm text-gray-600">{v.desc}</span></span>
            </Tile>
          );
        })}
      </div>
    ),
    palette: (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {suggestedPalettes.map((p, i) => (
          <Tile key={p.id} testid={`quiz-palette-${p.id}`} on={a.palette === p.id} onClick={() => set("palette", p.id)} className="overflow-hidden">
            <span className="flex h-20">
              <span className="flex-[3]" style={{ background: p.primary }} /><span className="flex-1" style={{ background: p.accent }} /><span className="flex-1" style={{ background: p.tint }} />
            </span>
            <span className="flex items-center justify-between p-3"><span className="text-sm font-semibold text-gray-900">{p.name}</span>{i < vibeLooks.length && <span className="text-[11px] font-semibold text-brand-700">Suggested</span>}</span>
          </Tile>
        ))}
      </div>
    ),
    font: (
      <div className="grid gap-3 sm:grid-cols-2">
        {FONTS.map((f) => (
          <Tile key={f.id} testid={`quiz-font-${f.id}`} on={a.font === f.id} onClick={() => set("font", f.id)} className="p-5">
            <span className="block truncate text-[30px] leading-tight" style={{ fontFamily: f.head, fontWeight: f.weight, color: pal.primary, textTransform: f.upper ? "uppercase" : "none" }}>{brand.shop_name}</span>
            <span className="mt-1 block text-[15px] text-gray-600" style={{ fontFamily: f.body }}>{f.name} · आपका स्वागत है</span>
          </Tile>
        ))}
      </div>
    ),
    radius: (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RADII.map((r) => (
          <Tile key={r.id} testid={`quiz-radius-${r.id}`} on={a.radius === r.id} onClick={() => set("radius", r.id)} className="p-5 text-center">
            <span className="mx-auto block h-24 w-20" style={{ background: `linear-gradient(135deg, ${pal.primary}, ${pal.accent})`, borderRadius: r.big }} />
            <span className="mx-auto mt-3 inline-block px-4 py-1.5 text-xs font-semibold" style={{ background: pal.primary, color: pal.onPrimary, borderRadius: r.btn }}>Button</span>
            <span className="mt-2 block font-semibold text-gray-900">{r.name}</span>
          </Tile>
        ))}
      </div>
    ),
    goal: (
      <div className="grid gap-3 sm:grid-cols-3">
        {[["whatsapp", MessageCircle, "Message on WhatsApp", "Best for orders and questions"], ["call", Phone, "Call the shop", "Best for bookings and quick answers"], ["visit", Navigation, "Visit the shop", "Best for showrooms and walk-ins"]].map(([g, I, t, d]) => (
          <Tile key={g} testid={`quiz-goal-${g}`} on={a.goal === g} onClick={() => set("goal", g)} className="p-5">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-50 text-brand-700"><I size={24} /></span>
            <span className="mt-3 block font-semibold text-gray-900">{t}</span><span className="block text-sm text-gray-600">{d}</span>
          </Tile>
        ))}
      </div>
    ),
    mode: (
      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        {[["light", Sun, "Light", pal.bg, pal.ink], ["dark", Moon, "Dark", pal.night, "#F6F1E9"]].map(([m, I, t, bg, ink]) => (
          <Tile key={m} testid={`quiz-mode-${m}`} on={a.mode === m} onClick={() => set("mode", m)} className="overflow-hidden">
            <span className="block h-32 p-5" style={{ background: bg, color: ink }}>
              <I size={22} />
              <span className="mt-3 block text-xl font-semibold">{brand.shop_name}</span>
              <span className="mt-2 block h-2 w-16 rounded-full" style={{ background: pal.primary }} />
            </span>
            <span className="block p-4 font-semibold text-gray-900">{t}</span>
          </Tile>
        ))}
      </div>
    ),
  };

  const titles = {
    pack: ["What do you sell?", "We'll fill your website with the right words. You can change all of it."],
    vibe: ["Which feels most like your shop?", "This sets the layout and mood."],
    palette: ["Pick your colours", "Suggested ones first, all of them work."],
    font: ["Pick your lettering", "Shown with your shop name."],
    radius: ["Sharp or soft?", "The shape of photos, cards and buttons."],
    goal: ["What should visitors do first?", "Your main button and quick-action buttons."],
    mode: ["Light or dark?", "Dark suits luxury and night-time looks."],
    result: ["Here's your website", "Everything is editable next: text, photos, sections, colours."],
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas font-admin" data-testid="website-quiz">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3">
        <button type="button" onClick={step === 0 ? onCancel : () => setStep(step - 1)} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-gray-100"><ArrowLeft size={19} /></button>
        <div className="flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        </div>
        <button type="button" onClick={onCancel} className="h-10 rounded-xl px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto px-4 py-6 sm:px-6 sm:py-10 ${id === "result" ? "max-w-6xl" : "max-w-4xl"}`}>
          <p className="text-sm font-medium text-brand-700"><Sparkles size={14} className="mr-1 inline" />Step {step + 1} of {STEPS.length}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{titles[id][0]}</h1>
          <p className="mt-1 text-gray-600">{titles[id][1]}</p>
          <div className="mt-6">
            {id === "result" ? (
              <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
                <div className="h-[62vh] overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-gray-200">
                  <Frame payload={{ config, brand, lang: "en", editing: false }} device={window.innerWidth < 640 ? "phone" : "desktop"} className="h-full w-full" />
                </div>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-gray-800">Name this website</span>
                    <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-11 w-full rounded-xl border border-gray-300 px-3.5 text-[15px]" />
                  </label>
                  <Button variant="secondary" icon={Shuffle} full onClick={() => setAlt((x) => !x)}>Try another layout</Button>
                  <Button data-testid="quiz-create" icon={Check} full size="lg" loading={creating} disabled={!name.trim()} onClick={() => onCreate(name.trim(), config, "quiz")}>Create and edit</Button>
                  <p className="text-[13px] text-gray-600">It's saved as a draft. Your live website doesn't change until you make this one live.</p>
                </div>
              </div>
            ) : body[id]}
          </div>
        </div>
      </div>
      {id !== "result" && (
        <footer className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mx-auto flex max-w-4xl justify-end">
            <Button data-testid="quiz-next" icon={ArrowRight} disabled={!ok} onClick={() => setStep(step + 1)}>Next</Button>
          </div>
        </footer>
      )}
    </div>,
    document.body,
  );
}
