import { createPortal } from "react-dom";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Monitor, Tablet, Smartphone, Undo2, Redo2, History, Save, Rocket, Plus, Eye, EyeOff, ArrowUp, ArrowDown,
  ChevronLeft, ChevronDown, Copy, Trash2, Layers, Palette, Settings2, Check, ExternalLink, Loader2, Sun, Moon, Wand2,
  Pencil, Store, Globe, Languages,
} from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import { SECTIONS, GROUPS, TONES, newSection, newId, fieldsFor, prune, hasDecor } from "@/site/registry";
import { PALETTES, FONTS, RADII, BUTTONS, DENSITIES, TEXTURES, MOTIONS, LOOKS, resolveTheme, loadAllFonts } from "@/site/theme";
import { Button, Segmented, Sheet, inputCls } from "@/admin/ui";
import Frame from "@/admin/website/Frame";
import { isMultilingual } from "@/site/presets";
import General from "@/admin/General";
import { FieldInput, ItemsEditor, LangInput, SwitchRow, Label, uploadImage, FactCtx, FactRow } from "@/admin/website/fields";
import { FACTS, factsFor, factsForSettings } from "@/admin/website/facts";
import { useW } from "@/admin/website/words";

// The website builder: a full-screen editor for one variation, with the live
// preview on the right and the panel on the left (Sections, Style, Settings).
// Text can also be typed straight into the preview, photos changed by tapping
// them, and the selected section moved, re-laid-out, copied or removed from
// its toolbar. Shop details (name, address, hours, ...) are not typed here:
// tapping one, in the preview or in the panel, opens it in the shop details.
// Every choice is from the design system, so nothing here costs per edit.

const clone = (x) => JSON.parse(JSON.stringify(x));
const HISTORY = 60;
const TONE_NAMES = { page: "Plain", tint: "Soft colour", brand: "Main colour", dark: "Dark" };

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

