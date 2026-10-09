import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Store, ImagePlus, Trash2, BookOpen, MapPin, Phone, Share2, Globe, Plus, X, ExternalLink, Languages } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { useBrandCtx } from "@/lib/brand";
import { Button, Card, CardHeader, Field, IconButton, Skeleton, Toggle, inputCls } from "@/admin/ui";

// Shop setup > General: the shop's name, logo, contact details, address,
// story and website options. Saved once for the whole shop and shown on the
// public site (header, hero, story, visit, footer), the admin app (wordmark,
// login, browser tab), the shop screen and exports.

const MAX_PHONES = 4;
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

// English and Hindi versions of one field side by side. The Hindi one is
// shown on the public site in Hindi; empty falls back to English.
function Pair({ k, form, set, label, hint, area, maxLength }) {
  const { t } = useLang();
  return (
    <div>
      <span className="block text-sm font-medium text-gray-800 mb-1.5">{label}</span>
      <div className="grid sm:grid-cols-2 gap-2">
        <Tag k={k} form={form} set={set} area={area} maxLength={maxLength} lang="en" aria={`${label} (English)`} placeholder="English" />
        <Tag k={`${k}_hi`} form={form} set={set} area={area} maxLength={maxLength} lang="hi" aria={`${label} (हिंदी)`} placeholder={`हिंदी · ${t("gen_hi_optional")}`} />
      </div>
      {hint && <span className="block text-[13px] text-gray-600 mt-1.5">{hint}</span>}
    </div>
  );
}

function Tag({ k, form, set, area, maxLength, lang, aria, placeholder }) {
  const El = area ? "textarea" : "input";
  return (
    <El data-testid={`gen-${k}`} lang={lang} aria-label={aria} value={form[k] ?? ""} placeholder={placeholder} maxLength={maxLength}
      onChange={(e) => set(k, e.target.value)} rows={area ? 3 : undefined} className={area ? areaCls : inputCls} />
  );
}

