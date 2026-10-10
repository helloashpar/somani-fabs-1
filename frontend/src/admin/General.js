import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Store, ImagePlus, Trash2, MapPin, Phone, Share2, Plus, X, Clock, Map as MapIcon, Languages, Copy, ChevronDown } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { useBrandCtx, DAYS, DAY_NAMES, formatAddress, hoursSummary } from "@/lib/brand";
import { Button, Card, CardHeader, Field, IconButton, Skeleton, Toggle, inputCls } from "@/admin/ui";

// Shop setup > General: only the basic facts about the shop (logo, names,
// address, hours, map and review links, contact, social). It is the one place
// they are kept: the websites, WhatsApp messages, the admin app, the shop
// screen and exports all read them from here. What a website says beyond
// these facts is set in Shop setup > Website.

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
// box is the default; "Add language" opens a box per language (empty = the
// main text is shown).
function LangText({ k, form, set, label, hint, placeholder, maxLength, languages }) {
  const [open, setOpen] = useState(() => languages.filter((l) => form[`${k}_${l.code}`]).map((l) => l.code));
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  const left = languages.filter((l) => !open.includes(l.code));
  useEffect(() => {
    if (!menu) return;
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
              className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[13px] font-medium text-brand-700 hover:bg-brand-50">
              <Languages size={14} aria-hidden="true" /> Add language {left.length > 1 && <ChevronDown size={13} aria-hidden="true" />}
            </button>
            {menu && (
              <div className="absolute right-0 top-8 z-20 min-w-36 rounded-xl border border-gray-200 bg-white shadow-pop p-1">
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
            <IconButton icon={X} label={`Remove ${l ? l.name : code}`} onClick={() => remove(code)} className="shrink-0" />
          </div>
        );
      })}
      {hint && <span className="block text-[13px] text-gray-600 mt-1.5">{hint}</span>}
    </div>
  );
}

function LogoPicker({ logo, onChange, name }) {
  const { t } = useLang();
  const onFile = async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/") || f.type === "image/svg+xml") { toast.error(t("gen_logo_type")); return; }
    if (f.size > 6 * 1024 * 1024) { toast.error(t("gen_logo_size")); return; }
    onChange(await readFile(f));
  };
  return (
    <div className="flex items-center gap-4">
      <label className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-brand-300 hover:bg-brand-50 transition-colors shrink-0">
        {logo ? <img data-testid="gen-logo-preview" src={logo} alt={`${name} logo`} className="w-full h-full object-contain p-1.5" />
          : <ImagePlus size={26} className="text-brand-700" aria-hidden="true" />}
        <input data-testid="gen-logo-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="sr-only" aria-label={t("gen_logo")} />
      </label>
      <div className="min-w-0 space-y-2">
        <p className="text-[13px] text-gray-600">{t("gen_logo_hint")}</p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center h-9 px-3 rounded-xl text-sm font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 cursor-pointer gap-1.5">
            <ImagePlus size={15} aria-hidden="true" /> {logo ? t("gen_logo_change") : t("gen_logo_upload")}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile} className="sr-only" />
          </label>
          {logo && <Button data-testid="gen-logo-remove" variant="dangerSoft" size="sm" icon={Trash2} onClick={() => onChange("")}>{t("remove")}</Button>}
        </div>
      </div>
    </div>
  );
}