export default function Builder({ site, live, liveSite, onClose, onSaved, onPublished }) {
  const w = useW();
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
  const [confirmLive, setConfirmLive] = useState(false);
  const [shop, setShop] = useState(null); // the shop detail being changed
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
    if (action === "delete" || action === "hide") setSelected(null);
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
  const openFact = useCallback((id) => { const f = FACTS[id]; if (f) setShop({ id, card: f.card, field: f.field }); }, []);

  // ----- Messages from the preview -----
  const onMessage = useCallback((m) => {
    if (m.type === "select") { setSelected(m.id); if (m.id) setTab("sections"); }
    else if (m.type === "edit") {
      if (m.item !== undefined && m.item !== null) setItemField(m.id, m.list || "items", m.item, m.key, m.value);
      else setContent(m.id, m.key, m.value);
    } else if (m.type === "image") { pickTarget.current = m; picker.current.click(); }
    else if (m.type === "action") sectionAction(m.id, m.action);
    else if (m.type === "lang") setLang(m.lang);
    else if (m.type === "general") openFact(m.field);
  }, [setContent, setItemField, sectionAction, openFact]);

  const onPickedImage = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    const t = pickTarget.current;
    if (!f || !t) return;
    const id = toast.loading(w("Adding photo…"));
    try {
      const url = await uploadImage(f);
      if (t.item !== undefined && t.item !== null) setItemField(t.id, t.list || "items", t.item, t.key, url);
      else setContent(t.id, t.key, url);
      toast.success(w("Photo added"), { id });
    } catch (err) { toast.error(err.response ? apiErr(err) : w(err.message), { id }); }
  };

  // Words of the preview's own buttons, in the app's language.
  const ui = useMemo(() => ({
    addPhoto: w("Add photo"), changePhoto: w("Change photo"), addText: w("Add text"), fromShop: w("From your shop details: tap to change"),
    up: w("Move up"), down: w("Move down"), layout: w("Next layout"), copy: w("Copy"), hide: w("Hide"), remove: w("Delete"),
    empty: w("Add a section from the panel to start."),
    names: Object.fromEntries(Object.entries(SECTIONS).map(([k, d]) => [k, w(d.name)])),
  }), [w]);
  const multi = isMultilingual(config.settings);
  const shownLang = multi ? lang : "en";
  const payload = useMemo(() => ({ config, brand, lang: shownLang, selected, editing: true, ui }), [config, brand, shownLang, selected, ui]);

  // ----- Save / make live -----
  const save = useCallback(async () => {
    if (!name.trim()) { toast.error(w("Give this variation a name")); setTab("settings"); return false; }
    setSaving(true);
    try {
      const { data } = await api.put(`/websites/${site.id}`, { name, config });
      setSaved(JSON.stringify(data.config));
      setSavedName(data.name);
      onSaved(data);
      toast.success(isLive ? w("Saved. Customers see the changes now.") : w("Saved. Only you can see it."));
      setSaving(false);
      return true;
    } catch (e) { toast.error(apiErr(e)); setSaving(false); return false; }
  }, [name, config, site.id, onSaved, isLive, w]);

  const publish = async () => {
    if (dirty && !(await save())) return;
    try {
      await api.post(`/websites/${site.id}/publish`);
      setIsLive(true);
      setConfirmLive(false);
      onPublished(site.id);
      toast.success(w("This variation is live now"));
    } catch (e) { toast.error(apiErr(e)); }
  };

  const close = () => {
    if (dirty && !window.confirm(w("You have changes that are not saved. Leave without saving?"))) return;
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
  const factCtx = useMemo(() => ({ brand, open: openFact, multi }), [brand, openFact, multi]);

  const panel = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 border-b border-gray-200 p-2" role="tablist">
        {[["sections", Layers, w("Sections")], ["design", Palette, w("Style")], ["settings", Settings2, w("Settings")]].map(([id, I, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`wb-tab-${id}`} onClick={() => { setTab(id); if (id !== "sections") setSelected(null); }}
            className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium ${tab === id ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-100"}`}>
            <I size={16} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tab === "sections" && !current && (
          <SectionList config={config} set={set} onSelect={select} onAdd={() => setAdding(true)} onAction={sectionAction} />
        )}
        {tab === "sections" && current && (
          <SectionEditor key={current.id} section={current} sections={sectionOptions} onBack={() => setSelected(null)}
            setContent={(k, v) => setContent(current.id, k, v, `${current.id}:${k}`)}
            setItems={(list, items) => updateSection(current.id, (s) => ({ ...s, content: { ...s.content, [list]: items } }))}
            setVariant={(v) => updateSection(current.id, (s) => ({ ...s, variant: v }))}
            setStyle={(patch) => updateSection(current.id, (s) => ({ ...s, style: { ...s.style, ...patch } }))}
            action={(a) => sectionAction(current.id, a)} />
        )}
        {tab === "design" && <DesignPanel theme={config.theme} setTheme={setTheme} brand={brand} />}
        {tab === "settings" && <SettingsPanel name={name} setName={setName} settings={config.settings || {}} setSettings={setSettings} brand={brand} onVersions={() => setVersions(true)} />}
      </div>
    </div>
  );

  // A portal: a transformed parent (page transitions) would break `fixed`.
  return createPortal(
    <FactCtx.Provider value={factCtx}>
      <div className="fixed inset-0 z-[60] flex flex-col bg-gray-100 font-admin" data-testid="website-builder">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-gray-200 bg-white px-2 sm:gap-2 sm:px-3">
          <button type="button" onClick={close} aria-label={w("Close editor")} data-testid="wb-close" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><ArrowLeft size={19} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-gray-900">{name}</p>
            <p className="truncate text-xs" data-testid="wb-status">
              {isLive
                ? <span className="font-medium text-emerald-700">● {w("Live")}</span>
                : <span className="font-medium text-gray-600">{w("Draft · only you can see it")}</span>}
              <span className={dirty ? "text-amber-700" : "text-gray-500"}> · {dirty ? w("Not saved") : w("Saved")}</span>
            </p>
          </div>
          <div className="hidden items-center gap-0.5 rounded-xl bg-gray-100 p-1 md:flex" role="group" aria-label={w("Screen size")}>
            {[["desktop", Monitor, w("Computer")], ["tablet", Tablet, w("Tablet")], ["phone", Smartphone, w("Phone")]].map(([d, I, label]) => (
              <button key={d} type="button" aria-label={label} title={label} aria-pressed={device === d} onClick={() => setDevice(d)}
                className={`grid h-8 w-9 place-items-center rounded-lg ${device === d ? "bg-white text-brand-700 shadow-card" : "text-gray-500 hover:text-gray-900"}`}><I size={16} /></button>
            ))}
          </div>
          {multi && (
            <div className="flex items-center gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label={w("Website language")} title={w("Website language")}>
              {[["en", "EN"], ["hi", "हिं"]].map(([l, label]) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}
                  className={`h-8 rounded-lg px-2 text-sm font-semibold sm:px-2.5 ${lang === l ? "bg-white text-brand-700 shadow-card" : "text-gray-500"}`}>{label}</button>
              ))}
            </div>
          )}
          <div className="hidden items-center lg:flex">
            <button type="button" aria-label={w("Undo")} title={w("Undo")} disabled={!canUndo} onClick={undo} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100 disabled:opacity-30"><Undo2 size={18} /></button>
            <button type="button" aria-label={w("Redo")} title={w("Redo")} disabled={!canRedo} onClick={redo} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100 disabled:opacity-30"><Redo2 size={18} /></button>
            <button type="button" aria-label={w("Earlier saves")} title={w("Earlier saves")} onClick={() => setVersions(true)} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><History size={18} /></button>
            <a href={`/site-preview/${site.id}`} target="_blank" rel="noreferrer" aria-label={w("Open the saved version in a new tab")} title={w("Open the saved version in a new tab")} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><ExternalLink size={18} /></a>
          </div>
          <Button data-testid="wb-save" variant={isLive ? "primary" : "secondary"} size="sm" icon={Save} loading={saving} disabled={!dirty} onClick={save}>
            <span className="hidden sm:inline">{isLive ? w("Save and update") : w("Save")}</span><span className="sm:hidden">{w("Save")}</span>
          </Button>
          {!isLive && (
            <Button data-testid="wb-publish" size="sm" icon={Rocket} onClick={() => setConfirmLive(true)} aria-label={w("Make live")}>
              <span className="hidden sm:inline">{w("Make live")}</span>
            </Button>
          )}
        </header>

        {/* Phones: switch between the preview and the panel. */}
        <div className="border-b border-gray-200 bg-white p-2 lg:hidden">
          <Segmented value={mobileView} onChange={setMobileView} options={[
            { id: "preview", label: <span className="inline-flex items-center gap-1.5"><Eye size={15} /> {w("Preview")}</span> },
            { id: "edit", label: <span className="inline-flex items-center gap-1.5"><Pencil size={15} /> {w("Edit")}</span> },
          ]} />
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className={`${mobileView === "edit" ? "flex" : "hidden"} w-full flex-col border-r border-gray-200 bg-white lg:flex lg:w-[380px] lg:shrink-0`}>{panel}</aside>
          <main className={`${mobileView === "preview" ? "flex" : "hidden"} min-w-0 flex-1 flex-col p-2 sm:p-4 lg:flex`}>
            <div className={`mx-auto min-h-0 w-full flex-1 overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-gray-200 ${device === "phone" ? "max-w-[420px]" : device === "tablet" ? "max-w-[860px]" : ""}`}>
              <Frame payload={payload} onMessage={onMessage} device={device} scrollTo={scrollTo} className="h-full w-full" />
            </div>
            <p className="mt-2 hidden text-center text-xs text-gray-500 lg:block">
              {w("Tap any text to type, any photo to change it, any section to edit it.")} <span className="ml-1 inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm ring-2 ring-amber-400" /> {w("Shop details: tap to change them for every variation.")}</span>
            </p>
            {/* Phones: undo / redo and a way into the selected section. */}
            <div className="mt-2 flex items-center gap-2 lg:hidden">
              <button type="button" aria-label={w("Undo")} disabled={!canUndo} onClick={undo} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-gray-700 shadow-card disabled:opacity-40"><Undo2 size={18} /></button>
              <button type="button" aria-label={w("Redo")} disabled={!canRedo} onClick={redo} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-gray-700 shadow-card disabled:opacity-40"><Redo2 size={18} /></button>
              <Button full icon={Pencil} variant={current ? "primary" : "secondary"} onClick={() => setMobileView("edit")} data-testid="wb-mobile-edit" className="min-w-0">
                {current ? w("Edit “{name}”", { name: w(SECTIONS[current.type].name) }) : w("Edit sections, style and settings")}
              </Button>
            </div>
          </main>
        </div>

        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPickedImage} />
        {adding && <AddSection onPick={addSection} onClose={() => setAdding(false)} />}
        {versions && <Versions site={site} onClose={() => setVersions(false)} onRestore={(cfg) => { reset(clone(cfg)); setSaved(JSON.stringify(cfg)); setVersions(false); }} />}
        {confirmLive && (
          <Sheet title={w("Make “{name}” live?", { name })} onClose={() => setConfirmLive(false)}
            footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmLive(false)}>{w("Cancel")}</Button><Button icon={Rocket} onClick={publish} data-testid="wb-publish-confirm">{dirty ? w("Save and make live") : w("Make live")}</Button></div>}>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" /> {w("Customers will see this variation on your website right away.")}</li>
              {liveSite && liveSite.id !== site.id && <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" /> {w("“{name}” is kept. You can make it live again any time.", { name: liveSite.kind === "classic" && liveSite.name === "Classic website" ? w("Original website") : liveSite.name })}</li>}
            </ul>
          </Sheet>
        )}
        {shop && (
          <Sheet testid="shop-details-sheet" size="lg" onClose={() => setShop(null)} title={w("Shop details")}
            subtitle={w("“{label}” is part of your shop details. Change it here and every variation, WhatsApp message and the app show the new one.", { label: w(FACTS[shop.id].label) })}>
            <General focus={shop} embedded onSaved={() => setShop(null)} />
          </Sheet>
        )}
      </div>
    </FactCtx.Provider>,
    document.body,
  );
}

