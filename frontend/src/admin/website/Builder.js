import { createPortal } from "react-dom";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Monitor, Tablet, Smartphone, Undo2, Redo2, History, Save, Rocket, Plus, Eye, EyeOff, GripVertical,
  ChevronRight, ChevronLeft, Copy, Trash2, Layers, Palette, Settings2, Check, ExternalLink, Loader2, Sun, Moon, Wand2,
} from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import { SECTIONS, GROUPS, TONES, newSection, newId, fieldsFor, prune } from "@/site/registry";
import { PALETTES, FONTS, RADII, BUTTONS, DENSITIES, TEXTURES, MOTIONS, LOOKS, resolveTheme, loadAllFonts } from "@/site/theme";
import { Button, Segmented, Sheet, inputCls } from "@/admin/ui";
import Frame from "@/admin/website/Frame";
import { FieldInput, ItemsEditor, LangInput, SwitchRow, Label, uploadImage } from "@/admin/website/fields";

// The website builder: a full-screen editor with the live preview on the
// right and the panel on the left (Sections, Design, Settings). Text can also
// be typed straight into the preview, photos changed by clicking them, and
// the selected section moved, re-laid-out, copied or removed from its toolbar.
// Every choice is from the design system, so nothing here costs per edit.

const clone = (x) => JSON.parse(JSON.stringify(x));
const HISTORY = 60;

