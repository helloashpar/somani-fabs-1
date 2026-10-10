import React, { createContext, useContext, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, Plus, ChevronUp, ChevronDown, X, Languages, Star, AlertCircle, ChevronRight } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { mediaSrc, pick } from "@/lib/brand";
import { ACTIONS, ICONS } from "@/site/registry";
import { Toggle, inputCls, selectCls } from "@/admin/ui";
import { FACTS, ACTION_FACT } from "@/admin/website/facts";
import { useW } from "@/admin/website/words";

// Inputs for the website builder's section editor. Text a visitor reads can
// have versions in other languages (`<key>_<lang>`), added with "Add in हिंदी".

const LANGS = [{ code: "hi", name: "हिंदी" }];
const areaCls = `${inputCls} h-auto py-2.5 resize-y min-h-[84px]`;

// The shop's details and a way to open them (Shop setup > General), given by
// the builder so any field can point at the exact detail it uses.
export const FactCtx = createContext({ brand: {}, open: () => {}, multi: true });

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Upload a picked image for a website; resolves to its URL.
export async function uploadImage(file) {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Choose a PNG, JPEG or WebP image");
  if (file.size > 10 * 1024 * 1024) throw new Error("Image is too large (max 10 MB)");
  const { data } = await api.post("/websites/images", { image: await readFile(file) });
  return data.url;
}

export function Label({ children, right }) {
  return (
    <div className="flex items-end justify-between gap-2 mb-1.5">
      <span className="text-sm font-medium text-gray-800">{children}</span>
      {right}
    </div>
  );
}