// Up to `max` values of one kind (phones, emails).
function ListField({ label, hint, values, onChange, max, addLabel, testid, ...input }) {
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
            <IconButton icon={X} label="Remove" onClick={() => onChange(list.filter((_, j) => j !== i))} className="shrink-0" />
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
  const set = Object.keys(hours || {}).length === 7;
  if (!set) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center">
        <p className="text-sm text-gray-600">Opening hours are not set, so websites don't show them.</p>
        <Button data-testid="gen-hours-set" variant="soft" size="sm" icon={Clock} className="mt-3" onClick={() => onChange(WEEKDAYS_10_830)}>Set opening hours</Button>
      </div>
    );
  }
  const setDay = (d, patch) => onChange({ ...hours, [d]: { ...hours[d], ...patch } });
  const copyFirst = () => {
    const first = DAYS.find((d) => !hours[d].closed) || "mon";
    onChange(Object.fromEntries(DAYS.map((d) => [d, hours[d].closed ? hours[d] : { ...hours[first], closed: false }])));
  };
  return (
    <div>
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        {DAYS.map((d) => {
          const h = hours[d];
          return (
            <div key={d} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5">
              <span className="w-10 text-sm font-semibold text-gray-900">{DAY_NAMES.en[d]}</span>
              <Toggle testid={`gen-hours-${d}-open`} label={`${DAY_NAMES.en[d]} open`} checked={!h.closed}
                onChange={(v) => setDay(d, { closed: !v, open: h.open || "10:00", close: h.close || "20:30" })} />
              {h.closed ? <span className="text-sm text-gray-500">Closed</span> : (
                <span className="flex items-center gap-2">
                  <input type="time" aria-label={`${DAY_NAMES.en[d]} opens`} value={h.open} onChange={(e) => setDay(d, { open: e.target.value })} className={timeCls} />
                  <span className="text-gray-500 text-sm">to</span>
                  <input type="time" aria-label={`${DAY_NAMES.en[d]} closes`} value={h.close} onChange={(e) => setDay(d, { close: e.target.value })} className={timeCls} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button variant="ghost" size="sm" icon={Copy} onClick={copyFirst}>Same time every open day</Button>
        <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onChange({})}>Don't show hours</Button>
      </div>
    </div>
  );
}

// Shows how the address reads in the visitor's language, as websites will show it.
function AddressPreview({ form }) {
  const hi = formatAddress(form, "hi");
  const en = formatAddress(form, "en");
  if (!en) return null;
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
      <span className="block text-[13px] font-medium text-gray-600 mb-1">Shown as</span>
      <span className="block text-gray-900">{en}</span>
      {hi !== en && <span className="block text-gray-700 mt-0.5" lang="hi">{hi}</span>}
    </div>
  );
}

export default function General() {
  const { t } = useLang();
  const { brand, update } = useBrandCtx();
  const [form, setForm] = useState(null);
  const [logo, setLogo] = useState(null); // null = unchanged
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Start from what the server has now (not the device's cached copy).
  useEffect(() => {
    api.get("/public/brand").then((r) => { setForm(r.data); update(r.data); })
      .catch((e) => toast.error(apiErr(e)));
  }, [update]);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setLogoDirty = (v) => { setLogo(v); setDirty(true); };

  const save = async () => {
    if (!form.shop_name?.trim()) { toast.error(t("gen_name_required")); return; }
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
      toast.success(t("gen_saved"));
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };

  if (!form) return <div className="space-y-4"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>;
  const languages = form.languages || [{ code: "hi", name: "हिंदी" }];
  const f = { form, set };
  const lf = { ...f, languages };
  const logoShown = logo !== null ? logo : brand.logo_src;
  const embed = form.map_embed_url && /src="|^https:\/\/(www\.)?google\./.test(form.map_embed_url)
    ? (form.map_embed_url.match(/src="([^"]+)"/) || [null, form.map_embed_url])[1] : "";

  return (
    <div className="space-y-4" data-testid="general-settings">
      <p className="flex gap-2.5 rounded-2xl bg-brand-50 text-brand-900 px-4 py-3 text-sm">
        <Store size={18} className="shrink-0 mt-0.5 text-brand-700" aria-hidden="true" /> {t("gen_source_note")}
      </p>
      <Card>
        <CardHeader icon={Store} title={t("gen_identity")} subtitle={t("gen_identity_sub")} />
        <div className="px-5 pb-5 space-y-5">
          <LogoPicker logo={logoShown} onChange={setLogoDirty} name={form.shop_name} />
          <LangText k="shop_name" label={`${t("gen_shop_name")} *`} hint={t("gen_shop_name_hint")} maxLength={60} {...lf} />
          <LangText k="short_name" label="Short name" hint="Where space is short: WhatsApp messages, phone headers. Empty: the shop name" maxLength={30} placeholder="Somani" {...lf} />
          <LangText k="legal_name" label="Owner / firm name" hint="Registered or family name, shown in footers and the shop screen" maxLength={100} {...lf} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={MapPin} title="Address" subtitle="One line each. Websites, WhatsApp messages and the map all use it" />
        <div className="px-5 pb-5 space-y-5">
          <LangText k="address_street" label="Street address" hint="Shop number, building, street, area and landmark" maxLength={160} placeholder="Shop 4, Station Road, near Clock Tower" {...lf} />
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-5">
            <LangText k="city" label="City / town" maxLength={60} placeholder="Jaipur" {...lf} />
            <LangText k="state" label="State" maxLength={60} placeholder="Rajasthan" {...lf} />
            <Text k="pincode" label="PIN code" inputMode="numeric" maxLength={10} placeholder="302001" {...f} />
            <LangText k="country" label="Country" maxLength={60} placeholder="India" {...lf} />
          </div>
          <AddressPreview form={form} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Clock} title="Opening hours" subtitle="Websites show them and whether the shop is open right now" />
        <div className="px-5 pb-5 space-y-5">
          <HoursEditor hours={form.hours} onChange={(v) => set("hours", v)} />
          {Object.keys(form.hours || {}).length === 7 && (
            <p className="text-sm text-gray-600"><span className="font-medium text-gray-800">Shown as:</span> {hoursSummary(form, "en")}</p>
          )}
          <LangText k="hours_note" label="Hours note" hint="Optional, like “Open on all festivals” or “Lunch 2–3 PM”" maxLength={100} {...lf} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={MapIcon} title="Map and reviews" subtitle="Directions button, map preview and the reviews link" />
        <div className="px-5 pb-5 space-y-5">
          <Text k="maps_url" type="url" label="Google Maps link" hint="Google Maps > your shop > Share > Copy link. Empty: the Directions button searches the address" placeholder="https://maps.app.goo.gl/..." {...f} />
          <div>
            <Text k="map_embed_url" area label="Google Maps preview" hint="Google Maps > your shop > Share > Embed a map > Copy HTML, and paste it here. Empty: a map of the address" placeholder='<iframe src="https://www.google.com/maps/embed?pb=..."></iframe>' {...f} />
            {embed && <iframe title="Map preview" src={embed} loading="lazy" className="mt-3 w-full h-48 rounded-xl border border-gray-200" />}
          </div>
          <Text k="reviews_url" type="url" label="Google reviews link" hint="Google Business Profile > Ask for reviews > copy the link. Used by websites and WhatsApp" placeholder="https://g.page/r/..." {...f} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Phone} title={t("gen_contact")} subtitle="Call, WhatsApp and email buttons everywhere" />
        <div className="px-5 pb-5 space-y-5">
          <ListField label={t("gen_phones")} hint={t("gen_phones_hint")} values={form.phones || []} onChange={(v) => set("phones", v)}
            max={MAX_PHONES} addLabel={t("gen_add_phone")} testid="gen-phone" type="tel" inputMode="tel" placeholder="+91 94144 22558" />
          <Text k="whatsapp" type="tel" inputMode="tel" label="WhatsApp number" hint={t("gen_whatsapp_hint")} placeholder="+91 94144 22558" {...f} />
          <ListField label="Emails" hint="Up to 3. The first one is used for the email button" values={form.emails || []} onChange={(v) => set("emails", v)}
            max={MAX_EMAILS} addLabel="Add email" testid="gen-email" type="email" inputMode="email" autoCapitalize="none" placeholder="shop@example.com" />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Share2} title={t("gen_social")} subtitle={t("gen_social_sub")} />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Text k="instagram" type="url" label="Instagram" placeholder="https://instagram.com/..." {...f} />
          <Text k="facebook" type="url" label="Facebook" placeholder="https://facebook.com/..." {...f} />
          <Text k="youtube" type="url" label="YouTube" placeholder="https://youtube.com/@..." {...f} />
          <Text k="x" type="url" label="X (Twitter)" placeholder="https://x.com/..." {...f} />
          <Text k="linkedin" type="url" label="LinkedIn" placeholder="https://linkedin.com/company/..." {...f} />
          <Text k="website" type="url" label={t("gen_website")} placeholder="https://..." {...f} />
        </div>
      </Card>

      {/* Save stays in reach above the phone tab bar while scrolling the long form. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-20">
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-md shadow-lift px-4 py-3">
          <p className="flex-1 text-sm text-gray-600 hidden sm:block">{dirty ? t("gen_unsaved") : t("gen_everywhere")}</p>
          <Button data-testid="save-general" size="lg" onClick={save} loading={saving} disabled={!dirty && !saving} className="flex-1 sm:flex-none sm:min-w-40">{t("save")}</Button>
        </div>
      </div>
    </div>
  );
}