function Switch({ k, form, set, label, hint }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {hint && <span className="block text-[13px] text-gray-600">{hint}</span>}
      </span>
      <Toggle testid={`gen-${k}`} label={label} checked={!!form[k]} onChange={(v) => set(k, v)} />
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

function Phones({ phones, onChange }) {
  const { t } = useLang();
  const list = phones.length ? phones : [""];
  const setAt = (i, v) => onChange(list.map((p, j) => (j === i ? v : p)));
  return (
    <div>
      <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("gen_phones")}</span>
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input data-testid={`gen-phone-${i}`} type="tel" inputMode="tel" value={p} placeholder="+91 94144 22558" aria-label={`${t("gen_phones")} ${i + 1}`}
              onChange={(e) => setAt(i, e.target.value)} className={inputCls} />
            <IconButton icon={X} label={t("remove")} onClick={() => onChange(list.filter((_, j) => j !== i))} className="shrink-0" />
          </div>
        ))}
      </div>
      {list.length < MAX_PHONES && (
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => onChange([...list, ""])} className="mt-2">{t("gen_add_phone")}</Button>
      )}
      <span className="block text-[13px] text-gray-600 mt-1.5">{t("gen_phones_hint")}</span>
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
      const { logo: _skip, logo_src: _src, ...fields } = form;
      const body = { ...fields, phones: (form.phones || []).map((p) => p.trim()).filter(Boolean) };
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
  const f = { form, set };
  const logoShown = logo !== null ? logo : brand.logo_src;

  return (
    <div className="space-y-4" data-testid="general-settings">
      <p className="flex gap-2.5 rounded-2xl bg-brand-50 text-brand-900 px-4 py-3 text-sm">
        <Languages size={18} className="shrink-0 mt-0.5 text-brand-700" aria-hidden="true" /> {t("gen_bilingual_note")}
      </p>
      <Card>
        <CardHeader icon={Store} title={t("gen_identity")} subtitle={t("gen_identity_sub")} />
        <div className="px-5 pb-5 space-y-5">
          <LogoPicker logo={logoShown} onChange={setLogoDirty} name={form.shop_name} />
          <Pair k="shop_name" label={`${t("gen_shop_name")} *`} hint={t("gen_shop_name_hint")} maxLength={60} {...f} />
          <Pair k="tagline" label={t("gen_tagline")} hint={t("gen_tagline_hint")} maxLength={80} {...f} />
          <Pair k="legal_name" label={t("gen_legal_name")} hint={t("gen_legal_name_hint")} maxLength={100} {...f} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Text k="founded_year" label={t("gen_founded")} hint={t("gen_founded_hint")} inputMode="numeric" maxLength={4} placeholder="1962" {...f} />
            <Field label={t("gen_accent")} hint={t("gen_accent_hint")}>
              <div className="flex gap-2">
                <input type="color" aria-label={t("gen_accent")} value={/^#[0-9a-f]{6}$/i.test(form.accent_color || "") ? form.accent_color : "#880D1E"}
                  onChange={(e) => set("accent_color", e.target.value.toUpperCase())} className="h-12 sm:h-11 w-14 rounded-xl border border-gray-300 bg-white p-1 cursor-pointer shrink-0" />
                <input data-testid="gen-accent_color" value={form.accent_color || ""} maxLength={7} onChange={(e) => set("accent_color", e.target.value)} className={`${inputCls} num uppercase`} />
              </div>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={BookOpen} title={t("gen_about")} subtitle={t("gen_about_sub")} />
        <div className="px-5 pb-5 space-y-5">
          <Pair k="description" label={t("gen_description")} hint={t("gen_description_hint")} area maxLength={300} {...f} />
          <Pair k="story_body" label={t("gen_story")} hint={t("gen_story_hint")} area maxLength={600} {...f} />
          <Pair k="founder" label={t("gen_founder")} hint={t("gen_founder_hint")} maxLength={100} {...f} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Text k="brands_count" label={t("gen_brands_count")} hint={t("gen_brands_count_hint")} maxLength={10} placeholder="100+" {...f} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={MapPin} title={t("gen_location")} subtitle={t("gen_location_sub")} />
        <div className="px-5 pb-5 space-y-5">
          <Pair k="address_line1" label={t("gen_address1")} maxLength={120} {...f} />
          <Pair k="address_line2" label={t("gen_address2")} maxLength={120} {...f} />
          <Pair k="locality" label={t("gen_locality")} hint={t("gen_locality_hint")} maxLength={60} {...f} />
          <Pair k="city" label={t("gen_city")} hint={t("gen_city_hint")} maxLength={60} {...f} />
          <Pair k="hours" label={t("gen_hours")} hint={t("gen_hours_hint")} maxLength={100} {...f} />
          <Text k="directions_url" type="url" label={t("gen_directions")} hint={t("gen_directions_hint")} placeholder="https://maps.app.goo.gl/..." {...f} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Phone} title={t("gen_contact")} subtitle={t("gen_contact_sub")} />
        <div className="px-5 pb-5 space-y-5">
          <Phones phones={form.phones || []} onChange={(v) => set("phones", v)} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Text k="whatsapp" type="tel" inputMode="tel" label="WhatsApp" hint={t("gen_whatsapp_hint")} placeholder="+91 94144 22558" {...f} />
            <Text k="email" type="email" inputMode="email" autoCapitalize="none" label={t("gen_email")} hint={t("gen_email_hint")} placeholder="shop@example.com" {...f} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Share2} title={t("gen_social")} subtitle={t("gen_social_sub")} />
        <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
          <Text k="instagram" type="url" label="Instagram" placeholder="https://instagram.com/..." {...f} />
          <Text k="facebook" type="url" label="Facebook" placeholder="https://facebook.com/..." {...f} />
          <Text k="youtube" type="url" label="YouTube" placeholder="https://youtube.com/@..." {...f} />
          <Text k="website" type="url" label={t("gen_website")} placeholder="https://..." {...f} />
        </div>
      </Card>

      <Card>
        <CardHeader icon={Globe} title={t("gen_site")} subtitle={t("gen_site_sub")}
          actions={<a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline shrink-0">{t("gen_open_site")} <ExternalLink size={14} aria-hidden="true" /></a>} />
        <div className="px-5 pb-5 space-y-5">
          <Pair k="footer_note" label={t("gen_footer_note")} hint={t("gen_footer_note_hint")} maxLength={200} {...f} />
          <Text k="seo_description" area label={t("gen_seo")} hint={t("gen_seo_hint")} maxLength={300} {...f} />
          <div className="grid sm:grid-cols-3 gap-3">
            <Switch k="show_brands" label={t("gen_show_brands")} {...f} />
            <Switch k="show_promise" label={t("gen_show_promise")} {...f} />
            <Switch k="show_staff_login" label={t("gen_show_staff")} {...f} />
          </div>
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