function useHistory(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const set = useCallback((fn, merge) => setState((s) => {
    const next = typeof fn === "function" ? fn(s.present) : fn;
    if (next === s.present) return s;
    // Typing in one field merges into one undo step.
    if (merge && s.lastMerge === merge) return { ...s, present: next };
    return { past: [...s.past, s.present].slice(-HISTORY), present: next, future: [], lastMerge: merge };
  }), []);
  const undo = useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback((v) => setState({ past: [], present: v, future: [] }), []);
  return { config: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export default function Builder({ site, live, onClose, onSaved, onPublished }) {
  const brand = useBrand();
  const { config, set, undo, redo, reset, canUndo, canRedo } = useHistory(clone(site.config));
  const [saved, setSaved] = useState(() => JSON.stringify(site.config));
  const [name, setName] = useState(site.name);
  const [savedName, setSavedName] = useState(site.name);
  const [selected, setSelected] = useState(null);
  const [scrollTo, setScrollTo] = useState(null);
  const [tab, setTab] = useState("sections");
  const [device, setDevice] = useState(() => (window.innerWidth < 1024 ? "phone" : "desktop"));
  const [lang, setLang] = useState("en");
  const [mobileView, setMobileView] = useState("preview");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [versions, setVersions] = useState(false);
  const [isLive, setIsLive] = useState(live);
  const picker = useRef(null);
  const pickTarget = useRef(null);

  const dirty = JSON.stringify(config) !== saved || name !== savedName;

  // ----- Editing helpers -----
  const updateSection = useCallback((id, fn, merge) => set((c) => ({
    ...c, sections: c.sections.map((s) => (s.id === id ? fn(s) : s)),
  }), merge), [set]);
  const setContent = useCallback((id, key, value, merge) => updateSection(id, (s) => ({ ...s, content: prune({ ...s.content, [key]: value }) }), merge), [updateSection]);
  const setItemField = useCallback((id, list, item, key, value) => updateSection(id, (s) => {
    const items = [...(s.content[list] || [])];
    items[item] = { ...(items[item] || {}), [key]: value };
    return { ...s, content: { ...s.content, [list]: items } };
  }), [updateSection]);
  const setTheme = (patch) => set((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
  const setSettings = (patch, merge) => set((c) => ({ ...c, settings: { ...c.settings, ...patch } }), merge);

  const sectionAction = useCallback((id, action) => {
    set((c) => {
      const i = c.sections.findIndex((s) => s.id === id);
      if (i < 0) return c;
      const list = [...c.sections];
      const s = list[i];
      if (action === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      else if (action === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      else if (action === "variant") {
        const vs = SECTIONS[s.type].variants;
        const at = vs.findIndex((v) => v.id === s.variant);
        list[i] = { ...s, variant: vs[(at + 1) % vs.length].id };
      } else if (action === "duplicate") list.splice(i + 1, 0, { ...clone(s), id: newId(s.type) });
      else if (action === "hide") list[i] = { ...s, hidden: !s.hidden };
      else if (action === "delete") list.splice(i, 1);
      else return c;
      return { ...c, sections: list };
    });
    if (action === "delete") setSelected(null);
    if (action === "hide") setSelected(null);
  }, [set]);

  const addSection = (type) => {
    const s = newSection(type);
    set((c) => {
      const list = [...c.sections];
      const at = selected ? list.findIndex((x) => x.id === selected) + 1 : list.findIndex((x) => x.type === "footer");
      list.splice(at < 0 ? list.length : at, 0, s);
      return { ...c, sections: list };
    });
    setAdding(false);
    setSelected(s.id);
    setScrollTo({ id: s.id, t: Date.now() });
  };

  const select = (id) => { setSelected(id); setTab("sections"); if (id) setScrollTo({ id, t: Date.now() }); };

  // ----- Messages from the preview -----
  const onMessage = useCallback((m) => {
    if (m.type === "select") { setSelected(m.id); if (m.id) setTab("sections"); }
    else if (m.type === "edit") {
      if (m.item !== undefined && m.item !== null) setItemField(m.id, m.list || "items", m.item, m.key, m.value);
      else setContent(m.id, m.key, m.value);
    } else if (m.type === "image") { pickTarget.current = m; picker.current.click(); }
    else if (m.type === "action") sectionAction(m.id, m.action);
    else if (m.type === "lang") setLang(m.lang);
  }, [setContent, setItemField, sectionAction]);

  const onPickedImage = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    const t = pickTarget.current;
    if (!f || !t) return;
    const id = toast.loading("Uploading photo…");
    try {
      const url = await uploadImage(f);
      if (t.item !== undefined && t.item !== null) setItemField(t.id, t.list || "items", t.item, t.key, url);
      else setContent(t.id, t.key, url);
      toast.success("Photo added", { id });
    } catch (err) { toast.error(err.response ? apiErr(err) : err.message, { id }); }
  };

  const payload = useMemo(() => ({ config, brand, lang, selected, editing: true }), [config, brand, lang, selected]);

  // ----- Save / publish -----
  const save = useCallback(async () => {
    if (!name.trim()) { toast.error("Give the website a name"); return false; }
    setSaving(true);
    try {
      const { data } = await api.put(`/websites/${site.id}`, { name, config });
      setSaved(JSON.stringify(data.config));
      setSavedName(data.name);
      onSaved(data);
      toast.success("Saved");
      setSaving(false);
      return true;
    } catch (e) { toast.error(apiErr(e)); setSaving(false); return false; }
  }, [name, config, site.id, onSaved]);

  const publish = async () => {
    if (dirty && !(await save())) return;
    try {
      await api.post(`/websites/${site.id}/publish`);
      setIsLive(true);
      onPublished(site.id);
      toast.success("This website is now live");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const close = () => {
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
      if (mod && !typing && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    };
    const onLeave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [save, undo, redo, dirty]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const current = config.sections.find((s) => s.id === selected);
  const sectionOptions = config.sections.filter((s) => !s.hidden).map((s) => ({ id: s.id, name: SECTIONS[s.type] ? SECTIONS[s.type].name : s.type }));

  const panel = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 border-b border-gray-200 p-2">
        {[["sections", Layers, "Sections"], ["design", Palette, "Design"], ["settings", Settings2, "Settings"]].map(([id, I, label]) => (
          <button key={id} type="button" data-testid={`wb-tab-${id}`} onClick={() => { setTab(id); if (id !== "sections") setSelected(null); }}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-medium ${tab === id ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"}`}>
            <I size={16} /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tab === "sections" && !current && (
          <SectionList config={config} set={set} onSelect={select} onAdd={() => setAdding(true)} onToggle={(id) => sectionAction(id, "hide")} />
        )}
        {tab === "sections" && current && (
          <SectionEditor key={current.id} section={current} sections={sectionOptions} onBack={() => setSelected(null)}
            setContent={(k, v) => setContent(current.id, k, v, `${current.id}:${k}`)}
            setItems={(list, items) => updateSection(current.id, (s) => ({ ...s, content: { ...s.content, [list]: items } }))}
            setVariant={(v) => updateSection(current.id, (s) => ({ ...s, variant: v }))}
            setTone={(t) => updateSection(current.id, (s) => ({ ...s, style: { ...s.style, tone: t } }))}
            action={(a) => sectionAction(current.id, a)} />
        )}
        {tab === "design" && <DesignPanel theme={config.theme} setTheme={setTheme} brand={brand} />}
        {tab === "settings" && <SettingsPanel name={name} setName={setName} settings={config.settings || {}} setSettings={setSettings} />}
      </div>
    </div>
  );

  // A portal: a transformed parent (page transitions) would break `fixed`.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100 font-admin" data-testid="website-builder">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2 sm:px-3">
        <button type="button" onClick={close} aria-label="Close builder" data-testid="wb-close" className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><ArrowLeft size={19} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">{isLive ? <span className="font-medium text-emerald-700">● Live</span> : "Draft"} · {dirty ? "Unsaved changes" : "All changes saved"}</p>
        </div>
        <div className="hidden items-center gap-0.5 rounded-xl bg-gray-100 p-1 md:flex">
          {[["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]].map(([d, I]) => (
            <button key={d} type="button" aria-label={d} aria-pressed={device === d} onClick={() => setDevice(d)}
              className={`grid h-8 w-9 place-items-center rounded-lg ${device === d ? "bg-white text-brand-700 shadow-card" : "text-gray-500 hover:text-gray-900"}`}><I size={16} /></button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="Preview language">
          {[["en", "EN"], ["hi", "हिं"]].map(([l, label]) => (
            <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
              className={`h-8 rounded-lg px-2.5 text-sm font-semibold ${lang === l ? "bg-white text-brand-700 shadow-card" : "text-gray-500"}`}>{label}</button>
          ))}
        </div>
        <div className="hidden items-center sm:flex">
          <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100 disabled:opacity-30"><Undo2 size={18} /></button>
          <button type="button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100 disabled:opacity-30"><Redo2 size={18} /></button>
          <button type="button" aria-label="Versions" title="Earlier versions" onClick={() => setVersions(true)} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><History size={18} /></button>
          <a href={`/site-preview/${site.id}`} target="_blank" rel="noreferrer" aria-label="Open saved version in a new tab" title="Open saved version in a new tab" className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><ExternalLink size={18} /></a>
        </div>
        <Button data-testid="wb-save" variant="secondary" size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save</Button>
        {!isLive && <Button data-testid="wb-publish" size="sm" icon={Rocket} onClick={publish} className="hidden sm:inline-flex">Make live</Button>}
      </header>

      {/* Phones: switch between the panel and the preview. */}
      <div className="border-b border-gray-200 bg-white p-2 lg:hidden">
        <Segmented value={mobileView} onChange={setMobileView} options={[{ id: "preview", label: "Preview" }, { id: "edit", label: "Edit" }]} />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={`${mobileView === "edit" ? "flex" : "hidden"} w-full flex-col border-r border-gray-200 bg-white lg:flex lg:w-[380px] lg:shrink-0`}>{panel}</aside>
        <main className={`${mobileView === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col p-2 sm:p-4 lg:flex`}>
          <div className={`mx-auto h-full w-full overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-gray-200 ${device === "phone" ? "max-w-[420px]" : device === "tablet" ? "max-w-[860px]" : ""}`}>
            <Frame payload={payload} onMessage={onMessage} device={device} scrollTo={scrollTo} className="h-full w-full" />
          </div>
          <p className="mt-2 hidden text-center text-xs text-gray-500 lg:block">Click any text in the preview to type, any photo to change it, any section to edit it.</p>
        </main>
      </div>

      <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPickedImage} />
      {adding && <AddSection onPick={addSection} onClose={() => setAdding(false)} />}
      {versions && <Versions site={site} onClose={() => setVersions(false)} onRestore={(cfg) => { reset(clone(cfg)); setSaved(JSON.stringify(cfg)); setVersions(false); }} />}
    </div>,
    document.body,
  );
}

// ---------- Sections tab ----------
function SectionList({ config, set, onSelect, onAdd, onToggle }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const drop = (to) => {
    if (drag === null || drag === to) return;
    set((c) => {
      const list = [...c.sections];
      const [s] = list.splice(drag, 1);
      list.splice(to, 0, s);
      return { ...c, sections: list };
    });
    setDrag(null); setOver(null);
  };
  return (
    <div className="p-3">
      <p className="px-1 pb-2 text-[13px] text-gray-600">Drag to reorder. Tap a section to edit it.</p>
      <ul className="space-y-1.5">
        {config.sections.map((s, i) => {
          const def = SECTIONS[s.type];
          if (!def) return null;
          const I = def.icon;
          const variant = def.variants.find((v) => v.id === s.variant);
          return (
            <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={() => drop(i)}
              className={`group flex items-center gap-2 rounded-xl border bg-white pr-1 transition ${over === i && drag !== null && drag !== i ? "border-brand-500 ring-2 ring-brand-500/20" : "border-gray-200"} ${s.hidden ? "opacity-55" : ""}`}>
              <span className="cursor-grab pl-2 text-gray-400 active:cursor-grabbing" aria-hidden="true"><GripVertical size={16} /></span>
              <button type="button" data-testid={`wb-section-${s.type}`} onClick={() => onSelect(s.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><I size={16} /></span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">{def.name}</span>
                  <span className="block truncate text-xs text-gray-500">{variant ? variant.name : s.variant}{s.hidden ? " · hidden" : ""}</span>
                </span>
              </button>
              <button type="button" aria-label={s.hidden ? "Show" : "Hide"} onClick={() => onToggle(s.id)} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100">{s.hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              <ChevronRight size={16} className="text-gray-400" />
            </li>
          );
        })}
      </ul>
      <Button data-testid="wb-add-section" variant="soft" icon={Plus} full className="mt-3" onClick={onAdd}>Add section</Button>
    </div>
  );
}

function SectionEditor({ section, sections, onBack, setContent, setItems, setVariant, setTone, action }) {
  const def = SECTIONS[section.type];
  const tone = (section.style && section.style.tone) || def.tone;
  const fields = fieldsFor(section);
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back to sections" className="grid h-9 w-9 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><ChevronLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{def.name}</p>
          <p className="truncate text-xs text-gray-500">{def.desc}</p>
        </div>
        <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => action("duplicate")} className="grid h-9 w-9 place-items-center rounded-xl text-gray-600 hover:bg-gray-100"><Copy size={16} /></button>
        <button type="button" aria-label="Delete" title="Delete" onClick={() => action("delete")} className="grid h-9 w-9 place-items-center rounded-xl text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
      </div>
      <div className="space-y-5">
        {def.variants.length > 1 && (
          <div>
            <Label>Layout</Label>
            <div className="grid grid-cols-2 gap-2">
              {def.variants.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariant(v.id)} aria-pressed={section.variant === v.id}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-medium transition ${section.variant === v.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                  <LayoutGlyph type={section.type} variant={v.id} /> {v.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Label>Background</Label>
          <div className="grid grid-cols-4 gap-2">
            {TONES.map((t) => (
              <button key={t.id} type="button" onClick={() => setTone(t.id)} aria-pressed={tone === t.id}
                className={`rounded-xl border-2 p-1.5 text-xs font-medium ${tone === t.id ? "border-brand-600 text-brand-800" : "border-gray-200 text-gray-600"}`}>
                <span className={`mb-1 block h-6 rounded-lg ${{ page: "bg-white ring-1 ring-gray-200", tint: "bg-amber-100", brand: "bg-brand-700", dark: "bg-gray-900" }[t.id]}`} />
                {t.name}
              </button>
            ))}
          </div>
        </div>
        {fields.map((f) => (f.kind === "items"
          ? <ItemsEditor key={f.key} f={f} items={section.content[f.key] || []} onChange={(items) => setItems(f.key, items)} sections={sections} />
          : <FieldInput key={f.key} f={f} obj={section.content} set={setContent} sections={sections} />))}
        <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-600">
          Tip: use <b>{"{shop_name}"}</b>, <b>{"{city}"}</b> or <b>{"{owner}"}</b> in any text; they fill in from Shop setup › General.
        </p>
      </div>
    </div>
  );
}

// A tiny drawing of a layout, so options are recognisable at a glance.
function LayoutGlyph({ type, variant }) {
  const k = `${type}:${variant}`;
  const box = "fill-current opacity-25";
  const ink = "fill-current";
  const shapes = {
    "hero:split": <><rect x="2" y="5" width="11" height="2" className={ink} /><rect x="2" y="9" width="8" height="1.5" className={box} /><rect x="16" y="3" width="10" height="14" rx="1.5" className={box} /></>,
    "hero:fullbleed": <><rect x="1" y="1" width="26" height="18" rx="1.5" className={box} /><rect x="3" y="12" width="12" height="2" className={ink} /></>,
    "hero:centered": <><rect x="7" y="4" width="14" height="2" className={ink} /><rect x="9" y="8" width="10" height="1.5" className={box} /><rect x="3" y="12" width="22" height="6" rx="1.5" className={box} /></>,
    "hero:collage": <><rect x="2" y="7" width="10" height="2" className={ink} /><rect x="14" y="2" width="6" height="16" rx="1" className={box} /><rect x="21" y="2" width="5" height="7.5" rx="1" className={box} /><rect x="21" y="10.5" width="5" height="7.5" rx="1" className={box} /></>,
    "hero:arch": <><rect x="2" y="7" width="10" height="2" className={ink} /><path d="M15 18V8a5 5 0 0 1 10 0v10z" className={box} /></>,
    "hero:poster": <><rect x="2" y="3" width="24" height="5" className={ink} /><rect x="2" y="11" width="10" height="7" rx="1" className={box} /><rect x="15" y="12" width="10" height="1.5" className={box} /></>,
  };
  const generic = <><rect x="3" y="4" width="22" height="2" className={ink} /><rect x="3" y="9" width="10" height="9" rx="1" className={box} /><rect x="15" y="9" width="10" height="9" rx="1" className={box} /></>;
  return <svg viewBox="0 0 28 20" className="h-5 w-7 shrink-0" aria-hidden="true">{shapes[k] || generic}</svg>;
}

function AddSection({ onPick, onClose }) {
  return (
    <Sheet title="Add a section" subtitle="It goes after the selected section" onClose={onClose} size="lg">
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{g}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(SECTIONS).filter(([, d]) => d.group === g).map(([type, d]) => (
                <button key={type} type="button" data-testid={`wb-add-${type}`} onClick={() => onPick(type)}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><d.icon size={18} /></span>
                  <span><span className="block text-sm font-semibold text-gray-900">{d.name}</span><span className="block text-[13px] text-gray-600">{d.desc}</span></span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- Design tab ----------
function Choice({ on, onClick, children, className = "" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`relative rounded-xl border-2 text-left transition ${on ? "border-brand-600 ring-4 ring-brand-500/10" : "border-gray-200 hover:border-gray-300"} ${className}`}>
      {children}
      {on && <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-700 text-white"><Check size={12} strokeWidth={3} /></span>}
    </button>
  );
}

function DesignPanel({ theme, setTheme, brand }) {
  const t = resolveTheme(theme);
  useEffect(() => { loadAllFonts(); }, []);
  const lookOn = (l) => Object.entries(l.theme).every(([k, v]) => t[k] === v);
  return (
    <div className="space-y-6 p-3">
      <div>
        <Label>Quick looks <span className="font-normal text-gray-500">— one tap sets everything below</span></Label>
        <div className="grid grid-cols-2 gap-2">
          {LOOKS.map((l) => {
            const p = PALETTES.find((x) => x.id === l.theme.palette);
            const f = FONTS.find((x) => x.id === l.theme.font);
            const dark = l.theme.mode === "dark";
            return (
              <Choice key={l.id} on={lookOn(l)} onClick={() => setTheme(l.theme)} className="overflow-hidden">
                <span className="block p-3" style={{ background: dark ? p.night : p.bg, color: dark ? "#F6F1E9" : p.ink }}>
                  <span className="block truncate text-[17px]" style={{ fontFamily: f.head, fontWeight: f.weight }}>{l.name}</span>
                  <span className="mt-2 flex gap-1"><span className="h-3 w-6 rounded-full" style={{ background: p.primary }} /><span className="h-3 w-3 rounded-full" style={{ background: p.accent }} /><span className="h-3 w-3 rounded-full" style={{ background: p.tint }} /></span>
                </span>
              </Choice>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Colours</Label>
        <div className="grid grid-cols-2 gap-2">
          {PALETTES.map((p) => (
            <Choice key={p.id} on={t.palette === p.id} onClick={() => setTheme({ palette: p.id })} className="flex items-center gap-2 p-2">
              <span className="flex -space-x-1.5">{[p.primary, p.accent, p.tint].map((c, i) => <span key={i} className="h-6 w-6 rounded-full ring-2 ring-white" style={{ background: c }} />)}</span>
              <span className="truncate text-[13px] font-medium text-gray-800">{p.name}</span>
            </Choice>
          ))}
        </div>
        <div className="mt-2">
          <Segmented value={t.mode} onChange={(v) => setTheme({ mode: v })} options={[{ id: "light", label: <span className="inline-flex items-center gap-1.5"><Sun size={14} /> Light</span> }, { id: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> Dark</span> }]} />
        </div>
      </div>

      <div>
        <Label>Lettering</Label>
        <div className="space-y-2">
          {FONTS.map((f) => (
            <Choice key={f.id} on={t.font === f.id} onClick={() => setTheme({ font: f.id })} className="block w-full px-3 py-2.5">
              <span className="block truncate text-[22px] leading-tight text-gray-900" style={{ fontFamily: f.head, fontWeight: f.weight, textTransform: f.upper ? "uppercase" : "none" }}>{brand.shop_name}</span>
              <span className="mt-0.5 block text-[13px] text-gray-500" style={{ fontFamily: f.body }}>{f.name} · Aa Bb आप का स्वागत है</span>
            </Choice>
          ))}
        </div>
      </div>

      <div>
        <Label>Corners</Label>
        <div className="grid grid-cols-4 gap-2">
          {RADII.map((r) => (
            <Choice key={r.id} on={t.radius === r.id} onClick={() => setTheme({ radius: r.id })} className="p-2 text-center">
              <span className="mx-auto block h-9 w-9 bg-gray-300" style={{ borderRadius: r.id === "arch" ? "999px 999px 6px 6px" : r.card }} />
              <span className="mt-1 block text-xs font-medium text-gray-700">{r.name}</span>
            </Choice>
          ))}
        </div>
      </div>

      <div>
        <Label>Buttons</Label>
        <div className="grid grid-cols-2 gap-2">
          {BUTTONS.map((b) => {
            const p = t.p;
            const style = {
              solid: { background: p.primary, color: p.onPrimary, borderRadius: 8 },
              pill: { background: p.primary, color: p.onPrimary, borderRadius: 999 },
              outline: { border: `2px solid ${p.primary}`, color: p.primary, borderRadius: 8 },
              pop: { background: p.primary, color: p.onPrimary, border: `2px solid ${p.ink}`, boxShadow: `3px 3px 0 ${p.ink}`, borderRadius: 4 },
            }[b.id];
            return (
              <Choice key={b.id} on={t.buttons === b.id} onClick={() => setTheme({ buttons: b.id })} className="p-3 text-center">
                <span className="inline-block px-3 py-1.5 text-xs font-semibold" style={style}>{b.name}</span>
              </Choice>
            );
          })}
        </div>
      </div>

      <div>
        <Label>Spacing</Label>
        <Segmented value={t.density} onChange={(v) => setTheme({ density: v })} options={DENSITIES.map((d) => ({ id: d.id, label: d.name }))} />
      </div>
      <div>
        <Label>Background pattern <span className="font-normal text-gray-500">(on coloured sections)</span></Label>
        <Segmented fit value={t.texture} onChange={(v) => setTheme({ texture: v })} options={TEXTURES.map((d) => ({ id: d.id, label: d.name }))} />
      </div>
      <div>
        <Label>Animation</Label>
        <Segmented value={t.motion} onChange={(v) => setTheme({ motion: v })} options={MOTIONS.map((d) => ({ id: d.id, label: d.name }))} />
      </div>
      <Shuffle setTheme={setTheme} />
    </div>
  );
}

// "Surprise me": a random, always-valid combination.
function Shuffle({ setTheme }) {
  const any = (list) => list[Math.floor(Math.random() * list.length)].id;
  return (
    <Button variant="secondary" icon={Wand2} full onClick={() => setTheme({
      palette: any(PALETTES), font: any(FONTS), radius: any(RADII), buttons: any(BUTTONS), texture: any(TEXTURES),
    })}>Surprise me</Button>
  );
}

// ---------- Settings tab ----------
function SettingsPanel({ name, setName, settings, setSettings }) {
  return (
    <div className="space-y-4 p-3">
      <div>
        <Label>Website name <span className="font-normal text-gray-500">(only you see it)</span></Label>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={inputCls} aria-label="Website name" />
      </div>
      <SwitchRow label="Floating WhatsApp button" hint="Bottom-right on every screen" checked={settings.whatsapp_button} onChange={(v) => setSettings({ whatsapp_button: v })} />
      <SwitchRow label="Call bar on phones" hint="Call and Directions fixed at the bottom" checked={settings.call_bar} onChange={(v) => setSettings({ call_bar: v })} />
      <SwitchRow label="Language switch" hint="English / हिंदी button in the header" checked={settings.language_switch !== false} onChange={(v) => setSettings({ language_switch: v })} />
      <div>
        <Label>Language visitors see first</Label>
        <Segmented value={settings.default_lang || "en"} onChange={(v) => setSettings({ default_lang: v })} options={[{ id: "en", label: "English" }, { id: "hi", label: "हिंदी" }]} />
      </div>
      <div className="space-y-3 rounded-xl border border-gray-200 p-3">
        <p className="text-sm font-semibold text-gray-900">Google search</p>
        <div>
          <Label>Page title</Label>
          <input value={settings.seo_title || ""} maxLength={70} onChange={(e) => setSettings({ seo_title: e.target.value }, "seo_title")} placeholder="Empty: shop name, city" className={`${inputCls} !h-10 !text-[14.5px]`} aria-label="Page title" />
        </div>
        <LangInput label="Description" area value={settings.seo_description} values={{}} placeholder="One or two lines Google shows under your name"
          onChange={(lang, v) => !lang && setSettings({ seo_description: v }, "seo_description")} />
      </div>
      <p className="rounded-xl bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-600">
        Shop name, logo, address, hours, phones and links come from <b>Shop setup › General</b>. Change them there and every website updates.
      </p>
    </div>
  );
}

function Versions({ site, onClose, onRestore }) {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { api.get(`/websites/${site.id}/history`).then((r) => setList(r.data)).catch((e) => { toast.error(apiErr(e)); setList([]); }); }, [site.id]);
  const restore = async (i) => {
    if (!window.confirm("Go back to this version? Your current saved version is kept in the list.")) return;
    setBusy(i);
    try { const { data } = await api.post(`/websites/${site.id}/restore/${i}`); onRestore(data.config); toast.success("Version restored"); }
    catch (e) { toast.error(apiErr(e)); }
    setBusy(null);
  };
  const fmt = (iso) => { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
  return (
    <Sheet title="Earlier versions" subtitle="Each save keeps the version before it (last 15)" onClose={onClose}>
      {list === null ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-gray-500" /></div>
        : list.length === 0 ? <p className="py-8 text-center text-sm text-gray-600">No earlier versions yet. They appear after you save changes.</p>
          : (
            <ul className="divide-y divide-gray-100">
              {list.map((v) => (
                <li key={v.index} className="flex items-center gap-3 py-3">
                  <span className="flex-1"><span className="block text-sm font-medium text-gray-900">{fmt(v.at)}</span><span className="block text-xs text-gray-500">{v.by || "—"} · {v.sections} sections</span></span>
                  <Button size="sm" variant="secondary" loading={busy === v.index} onClick={() => restore(v.index)}>Restore</Button>
                </li>
              ))}
            </ul>
          )}
    </Sheet>
  );
}
