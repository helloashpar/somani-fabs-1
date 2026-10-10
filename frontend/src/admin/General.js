import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Store, ImagePlus, Trash2, MapPin, Phone, Share2, Plus, X, Clock, Map as MapIcon, Languages, Copy, ChevronDown, Check, AlertTriangle } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useBrandCtx, DAYS, DAY_NAMES, formatAddress, hoursSummary, hasHours } from "@/lib/brand";
import { Button, Field, IconButton, Skeleton, Toggle, inputCls } from "@/admin/ui";
import { useW } from "@/admin/website/words";

// Shop setup > General: only the basic facts about the shop (logo, names,
// address, hours, map and review links, contact, social). It is the one place
// they are kept: the website, WhatsApp messages, the admin app, the shop
// screen and exports all read them from here.
//
// Each part is folded to one line that says what is filled in, so the page
// reads as a short checklist; tap a part to open it. The website builder
// opens this screen in a sheet at one part (`focus`), with the cursor in the
// field it was asked about.

const MAX_PHONES = 4;
const MAX_EMAILS = 3;
const areaCls = `${inputCls} h-auto py-2.5 resize-y min-h-[88px]`;

// Read a picked image file as a data URI.
function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Text({ k, form, set, label, hint, placeholder, area, type = "text", maxLength, ...rest }) {
  const Tag = area ? "textarea" : "input";
  return (
    <Field label={label} hint={hint}>
      <Tag data-testid={`gen-${k}`} type={area ? undefined : type} value={form[k] ?? ""} placeholder={placeholder} maxLength={maxLength}
        onChange={(e) => set(k, e.target.value)} rows={area ? 3 : undefined} className={area ? areaCls : inputCls} {...rest} />
    </Field>
  );
}