// ---------- Sections tab ----------
function SectionList({ config, set, onSelect, onAdd, onAction }) {
  const w = useW();
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
  const count = config.sections.length;
  return (
    <div className="p-3">
      <p className="px-1 pb-2 text-[13px] text-gray-600">{w("Your page, top to bottom. Tap a section to change it, use the arrows to move it.")}</p>
      <ul className="space-y-1.5">
        {config.sections.map((s, i) => {
          const def = SECTIONS[s.type];
          if (!def) return null;
          const I = def.icon;
          const variant = def.variants.find((v) => v.id === s.variant);
          return (
            <li key={s.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={() => drop(i)}
              className={`flex items-center gap-1 rounded-xl border bg-white pr-1 transition ${over === i && drag !== null && drag !== i ? "border-brand-500 ring-2 ring-brand-500/20" : "border-gray-200"} ${s.hidden ? "bg-gray-50" : ""}`}>
              <button type="button" data-testid={`wb-section-${s.type}`} onClick={() => onSelect(s.id)} className="flex min-w-0 flex-1 cursor-grab items-center gap-3 py-2.5 pl-2.5 text-left active:cursor-grabbing">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.hidden ? "bg-gray-100 text-gray-400" : "bg-brand-50 text-brand-700"}`}><I size={17} /></span>
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${s.hidden ? "text-gray-500" : "text-gray-900"}`}>{w(def.name)}</span>
                  <span className="block truncate text-xs text-gray-500">{s.hidden ? w("Hidden from customers") : variant ? w(variant.name) : s.variant}</span>
                </span>
              </button>
              <button type="button" aria-label={w("Move up")} disabled={i === 0} onClick={() => onAction(s.id, "up")} className="grid h-9 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-25"><ArrowUp size={15} /></button>
              <button type="button" aria-label={w("Move down")} disabled={i === count - 1} onClick={() => onAction(s.id, "down")} className="grid h-9 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-25"><ArrowDown size={15} /></button>
              <button type="button" aria-label={s.hidden ? w("Show") : w("Hide")} title={s.hidden ? w("Show") : w("Hide")} onClick={() => onAction(s.id, "hide")} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100">{s.hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </li>
          );
        })}
      </ul>
      <Button data-testid="wb-add-section" variant="soft" icon={Plus} full className="mt-3" onClick={onAdd}>{w("Add a section")}</Button>
    </div>
  );
}

