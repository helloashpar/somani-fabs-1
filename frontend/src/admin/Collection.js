import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Plus, Search, X, Camera as CamIcon, ImagePlus, Trash2, Loader2, Images, Layers } from "lucide-react";
import Camera from "@/admin/Camera";
import { FabricThumb } from "@/admin/FabricSearch";
import { loadCatalog, invalidateCatalog, searchCatalog, catalogCategories, singleCategories, loadCategories, fileToSquareJpeg, thumbUrl } from "@/lib/catalog";

// Settings -> Catalog -> Collection (super admin): the fabrics staff pick from
// in New Try-On. Each fabric belongs to one configured category.
export default function Collection() {
  const { t } = useLang();
  const [items, setItems] = useState(null);
  const [cats, setCats] = useState([]); // single (non-group) categories
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState(null); // item, or {} for new
  const [bulk, setBulk] = useState(null); // { done, total }
  const [bulkCat, setBulkCat] = useState(null); // category picked for "Add many photos"
  const bulkRef = useRef(null);

  const reload = () => { invalidateCatalog(); return loadCatalog({ force: true }).then(setItems).catch((e) => toast.error(apiErr(e))); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload();
    loadCategories().then((c) => setCats(singleCategories(c))).catch(() => {});
  }, []);

  const chips = useMemo(() => catalogCategories(items || []), [items]);
  const shown = useMemo(() => searchCatalog(items || [], q, cat), [items, q, cat]);

  // Many photos at once: each becomes a fabric named after its file, to be
  // filled in later. Names already in the catalog are skipped.
  const onBulk = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    const catId = bulkCat;
    setBulkCat(null);
    let ok = 0; const failed = [];
    setBulk({ done: 0, total: files.length });
    for (const [i, f] of files.entries()) {
      const name = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || `Fabric ${i + 1}`;
      try {
        const image = await fileToSquareJpeg(f);
        await api.post("/catalog", { name, image, category_id: catId });
        ok += 1;
      } catch (err) { failed.push(`${name}: ${apiErr(err)}`); }
      setBulk({ done: i + 1, total: files.length });
    }
    setBulk(null);
    if (ok) toast.success(`${ok} ${t("cat_added_n")}`);
    if (failed.length) toast.error(failed.slice(0, 3).join("\n") + (failed.length > 3 ? `\n+${failed.length - 3}` : ""));
    reload();
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-gray-600 pt-2">{t("cat_sub")}</p>
        <div className="flex gap-2 shrink-0">
          <input ref={bulkRef} type="file" accept="image/*" multiple className="hidden" onChange={onBulk} data-testid="catalog-bulk-input" />
          <button data-testid="catalog-bulk-btn" onClick={() => setBulkCat("")} disabled={!!bulk} title={t("cat_bulk")}
            className="flex items-center gap-1.5 h-10 text-sm font-medium border border-gray-300 bg-white rounded-xl px-3 text-gray-800 hover:bg-gray-50 disabled:opacity-50"><Images size={16} /><span className="hidden sm:inline">{t("cat_bulk")}</span></button>
          <button data-testid="catalog-add-btn" onClick={() => setEditing({})}
            className="flex items-center gap-1.5 h-10 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-xl px-3.5 font-medium"><Plus size={16} /> {t("add")}</button>
        </div>
      </div>

      {bulk && (
        <div className="mb-3 rounded-xl bg-brand-50 text-brand-700 text-sm px-3 py-2.5 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> {t("cat_uploading")} {bulk.done}/{bulk.total}
          <span className="flex-1 h-1.5 bg-white rounded-full overflow-hidden ml-2"><span className="block h-full bg-brand-700 transition-all" style={{ width: `${(bulk.done / bulk.total) * 100}%` }} /></span>
        </div>
      )}

      <div className="flex items-center gap-2 bg-white border rounded-xl px-3 h-11 mb-2 focus-within:ring-2 focus-within:ring-brand-700/20">
        <Search size={17} className="text-gray-400" />
        <input data-testid="catalog-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("fs_placeholder")}
          className="flex-1 min-w-0 outline-none text-base sm:text-sm bg-transparent" />
        {q && <button onClick={() => setQ("")} className="text-gray-400"><X size={16} /></button>}
      </div>
      {chips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-1">
          {[{ name: "", label: t("fs_all"), count: items.length }, ...chips].map((c) => (
            <button key={c.name || "_all"} onClick={() => setCat(c.name === cat ? "" : c.name)}
              className={`shrink-0 whitespace-nowrap text-sm px-3 py-1.5 rounded-full border ${cat === c.name ? "bg-brand-700 border-brand-700 text-white" : "bg-white border-gray-200 text-gray-700"}`}>
              {c.label || c.name} <span className="opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border rounded-xl divide-y overflow-hidden">
        {items === null && <p className="py-10 text-center"><Loader2 className="inline animate-spin text-gray-400" /></p>}
        {items?.length === 0 && (
          <div className="py-12 px-6 text-center">
            <span className="inline-flex w-14 h-14 rounded-full bg-gray-100 text-gray-400 items-center justify-center mb-3"><Layers size={24} /></span>
            <p className="font-medium text-gray-800">{t("cat_none")}</p>
            <p className="text-sm text-gray-500 mt-1">{t("cat_none_sub")}</p>
          </div>
        )}
        {items?.length > 0 && shown.length === 0 && <p className="py-8 text-center text-sm text-gray-400">{t("fs_no_match")} “{q}”</p>}
        {shown.map((it) => (
          <button key={it.id} data-testid={`catalog-row-${it.id}`} onClick={() => setEditing(it)} className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-gray-50 active:bg-gray-50">
            <FabricThumb item={it} />
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900 truncate">{it.name}</span>
                {it.code && <span className="shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{it.code}</span>}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {!it.category && <span className="text-amber-700 font-medium">{t("cat_choose_category")} · </span>}
                {[it.category, it.garment_type, it.description].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        ))}
      </div>

      {editing && (
        <CatalogEditor item={editing} cats={cats}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}

      {bulkCat !== null && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={() => setBulkCat(null)}>
          <div data-testid="bulk-sheet" onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3 animate-in slide-in-from-bottom-8 duration-200">
            <h3 className="font-semibold">{t("cat_bulk")}</h3>
            <p className="text-sm text-gray-500">{t("cat_bulk_sub")}</p>
            <CategorySelect cats={cats} value={bulkCat} onChange={setBulkCat} />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={() => setBulkCat(null)} className="py-2.5 rounded-lg border">{t("cancel")}</button>
              <button data-testid="bulk-choose-photos" disabled={!bulkCat} onClick={() => bulkRef.current?.click()}
                className="py-2.5 rounded-lg bg-brand-700 text-white font-medium disabled:opacity-40">{t("cat_choose_photos")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputCls = "mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15";

const POS_KEY = { top: "pos_top", bottom: "pos_bottom", third: "pos_third" };

function CategorySelect({ cats, value, onChange, testid }) {
  const { t } = useLang();
  return (
    <select data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} bg-white`}>
      <option value="">{t("cat_choose_category")}</option>
      {cats.map((c) => <option key={c.id} value={c.id}>{c.label} ({t(POS_KEY[c.position])})</option>)}
    </select>
  );
}

function CatalogEditor({ item, cats, onClose, onSaved }) {
  const { t } = useLang();
  const isNew = !item.id;
  const [f, setF] = useState({
    name: item.name || "", code: item.code || "", category_id: cats.some((c) => c.id === item.category_id) ? item.category_id : "",
    garment_type: item.garment_type || "", description: item.description || "", keywords: item.keywords || "",
  });
  const [image, setImage] = useState(""); // new photo only; editing keeps the old one otherwise
  const [cam, setCam] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { setImage(await fileToSquareJpeg(file)); } catch (err) { toast.error(err.message); }
  };

  const save = async () => {
    if (!f.name.trim()) { toast.error(t("cat_name_required")); return; }
    if (!f.category_id) { toast.error(t("cat_category_required")); return; }
    if (isNew && !image) { toast.error(t("cat_photo_required")); return; }
    setSaving(true);
    try {
      const body = { ...f, image };
      if (isNew) await api.post("/catalog", body); else await api.put(`/catalog/${item.id}`, body);
      toast.success(t("cat_saved"));
      onSaved();
    } catch (e) { toast.error(apiErr(e)); setSaving(false); }
  };

  const del = async () => {
    if (!window.confirm(`${t("cat_delete_q")} "${item.name}"?`)) return;
    try { await api.delete(`/catalog/${item.id}`); toast.success(t("cat_deleted")); onSaved(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  if (cam) return <Camera mode="fabric" onCapture={(img) => { setImage(img); setCam(false); }} onClose={() => setCam(false)} />;

  const preview = image || (item.id ? thumbUrl(item) : "");
  const styles = cats.find((c) => c.id === f.category_id)?.items || [];

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={onClose}>
      <div data-testid="catalog-editor" onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[94vh] flex flex-col animate-in slide-in-from-bottom-8 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">{isNew ? t("cat_add") : t("cat_edit")}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 text-gray-500"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="catalog-file-input" />
          <div className="flex items-center gap-4">
            {preview
              ? <img src={preview} alt="" className="w-28 h-28 rounded-xl object-cover border" />
              : <button onClick={() => setCam(true)} className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 flex flex-col items-center justify-center gap-1 text-xs"><CamIcon size={24} />{t("cat_photo")}</button>}
            <div className="flex flex-col gap-2">
              <button data-testid="catalog-camera-btn" onClick={() => setCam(true)} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2 text-gray-700"><CamIcon size={16} /> {t("cat_camera")}</button>
              <button data-testid="catalog-gallery-btn" onClick={() => fileRef.current?.click()} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2 text-gray-700"><ImagePlus size={16} /> {t("cat_gallery")}</button>
            </div>
          </div>

          <Field label={`${t("cat_name")} *`}>
            <input data-testid="catalog-name" value={f.name} onChange={set("name")} placeholder="e.g. Royal Blue Linen" className={inputCls} />
          </Field>
          <Field label={t("cat_code")} hint={t("cat_code_hint")}>
            <input data-testid="catalog-code" value={f.code} onChange={set("code")} placeholder="e.g. SF-102" autoCapitalize="characters" className={`${inputCls} font-mono uppercase placeholder:normal-case placeholder:font-sans`} />
          </Field>
          <Field label={`${t("cat_category")} *`} hint={t("cat_category_hint")}>
            <CategorySelect testid="catalog-category" cats={cats} value={f.category_id}
              onChange={(v) => setF({ ...f, category_id: v, garment_type: "" })} />
          </Field>
          <Field label={t("cat_style")} hint={t("cat_style_hint")}>
            <select data-testid="catalog-style" value={f.garment_type} onChange={set("garment_type")} disabled={!f.category_id}
              className={`${inputCls} bg-white disabled:bg-gray-50 disabled:text-gray-400`}>
              <option value="">{f.category_id ? t("cat_style_none") : t("cat_style_pick_cat")}</option>
              {styles.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </Field>
          <Field label={t("cat_desc")}>
            <textarea data-testid="catalog-description" rows={3} value={f.description} onChange={set("description")} placeholder={t("cat_desc_ph")} className={inputCls} />
          </Field>
          <Field label={t("cat_keywords")} hint={t("cat_keywords_hint")}>
            <input data-testid="catalog-keywords" value={f.keywords} onChange={set("keywords")} placeholder="e.g. navy wedding summer raymond" className={inputCls} />
          </Field>
        </div>

        <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
          {!isNew && <button data-testid="catalog-delete" onClick={del} aria-label={t("remove")} className="px-3 rounded-lg border text-red-500"><Trash2 size={18} /></button>}
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border">{t("cancel")}</button>
          <button data-testid="catalog-save" onClick={save} disabled={saving} className="flex-1 bg-brand-700 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 size={16} className="animate-spin" />} {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