// A text visitors read, with optional versions in other languages. The main
// box is the default; "Add Hindi" opens a box per language (empty = the main
// text is shown).
function LangText({ k, form, set, label, hint, placeholder, maxLength, languages }) {
  const w = useW();
  const [open, setOpen] = useState(() => languages.filter((l) => form[`${k}_${l.code}`]).map((l) => l.code));
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  const left = languages.filter((l) => !open.includes(l.code));
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const add = (code) => { setOpen((o) => [...o, code]); setMenu(false); };
  const remove = (code) => { setOpen((o) => o.filter((c) => c !== code)); set(`${k}_${code}`, ""); };
  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1.5">
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {left.length > 0 && (
          <div className="relative" ref={ref}>
            <button type="button" data-testid={`gen-${k}-addlang`} onClick={() => (left.length === 1 ? add(left[0].code) : setMenu((m) => !m))}
              className="inline-flex items-center gap-1 h-8 px-2 rounded-lg text-[13px] font-medium text-brand-700 hover:bg-brand-50">
              <Languages size={14} aria-hidden="true" /> {left.length === 1 ? w("Add in {lang}", { lang: left[0].name }) : w("Add language")} {left.length > 1 && <ChevronDown size={13} aria-hidden="true" />}
            </button>
            {menu && (
              <div className="absolute right-0 top-9 z-20 min-w-36 rounded-xl border border-gray-200 bg-white shadow-pop p-1">
                {left.map((l) => (
                  <button key={l.code} type="button" onClick={() => add(l.code)} className="block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-gray-50">{l.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <input data-testid={`gen-${k}`} value={form[k] ?? ""} placeholder={placeholder} maxLength={maxLength} aria-label={label}
        onChange={(e) => set(k, e.target.value)} className={inputCls} />
      {open.map((code) => {
        const l = languages.find((x) => x.code === code);
        return (
          <div key={code} className="mt-2 flex items-center gap-2">
            <span className="shrink-0 inline-flex items-center h-12 sm:h-11 px-3 rounded-xl bg-brand-50 text-brand-800 text-sm font-medium" lang={code}>{l ? l.name : code}</span>
            <input data-testid={`gen-${k}_${code}`} lang={code} value={form[`${k}_${code}`] ?? ""} maxLength={maxLength}
              aria-label={`${label} (${l ? l.name : code})`} placeholder={form[k] || ""} autoFocus={!form[`${k}_${code}`]}
              onChange={(e) => set(`${k}_${code}`, e.target.value)} className={inputCls} />
            <IconButton icon={X} label={w("Remove {lang}", { lang: l ? l.name : code })} onClick={() => remove(code)} className="shrink-0" />
          </div>
        );
      })}
      {hint && <span className="block text-[13px] text-gray-600 mt-1.5">{hint}</span>}
    </div>
  );
}

function LogoPicker({ logo, onChange, name }) {
  const w = useW();
  const onFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.type === "image/svg+xml") { toast.error(w("Choose a PNG, JPEG or WebP image")); return; }
    if (f.size > 6 * 1024 * 1024) { toast.error(w("Logo is too large (max 6 MB)")); return; }
    onChange(await readFile(f));
  };
  return (
    <div className="flex items-center gap-4">
      <label className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors shrink-0">
        {logo ? <img data-testid="gen-logo-preview" src={logo} alt={`${name} logo`} className="w-full h-full object-contain p-1.5" />
          : <ImagePlus size={26} className="text-brand-700" aria-hidden="true" />}
        <input data-testid="gen-logo-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="sr-only" aria-label={w("Logo")} />
      </label>
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-medium text-gray-800">{w("Logo")}</p>
        <p className="text-[13px] text-gray-600">{w("A square picture works best.")}</p>
        <div className="flex flex-wrap gap-2">
          <label data-testid="gen-logo" className="inline-flex items-center h-9 px-3 rounded-xl text-sm font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer gap-1.5">
            <ImagePlus size={15} aria-hidden="true" /> {logo ? w("Change") : w("Upload logo")}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="sr-only" />
          </label>
          {logo && <Button data-testid="gen-logo-remove" variant="dangerSoft" size="sm" icon={Trash2} onClick={() => onChange("")}>{w("Remove")}</Button>}
        </div>
      </div>
    </div>
  );
}

// Up to `max` values of one kind (phones, emails).
function ListField({ label, hint, values, onChange, max, addLabel, testid, ...input }) {
  const w = useW();
  const list = values.length ? values : [""];
  const setAt = (i, v) => onChange(list.map((p, j) => (j === i ? v : p)));
  return (
    <div>
      <span className="block text-sm font-medium text-gray-800 mb-1.5">{label}</span>
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input data-testid={`${testid}-${i}`} value={p} aria-label={`${label} ${i + 1}`} {...input}
              onChange={(e) => setAt(i, e.target.value)} className={inputCls} />
            <IconButton icon={X} label={w("Remove")} onClick={() => onChange(list.filter((_, j) => j !== i))} className="shrink-0" />
          </div>
        ))}
      </div>
      {list.length < max && (
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => onChange([...list, ""])} className="mt-2">{addLabel}</Button>
      )}
      {hint && <span className="block text-[13px] text-gray-600 mt-1.5">{hint}</span>}
    </div>
  );
}

const WEEKDAYS_10_830 = Object.fromEntries(DAYS.map((d) => [d, { closed: d === "sun", open: "10:00", close: "20:30" }]));
const timeCls = `${inputCls} num w-[7.5rem] sm:w-32 px-2.5`;

// Opening hours for each day of the week. Not set = hidden on the website.
function HoursEditor({ hours, onChange }) {
  const w = useW();
  const set = Object.keys(hours || {}).length === 7;
  if (!set) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center">
        <p className="text-sm text-gray-600">{w("Opening hours are not set, so your website doesn't show them.")}</p>
        <Button data-testid="gen-hours-set" variant="soft" size="sm" icon={Clock} className="mt-3" onClick={() => onChange(WEEKDAYS_10_830)}>{w("Set opening hours")}</Button>
      </div>
    );
  }
  const setDay = (d, patch) => onChange({ ...hours, [d]: { ...hours[d], ...patch } });
  const copyFirst = () => {
    const first = DAYS.find((d) => !hours[d].closed) || "mon";
    onChange(Object.fromEntries(DAYS.map((d) => [d, hours[d].closed ? hours[d] : { ...hours[first], closed: false }])));
  };
  return (
    <div data-testid="gen-hours">
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        {DAYS.map((d) => {
          const h = hours[d];
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5">
              <span className="w-10 text-sm font-semibold text-gray-900">{w(DAY_NAMES.en[d])}</span>
              <Toggle testid={`gen-hours-${d}-open`} label={w("{day} open", { day: w(DAY_NAMES.en[d]) })} checked={!h.closed}
                onChange={(v) => setDay(d, { closed: !v, open: h.open || "10:00", close: h.close || "20:30" })} />
              {h.closed ? <span className="text-sm text-gray-500">{w("Closed")}</span> : (
                <span className="flex items-center gap-2">
                  <input type="time" aria-label={w("{day} opens", { day: w(DAY_NAMES.en[d]) })} value={h.open} onChange={(e) => setDay(d, { open: e.target.value })} className={timeCls} />
                  <span className="text-gray-500 text-sm">{w("to")}</span>
                  <input type="time" aria-label={w("{day} closes", { day: w(DAY_NAMES.en[d]) })} value={h.close} onChange={(e) => setDay(d, { close: e.target.value })} className={timeCls} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button variant="ghost" size="sm" icon={Copy} onClick={copyFirst}>{w("Same time every open day")}</Button>
        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onChange({})}>{w("Don't show hours")}</Button>
      </div>
    </div>
  );
}

// Shows how the address reads, in English and Hindi, as the website shows it.
function AddressPreview({ form }) {
  const w = useW();
  const hi = formatAddress(form, "hi");
  const en = formatAddress(form, "en");
  if (!en) return null;
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
      <span className="block text-[13px] font-medium text-gray-600 mb-1">{w("Shown as")}</span>
      <span className="block text-gray-900">{en}</span>
      {hi !== en && <span className="block text-gray-700 mt-0.5" lang="hi">{hi}</span>}
    </div>
  );
}

// One folded part of the page: its name, what is filled in, and the fields.
function Part({ id, icon: Icon, title, summary, done, optional, open, onToggle, children }) {
  const w = useW();
  return (
    <section id={`gen-part-${id}`} data-testid={`gen-part-${id}`} className={`scroll-mt-4 bg-white rounded-2xl border shadow-card transition-colors ${open ? "border-brand-200" : "border-gray-200/80"}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full min-h-[64px] flex items-center gap-3.5 px-4 sm:px-5 py-3 text-left touch-manipulation">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${open ? "bg-brand-700 text-white" : "bg-brand-50 text-brand-700"}`}><Icon size={19} aria-hidden="true" /></span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-gray-900">{title}</span>
          {summary ? <span className="block text-[13px] text-gray-600 truncate">{summary}</span>
            : <span className={`block text-[13px] ${optional ? "text-gray-500" : "text-amber-700"}`}>{optional ? w("Optional. Not added.") : w("Not added yet")}</span>}
        </span>
        {done ? <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0" aria-label={w("Filled in")}><Check size={14} strokeWidth={3} /></span>
          : !optional && <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0 mx-1.5" aria-label={w("Not added yet")} />}
        <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className="px-4 sm:px-5 pb-5 pt-1 space-y-5 border-t border-gray-100">{children}</div>}
    </section>
  );
}

const SOCIALS = [
  ["instagram", "Instagram", "https://instagram.com/..."], ["facebook", "Facebook", "https://facebook.com/..."],
  ["youtube", "YouTube", "https://youtube.com/@..."], ["x", "X (Twitter)", "https://x.com/..."],
  ["linkedin", "LinkedIn", "https://linkedin.com/company/..."], ["website", "Other website", "https://..."],
];

function SocialLinks({ form, set }) {
  const w = useW();
  const [extra, setExtra] = useState([]);
  const shown = SOCIALS.filter(([k]) => form[k] || extra.includes(k));
  const hidden = SOCIALS.filter(([k]) => !form[k] && !extra.includes(k));
  return (
    <div className="space-y-4" data-testid="gen-social">
      {shown.length === 0 && <p className="text-sm text-gray-600">{w("Add the pages you have. Their icons show on your website.")}</p>}
      {shown.map(([k, label, ph]) => (
        <div key={k} className="flex items-end gap-2">
          <div className="flex-1 min-w-0"><Text k={k} type="url" label={w(label)} placeholder={ph} form={form} set={set} autoFocus={extra.includes(k) && !form[k]} /></div>
          <IconButton icon={X} label={w("Remove")} onClick={() => { set(k, ""); setExtra((x) => x.filter((y) => y !== k)); }} className="shrink-0" />
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hidden.map(([k, label]) => (
            <button key={k} type="button" data-testid={`gen-add-${k}`} onClick={() => setExtra((x) => [...x, k])}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <Plus size={14} aria-hidden="true" /> {w(label)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function General({ focus, embedded, onSaved }) {
  const w = useW();
  const { brand, update } = useBrandCtx();
  const [form, setForm] = useState(null);
  const [logo, setLogo] = useState(null); // null = unchanged
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(() => (focus && focus.card ? [focus.card] : []));
  const [moreNames, setMoreNames] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Start from what the server has now (not the device's cached copy).
  useEffect(() => {
    api.get("/public/brand").then((r) => { setForm(r.data); update(r.data); })
      .catch((e) => toast.error(apiErr(e)));
  }, [update]);

  // Asked about one detail: open its part and put the cursor in its field.
  useEffect(() => {
    if (!form || !focus) return undefined;
    const id = setTimeout(() => {
      const part = document.getElementById(`gen-part-${focus.card}`);
      const el = focus.field && document.querySelector(`[data-testid="gen-${focus.field}"]`);
      (el || part)?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el && /INPUT|TEXTAREA/.test(el.tagName)) el.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(id);
    // Only when the form first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!form]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setLogoDirty = (v) => { setLogo(v); setDirty(true); };
  const toggle = (id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const save = async () => {
    if (!form.shop_name?.trim()) {
      setOpen((o) => (o.includes("identity") ? o : [...o, "identity"]));
      toast.error(w("Shop name is required"));
      return;
    }
    setSaving(true);
    try {
      const { logo: _skip, logo_src: _src, classic: _c, languages: _l, address: _a, address_hi: _ah, ...fields } = form;
      const body = {
        ...fields,
        phones: (form.phones || []).map((p) => p.trim()).filter(Boolean),
        emails: (form.emails || []).map((p) => p.trim()).filter(Boolean),
      };
      if (logo !== null) body.logo = logo;
      const { data } = await api.put("/settings/brand", body);
      update(data);
      setForm(data);
      setLogo(null);
      setDirty(false);
      setConfirming(false);
      toast.success(w("Saved. Your website and app show it now."));
      if (onSaved) onSaved(data);
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };

  if (!form) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  const languages = form.languages || [{ code: "hi", name: "हिंदी" }];
  const f = { form, set };
  const lf = { ...f, languages };
  const logoShown = logo !== null ? logo : brand.logo_src;
  const phones = (form.phones || []).filter((p) => p.trim());
  const socials = SOCIALS.filter(([k]) => form[k]).map(([, n]) => n);
  const namesOpen = moreNames || !!(form.short_name || form.legal_name);

  const parts = [
    {
      id: "identity", icon: Store, title: w("Name and logo"), done: !!form.shop_name?.trim(),
      summary: [form.shop_name, logoShown ? w("Logo added") : ""].filter(Boolean).join(" · "),
      body: (
        <>
          <LogoPicker logo={logoShown} onChange={setLogoDirty} name={form.shop_name} />
          <LangText k="shop_name" label={`${w("Shop name")} *`} hint={w("Shown on your website, the app and the shop screen")} maxLength={60} {...lf} />
          {namesOpen ? (
            <>
              <LangText k="short_name" label={w("Short name (optional)")} hint={w("Used where space is small, like WhatsApp messages. Empty: the shop name")} maxLength={30} placeholder="Somani" {...lf} />
              <LangText k="legal_name" label={w("Firm / Owner name (optional)")} hint={w("Shown at the bottom of your website")} maxLength={100} {...lf} />
            </>
          ) : (
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => setMoreNames(true)} data-testid="gen-more-names">{w("Add a short name or firm / owner name")}</Button>
          )}
        </>
      ),
    },
    {
      id: "address", icon: MapPin, title: w("Address"), done: !!(form.address_street && form.city),
      summary: formatAddress(form, "en"),
      body: (
        <>
          <LangText k="address_street" label={w("Street address")} hint={w("Shop number, building, street, area and a landmark")} maxLength={160} placeholder="Shop 4, Station Road, near Clock Tower" {...lf} />
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-5">
            <LangText k="city" label={w("City / town")} maxLength={60} placeholder="Jaipur" {...lf} />
            <LangText k="state" label={w("State")} maxLength={60} placeholder="Rajasthan" {...lf} />
            <Text k="pincode" label={w("PIN code")} inputMode="numeric" maxLength={10} placeholder="302001" {...f} />
            <LangText k="country" label={w("Country")} maxLength={60} placeholder="India" {...lf} />
          </div>
          <AddressPreview form={form} />
        </>
      ),
    },
    {
      id: "hours", icon: Clock, title: w("Opening hours"), done: hasHours(form),
      summary: hoursSummary(form, "en"),
      body: (
        <>
          <HoursEditor hours={form.hours} onChange={(v) => set("hours", v)} />
          <LangText k="hours_note" label={w("Note about timings (optional)")} hint={w("Like “Open on all festivals” or “Lunch 2–3 PM”")} maxLength={100} {...lf} />
        </>
      ),
    },
    {
      id: "contact", icon: Phone, title: w("Phone and email"), done: phones.length > 0,
      summary: [phones.join(", "), form.whatsapp ? `WhatsApp ${form.whatsapp}` : ""].filter(Boolean).join(" · "),
      body: (
        <>
          <ListField label={w("Phone numbers")} hint={w("The first one is used for the Call button. Up to 4")} values={form.phones || []} onChange={(v) => set("phones", v)}
            max={MAX_PHONES} addLabel={w("Add number")} testid="gen-phone" type="tel" inputMode="tel" placeholder="+91 94144 22558" />
          <Text k="whatsapp" type="tel" inputMode="tel" label={w("WhatsApp number (optional)")} hint={w("Empty: your first phone number is used for WhatsApp")} placeholder="+91 94144 22558" {...f} />
          <ListField label={w("Email (optional)")} hint={w("Up to 3. The first one is used for the Email button")} values={form.emails || []} onChange={(v) => set("emails", v)}
            max={MAX_EMAILS} addLabel={w("Add email")} testid="gen-email" type="email" inputMode="email" autoCapitalize="none" placeholder="shop@example.com" />
        </>
      ),
    },
    {
      id: "map", icon: MapIcon, title: w("Google Maps and reviews"), optional: true, done: !!(form.maps_url || form.reviews_url),
      summary: [form.maps_url ? w("Maps link added") : "", form.reviews_url ? w("Reviews link added") : ""].filter(Boolean).join(" · "),
      body: (
        <>
          <Text k="maps_url" type="url" label={w("Google Maps link")} hint={w("Open Google Maps, find your shop, tap Share and copy the link. Empty: directions use your address.")} placeholder="https://maps.app.goo.gl/..." {...f} />
          <Text k="reviews_url" type="url" label={w("Google reviews link")} hint={w("From your Google Business Profile: “Ask for reviews”, then copy the link. Empty: the reviews button is hidden.")} placeholder="https://g.page/r/..." {...f} />
        </>
      ),
    },
    {
      id: "social", icon: Share2, title: w("Social media"), optional: true, done: socials.length > 0,
      summary: socials.map((n) => w(n)).join(", "),
      body: <SocialLinks form={form} set={set} />,
    },
  ];
  const needed = parts.filter((p) => !p.optional);
  const doneCount = needed.filter((p) => p.done).length;

  return (
    <div className="space-y-3" data-testid="general-settings">
      {!embedded && (
        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 text-brand-900 px-4 py-3 text-sm">
          <Store size={18} className="shrink-0 text-brand-700" aria-hidden="true" />
          <p className="flex-1 min-w-0">{w("Your shop's details, kept in one place. Your website, WhatsApp messages and the app all use them.")}</p>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-brand-800 shadow-card" data-testid="gen-progress">{w("{done} of {all} done", { done: doneCount, all: needed.length })}</span>
        </div>
      )}
      {parts.map((p) => (
        <Part key={p.id} id={p.id} icon={p.icon} title={p.title} summary={p.summary} done={p.done} optional={p.optional}
          open={open.includes(p.id)} onToggle={() => toggle(p.id)}>{p.body}</Part>
      ))}

      {/* Save appears once something changed, and stays in reach while
          scrolling (above the phone tab bar on the page). */}
      {(dirty || saving) && (
        <div className={`sticky z-20 pt-2 ${embedded ? "bottom-0" : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4"}`}>
          {/* From the website editor a shop detail looks like part of one
              variation, so say plainly that it changes everywhere first. */}
          {embedded && confirming ? (
            <div data-testid="general-confirm" className="rounded-2xl border border-amber-300 bg-amber-50 shadow-lift px-4 py-3">
              <p className="flex items-start gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> {w("This changes it everywhere")}</p>
              <p className="mt-1 text-[13.5px] text-amber-900">{w("Your shop details are shared. Saving changes them on your live website, in all your variations, in WhatsApp messages and in the app.")}</p>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={saving}>{w("Go back")}</Button>
                <Button data-testid="save-general-confirm" onClick={save} loading={saving}>{w("Yes, save everywhere")}</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-md shadow-lift px-4 py-3">
              <p className="flex-1 text-sm hidden sm:block text-amber-700 font-medium">{embedded ? w("Changes here show everywhere, not just in this variation") : w("You have changes that are not saved")}</p>
              <Button data-testid="save-general" size="lg" onClick={embedded ? () => setConfirming(true) : save} loading={saving} className="flex-1 sm:flex-none sm:min-w-40">{w("Save")}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
