import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/i18n";
import { ArrowLeft, X, Search, Camera as CamIcon, Check, Layers, Clock, Repeat } from "lucide-react";
import { loadCatalog, cachedCatalog, searchCatalog, catalogCategories, recentIds, thumbUrl } from "@/lib/catalog";

const PAGE = 60; // rows rendered at a time; more appear on scroll

// Bold the parts of `text` that match the typed words.
function Hl({ text, words }) {
  if (!text || !words.length) return text || null;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return text.split(re).map((p, i) => (i % 2 ? <mark key={i} className="bg-amber-100 text-inherit rounded-sm">{p}</mark> : p));
}

export function FabricThumb({ item, size = 48, className = "" }) {
  return (
    <img src={thumbUrl(item)} alt="" loading="lazy" decoding="async" width={size} height={size}
      style={{ width: size, height: size }}
      className={`block shrink-0 rounded-lg object-cover bg-gradient-to-br from-gray-100 to-gray-200 ${className}`} />
  );
}

// Full-screen fabric picker. Opens with the keyboard up; every keystroke
// filters the whole catalog instantly in the browser.
export default function FabricSearch({ onPick, onClose, onCamera, pickedIds = [], replaceHint }) {
  const { t } = useLang();
  const [items, setItems] = useState(cachedCatalog());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { loadCatalog().then(setItems).catch(() => setItems((x) => x || [])); }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Each new search starts at the top.
  useEffect(() => { setLimit(PAGE); listRef.current?.scrollTo({ top: 0 }); }, [q, cat]);

  const words = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const cats = useMemo(() => catalogCategories(items || []), [items]);
  const results = useMemo(() => searchCatalog(items || [], q, cat), [items, q, cat]);
  const catHits = useMemo(() => (words.length && !cat
    ? cats.filter((c) => words.every((w) => c.name.toLowerCase().includes(w))) : []), [cats, words, cat]);
  const recent = useMemo(() => {
    if (q || cat || !items) return [];
    const byId = new Map(items.map((it) => [it.id, it]));
    return recentIds().map((id) => byId.get(id)).filter(Boolean).slice(0, 8);
  }, [items, q, cat]);

  const picked = new Set(pickedIds);
  const pick = (it) => { if (!picked.has(it.id)) { navigator.vibrate?.(8); onPick(it); } };
  const chooseCat = (name) => { setCat(name); setQ(""); inputRef.current?.focus(); };

  const onKey = (e) => {
    if (e.key === "Enter") { const first = results.find((it) => !picked.has(it.id)); if (first) pick(first); }
    if (e.key === "Escape") onClose();
  };
  const onScroll = (e) => {
    const el = e.currentTarget;
    if (limit < results.length && el.scrollTop + el.clientHeight > el.scrollHeight - 400) setLimit(limit + PAGE);
  };

  const loading = items === null;
  const empty = !loading && items.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 sm:flex sm:items-center sm:justify-center animate-in fade-in duration-150" onClick={onClose}>
      <div data-testid="fabric-search" onClick={(e) => e.stopPropagation()}
        className="bg-white w-full h-full sm:h-[min(760px,92vh)] sm:max-w-md sm:rounded-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200">

        {/* Search field */}
        <div className="flex items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 border-b">
          <button data-testid="fabric-search-back" onClick={onClose} aria-label={t("back")} className="p-2.5 text-gray-600 rounded-full active:bg-gray-100"><ArrowLeft size={22} /></button>
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 h-11 focus-within:ring-2 focus-within:ring-brand-700/30">
            <Search size={18} className="text-gray-400 shrink-0" />
            <input ref={inputRef} data-testid="fabric-search-input" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder={t("fs_placeholder")} enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
              className="flex-1 min-w-0 bg-transparent outline-none text-base placeholder:text-gray-400" />
            {q && <button onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear" className="p-1 -mr-1 text-gray-400"><X size={18} /></button>}
          </div>
          {onCamera && <button data-testid="fabric-search-camera" onClick={onCamera} aria-label={t("fs_snap")} className="p-2.5 text-brand-700 rounded-full active:bg-brand-50"><CamIcon size={22} /></button>}
        </div>

        {/* Category chips */}
        {cats.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2.5 border-b">
            <Chip active={!cat} onClick={() => chooseCat("")}>{t("fs_all")} <span className="opacity-60">{items.length}</span></Chip>
            {cats.map((c) => (
              <Chip key={c.name} testid={`fabric-cat-${c.name}`} active={cat === c.name} onClick={() => chooseCat(cat === c.name ? "" : c.name)}>
                {c.name} <span className="opacity-60">{c.count}</span>
              </Chip>
            ))}
          </div>
        )}

        <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {loading && <SkeletonRows />}

          {empty && (
            <Empty icon={Layers} title={t("fs_empty_title")} text={t("fs_empty_text")} action={t("fs_snap")} onAction={onCamera} />
          )}

          {catHits.length > 0 && (
            <Section title={t("fs_categories")}>
              {catHits.map((c) => (
                <button key={c.name} onClick={() => chooseCat(c.name)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-gray-50">
                  <span className="w-12 h-12 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0"><Layers size={20} /></span>
                  <span className="flex-1 min-w-0"><span className="font-medium text-gray-900"><Hl text={c.name} words={words} /></span>
                    <span className="block text-xs text-gray-500">{c.count} {t("fs_fabrics")}</span></span>
                </button>
              ))}
            </Section>
          )}

          {recent.length > 0 && (
            <Section title={<span className="flex items-center gap-1"><Clock size={12} /> {t("fs_recent")}</span>}>
              <div className="flex items-start gap-3 overflow-x-auto no-scrollbar px-4 pb-3">
                {recent.map((it) => (
                  <button key={it.id} onClick={() => pick(it)} disabled={picked.has(it.id)} className="w-16 shrink-0 text-center disabled:opacity-40">
                    <FabricThumb item={it} size={64} className="rounded-xl" />
                    <span className="text-[11px] leading-tight mt-1 text-gray-700 line-clamp-2">{it.name}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {!loading && !empty && results.length === 0 && catHits.length === 0 && (
            <Empty icon={Search} title={`${t("fs_no_match")} “${q}”`} text={t("fs_no_match_text")} action={t("fs_snap")} onAction={onCamera} />
          )}

          {results.length > 0 && (
            <Section title={q || cat ? `${results.length} ${t("fs_fabrics")}` : t("fs_all_fabrics")}>
              {results.slice(0, limit).map((it) => {
                const on = picked.has(it.id);
                const sub = [it.category, it.garment_type].filter(Boolean).join(" · ");
                const swap = !on && replaceHint ? replaceHint(it) : "";
                return (
                  <button key={it.id} data-testid={`fabric-${it.id}`} onClick={() => pick(it)} disabled={on}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left active:bg-gray-50 disabled:opacity-50">
                    <FabricThumb item={it} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate"><Hl text={it.name} words={words} /></span>
                        {it.code && <span className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"><Hl text={it.code} words={words} /></span>}
                      </span>
                      {sub && <span className="block text-xs text-gray-500 truncate">{sub}</span>}
                      {it.description && <span className="block text-xs text-gray-400 truncate"><Hl text={it.description} words={words} /></span>}
                      {swap && <span className="flex items-center gap-1 text-[11px] text-amber-700 mt-0.5"><Repeat size={11} /> {swap}</span>}
                    </span>
                    {on && <Check size={18} className="text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children, testid }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className={`shrink-0 whitespace-nowrap text-sm px-3 py-1.5 rounded-full border transition-colors ${active ? "bg-brand-700 border-brand-700 text-white" : "bg-white border-gray-200 text-gray-700 active:bg-gray-50"}`}>
      {children}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="pt-3">
      <p className="px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</p>
      {children}
    </div>
  );
}

function Empty({ icon: Icon, title, text, action, onAction }) {
  return (
    <div className="flex flex-col items-center text-center px-8 py-14 gap-2">
      <span className="w-14 h-14 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mb-1"><Icon size={24} /></span>
      <p className="font-medium text-gray-800 break-all">{title}</p>
      <p className="text-sm text-gray-500">{text}</p>
      {onAction && <button onClick={onAction} className="mt-3 flex items-center gap-2 bg-brand-700 text-white px-5 py-2.5 rounded-xl font-medium"><CamIcon size={18} /> {action}</button>}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="pt-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2">
          <span className="w-12 h-12 rounded-lg bg-gray-100 animate-pulse" />
          <span className="flex-1 space-y-2"><span className="block h-3 w-2/3 bg-gray-100 rounded animate-pulse" /><span className="block h-2.5 w-1/3 bg-gray-100 rounded animate-pulse" /></span>
        </div>
      ))}
    </div>
  );
}
