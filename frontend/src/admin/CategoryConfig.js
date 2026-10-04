import React, { useEffect, useMemo, useState } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, Layers, Loader2 } from "lucide-react";
import { singleCategories, SLOT_ORDER } from "@/lib/catalog";

const POS_KEY = { top: "pos_top", bottom: "pos_bottom", third: "pos_third" };
const inputCls = "mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base sm:text-sm outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15";

async function run(action, okMsg) {
  try { await action(); if (okMsg) toast.success(okMsg); return true; }
  catch (e) { toast.error(apiErr(e)); return false; }
}

// Where a category is worn, drawn as bars: top, bottom, outer layer.
function PosIcon({ positions, size = 40 }) {
  return (
    <span style={{ width: size, height: size }} className="shrink-0 rounded-xl bg-brand-50 flex flex-col items-center justify-center gap-1">
      {positions.map((p, i) => (
        <span key={i} className={`block h-1.5 rounded-full bg-brand-700 ${p === "third" ? "w-6 opacity-40" : p === "bottom" ? "w-3.5 opacity-70" : "w-5"}`} />
      ))}
      {positions.length === 0 && <Layers size={16} className="text-brand-700/50" />}
    </span>
  );
}

// Settings -> Catalog -> Configuration. Two kinds of try-on category:
// a category (styles, one photo) and a group of categories (one photo each).
export default function CategoryConfig() {
  const { t } = useLang();
  const [cats, setCats] = useState(null);
  const [catSheet, setCatSheet] = useState(null); // { cat? }  new when cat is missing
  const [styleSheet, setStyleSheet] = useState(null); // { cat, idx, label, description }
  const [memberSheet, setMemberSheet] = useState(null); // group

  const load = () => api.get("/config/categories").then((r) => setCats(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const byId = useMemo(() => new Map((cats || []).map((c) => [c.id, c])), [cats]);
  const singles = useMemo(() => singleCategories(cats || []), [cats]);
  const groups = useMemo(() => (cats || []).filter((c) => c.kind === "group"), [cats]);

  const save = (cat, patch, okMsg) => run(() => api.put(`/config/categories/${cat.id}`, {
    label: cat.label, description: cat.description || "", kind: cat.kind, position: cat.position || "top",
    items: cat.items || [], members: cat.members || [], order: cat.order || 0, ...patch,
  }), okMsg).then((ok) => { if (ok) load(); return ok; });

  const delCat = async (c) => {
    if (!window.confirm(`${t("cfg_delete_q")} "${c.label}"?`)) return;
    if (await run(() => api.delete(`/config/categories/${c.id}`), t("cat_deleted"))) load();
  };
  const delStyle = (cat, idx) => {
    if (!window.confirm(`${t("cfg_remove_style_q")} "${cat.items[idx].label}"?`)) return;
    save(cat, { items: cat.items.filter((_, i) => i !== idx) });
  };
  const removeMember = (g, id) => save(g, { members: g.members.filter((m) => m !== id) });

  if (cats === null) return <p className="py-10 text-center"><Loader2 className="inline animate-spin text-gray-400" /></p>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-semibold text-gray-900 text-[17px]">{t("cfg_categories")}</h3>
          <button data-testid="add-category-btn" onClick={() => setCatSheet({})}
            className="flex items-center gap-1.5 h-10 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-xl px-3.5 font-medium shrink-0"><Plus size={16} /> {t("cfg_new_category")}</button>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t("cfg_intro")}</p>

        <div className="space-y-3">
          {singles.map((c) => (
            <div key={c.id} data-testid={`category-${c.label}`} className="bg-white border rounded-2xl p-3">
              <CardHead positions={[c.position]} title={c.label}
                sub={`${t(POS_KEY[c.position])} · 1 ${t("nt_photo_1")} · ${(c.items || []).length} ${t("cfg_styles")}`}
                onEdit={() => setCatSheet({ cat: c })} onDelete={() => delCat(c)} />
              {(c.items || []).length > 0 && (
                <div className="mt-3 divide-y border rounded-xl">
                  {c.items.map((it, i) => (
                    <div key={it.label} className="flex items-start gap-2 pl-3 pr-1.5 py-2">
                      <button data-testid={`edit-style-${it.label}`} onClick={() => setStyleSheet({ cat: c, idx: i, label: it.label, description: it.description || "" })} className="flex-1 min-w-0 text-left">
                        <span className="block text-sm font-medium text-gray-900">{it.label}</span>
                        <span className="text-xs text-gray-400 line-clamp-1">{it.description || t("cfg_no_ai_desc")}</span>
                      </button>
                      <button onClick={() => delStyle(c, i)} aria-label={t("remove")} className="p-1.5 text-gray-300 hover:text-red-500"><X size={15} /></button>
                    </div>
                  ))}
                </div>
              )}
              <button data-testid={`add-style-${c.label}`} onClick={() => setStyleSheet({ cat: c, idx: -1, label: "", description: "" })}
                className="mt-2.5 flex items-center gap-1 text-xs font-medium text-brand-700 border border-dashed border-brand-700/40 rounded-full px-3 py-1.5"><Plus size={13} /> {t("cfg_add_style")}</button>
            </div>
          ))}
        </div>

        {groups.length > 0 && <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-6 mb-2">{t("cfg_groups")}</p>}
        <div className="space-y-3">
          {groups.map((g) => {
            const members = (g.members || []).map((m) => byId.get(m)).filter(Boolean);
            return (
              <div key={g.id} data-testid={`category-${g.label}`} className="bg-white border rounded-2xl p-3">
                <CardHead positions={members.map((m) => m.position)} title={g.label} badge={t("cfg_group")}
                  sub={members.length ? `${members.length} ${members.length === 1 ? t("nt_photo_1") : t("nt_photos")} · ${members.map((m) => m.label).join(" + ")}` : t("cfg_group_empty")}
                  onEdit={() => setCatSheet({ cat: g })} onDelete={() => delCat(g)} />
                {members.length > 0 && (
                  <div className="mt-3 divide-y border rounded-xl">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center gap-2.5 pl-2.5 pr-1.5 py-2">
                        <PosIcon positions={[m.position]} size={30} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-900">{m.label}</span>
                          <span className="block text-xs text-gray-400 truncate">{(m.items || []).map((s) => s.label).join(", ") || t("nt_no_styles")}</span>
                        </span>
                        <button onClick={() => removeMember(g, m.id)} aria-label={t("remove")} className="p-1.5 text-gray-300 hover:text-red-500"><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {members.length < SLOT_ORDER.length && (
                  <button data-testid={`add-member-${g.label}`} onClick={() => setMemberSheet(g)}
                    className="mt-2.5 flex items-center gap-1 text-xs font-medium text-brand-700 border border-dashed border-brand-700/40 rounded-full px-3 py-1.5"><Plus size={13} /> {t("cfg_add_category")}</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {catSheet && <CategorySheet cat={catSheet.cat} count={cats.length} onClose={() => setCatSheet(null)} onSaved={() => { setCatSheet(null); load(); }} save={save} />}
      {styleSheet && <StyleSheet s={styleSheet} onClose={() => setStyleSheet(null)} save={save} onSaved={() => setStyleSheet(null)} />}
      {memberSheet && (
        <MemberSheet group={memberSheet} singles={singles} byId={byId} onClose={() => setMemberSheet(null)}
          onPick={async (id) => { if (await save(memberSheet, { members: [...memberSheet.members, id] })) setMemberSheet(null); }} />
      )}
    </div>
  );
}

function CardHead({ positions, title, sub, badge, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-3">
      <PosIcon positions={positions} />
      <div className="flex-1 min-w-0">
        <p className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-gray-900 truncate">{title}</span>
          {badge && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-brand-700 bg-brand-700/10 rounded px-1.5 py-0.5">{badge}</span>}
        </p>
        <p className="text-xs text-gray-500 truncate">{sub}</p>
      </div>
      <button onClick={onEdit} aria-label="Edit" className="p-2 text-gray-400 hover:text-brand-700"><Pencil size={16} /></button>
      <button onClick={onDelete} aria-label="Delete" className="p-2 -mr-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
    </div>
  );
}

function Sheet({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center animate-in fade-in duration-150" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col animate-in slide-in-from-bottom-8 duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 text-gray-500"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">{children}</div>
        {footer && <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}

function Segmented({ value, options, onChange, testid }) {
  return (
    <div data-testid={testid} className="mt-1 grid gap-1 p-1 bg-gray-100 rounded-xl" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`py-2 px-2 rounded-lg text-sm transition-colors ${value === o.value ? "bg-white shadow-sm font-semibold text-brand-700" : "text-gray-600"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CategorySheet({ cat, count, onClose, onSaved, save }) {
  const { t } = useLang();
  const isNew = !cat;
  const [f, setF] = useState({ label: cat?.label || "", description: cat?.description || "", kind: cat?.kind || "single", position: cat?.position || "top" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.label.trim()) { toast.error(t("cfg_name_required")); return; }
    setBusy(true);
    const ok = isNew
      ? await run(() => api.post("/config/categories", { ...f, items: [], members: [], order: count + 1 }), t("cat_saved"))
      : await save(cat, f, t("cat_saved"));
    setBusy(false);
    if (ok) onSaved();
  };
  return (
    <Sheet title={isNew ? t("cfg_new_category") : t("cfg_edit_category")} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border">{t("cancel")}</button>
        <button data-testid="save-category" onClick={submit} disabled={busy} className="flex-1 bg-brand-700 text-white py-2.5 rounded-lg font-medium disabled:opacity-60">{t("save")}</button>
      </>}>
      {isNew && (
        <label className="block">
          <span className="text-xs text-gray-500 uppercase tracking-wider">{t("cfg_type")}</span>
          <Segmented testid="category-kind" value={f.kind} onChange={(kind) => setF({ ...f, kind })}
            options={[{ value: "single", label: t("cfg_type_single") }, { value: "group", label: t("cfg_type_group") }]} />
          <span className="block text-xs text-gray-400 mt-1.5">{f.kind === "single" ? t("cfg_type_single_hint") : t("cfg_type_group_hint")}</span>
        </label>
      )}
      <label className="block">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("cat_name")} *</span>
        <input data-testid="category-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })}
          placeholder={f.kind === "group" ? "e.g. Top + Bottom, 3-Piece Suit" : "e.g. Top Wear, Sherwani"} className={inputCls} />
      </label>
      {f.kind === "single" && (
        <label className="block">
          <span className="text-xs text-gray-500 uppercase tracking-wider">{t("cfg_worn_on")}</span>
          <Segmented testid="category-position" value={f.position} onChange={(position) => setF({ ...f, position })}
            options={SLOT_ORDER.map((p) => ({ value: p, label: t(POS_KEY[p]) }))} />
          <span className="block text-xs text-gray-400 mt-1.5">{t("cfg_worn_on_hint")}</span>
        </label>
      )}
      <label className="block">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("cat_desc")}</span>
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("cfg_desc_ph")} className={inputCls} />
      </label>
    </Sheet>
  );
}

function StyleSheet({ s, onClose, save, onSaved }) {
  const { t } = useLang();
  const [label, setLabel] = useState(s.label);
  const [description, setDescription] = useState(s.description);
  const submit = async () => {
    const name = label.trim();
    if (!name) { toast.error(t("cfg_style_required")); return; }
    const item = { label: name, description: description.trim() };
    const items = s.idx === -1 ? [...(s.cat.items || []), item] : s.cat.items.map((it, i) => (i === s.idx ? item : it));
    if (await save(s.cat, { items }, t("cat_saved"))) onSaved();
  };
  return (
    <Sheet title={`${s.idx === -1 ? t("cfg_add_style") : t("cfg_edit_style")} · ${s.cat.label}`} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border">{t("cancel")}</button>
        <button data-testid="save-style" onClick={submit} className="flex-1 bg-brand-700 text-white py-2.5 rounded-lg font-medium">{t("save")}</button>
      </>}>
      <label className="block">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("cfg_style_name")} *</span>
        <input data-testid="style-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Kurta, Trousers" className={inputCls} />
      </label>
      <label className="block">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{t("cfg_ai_desc")}</span>
        <textarea data-testid="style-description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder={t("cfg_ai_desc_ph")} className={inputCls} />
        <span className="block text-xs text-gray-400 mt-1">{t("cfg_ai_desc_hint")}</span>
      </label>
    </Sheet>
  );
}

// Add a category to a group: one per body part.
function MemberSheet({ group, singles, byId, onClose, onPick }) {
  const { t } = useLang();
  const used = new Map(group.members.map((m) => [byId.get(m)?.position, byId.get(m)]));
  const options = singles.filter((c) => !group.members.includes(c.id));
  return (
    <Sheet title={`${t("cfg_add_category")} · ${group.label}`} onClose={onClose}>
      <p className="text-sm text-gray-500 -mt-1">{t("cfg_member_hint")}</p>
      {options.length === 0 && <p className="text-sm text-gray-400 text-center py-6">{t("cfg_no_more_categories")}</p>}
      <div className="space-y-2">
        {options.map((c) => {
          const clash = used.get(c.position);
          return (
            <button key={c.id} data-testid={`member-option-${c.label}`} disabled={!!clash} onClick={() => onPick(c.id)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 text-left active:bg-gray-50 disabled:opacity-45">
              <PosIcon positions={[c.position]} size={36} />
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-gray-900">{c.label}</span>
                <span className="block text-xs text-gray-500 truncate">
                  {clash ? `${t(POS_KEY[c.position])}: ${clash.label} ${t("cfg_already_in")}` : (c.items || []).map((s) => s.label).join(", ") || t("nt_no_styles")}
                </span>
              </span>
              {!clash && <Plus size={18} className="text-brand-700" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