// One shop detail a section shows: what it is now and a button to change it
// in the shop details. Missing ones say what that means on the website.
export function FactRow({ id, hint }) {
  const w = useW();
  const { brand, open } = useContext(FactCtx);
  const f = FACTS[id];
  if (!f) return null;
  const v = f.value(brand, w);
  const I = f.icon;
  return (
    <button type="button" data-testid={`fact-${id}`} onClick={() => open(id)}
      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${v ? "bg-white text-gray-600 ring-1 ring-gray-200" : "bg-amber-100 text-amber-700"}`}><I size={15} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-gray-900">{w(f.label)}</span>
        {v ? <span className="block truncate text-[12.5px] text-gray-600">{v}</span>
          : <span className="block text-[12.5px] text-amber-800">{hint || w("Not added yet, so it is hidden")}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-medium text-brand-700">{v ? w("Change") : w("Add")}<ChevronRight size={14} aria-hidden="true" /></span>
    </button>
  );
}

// Text like "Welcome to {shop_name}" fills in from the shop details: say so
// in words, with what each one shows now.
const VARS = { shop_name: ["Shop name", "shop_name"], short_name: ["Short name", "short_name"], city: ["City", "city"], state: ["State", "state"], owner: ["Firm / Owner name", "legal_name"] };
function VarHint({ value }) {
  const w = useW();
  const { brand } = useContext(FactCtx);
  const found = [...new Set((String(value || "").match(/\{(\w+)\}/g) || []).map((m) => m.slice(1, -1)).filter((k) => VARS[k]))];
  if (!found.length) return null;
  return (
    <p className="mt-1.5 text-[12.5px] text-gray-600">
      {found.map((k, i) => (
        <span key={k}>{i > 0 && " · "}<code className="rounded bg-gray-100 px-1 text-[12px] text-gray-800">{`{${k}}`}</code> {w("shows")} <b className="font-medium text-gray-800">{pick(brand, VARS[k][1], "en") || pick(brand, "shop_name", "en")}</b></span>
      ))}
      <span className="block text-gray-500">{w("Filled in from your shop details.")}</span>
    </p>
  );
}

// Text with optional translations.
export function LangInput({ label, value, values, onChange, area, placeholder, hint, small }) {
  const w = useW();
  // One-language websites have no translations to add.
  const { multi } = useContext(FactCtx);
  const [chosen, setOpen] = useState(() => LANGS.filter((l) => values[`${l.code}`]).map((l) => l.code));
  const open = multi ? chosen : [];
  const left = multi ? LANGS.filter((l) => !open.includes(l.code)) : [];
  const El = area ? "textarea" : "input";
  const cls = area ? areaCls : `${inputCls} ${small ? "!h-11 sm:!h-10 !text-[15px] sm:!text-[14.5px]" : ""}`;
  return (
    <div>
      {label !== undefined && (
        <Label right={left.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => [...o, left[0].code])}
            className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[12.5px] font-medium text-brand-700 hover:bg-brand-50">
            <Languages size={13} aria-hidden="true" /> {w("Add in {lang}", { lang: left[0].name })}
          </button>
        )}>{label}</Label>
      )}
      <El value={value || ""} placeholder={placeholder} rows={area ? 3 : undefined} aria-label={label}
        onChange={(e) => onChange("", e.target.value)} className={cls} />
      <VarHint value={value} />
      {open.map((code) => {
        const l = LANGS.find((x) => x.code === code);
        return (
          <div key={code} className="mt-2 flex items-start gap-2">
            <span className="shrink-0 inline-flex items-center h-10 px-2.5 rounded-xl bg-brand-50 text-brand-800 text-[13px] font-medium" lang={code}>{l.name}</span>
            <El value={values[code] || ""} lang={code} rows={area ? 3 : undefined} autoFocus={!values[code]} placeholder={value || ""}
              aria-label={`${label} (${l.name})`} onChange={(e) => onChange(code, e.target.value)} className={`${cls} ${area ? "" : "!h-10"}`} />
            <button type="button" aria-label={w("Remove {lang}", { lang: l.name })} onClick={() => { setOpen((o) => o.filter((c) => c !== code)); onChange(code, ""); }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-gray-500 hover:bg-gray-100"><X size={16} /></button>
          </div>
        );
      })}
      {hint && <p className="mt-1.5 text-[12.5px] text-gray-600">{hint}</p>}
    </div>
  );
}

export function ImageField({ label, value, onChange, compact }) {
  const w = useW();
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const onFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try { onChange(await uploadImage(f)); } catch (err) { toast.error(err.response ? apiErr(err) : w(err.message)); }
    setBusy(false);
  };
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => input.current.click()} disabled={busy} aria-label={value ? w("Change photo") : w("Add photo")}
          className={`relative ${compact ? "w-16 h-16" : "w-24 h-20"} shrink-0 overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-brand-300 hover:bg-brand-50 grid place-items-center`}>
          {busy ? <Loader2 size={20} className="animate-spin text-brand-700" />
            : value ? <img src={mediaSrc(value)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              : <ImagePlus size={20} className="text-brand-700" />}
        </button>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => input.current.click()} className="h-9 px-3 rounded-xl text-sm font-medium bg-brand-50 text-brand-700 hover:bg-brand-100">{value ? w("Change") : w("Add photo")}</button>
          {value && <button type="button" onClick={() => onChange("")} className="h-9 px-3 rounded-xl text-sm font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1"><Trash2 size={14} /> {w("Remove")}</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} />
      </div>
    </div>
  );
}

export function SwitchRow({ label, hint, checked, onChange }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-2.5">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-[12.5px] text-gray-600">{hint}</span>}
      </span>
      <Toggle label={label} checked={!!checked} onChange={onChange} />
    </div>
  );
}

// A button: what it does (from the shop's details), its words and, for
// "section" / "link", where it goes.
export function CtaField({ label, content, k, set, sections }) {
  const w = useW();
  const action = content[k] || "none";
  const fact = ACTION_FACT[action];
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2.5">
      <Label>{label}</Label>
      <select value={action} onChange={(e) => set(k, e.target.value)} className={`${selectCls} !h-11 sm:!h-10 !text-[15px] sm:!text-[14.5px]`} aria-label={w("What the button does")}>
        {ACTIONS.map((a) => <option key={a.id} value={a.id}>{w(a.label)}</option>)}
      </select>
      {action !== "none" && (
        <LangInput small value={content[`${k}_label`]} values={{ hi: content[`${k}_label_hi`] }} placeholder={w("Empty: words that fit the button")}
          label={w("Words on the button")} onChange={(lang, v) => set(lang ? `${k}_label_${lang}` : `${k}_label`, v)} />
      )}
      {action === "section" && (
        <select value={content[`${k}_link`] || ""} onChange={(e) => set(`${k}_link`, e.target.value)} className={`${selectCls} !h-11 sm:!h-10 !text-[15px] sm:!text-[14.5px]`} aria-label={w("Which section")}>
          <option value="">{w("Choose a section…")}</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{w(s.name)}</option>)}
        </select>
      )}
      {action === "link" && (
        <input value={content[`${k}_link`] || ""} onChange={(e) => set(`${k}_link`, e.target.value)} placeholder="https://..." className={`${inputCls} !h-11 sm:!h-10 !text-[15px] sm:!text-[14.5px]`} aria-label={w("Link")} />
      )}
      {fact && (
        <div className="-mx-1 rounded-xl bg-gray-50 p-1">
          <FactRow id={fact} hint={w("Not added yet, so this button is hidden")} />
        </div>
      )}
    </div>
  );
}

export function IconPicker({ value, onChange }) {
  const w = useW();
  const [open, setOpen] = useState(false);
  const Cur = ICONS[value] || ICONS.sparkles;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-gray-300 text-sm hover:border-gray-400">
        <Cur size={18} className="text-brand-700" /> {w("Icon")} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-7 sm:grid-cols-8 gap-1 rounded-xl border border-gray-200 p-2">
          {Object.entries(ICONS).map(([k, I]) => (
            <button key={k} type="button" title={k} aria-label={k} onClick={() => { onChange(k); setOpen(false); }}
              className={`grid h-10 w-10 place-items-center rounded-lg ${k === value ? "bg-brand-700 text-white" : "text-gray-700 hover:bg-gray-100"}`}><I size={17} /></button>
          ))}
        </div>
      )}
    </div>
  );
}

function Rating({ value, onChange }) {
  const w = useW();
  const n = Number(value) || 5;
  return (
    <div>
      <Label>{w("Stars")}</Label>
      <div className="flex gap-1" role="radiogroup" aria-label={w("Stars")}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={n === i} aria-label={`${i}`} onClick={() => onChange(i)} className="grid h-10 w-10 place-items-center text-amber-500">
            <Star size={22} fill={i <= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
    </div>
  );
}

// One field of a section or of an item.
export function FieldInput({ f, obj, set, sections }) {
  const w = useW();
  const v = obj[f.key];
  const label = w(f.label);
  switch (f.kind) {
    case "image": return <ImageField label={label} value={v} onChange={(x) => set(f.key, x)} compact />;
    case "toggle": return <SwitchRow label={label} checked={f.defaultOn ? v !== false : v} onChange={(x) => set(f.key, x)} />;
    case "cta": return <CtaField label={label} content={obj} k={f.key} set={set} sections={sections} />;
    case "icon": return <IconPicker value={v} onChange={(x) => set(f.key, x)} />;
    case "rating": return <Rating value={v} onChange={(x) => set(f.key, x)} />;
    case "area":
    case "text":
      if (f.lang === false) {
        return (
          <div>
            <Label>{label}</Label>
            <input value={v || ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={`${inputCls} !h-11 sm:!h-10 !text-[15px] sm:!text-[14.5px]`} aria-label={label} />
          </div>
        );
      }
      return (
        <LangInput label={label} area={f.kind === "area"} small value={v} values={{ hi: obj[`${f.key}_hi`] }} placeholder={f.placeholder}
          onChange={(lang, x) => set(lang ? `${f.key}_${lang}` : f.key, x)} />
      );
    default: return null;
  }
}

// A list of cards / photos / reviews: add, remove, reorder, edit each.
export function ItemsEditor({ f, items, onChange, sections }) {
  const w = useW();
  const [open, setOpen] = useState(0);
  const max = f.max || 24;
  const setItem = (i, k, v) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(j);
  };
  const label = w(f.label);
  const title = (it, i) => it.title || it.name || it.q || it.caption || it.value || it.year || it.quote || `${label} ${i + 1}`;
  return (
    <div>
      <Label>{label} <span className="font-normal text-gray-500">({items.length}/{max})</span></Label>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className={`rounded-xl border bg-white ${open === i ? "border-brand-200" : "border-gray-200"}`}>
            <div className="flex items-center gap-1 pl-3 pr-1">
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} className="flex-1 min-w-0 truncate py-3 text-left text-sm font-medium text-gray-900">
                {it.image && <img src={mediaSrc(it.image)} alt="" className="mr-2 inline-block h-6 w-6 rounded object-cover align-middle" />}{String(title(it, i)).slice(0, 48)}
              </button>
              <button type="button" aria-label={w("Move up")} disabled={i === 0} onClick={() => move(i, -1)} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronUp size={16} /></button>
              <button type="button" aria-label={w("Move down")} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"><ChevronDown size={16} /></button>
              <button type="button" aria-label={w("Remove")} onClick={() => onChange(items.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
            </div>
            {open === i && (
              <div className="space-y-3 border-t border-gray-100 p-3">
                {f.fields.map((ff) => <FieldInput key={ff.key} f={ff} obj={it} set={(k, v) => setItem(i, k, v)} sections={sections} />)}
              </div>
            )}
          </div>
        ))}
      </div>
      {items.length < max ? (
        <button type="button" onClick={() => { onChange([...items, {}]); setOpen(items.length); }}
          className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"><Plus size={15} /> {w("Add one more")}</button>
      ) : <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-gray-600"><AlertCircle size={14} /> {w("That's the most this section can show.")}</p>}
    </div>
  );
}