function SectionEditor({ section, sections, onBack, setContent, setItems, setVariant, setStyle, action }) {
  const w = useW();
  const def = SECTIONS[section.type];
  const tone = (section.style && section.style.tone) || def.tone;
  const fields = fieldsFor(section);
  const facts = factsFor(section);
  const decor = hasDecor(section);
  return (
    <div className="p-3">
      <div className="sticky -top-3 z-10 -mx-3 -mt-3 mb-3 flex items-center gap-1 border-b border-gray-100 bg-white px-2 py-2">
        <button type="button" onClick={onBack} aria-label={w("Back to all sections")} className="grid h-10 w-10 place-items-center rounded-xl text-gray-700 hover:bg-gray-100"><ChevronLeft size={19} /></button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{w(def.name)}</p>
          <p className="truncate text-xs text-gray-500">{w(def.desc)}</p>
        </div>
        <button type="button" aria-label={w("Copy")} title={w("Copy")} onClick={() => action("duplicate")} className="grid h-10 w-10 place-items-center rounded-xl text-gray-600 hover:bg-gray-100"><Copy size={16} /></button>
        <button type="button" aria-label={w("Delete")} title={w("Delete")} onClick={() => action("delete")} className="grid h-10 w-10 place-items-center rounded-xl text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
      </div>
      <div className="space-y-6">
        {def.variants.length > 1 && (
          <div>
            <Label>{w("Layout")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {def.variants.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariant(v.id)} aria-pressed={section.variant === v.id}
                  className={`flex min-h-[44px] items-center gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm font-medium transition ${section.variant === v.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                  <LayoutGlyph type={section.type} variant={v.id} /> {w(v.name)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {fields.map((f) => (f.kind === "items"
            ? <ItemsEditor key={f.key} f={f} items={section.content[f.key] || []} onChange={(items) => setItems(f.key, items)} sections={sections} />
            : <FieldInput key={f.key} f={f} obj={section.content} set={setContent} sections={sections} />))}
        </div>

        {facts.length > 0 && (
          <div className="rounded-2xl bg-gray-50 p-2 ring-1 ring-gray-200/70" data-testid="wb-facts">
            <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[13px] font-semibold text-gray-800"><Store size={14} className="text-brand-700" /> {w("Also shows, from your shop details")}</p>
            <p className="px-2.5 pb-1.5 text-[12.5px] text-gray-600">{w("These are the same in every variation. Tap one to change it.")}</p>
            {facts.map((id) => <FactRow key={id} id={id} />)}
          </div>
        )}

        <div>
          <Label>{w("Background colour")}</Label>
          <div className="grid grid-cols-4 gap-2">
            {TONES.map((t) => (
              <button key={t.id} type="button" onClick={() => setStyle({ tone: t.id })} aria-pressed={tone === t.id}
                className={`rounded-xl border-2 p-1.5 text-xs font-medium leading-tight ${tone === t.id ? "border-brand-600 text-brand-800" : "border-gray-200 text-gray-600"}`}>
                <span className={`mb-1 block h-7 rounded-lg ${{ page: "bg-white ring-1 ring-gray-200", tint: "bg-amber-100", brand: "bg-brand-700", dark: "bg-gray-900" }[t.id]}`} />
                {w(TONE_NAMES[t.id] || t.name)}
              </button>
            ))}
          </div>
        </div>
        {decor && (
          <SwitchRow label={w("Soft colour shapes")} hint={w("The blurred colour shapes behind the photo and text")}
            checked={!(section.style && section.style.decor === false)} onChange={(v) => setStyle({ decor: v })} />
        )}
      </div>
    </div>
  );
}

// A tiny drawing of a layout, so options are recognisable at a glance.
export function LayoutGlyph({ type, variant, className = "h-5 w-7" }) {
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
  return <svg viewBox="0 0 28 20" className={`${className} shrink-0`} aria-hidden="true">{shapes[k] || generic}</svg>;
}

function AddSection({ onPick, onClose }) {
  const w = useW();
  return (
    <Sheet title={w("Add a section")} subtitle={w("It goes below the section you have open, or above the bottom bar.")} onClose={onClose} size="lg">
      <div className="space-y-5">
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{w(g)}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(SECTIONS).filter(([, d]) => d.group === g).map(([type, d]) => (
                <button key={type} type="button" data-testid={`wb-add-${type}`} onClick={() => onPick(type)}
                  className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><d.icon size={18} /></span>
                  <span><span className="block text-sm font-semibold text-gray-900">{w(d.name)}</span><span className="block text-[13px] text-gray-600">{w(d.desc)}</span></span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------- Style tab ----------
function Choice({ on, onClick, children, className = "", label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label}
      className={`relative rounded-xl border-2 text-left transition ${on ? "border-brand-600 ring-4 ring-brand-500/10" : "border-gray-200 hover:border-gray-300"} ${className}`}>
      {children}
      {on && <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-brand-700 text-white"><Check size={12} strokeWidth={3} /></span>}
    </button>
  );
}

function DesignPanel({ theme, setTheme, brand }) {
  const w = useW();
  const [more, setMore] = useState(false);
  const t = resolveTheme(theme);
  useEffect(() => { loadAllFonts(); }, []);
  const lookOn = (l) => Object.entries(l.theme).every(([k, v]) => t[k] === v);
  const any = (list) => list[Math.floor(Math.random() * list.length)].id;
  const shuffle = () => setTheme({ palette: any(PALETTES), font: any(FONTS), radius: any(RADII), buttons: any(BUTTONS), texture: any(TEXTURES) });
  return (
    <div className="space-y-6 p-3">
      <div>
        <Label right={<button type="button" onClick={shuffle} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-brand-700 hover:bg-brand-50"><Wand2 size={14} /> {w("Surprise me")}</button>}>
          {w("Ready-made looks")}
        </Label>
        <p className="-mt-0.5 mb-2 text-[12.5px] text-gray-600">{w("One tap changes colours, letters and shapes together.")}</p>
        <div className="grid grid-cols-2 gap-2">
          {LOOKS.map((l) => {
            const p = PALETTES.find((x) => x.id === l.theme.palette);
            const f = FONTS.find((x) => x.id === l.theme.font);
            const dark = l.theme.mode === "dark";
            return (
              <Choice key={l.id} on={lookOn(l)} onClick={() => setTheme(l.theme)} className="overflow-hidden" label={w(l.name)}>
                <span className="block p-3" style={{ background: dark ? p.night : p.bg, color: dark ? "#F6F1E9" : p.ink }}>
                  <span className="block truncate text-[17px]" style={{ fontFamily: f.head, fontWeight: f.weight }}>{w(l.name)}</span>
                  <span className="mt-2 flex gap-1"><span className="h-3 w-6 rounded-full" style={{ background: p.primary }} /><span className="h-3 w-3 rounded-full" style={{ background: p.accent }} /><span className="h-3 w-3 rounded-full" style={{ background: p.tint }} /></span>
                </span>
              </Choice>
            );
          })}
        </div>
      </div>

      <div>
        <Label>{w("Colours")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {PALETTES.map((p) => (
            <Choice key={p.id} on={t.palette === p.id} onClick={() => setTheme({ palette: p.id })} className="flex items-center gap-2 p-2" label={w(p.name)}>
              <span className="flex -space-x-1.5">{[p.primary, p.accent, p.tint].map((c, i) => <span key={i} className="h-6 w-6 rounded-full ring-2 ring-white" style={{ background: c }} />)}</span>
              <span className="truncate text-[13px] font-medium text-gray-800">{w(p.name)}</span>
            </Choice>
          ))}
        </div>
        <div className="mt-2">
          <Segmented value={t.mode} onChange={(v) => setTheme({ mode: v })} options={[{ id: "light", label: <span className="inline-flex items-center gap-1.5"><Sun size={14} /> {w("Light")}</span> }, { id: "dark", label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> {w("Dark")}</span> }]} />
        </div>
      </div>

      <div>
        <Label>{w("Lettering")}</Label>
        <div className="space-y-2">
          {FONTS.map((f) => (
            <Choice key={f.id} on={t.font === f.id} onClick={() => setTheme({ font: f.id })} className="block w-full px-3 py-2.5" label={w(f.name)}>
              <span className="block truncate text-[22px] leading-tight text-gray-900" style={{ fontFamily: f.head, fontWeight: f.weight, textTransform: f.upper ? "uppercase" : "none" }}>{brand.shop_name}</span>
              <span className="mt-0.5 block text-[13px] text-gray-500" style={{ fontFamily: f.body }}>{w(f.name)} · Aa Bb आप का स्वागत है</span>
            </Choice>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200">
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} data-testid="wb-more-style" className="flex min-h-[52px] w-full items-center gap-3 px-3.5 text-left">
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-900">{w("More style choices")}</span><span className="block text-[12.5px] text-gray-600">{w("Corners, buttons, spacing, pattern and movement")}</span></span>
          <ChevronDown size={18} className={`shrink-0 text-gray-400 transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
        {more && (
          <div className="space-y-6 border-t border-gray-100 p-3">
            <div>
              <Label>{w("Corners")}</Label>
              <div className="grid grid-cols-4 gap-2">
                {RADII.map((r) => (
                  <Choice key={r.id} on={t.radius === r.id} onClick={() => setTheme({ radius: r.id })} className="p-2 text-center" label={w(r.name)}>
                    <span className="mx-auto block h-9 w-9 bg-gray-300" style={{ borderRadius: r.id === "arch" ? "999px 999px 6px 6px" : r.card }} />
                    <span className="mt-1 block text-xs font-medium text-gray-700">{w(r.name)}</span>
                  </Choice>
                ))}
              </div>
            </div>
            <div>
              <Label>{w("Buttons")}</Label>
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
                    <Choice key={b.id} on={t.buttons === b.id} onClick={() => setTheme({ buttons: b.id })} className="p-3 text-center" label={w(b.name)}>
                      <span className="inline-block px-3 py-1.5 text-xs font-semibold" style={style}>{w(b.name)}</span>
                    </Choice>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>{w("Space between sections")}</Label>
              <Segmented value={t.density} onChange={(v) => setTheme({ density: v })} options={DENSITIES.map((d) => ({ id: d.id, label: w(d.name) }))} />
            </div>
            <div>
              <Label>{w("Background pattern")}</Label>
              <p className="-mt-0.5 mb-2 text-[12.5px] text-gray-600">{w("Shows on sections with a coloured background.")}</p>
              <Segmented fit value={t.texture} onChange={(v) => setTheme({ texture: v })} options={TEXTURES.map((d) => ({ id: d.id, label: w(d.name) }))} />
            </div>
            <div>
              <Label>{w("Movement when scrolling")}</Label>
              <Segmented value={t.motion} onChange={(v) => setTheme({ motion: v })} options={MOTIONS.map((d) => ({ id: d.id, label: w(d.name) }))} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Settings tab ----------
const LANG_STYLES = [
  { id: "button", name: "Button", demo: <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 ring-1 ring-gray-300"><Languages size={12} /> हिंदी</span> },
  { id: "toggle", name: "Two-part switch", demo: <span className="inline-flex rounded-full p-0.5 ring-1 ring-gray-300"><span className="rounded-full bg-gray-900 px-2 py-0.5 text-white">EN</span><span className="px-2 py-0.5 text-gray-500">हिं</span></span> },
  { id: "text", name: "Just the word", demo: <span className="underline decoration-2 underline-offset-4 decoration-brand-500">हिंदी</span> },
  { id: "icon", name: "Small icon", demo: <span className="relative grid h-7 w-7 place-items-center rounded-full ring-1 ring-gray-300"><Languages size={13} /><span className="absolute -bottom-1 -right-1.5 rounded-full bg-gray-900 px-1 text-[9px] font-bold text-white">हि</span></span> },
];

// One language (the default) or English + हिंदी, and how visitors switch.
function LanguageSettings({ settings, setSettings }) {
  const w = useW();
  const multi = isMultilingual(settings);
  const on = multi && settings.language_switch !== false;
  return (
    <div className="space-y-2" data-testid="wb-languages">
      <p className="text-sm font-semibold text-gray-900">{w("Language")}</p>
      <SwitchRow label={w("Website in English and हिंदी")}
        hint={multi ? w("Every text box gets an “Add in हिंदी” option. Customers can switch between the two.") : w("Off: your website shows one language, exactly as you write it.")}
        checked={multi} onChange={(v) => setSettings({ multilingual: v, language_switch: v })} />
      {multi && (
        <div className="space-y-4 rounded-xl border border-gray-200 p-3">
          <SwitchRow label={w("Language button on the website")} hint={w("Shown at the top, so customers can switch")} checked={on} onChange={(v) => setSettings({ language_switch: v })} />
          {on && (
            <div>
              <Label>{w("How the button looks")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {LANG_STYLES.map((o) => (
                  <Choice key={o.id} on={(settings.lang_style || "button") === o.id} onClick={() => setSettings({ lang_style: o.id })} className="flex flex-col items-center gap-2 px-2 py-3" label={w(o.name)}>
                    <span className="flex h-8 items-center text-[13px] font-semibold text-gray-900">{o.demo}</span>
                    <span className="text-[12.5px] font-medium text-gray-700">{w(o.name)}</span>
                  </Choice>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label>{w("Language customers see first")}</Label>
            <Segmented value={settings.default_lang || "en"} onChange={(v) => setSettings({ default_lang: v })} options={[{ id: "en", label: "English" }, { id: "hi", label: "हिंदी" }]} />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ name, setName, settings, setSettings, brand, onVersions }) {
  const w = useW();
  const facts = factsForSettings(settings);
  const title = settings.seo_title || [brand.shop_name, brand.city].filter(Boolean).join(", ");
  return (
    <div className="space-y-5 p-3">
      <div>
        <Label>{w("Name of this variation")}</Label>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className={inputCls} aria-label={w("Name of this variation")} data-testid="wb-name" />
        <p className="mt-1.5 text-[12.5px] text-gray-600">{w("Only you see this name. It helps you tell your variations apart.")}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900">{w("Quick-contact buttons")}</p>
        <SwitchRow label={w("WhatsApp button")} hint={w("A round green button in the corner of every screen")} checked={settings.whatsapp_button} onChange={(v) => setSettings({ whatsapp_button: v })} />
        <SwitchRow label={w("Call bar on phones")} hint={w("Call and Directions buttons fixed at the bottom of phone screens")} checked={settings.call_bar} onChange={(v) => setSettings({ call_bar: v })} />
        {facts.length > 0 && <div className="rounded-xl bg-gray-50 p-1">{facts.map((id) => <FactRow key={id} id={id} />)}</div>}
      </div>

      <LanguageSettings settings={settings} setSettings={setSettings} />

      <div className="space-y-3 rounded-2xl border border-gray-200 p-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Globe size={15} className="text-brand-700" /> {w("Your website on Google")}</p>
          <p className="text-[12.5px] text-gray-600">{w("How your website shows up when people search on Google.")}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3" aria-hidden="true">
          <p className="truncate text-[12px] text-gray-600">{window.location.host}</p>
          <p className="truncate text-[16px] leading-snug text-[#1a0dab]">{title}</p>
          <p className="line-clamp-2 text-[13px] text-gray-700">{settings.seo_description || w("Google picks a few lines from your page.")}</p>
        </div>
        <div>
          <Label>{w("Title on Google")}</Label>
          <input value={settings.seo_title || ""} maxLength={70} onChange={(e) => setSettings({ seo_title: e.target.value }, "seo_title")} placeholder={title} className={`${inputCls} !h-11 sm:!h-10 !text-[15px] sm:!text-[14.5px]`} aria-label={w("Title on Google")} />
          <p className="mt-1.5 text-[12.5px] text-gray-600">{w("Empty: your shop name and city.")}</p>
        </div>
        <LangInput label={w("Line under the title")} area value={settings.seo_description} values={{}} placeholder={w("One or two lines about your shop")}
          onChange={(lang, v) => !lang && setSettings({ seo_description: v }, "seo_description")} />
      </div>

      <Button variant="secondary" icon={History} full onClick={onVersions}>{w("Earlier saves")}</Button>
    </div>
  );
}

function Versions({ site, onClose, onRestore }) {
  const w = useW();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { api.get(`/websites/${site.id}/history`).then((r) => setList(r.data)).catch((e) => { toast.error(apiErr(e)); setList([]); }); }, [site.id]);
  const restore = async (i) => {
    if (!window.confirm(w("Go back to this save? What you have saved now is kept in this list."))) return;
    setBusy(i);
    try { const { data } = await api.post(`/websites/${site.id}/restore/${i}`); onRestore(data.config); toast.success(w("Brought back")); }
    catch (e) { toast.error(apiErr(e)); }
    setBusy(null);
  };
  const fmt = (iso) => { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return iso; } };
  return (
    <Sheet title={w("Earlier saves")} subtitle={w("Each save keeps the one before it (last 15). Bring one back if you change your mind.")} onClose={onClose}>
      {list === null ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-gray-500" /></div>
        : list.length === 0 ? <p className="py-8 text-center text-sm text-gray-600">{w("Nothing here yet. Earlier saves show up after you save changes.")}</p>
          : (
            <ul className="divide-y divide-gray-100">
              {list.map((v) => (
                <li key={v.index} className="flex items-center gap-3 py-3">
                  <span className="flex-1"><span className="block text-sm font-medium text-gray-900">{fmt(v.at)}</span><span className="block text-xs text-gray-500">{v.by || "—"} · {w("{n} sections", { n: v.sections })}</span></span>
                  <Button size="sm" variant="secondary" loading={busy === v.index} onClick={() => restore(v.index)}>{w("Bring back")}</Button>
                </li>
              ))}
            </ul>
          )}
    </Sheet>
  );
}
