import React, { useEffect, useRef, useState } from "react";
import { X, Loader2, ChevronRight, ChevronLeft, ArrowLeft } from "lucide-react";

// Shared building blocks for the admin app, so every screen looks and behaves
// the same. Shape rule: cards and sheets are rounded-2xl, buttons and inputs
// rounded-xl, chips and badges fully rounded. One accent colour: brand.

// Content column shared by every screen.
export function Page({ children, className = "" }) {
  return <div className={`px-4 py-5 sm:px-6 lg:px-10 lg:py-9 max-w-6xl mx-auto ${className}`}>{children}</div>;
}

// 16px text on phones: smaller text makes iOS zoom the page on focus.
export const inputCls =
  "w-full h-12 sm:h-11 rounded-xl border border-gray-300 bg-white px-3.5 text-base sm:text-[15px] text-gray-900 placeholder:text-gray-500 " +
  "transition-colors focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-gray-50";

export const selectCls = inputCls + " pr-8";

const VARIANTS = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm shadow-brand-900/10",
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 hover:border-gray-400",
  ghost: "text-gray-700 hover:bg-gray-100",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  dangerSoft: "text-red-700 bg-red-50 hover:bg-red-100",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};
const SIZES = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-4 text-[15px] gap-2 rounded-xl",
  xl: "h-14 px-6 text-base font-semibold gap-2 rounded-2xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

