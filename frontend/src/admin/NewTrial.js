import React, { useState, useEffect, useRef, useMemo } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { X, Camera as CamIcon, Search, Loader2, Sparkles, ArrowLeft, RotateCcw, Repeat, Check, ChevronRight } from "lucide-react";
import Camera from "@/admin/Camera";
import FabricSearch, { FabricThumb } from "@/admin/FabricSearch";
import { loadCatalog, pushRecent, loadCategories, cachedCategories, tryOnTemplates } from "@/lib/catalog";

const LAST_TEMPLATE_KEY = "sf_last_tryon_category";
let keySeq = 0;

function lastTemplate() { try { return localStorage.getItem(LAST_TEMPLATE_KEY) || ""; } catch { return ""; } }
function rememberTemplate(id) { try { localStorage.setItem(LAST_TEMPLATE_KEY, id); } catch { /* storage off */ } }

// New try-on, always in the same three steps:
// 1. What is being tried? (a category such as Top Wear, or a group like
//    Top + Bottom). The last choice is offered first.
// 2. One placeholder per part. Each is filled from a Photo (camera; staff
//    pick the style) or the Catalogue (search opens on that category and the
//    fabric's own style is pre-selected).
// 3. Generate hands the job to the server and closes at once: the session
//    shows the look as "generating" and opens it when ready (`onSubmitted`).
export default function NewTrial({ sessionId, onClose, onSubmitted }) {
  const { t } = useLang();
  const [cats, setCats] = useState(cachedCategories() || []);
  const [loaded, setLoaded] = useState(!!cachedCategories());
  const [pieces, setPieces] = useState([]); // one per part: {key, catId, item|null, photo|null, style|null}
  const [template, setTemplate] = useState(null);
  const [screen, setScreen] = useState("choose"); // choose | build | search | camera
  const [active, setActive] = useState(null); // key of the part the camera / search fills
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCategories().then(setCats).catch(() => {}).finally(() => setLoaded(true));
    loadCatalog().catch(() => {}); // warm it so Catalogue opens instantly
  }, []);

  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const templates = useMemo(() => tryOnTemplates(cats), [cats]);
  const posOf = (catId) => byId.get(catId)?.position;
  const defaultStyle = (catId, wanted) => {
    const styles = byId.get(catId)?.items || [];
    if (wanted && styles.some((s) => s.label === wanted)) return wanted;
    return styles.length === 1 ? styles[0].label : null;
  };

  const chooseTemplate = (tpl) => {
    const keep = new Map(pieces.map((p) => [p.catId, p])); // switching keeps parts already filled
    setPieces(tpl.parts.map((c) => keep.get(c.id) || { key: ++keySeq, catId: c.id, item: null, photo: null, style: defaultStyle(c.id) }));
    rememberTemplate(tpl.id);
    setTemplate(tpl.id);
    setScreen("build");
  };
  // Only one thing to try: skip the question.
  useEffect(() => {
    if (loaded && !template && templates.length === 1) chooseTemplate(templates[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, templates]);

  const update = (key, fn) => setPieces((ps) => ps.map((p) => (p.key === key ? { ...p, ...fn(p) } : p)));
  const open = (key, where) => { setActive(key); setScreen(where); };
  const onPhoto = (img) => {
    update(active, (p) => ({ photo: img, item: null, style: p.style || defaultStyle(p.catId) }));
    setScreen("build");
  };
  const onItem = (item) => {
    update(active, (p) => ({ item, photo: null, style: defaultStyle(p.catId, item.garment_type) || p.style }));
    setScreen("build");
  };
  const clear = (key) => update(key, (p) => ({ item: null, photo: null, style: defaultStyle(p.catId) }));
  const setStyle = (key, style) => update(key, () => ({ style }));

  const ready = pieces.length > 0 && pieces.every((p) => (p.item || p.photo) && p.style);

  const generate = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    pieces.forEach((p) => p.item && pushRecent(p.item.id));
    const garments = pieces.map((p) => ({
      slot: posOf(p.catId), garment_type: p.style,
      ...(p.item ? { catalog_id: p.item.id } : { fabric_b64: p.photo }),
    }));
    try {
      const { data } = await api.post(`/sessions/${sessionId}/trials/generate`, { type: byId.get(template)?.label || "", garments });
      onSubmitted(data.id, data.status);
    } catch (e) {
      toast.error(apiErr(e));
      setSubmitting(false); // the look is kept, so staff can simply tap Generate again
    }
  };

  if (screen === "camera") {
    return <Camera mode="fabric" confirm={false} onCapture={onPhoto} onClose={() => setScreen("build")} />;
  }

  const busy = submitting;
  const tpl = template ? templates.find((x) => x.id === template) : null;
  const choosing = screen === "choose" || !tpl;
  const activePiece = pieces.find((p) => p.key === active);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-gray-950/40 flex items-end sm:items-center justify-center sm:p-6 animate-in fade-in duration-150" onClick={busy ? undefined : onClose}>
        <div data-testid="new-trial-sheet" onClick={(e) => e.stopPropagation()}
          className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-pop max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-8 duration-200">
          <span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-gray-200 sm:hidden" />
          <div className="flex items-center gap-1 px-3 pt-4 pb-2">
            {choosing && tpl && (
              <button data-testid="choose-back" onClick={() => setScreen("build")} aria-label={t("back")} className="w-11 h-11 flex items-center justify-center text-gray-600 rounded-xl active:bg-gray-100"><ArrowLeft size={20} /></button>
            )}
            <h3 className={`flex-1 min-w-0 font-semibold text-lg tracking-tight truncate ${choosing && tpl ? "" : "pl-2"}`}>{choosing ? t("nt_choose_title") : tpl.label}</h3>
            {!choosing && templates.length > 1 && !busy && (
              <button data-testid="change-category" onClick={() => setScreen("choose")}
                className="flex items-center gap-1.5 h-9 text-sm text-brand-700 font-medium border border-brand-700/25 rounded-full px-3 active:bg-brand-50"><Repeat size={14} aria-hidden="true" /> {t("nt_change")}</button>
            )}
            {!busy && <button data-testid="close-trial" onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center text-gray-500 rounded-xl active:bg-gray-100"><X size={22} /></button>}
          </div>

          {choosing ? (
            <TemplatePicker templates={templates} loaded={loaded} current={template} last={lastTemplate()} onPick={chooseTemplate} t={t} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-3">
                {pieces.map((p) => (
                  <SlotCard key={p.key} p={p} cat={byId.get(p.catId)} t={t} disabled={busy}
                    onPhoto={() => open(p.key, "camera")} onCatalog={() => open(p.key, "search")}
                    onClear={() => clear(p.key)} onStyle={(s) => setStyle(p.key, s)} />
                ))}
              </div>
              <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white sm:rounded-b-2xl">
                <button data-testid="generate-btn" onClick={generate} disabled={!ready || busy}
                  className="w-full h-14 flex items-center justify-center gap-2 bg-brand-700 text-white rounded-2xl font-semibold text-base disabled:bg-gray-200 disabled:text-gray-600 active:scale-[0.99] transition-all touch-manipulation">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} aria-hidden="true" />} {ready ? t("nt_generate") : pieces.some((p) => !p.item && !p.photo) ? t("nt_snap_all") : t("nt_pick_style")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {screen === "search" && activePiece && (
        <FabricSearch onlyCat={byId.get(activePiece.catId)?.label || ""}
          pickedIds={pieces.filter((p) => p.item && p.key !== active).map((p) => p.item.id)}
          onPick={onItem} onClose={() => setScreen("build")} onCamera={() => setScreen("camera")} />
      )}
    </>
  );
}

// Step 1: what is being tried? The last choice is offered first.
function TemplatePicker({ templates, loaded, current, last, onPick, t }) {
  const sorted = [...templates].sort((a, b) => (b.id === last) - (a.id === last));
  if (!loaded && !templates.length) {
    return <div className="px-4 pb-5 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-[72px] rounded-2xl bg-gray-100 animate-pulse" />)}</div>;
  }
  if (!templates.length) return <p className="p-8 text-center text-sm text-gray-600">{t("nt_no_categories")}</p>;
  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5 space-y-2">
      <p className="text-sm text-gray-600 mb-1">{t("nt_choose_sub")}</p>
      {sorted.map((tp) => {
        const on = tp.id === current;
        const sub = tp.kind === "group" ? tp.parts.map((c) => c.label).join(" + ") : (tp.items || []).map((s) => s.label).join(", ");
        return (
          <button key={tp.id} data-testid={`template-${tp.label}`} onClick={() => onPick(tp)}
            className={`w-full flex items-center gap-3 p-3 min-h-[72px] rounded-2xl border text-left transition-colors hover:border-brand-300 active:bg-brand-50 touch-manipulation ${on ? "border-brand-700 bg-brand-50/40" : "border-gray-200"}`}>
            <span className="w-12 h-12 shrink-0 rounded-xl bg-brand-50 flex flex-col items-center justify-center gap-1" aria-hidden="true">
              {tp.parts.map((c) => <span key={c.id} className={`block h-1.5 rounded-full bg-brand-700 ${c.position === "third" ? "w-7 opacity-40" : c.position === "bottom" ? "w-4 opacity-70" : "w-6"}`} />)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 truncate">{tp.label}</span>
                {tp.id === last && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-700 bg-brand-700/10 rounded px-1.5 py-0.5">{t("nt_last_used")}</span>}
              </span>
              {sub && <span className="block text-[13px] text-gray-600 truncate">{sub}</span>}
            </span>
            {on ? <Check size={18} className="text-brand-700 shrink-0" aria-hidden="true" /> : <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
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
    <button data-testid={testid} data-on={on ? "1" : "0"} disabled={disabled} onClick={onClick} aria-pressed={on}
      className={`shrink-0 whitespace-nowrap text-[15px] h-11 px-4 rounded-full border transition-colors touch-manipulation ${on ? "bg-brand-700 border-brand-700 text-white" : "bg-white border-gray-300 text-gray-800 active:bg-gray-50"} disabled:opacity-35`}>
      {children}
    </button>
  );
}

// Step 2: one placeholder per part. Empty: Photo or Catalogue. Filled: the
// fabric, a way to redo it, and its style.
function SlotCard({ p, cat, onPhoto, onCatalog, onClear, onStyle, disabled, t }) {
  const filled = p.item || p.photo;
  const styles = cat?.items || [];
  return (
    <div data-testid="look-garment" className={`rounded-2xl border p-3 transition-colors ${filled ? "border-gray-200" : "border-dashed border-gray-300 bg-gray-50/60"}`}>
      <div className="flex items-center gap-2 min-h-[24px]">
        <p className="flex-1 text-[13px] font-semibold uppercase tracking-wider text-brand-700">{cat?.label}</p>
        {filled && <Check size={16} className="text-emerald-600" aria-hidden="true" />}
      </div>

      {!filled ? (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <SourceButton testid="slot-photo" icon={CamIcon} label={t("nt_src_photo")} onClick={onPhoto} disabled={disabled} />
          <SourceButton testid="slot-catalog" icon={Search} label={t("nt_src_catalog")} onClick={onCatalog} disabled={disabled} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mt-2 animate-in fade-in duration-150">
            <Swatch p={p} size={56} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{p.item ? p.item.name : t("nt_photo_fabric")}</p>
              <p className="text-[13px] text-gray-600 truncate">
                {p.item ? [p.item.code, p.item.description].filter(Boolean).join(" · ") || t("nt_src_catalog") : t("nt_src_photo")}
              </p>
            </div>
            <button data-testid={p.item ? "repick-piece" : "retake-piece"} onClick={p.item ? onCatalog : onPhoto} disabled={disabled}
              aria-label={p.item ? t("nt_change") : t("retake")} title={p.item ? t("nt_change") : t("retake")}
              className="w-11 h-11 flex items-center justify-center text-gray-600 rounded-xl hover:bg-gray-100 active:bg-gray-100">{p.item ? <Repeat size={18} /> : <RotateCcw size={18} />}</button>
            <button data-testid="clear-piece" onClick={onClear} disabled={disabled} aria-label={t("remove")} title={t("remove")}
              className="w-11 h-11 -mr-1 flex items-center justify-center text-gray-600 rounded-xl hover:bg-red-50 hover:text-red-600 active:bg-red-50 active:text-red-600"><X size={18} /></button>
          </div>
          <p className="text-[13px] font-medium text-gray-700 mt-3 mb-1.5">{t("garment_type")}</p>
          <Chips>
            {styles.map((s) => (
              <Chip key={s.label} testid={`style-${s.label}`} on={p.style === s.label} onClick={() => onStyle(p.style === s.label ? null : s.label)}>{s.label}</Chip>
            ))}
            {styles.length === 0 && <span className="text-[13px] text-gray-600 py-2">{t("nt_no_styles")}</span>}
          </Chips>
        </>
      )}
    </div>
  );
}

function SourceButton({ icon: Icon, label, onClick, disabled, testid }) {
  return (
    <button data-testid={testid} onClick={onClick} disabled={disabled}
      className="h-[72px] flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-gray-900 font-medium text-[15px] shadow-card transition-colors hover:border-brand-300 active:bg-brand-50 active:scale-[0.98] touch-manipulation disabled:opacity-50">
      <Icon size={22} className="text-brand-700" aria-hidden="true" />
      {label}
    </button>
  );
}
