import React, { useState, useEffect, useRef, useMemo } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { X, Camera as CamIcon, Search, Loader2, Trash2, Sparkles, Clock, ArrowLeft, RotateCcw, Repeat, Check } from "lucide-react";
import Camera from "@/admin/Camera";
import FabricSearch, { FabricThumb } from "@/admin/FabricSearch";
import { loadCatalog, cachedCatalog, recentIds, pushRecent, loadCategories, cachedCategories, tryOnTemplates, singleCategories } from "@/lib/catalog";

const LAST_TEMPLATE_KEY = "sf_last_tryon_category";
let keySeq = 0;

function lastTemplate() { try { return localStorage.getItem(LAST_TEMPLATE_KEY) || ""; } catch { return ""; } }
function rememberTemplate(id) { try { localStorage.setItem(LAST_TEMPLATE_KEY, id); } catch { /* storage off */ } }

// New try-on in as few taps as possible. Two ways in:
// - Catalog: search, tap a fabric, it lands in its category with its default
//   style. A second fabric for the same body part offers to replace the first.
// - Photo: pick a category (or a group like Top + Bottom), which fixes how many
//   photos are needed, then snap each fabric and tap its style.
export default function NewTrial({ sessionId, onClose, onDone }) {
  const { t } = useLang();
  const [cats, setCats] = useState(cachedCategories() || []);
  const [catalog, setCatalog] = useState(cachedCatalog());
  const [pieces, setPieces] = useState([]); // [{key, catId, item|null, photo|null, style|null}]
  const [template, setTemplate] = useState(null); // photo path: chosen category or group id
  const [screen, setScreen] = useState("build"); // build | search | choose | camera | generating
  const [camFor, setCamFor] = useState(null); // piece key the camera fills
  const [confirm, setConfirm] = useState(null); // { piece, victim } waiting for "Replace?"
  const cancelled = useRef(false);

  useEffect(() => {
    loadCategories().then(setCats).catch(() => {});
    loadCatalog().then(setCatalog).catch(() => {});
  }, []);
  useEffect(() => { cancelled.current = false; return () => { cancelled.current = true; }; }, []);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const templates = useMemo(() => tryOnTemplates(cats), [cats]);
  const singles = useMemo(() => singleCategories(cats), [cats]);
  const posOf = (catId) => byId.get(catId)?.position;
  const stylesOf = (catId) => byId.get(catId)?.items || [];
  const defaultStyle = (catId, wanted) => {
    const styles = stylesOf(catId);
    if (wanted && styles.some((s) => s.label === wanted)) return wanted;
    return styles.length === 1 ? styles[0].label : null;
  };
  const occupant = (catId, exceptKey) => catId && pieces.find((p) => p.key !== exceptKey && p.catId && posOf(p.catId) === posOf(catId));
  const pieceName = (p) => (p.item ? p.item.name : byId.get(p.catId)?.label || t("nt_photo_fabric"));

  // ---- Catalog path ----
  const addFabric = (item) => {
    const catId = byId.has(item.category_id) ? item.category_id : null;
    const piece = { key: ++keySeq, catId, item, photo: null, style: catId ? defaultStyle(catId, item.garment_type) : null };
    const victim = occupant(catId);
    setScreen("build");
    if (victim) setConfirm({ piece, victim });
    else setPieces((ps) => [...ps, piece]);
  };
  const doReplace = () => {
    const { piece, victim } = confirm;
    setPieces((ps) => ps.map((p) => (p.key === victim.key ? piece : p)));
    setConfirm(null);
    navigator.vibrate?.(8);
  };
  // A fabric saved without a category gets one here.
  const setCategory = (key, catId) => setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, catId, style: defaultStyle(catId, p.item?.garment_type) } : p)));

  // ---- Photo path ----
  const chooseTemplate = (tpl) => {
    const keep = new Map(pieces.map((p) => [p.catId, p])); // switching keeps matching photos
    const next = tpl.parts.map((c) => keep.get(c.id) || { key: ++keySeq, catId: c.id, item: null, photo: null, style: defaultStyle(c.id) });
    rememberTemplate(tpl.id);
    setTemplate(tpl.id);
    setPieces(next);
    const empty = next.find((p) => !p.photo);
    if (empty) { setCamFor(empty.key); setScreen("camera"); } else setScreen("build");
  };
  const snap = (key) => { setCamFor(key); setScreen("camera"); };
  const onPhoto = (img) => {
    setPieces((ps) => ps.map((p) => (p.key === camFor ? { ...p, photo: img } : p)));
    setScreen("build");
  };

  const setStyle = (key, style) => setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, style } : p)));
  const remove = (key) => setPieces((ps) => ps.filter((p) => p.key !== key));

  const recent = useMemo(() => {
    if (!catalog) return [];
    const m = new Map(catalog.map((it) => [it.id, it]));
    return recentIds().map((id) => m.get(id)).filter(Boolean).slice(0, 8);
  }, [catalog]);

  const ready = pieces.length > 0 && pieces.every((p) => p.catId && (p.item || p.photo) && p.style);

  const generate = async () => {
    if (!ready) return;
    cancelled.current = false;
    setScreen("generating");
    pieces.forEach((p) => p.item && pushRecent(p.item.id));
    const garments = pieces.map((p) => ({
      slot: posOf(p.catId), garment_type: p.style,
      ...(p.item ? { catalog_id: p.item.id } : { fabric_b64: p.photo }),
    }));
    try {
      const { data } = await api.post(`/sessions/${sessionId}/trials/generate`, { type: template ? byId.get(template)?.label || "" : "", garments });
      const tid = data.id;
      if (data.status === "done") { toast.success(t("nt_ready")); onDone(tid); return; }
      const started = Date.now();
      const poll = async () => {
        if (cancelled.current) return;
        try {
          const { data: st } = await api.get(`/trials/${tid}/status`);
          if (cancelled.current) return;
          if (st.status === "done") { toast.success(t("nt_ready")); onDone(tid); return; }
          if (st.status === "failed") { toast.error(st.error || "Image generation failed"); setScreen("build"); return; }
        } catch (e) { /* transient — keep polling */ }
        if (Date.now() - started > 180000) {
          // Keep the trial: it may still finish and will show in the session list.
          toast.error("This is taking longer than usual. It will appear in the list when ready.");
          onDone(null);
          return;
        }
        setTimeout(poll, 2500);
      };
      setTimeout(poll, 2000);
    } catch (e) {
      toast.error(apiErr(e));
      setScreen("build"); // the look is kept, so staff can simply tap Generate again
    }
  };

  if (screen === "camera") {
    return <Camera mode="fabric" onCapture={onPhoto} onClose={() => setScreen("build")} />;
  }

  const busy = screen === "generating";
  const photoMode = !!template;
  const tpl = template ? templates.find((x) => x.id === template) : null;
  const choosing = screen === "choose";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-gray-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center sm:p-6 animate-in fade-in duration-150" onClick={busy ? undefined : onClose}>
        <div data-testid="new-trial-sheet" onClick={(e) => e.stopPropagation()}
          className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-pop max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-8 duration-200">
          <span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-gray-200 sm:hidden" />
          <div className="flex items-center gap-2 px-4 pt-3 pb-2">
            {choosing && (
              <button data-testid="choose-back" onClick={() => setScreen("build")} aria-label={t("back")} className="p-1.5 -ml-1.5 text-gray-600 rounded-full active:bg-gray-100"><ArrowLeft size={20} /></button>
            )}
            <h3 className="flex-1 font-semibold text-lg">{choosing ? t("nt_choose_title") : t("nt_title")}</h3>
            {!busy && <button data-testid="close-trial" onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 text-gray-500 rounded-full active:bg-gray-100"><X size={22} /></button>}
          </div>

          {busy && (
            <div className="p-12 flex flex-col items-center gap-4 text-center">
              <div className="flex -space-x-3">
                {pieces.map((p) => <Swatch key={p.key} p={p} size={52} className="ring-4 ring-white" />)}
              </div>
              <Loader2 className="animate-spin text-brand-700" size={32} />
              <p className="text-gray-600">{t("generating")}</p>
            </div>
          )}

          {choosing && <TemplatePicker templates={templates} current={template} last={lastTemplate()} onPick={chooseTemplate} t={t} />}

          {!busy && !choosing && (
            <>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
                {pieces.length === 0 ? (
                  <Landing recent={recent} onSearch={() => setScreen("search")} onPhoto={() => setScreen("choose")} onRecent={addFabric} t={t} />
                ) : (
                  <div className="space-y-3">
                    {photoMode && tpl && (
                      <div className="flex items-center gap-3 rounded-xl bg-brand-700/5 px-3 py-2.5">
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-gray-900 truncate">{tpl.label}</span>
                          <span className="block text-xs text-gray-500">{tpl.parts.length} {tpl.parts.length === 1 ? t("nt_photo_1") : t("nt_photos")}</span>
                        </span>
                        <button data-testid="change-category" onClick={() => setScreen("choose")}
                          className="flex items-center gap-1.5 text-sm text-brand-700 font-medium bg-white border border-brand-700/20 rounded-full px-3 py-1.5 active:bg-brand-50"><Repeat size={14} /> {t("nt_change")}</button>
                      </div>
                    )}
                    {pieces.map((p) => (
                      <PieceCard key={p.key} p={p} cat={byId.get(p.catId)} photoMode={photoMode} t={t}
                        singles={singles} blocked={(catId) => !!occupant(catId, p.key)}
                        onCategory={(catId) => setCategory(p.key, catId)}
                        onStyle={(s) => setStyle(p.key, s)} onSnap={() => snap(p.key)} onRemove={() => remove(p.key)} />
                    ))}
                    {!photoMode && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2 mt-1">{t("nt_add_more")}</p>
                        <SearchBar onClick={() => setScreen("search")} label={t("nt_search_short")} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {pieces.length > 0 && (
                <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white sm:rounded-b-2xl">
                  <button data-testid="generate-btn" onClick={generate} disabled={!ready}
                    className="w-full flex items-center justify-center gap-2 bg-brand-700 text-white py-3.5 rounded-xl font-semibold disabled:bg-gray-200 disabled:text-gray-400 active:scale-[0.99] transition-all">
                    <Sparkles size={18} /> {ready ? t("nt_generate") : pieces.some((p) => !p.item && !p.photo) ? t("nt_snap_all") : t("nt_pick_style")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {screen === "search" && (
        <FabricSearch pickedIds={pieces.filter((p) => p.item).map((p) => p.item.id)}
          replaceHint={(item) => { const v = occupant(item.category_id); return v ? `${t("nt_replaces")} ${pieceName(v)}` : ""; }}
          onPick={addFabric} onClose={() => setScreen("build")} onCamera={pieces.length ? null : () => setScreen("choose")} />
      )}

      {confirm && (
        <ReplaceDialog confirm={confirm} cat={byId.get(confirm.piece.catId)} name={pieceName} t={t}
          onCancel={() => setConfirm(null)} onReplace={doReplace} />
      )}
    </>
  );
}

function Landing({ recent, onSearch, onPhoto, onRecent, t }) {
  return (
    <>
      <SearchBar onClick={onSearch} label={t("fs_placeholder")} big />
      <div className="flex items-center gap-3 my-3 text-xs text-gray-400 uppercase tracking-wider"><span className="flex-1 h-px bg-gray-200" />{t("nt_or")}<span className="flex-1 h-px bg-gray-200" /></div>
      <button data-testid="snap-fabric-btn" onClick={onPhoto}
        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed border-gray-300 text-left active:bg-gray-50 transition-colors">
        <span className="w-12 h-12 rounded-xl bg-brand-700/10 text-brand-700 flex items-center justify-center shrink-0"><CamIcon size={24} /></span>
        <span><span className="block font-semibold text-gray-900">{t("fs_snap")}</span><span className="block text-sm text-gray-500">{t("nt_snap_sub")}</span></span>
      </button>
      {recent.length > 0 && (
        <div className="mt-5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2"><Clock size={12} /> {t("fs_recent")}</p>
          <div className="flex items-start gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
            {recent.map((it) => (
              <button key={it.id} data-testid={`recent-${it.id}`} onClick={() => onRecent(it)} className="w-16 shrink-0 text-center active:scale-95 transition-transform">
                <FabricThumb item={it} size={64} className="rounded-xl" />
                <span className="text-[11px] leading-tight mt-1 text-gray-700 line-clamp-2">{it.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Photo path step 1: what is being tried? The last choice is offered first.
function TemplatePicker({ templates, current, last, onPick, t }) {
  const sorted = [...templates].sort((a, b) => (b.id === last) - (a.id === last));
  if (!templates.length) return <p className="p-8 text-center text-sm text-gray-500">{t("nt_no_categories")}</p>;
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5 space-y-2">
      <p className="text-sm text-gray-500 mb-1">{t("nt_choose_sub")}</p>
      {sorted.map((tp) => {
        const on = tp.id === current;
        return (
          <button key={tp.id} data-testid={`template-${tp.label}`} onClick={() => onPick(tp)}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-colors active:bg-gray-50 ${on ? "border-brand-700 bg-brand-50/40" : "border-gray-200"}`}>
            <span className="w-12 h-12 shrink-0 rounded-xl bg-gray-100 flex flex-col items-center justify-center gap-1">
              {tp.parts.map((c) => <span key={c.id} className={`block h-1.5 rounded-full bg-brand-700 ${c.position === "third" ? "w-7 opacity-40" : c.position === "bottom" ? "w-4 opacity-70" : "w-6"}`} />)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 truncate">{tp.label}</span>
                {tp.id === last && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-700 bg-brand-700/10 rounded px-1.5 py-0.5">{t("nt_last_used")}</span>}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {tp.parts.length} {tp.parts.length === 1 ? t("nt_photo_1") : t("nt_photos")}
                {tp.kind === "group" ? ` · ${tp.parts.map((c) => c.label).join(" + ")}` : ` · ${(tp.items || []).map((s) => s.label).join(", ")}`}
              </span>
            </span>
            {on && <Check size={18} className="text-brand-700 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

function SearchBar({ onClick, label, big }) {
  return (
    <button data-testid={big ? "open-fabric-search" : "open-fabric-search-more"} onClick={onClick}
      className={`w-full flex items-center gap-3 bg-gray-100 rounded-xl px-4 text-left text-gray-500 active:bg-gray-200 transition-colors ${big ? "h-14 text-base" : "h-12 text-sm"}`}>
      <Search size={big ? 20 : 18} className="text-gray-400 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Swatch({ p, size, className = "" }) {
  if (p.item) return <FabricThumb item={p.item} size={size} className={className} />;
  if (p.photo) return <img src={p.photo} alt="" style={{ width: size, height: size }} className={`block shrink-0 rounded-lg object-cover ${className}`} />;
  return <span style={{ width: size, height: size }} className={`block shrink-0 rounded-lg bg-gray-100 ${className}`} />;
}

function Chips({ children }) {
  const ref = useRef(null);
  // Keep the selected chip in view (e.g. a catalog default far to the right).
  useEffect(() => { ref.current?.querySelector("[data-on='1']")?.scrollIntoView({ block: "nearest", inline: "center" }); });
  return <div ref={ref} className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3">{children}</div>;
}

function Chip({ on, disabled, onClick, children, testid }) {
  return (
    <button data-testid={testid} data-on={on ? "1" : "0"} disabled={disabled} onClick={onClick}
      className={`shrink-0 whitespace-nowrap text-sm px-3 py-2 rounded-full border transition-colors ${on ? "bg-brand-700 border-brand-700 text-white" : "bg-white border-gray-200 text-gray-700 active:bg-gray-50"} disabled:opacity-35`}>
      {children}
    </button>
  );
}

function PieceCard({ p, cat, photoMode, singles, blocked, onCategory, onStyle, onSnap, onRemove, t }) {
  const hasFabric = p.item || p.photo;
  return (
    <div data-testid="look-garment" className="rounded-2xl border border-gray-200 p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-3">
        {hasFabric ? <Swatch p={p} size={56} /> : (
          <button data-testid="snap-piece" onClick={onSnap} aria-label={t("nt_snap_this")}
            className="w-14 h-14 shrink-0 rounded-lg border-2 border-dashed border-brand-700/40 text-brand-700 flex items-center justify-center active:bg-brand-50"><CamIcon size={22} /></button>
        )}
        <div className="flex-1 min-w-0">
          {cat && <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">{cat.label}</p>}
          {p.item ? <p className="font-semibold text-gray-900 truncate">{p.item.name}</p>
            : p.photo ? <p className="font-semibold text-gray-900">{t("nt_photo_fabric")}</p>
              : <button onClick={onSnap} className="font-semibold text-brand-700">{t("nt_snap_this")}</button>}
          {p.item && (p.item.code || p.item.description) && <p className="text-xs text-gray-500 truncate">{[p.item.code, p.item.description].filter(Boolean).join(" · ")}</p>}
        </div>
        {photoMode ? (
          p.photo && <button data-testid="retake-piece" onClick={onSnap} aria-label={t("retake")} className="p-2 text-gray-400 rounded-full active:bg-gray-100"><RotateCcw size={18} /></button>
        ) : (
          <button data-testid="remove-garment" onClick={onRemove} aria-label={t("remove")} className="p-2 -mr-1 text-gray-400 rounded-full active:bg-red-50 active:text-red-500"><Trash2 size={18} /></button>
        )}
      </div>

      {!cat ? (
        <>
          <p className="text-xs font-medium text-gray-500 mt-3 mb-1.5">{t("nt_which_category")}</p>
          <Chips>
            {singles.map((c) => <Chip key={c.id} disabled={blocked(c.id)} onClick={() => onCategory(c.id)}>{c.label}</Chip>)}
          </Chips>
        </>
      ) : (
        <>
          <p className="text-xs font-medium text-gray-500 mt-3 mb-1.5">{t("garment_type")}</p>
          <Chips>
            {(cat.items || []).map((s) => (
              <Chip key={s.label} testid={`style-${s.label}`} on={p.style === s.label} onClick={() => onStyle(p.style === s.label ? null : s.label)}>{s.label}</Chip>
            ))}
            {(cat.items || []).length === 0 && <span className="text-xs text-gray-400 py-2">{t("nt_no_styles")}</span>}
          </Chips>
        </>
      )}
    </div>
  );
}

function ReplaceDialog({ confirm, cat, name, onCancel, onReplace, t }) {
  const { piece, victim } = confirm;
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150" onClick={onCancel}>
      <div data-testid="replace-dialog" onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-sm rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Swatch p={victim} size={56} className="opacity-50" />
          <Repeat size={20} className="text-gray-400" />
          <Swatch p={piece} size={56} className="ring-2 ring-brand-700 ring-offset-2" />
        </div>
        <h4 className="text-center font-semibold text-gray-900">{t("nt_replace_title")}</h4>
        <p className="text-center text-sm text-gray-500 mt-1">
          <b className="text-gray-700">{name(victim)}</b> {t("nt_replace_will")} <b className="text-gray-700">{name(piece)}</b>.
          {cat && <> {t("nt_replace_one")} <b className="text-gray-700">{cat.label}</b>.</>}
        </p>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button data-testid="replace-cancel" onClick={onCancel} className="py-3 rounded-xl border font-medium text-gray-700">{t("cancel")}</button>
          <button data-testid="replace-confirm" onClick={onReplace} className="py-3 rounded-xl bg-brand-700 text-white font-semibold">{t("nt_replace")}</button>
        </div>
      </div>
    </div>
  );
}