export function Button({ variant = "primary", size = "md", icon: Icon, loading, full, className = "", children, disabled, ...props }) {
  return (
    <button {...props} disabled={disabled || loading}
      className={`inline-flex items-center justify-center whitespace-nowrap font-medium transition-all active:scale-[0.98] touch-manipulation
        disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${full ? "w-full" : ""} ${className}`}>
      {loading ? <Loader2 size={size === "sm" ? 15 : 18} className="animate-spin" /> : Icon && <Icon size={size === "sm" ? 15 : 18} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className = "", size = 20, tone = "default", ...props }) {
  const tones = { default: "text-gray-600 hover:bg-gray-100 hover:text-gray-900", onDark: "text-white bg-white/10 hover:bg-white/20" };
  return (
    <button {...props} aria-label={label} title={label}
      className={`inline-flex items-center justify-center w-11 h-11 rounded-xl transition-colors active:scale-95 touch-manipulation ${tones[tone]} ${className}`}>
      <Icon size={size} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

export function Card({ className = "", children, as: Tag = "section", ...props }) {
  return <Tag {...props} className={`bg-white rounded-2xl border border-gray-200/80 shadow-card ${className}`}>{children}</Tag>;
}

export function CardHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-4 pb-3">
      {Icon && <span className="mt-0.5 w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={16} /></span>}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-gray-900 text-[15px]">{title}</h3>
        {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-sm font-medium text-gray-800 mb-1.5">{label}</span>}
      {children}
      {error ? <span className="block text-sm text-red-700 mt-1.5">{error}</span>
        : hint && <span className="block text-[13px] text-gray-600 mt-1.5">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, actions, className = "" }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 mb-5 lg:mb-7 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl lg:text-[28px] font-semibold tracking-tight text-gray-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-[15px] text-gray-600 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, icon: Icon, tone = "text-gray-900", hint, className = "" }) {
  return (
    <Card className={`p-4 lg:p-5 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        {Icon && <Icon size={16} className="text-gray-500" />}{label}
      </div>
      <p className={`num mt-2 text-2xl lg:text-[28px] font-semibold tracking-tight ${tone}`}>{value}</p>
      {hint && <p className="text-[13px] text-gray-600 mt-1">{hint}</p>}
    </Card>
  );
}

export function Badge({ tone = "gray", children, className = "", icon: Icon }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700", brand: "bg-brand-50 text-brand-700", green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700", pink: "bg-pink-50 text-pink-700", sky: "bg-sky-50 text-sky-700",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {Icon && <Icon size={12} />}{children}
    </span>
  );
}

export function Empty({ icon: Icon, title, body, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center text-center px-6 py-14 ${className}`}>
      {Icon && <span className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center mb-4"><Icon size={26} /></span>}
      <p className="font-semibold text-gray-900">{title}</p>
      {body && <p className="text-sm text-gray-600 mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`skeleton relative rounded-xl ${className}`} />;
}

// `fit` sizes each segment to its label (for options of uneven length).
export function Segmented({ value, options, onChange, testid, fit, className = "" }) {
  return (
    <div className={`grid gap-1 p-1 bg-gray-100 rounded-xl ${className}`} style={{ gridTemplateColumns: fit ? `repeat(${options.length}, auto)` : `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" data-testid={testid ? `${testid}-${o.id}` : undefined} onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`h-10 sm:h-9 ${fit ? "px-2" : "px-1"} rounded-lg text-sm font-medium transition-all truncate touch-manipulation ${value === o.id ? "bg-white shadow-card text-brand-700" : "text-gray-600 hover:text-gray-900"}`}>{o.label}</button>
      ))}
    </div>
  );
}

// Bottom sheet on phones, centred dialog from `sm` up. Escape, the backdrop
// and a downward swipe on the header close it unless `locked` (e.g. saving).
export function Sheet({ title, subtitle, onClose, children, footer, size = "md", locked, testid, closeTestId, headerExtra, bodyClass = "" }) {
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  useEffect(() => {
    if (locked) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, locked]);
  // Body behind the sheet must not scroll with it.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const onTouchStart = (e) => { if (!locked) start.current = e.touches[0].clientY; };
  const onTouchMove = (e) => { if (start.current !== null) setDrag(Math.max(0, e.touches[0].clientY - start.current)); };
  const onTouchEnd = () => { if (start.current === null) return; start.current = null; if (drag > 90) onClose(); setDrag(0); };
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 bg-gray-950/40 flex items-end sm:items-center justify-center sm:p-6 animate-in fade-in duration-150"
      onClick={locked ? undefined : onClose}>
      <div data-testid={testid} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
        className={`relative bg-white w-full ${width} rounded-t-3xl sm:rounded-2xl shadow-pop max-h-[92dvh] flex flex-col transition-transform duration-200
          animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 sm:zoom-in-[0.98] duration-200`}>
        <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} className="touch-none sm:touch-auto">
          <span className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 rounded-full bg-gray-300 sm:hidden" aria-hidden="true" />
          {title !== undefined && (
            <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-3">
              {headerExtra}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">{title}</h2>
                {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
              </div>
              {!locked && <IconButton data-testid={closeTestId} icon={X} label="Close" onClick={onClose} className="-mr-2 -mt-1.5" />}
            </div>
          )}
        </div>
        <div className={`flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-5 ${bodyClass}`}>{children}</div>
        {footer && <div className="border-t border-gray-100 px-5 sm:px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

// Phones: the screen's main actions, fixed above the home indicator. From
// `lg` up it is not rendered: desktop puts the same actions in the header.
export function BottomBar({ children, className = "" }) {
  return (
    <div className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${className}`}>
      <div className="flex gap-3 max-w-xl mx-auto">{children}</div>
    </div>
  );
}

// Settings-style list: grouped rows that open a screen. Used by More.
export function MenuGroup({ title, children }) {
  return (
    <section className="mb-6">
      {title && <h2 className="px-1 mb-2 text-sm font-medium text-gray-600">{title}</h2>}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-card divide-y divide-gray-100 overflow-hidden">{children}</div>
    </section>
  );
}

export function MenuRow({ icon: Icon, title, sub, meta, onClick, testid, tone = "default", chevron = true }) {
  const danger = tone === "danger";
  return (
    <button type="button" data-testid={testid} onClick={onClick}
      className="w-full min-h-[60px] flex items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 touch-manipulation">
      {Icon && <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}><Icon size={18} aria-hidden="true" /></span>}
      <span className="flex-1 min-w-0">
        <span className={`block font-medium ${danger ? "text-red-700" : "text-gray-900"}`}>{title}</span>
        {sub && <span className="block text-[13px] text-gray-600 line-clamp-2">{sub}</span>}
      </span>
      {meta}
      {chevron && <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />}
    </button>
  );
}

export function Toggle({ checked, onChange, testid, label }) {
  return (
    <button type="button" data-testid={testid} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? "bg-brand-700" : "bg-gray-300"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

// Hub screens (Catalog, Marketing, More Settings): one tile per area. A tile
// opens its screen in place; BackLink returns to the hub.
export function Tiles({ tiles, onOpen }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
      {tiles.map((tl) => (
        <button key={tl.id} data-testid={`tile-${tl.id}`} onClick={() => onOpen(tl.id)}
          className="group text-left bg-white rounded-2xl border border-gray-200/80 shadow-card p-4 lg:p-5 flex sm:flex-col gap-4 sm:gap-5 items-center sm:items-start transition-all hover:shadow-lift hover:border-brand-200 hover:-translate-y-0.5 active:translate-y-0">
          <span className="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><tl.icon size={24} /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-gray-900">{tl.title}</span>
            <span className="block text-sm text-gray-600 mt-0.5">{tl.sub}</span>
            {tl.meta && <span className="mt-2 inline-flex">{tl.meta}</span>}
          </span>
          <ChevronRight size={20} className="text-gray-400 group-hover:text-brand-700 sm:hidden shrink-0" />
        </button>
      ))}
    </div>
  );
}

export function BackLink({ label, onClick, testid }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className="inline-flex items-center gap-0.5 h-9 -ml-2 pl-1 pr-3 mb-3 rounded-xl text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors">
      <ChevronLeft size={18} /> {label}
    </button>
  );
}

// Navigation inside a Settings area has three levels, always shown the same way:
//   1. Sidebar / tab strip  (e.g. Marketing)
//   2. Hub tiles            (e.g. WhatsApp)       -> SubHeader: back + "Marketing > WhatsApp"
//   3. Section tabs         (e.g. Connection)     -> UnderlineTabs under the SubHeader
export function SubHeader({ parent, title, subtitle, icon: Icon, onBack, backTestid }) {
  return (
    <div className="mb-5 lg:mb-7">
      <div className="flex items-center gap-3">
        <button data-testid={backTestid} onClick={onBack} aria-label={`Back to ${parent}`}
          className="w-10 h-10 rounded-xl border border-gray-300 bg-white text-gray-700 flex items-center justify-center shrink-0 hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all">
          <ArrowLeft size={18} />
        </button>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
          <button onClick={onBack} className="text-gray-600 hover:text-brand-700 truncate">{parent}</button>
          <ChevronRight size={15} className="text-gray-400 shrink-0" />
          <span className="text-gray-900 font-medium truncate">{title}</span>
        </nav>
      </div>
      <div className="flex items-center gap-3 mt-4">
        {Icon && <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Icon size={22} /></span>}
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-[28px] font-semibold tracking-tight text-gray-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-[15px] text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// Desktop trail above a deep screen: a back button and "Group > Screen". The
// last entry is the current page; the others are links up.
export function Crumbs({ trail, onBack, backLabel, testid, className = "" }) {
  return (
    <div className={`items-center gap-3 mb-4 ${className}`}>
      <button data-testid={testid} onClick={onBack} aria-label={backLabel} title={backLabel}
        className="w-9 h-9 rounded-xl border border-gray-300 bg-white text-gray-700 flex items-center justify-center shrink-0 hover:bg-gray-50 hover:border-gray-400 active:scale-95 transition-all">
        <ArrowLeft size={17} aria-hidden="true" />
      </button>
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {trail.map((c, i) => (
            <li key={i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight size={15} className="text-gray-400 shrink-0" aria-hidden="true" />}
              {c.onClick ? <button onClick={c.onClick} className="text-gray-600 hover:text-brand-700 rounded truncate">{c.label}</button>
                : <span aria-current="page" className="text-gray-900 font-medium truncate">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}

export function UnderlineTabs({ tabs, value, onChange, testid }) {
  return (
    <div className="border-b border-gray-200 mb-5 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
      <div role="tablist" className="flex gap-1 min-w-max">
        {tabs.map((tb) => {
          const on = tb.id === value;
          return (
            <button key={tb.id} role="tab" aria-selected={on} data-testid={testid ? `${testid}-${tb.id}` : undefined} onClick={() => onChange(tb.id)}
              className={`relative h-11 px-3 text-sm font-medium whitespace-nowrap transition-colors ${on ? "text-brand-700" : "text-gray-600 hover:text-gray-900"}`}>
              {tb.label}
              <span className={`absolute left-2 right-2 -bottom-px h-0.5 rounded-full ${on ? "bg-brand-700" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// A Settings area made of tiles. At the root it shows the area's header and
// the tiles; a tile opens its screen under a SubHeader with a back button.
export function HubPage({ title, subtitle, tiles, render, testid, headerClass = "hidden lg:flex" }) {
  const [open, setOpen] = useState(null);
  const current = tiles.find((tl) => tl.id === open);
  if (current) {
    return (
      <div key={current.id} className="animate-in fade-in duration-150">
        <SubHeader parent={title} title={current.title} subtitle={current.sub} icon={current.icon}
          onBack={() => setOpen(null)} backTestid={`${testid}-back`} />
        {render(current.id)}
      </div>
    );
  }
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} className={headerClass} />
      <Tiles tiles={tiles} onOpen={setOpen} />
    </>
  );
}
