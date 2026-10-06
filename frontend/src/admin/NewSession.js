import React, { useState, useEffect, useRef } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Camera as CamIcon, X, MessageCircle, ChevronDown, RotateCcw, Check } from "lucide-react";
import Camera from "@/admin/Camera";
import Avatar from "@/admin/Avatar";
import { DayMonthInput, dayValue } from "@/admin/CustomerHistory";
import { Button, Field, Sheet, Toggle, inputCls } from "@/admin/ui";

// Extra session fields and the WhatsApp consent default rarely change: they
// are fetched once (right after sign-in) so the form opens instantly.
const cache = { fields: null, wa: null };
export function prefetchSessionConfig() {
  api.get("/config/fields").then((r) => { cache.fields = r.data; }).catch(() => {});
  api.get("/whatsapp/client-config").then((r) => { cache.wa = r.data; }).catch(() => {});
}

// New session in as few taps as possible: type the mobile number, tap the
// returning customer (or type a name), Start. Photo and the rest are optional.
export default function NewSession({ onClose, onCreated, onExisting, initial }) {
  const { t } = useLang();
  const [fields, setFields] = useState(cache.fields || []);
  const [wa, setWa] = useState(cache.wa);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobile2, setMobile2] = useState("");
  const [extra, setExtra] = useState({});
  const [dob, setDob] = useState({});
  const [photo, setPhoto] = useState("");
  const [showCam, setShowCam] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState(null);
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(!!cache.wa?.consent_default);
  const [optedOut, setOptedOut] = useState(false);
  const active = useRef(null);
  const timer = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    api.get("/config/fields").then((r) => { cache.fields = r.data; setFields(r.data); }).catch(() => {});
    if (!cache.wa) api.get("/whatsapp/client-config").then((r) => { cache.wa = r.data; setWa(r.data); setConsent(!!r.data?.consent_default); }).catch(() => {});
    api.get("/sessions/active").then((r) => { active.current = r.data; }).catch(() => {});
    if (initial) pick(initial);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (q) => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    timer.current = setTimeout(() => {
      api.get(`/customers/search?q=${encodeURIComponent(q.trim())}`).then((r) => setSuggestions(r.data)).catch(() => {});
    }, 180);
  };

  function pick(c) {
    setName(c.name || ""); setMobile(c.mobile || ""); setMobile2(c.mobile2 || "");
    setExtra(c.extra || {}); setPhoto(c.photo || "");
    setDob(c.dob || {});
    if (c.wa) { setConsent(c.wa.opted_in || (!!cache.wa?.consent_default && !c.wa.opted_out)); setOptedOut(!!c.wa.opted_out); }
    setPicked(c);
    setSuggestions([]);
    setError("");
  }

  const clearPick = () => { setPicked(null); setPhoto(""); };

  const required = fields.filter((f) => f.required);
  const optional = fields.filter((f) => !f.required);

  const submit = async () => {
    if (!mobile.trim()) { setError(t("mobile")); return; }
    if (!name.trim()) { setError(t("cust_name")); nameRef.current?.focus(); return; }
    const missing = required.filter((f) => [undefined, null, "", false].includes(extra[f.label])).map((f) => f.label);
    if (missing.length) { setError(missing.join(", ")); return; }
    setError("");
    // Same customer already in the shop: open their session instead of a second one.
    const open = (active.current || []).find((s) => (s.mobile || "").trim() === mobile.trim());
    if (open) { toast.message(t("already_open")); onExisting(open.id); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/sessions", { customer_name: name.trim(), mobile: mobile.trim(), mobile2, photo, extra, dob: dayValue(dob), ...(wa?.enabled ? { wa_consent: consent } : {}) });
      onCreated(data);
    } catch (e) { toast.error(apiErr(e)); setSaving(false); }
  };

  if (showCam) return <Camera confirm={false} onCapture={(img) => { setPhoto(img); setShowCam(false); }} onClose={() => setShowCam(false)} />;

  const fieldInput = (f) => (
    f.type === "checkbox" ? (
      <label key={f.id} className="flex items-center gap-3 min-h-[44px] text-[15px] font-medium text-gray-800">
        <input type="checkbox" data-testid={`field-${f.id}`} checked={!!extra[f.label]} onChange={(e) => setExtra({ ...extra, [f.label]: e.target.checked })} className="w-5 h-5 rounded accent-brand-700" />
        {f.label}{f.required && <span className="text-red-600" aria-hidden="true">*</span>}
      </label>
    ) : (
      <Field key={f.id} label={<>{f.label}{f.required && <span className="text-red-600" aria-hidden="true"> *</span>}</>}>
        <input data-testid={`field-${f.id}`} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "decimal" : undefined}
          value={extra[f.label] || ""} onChange={(e) => setExtra({ ...extra, [f.label]: e.target.value })} className={inputCls} />
      </Field>
    )
  );

  return (
    <Sheet title={t("new_session")} onClose={onClose} locked={saving} closeTestId="close-create-session"
      footer={<Button data-testid="create-session-submit" onClick={submit} loading={saving} size="xl" full>{t("start_session")}</Button>}>
      <div className="flex gap-4">
        {/* Photo: optional, one tap opens the camera; tap again to retake. */}
        <div className="shrink-0">
          {photo ? (
            <div className="relative w-24">
              <button type="button" data-testid="recapture-photo" onClick={() => setShowCam(true)} aria-label={t("retake")} className="block w-24 h-[120px] rounded-2xl overflow-hidden border border-gray-200">
                <img src={photo} alt="" className="w-full h-full object-cover" />
                <span className="absolute bottom-1.5 left-1.5 w-7 h-7 rounded-full bg-gray-950/60 text-white flex items-center justify-center"><RotateCcw size={14} aria-hidden="true" /></span>
              </button>
              <button type="button" data-testid="remove-photo" onClick={() => setPhoto("")} aria-label={t("remove")}
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white border border-gray-300 shadow-card text-gray-700 flex items-center justify-center"><X size={15} /></button>
            </div>
          ) : (
            <button type="button" data-testid="capture-photo-btn" onClick={() => setShowCam(true)}
              className="w-24 h-[120px] rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-brand-50 hover:border-brand-300 active:bg-brand-50 transition-colors flex flex-col items-center justify-center gap-1.5 text-gray-700">
              <span className="w-10 h-10 rounded-full bg-white shadow-card flex items-center justify-center text-brand-700"><CamIcon size={20} aria-hidden="true" /></span>
              <span className="text-xs font-medium leading-tight text-center px-1.5">{t("capture_photo")}</span>
              <span className="text-[11px] text-gray-500">{t("optional")}</span>
            </button>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <Field label={t("mobile")}>
            <input data-testid="session-mobile" autoFocus={!initial} value={mobile} type="tel" inputMode="numeric" autoComplete="off" enterKeyHint="next"
              onChange={(e) => { setMobile(e.target.value); setPicked(null); search(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nameRef.current?.focus(); } }} className={`${inputCls} num`} />
          </Field>
          <Field label={t("cust_name")}>
            <input ref={nameRef} data-testid="session-name" value={name} autoCapitalize="words" autoComplete="off" enterKeyHint="go"
              onChange={(e) => { setName(e.target.value); if (!picked) search(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Returning customers: one tap fills everything in. */}
      {suggestions.length > 0 && !picked && (
        <div className="mt-4 rounded-2xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          <p className="px-4 pt-2.5 pb-1 text-xs font-medium text-gray-600">{t("returning_customers")}</p>
          {suggestions.slice(0, 5).map((c) => (
            <button type="button" data-testid={`suggestion-${c.id}`} key={c.id} onClick={() => pick(c)}
              className="flex items-center gap-3 w-full text-left px-4 py-2.5 min-h-[56px] hover:bg-gray-50 active:bg-brand-50 transition-colors">
              <Avatar src={c.thumb || c.photo} className="w-10 h-10 rounded-full shrink-0" />
              <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{c.name}</span><span className="block text-sm text-gray-600 num">{c.mobile}</span></span>
              <span className="text-sm font-medium text-brand-700">{t("select")}</span>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800 animate-in fade-in duration-150">
          <Check size={16} aria-hidden="true" /> <span className="flex-1 font-medium">{t("welcome_back")}</span>
          <button type="button" onClick={clearPick} className="font-medium underline underline-offset-2">{t("nt_change")}</button>
        </div>
      )}

      {required.length > 0 && <div className="mt-4 space-y-3">{required.map(fieldInput)}</div>}

      {wa?.enabled && (
        <div data-testid="wa-consent" className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 px-3.5 py-3">
          <MessageCircle size={18} className="text-emerald-600 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm text-gray-800">
            <span className="font-medium">{t("wa_consent")}</span>
            {optedOut && <span className="block text-[13px] text-amber-800 mt-0.5">{t("wa_consent_optout")}</span>}
          </span>
          <Toggle checked={consent} onChange={setConsent} label={t("wa_consent")} testid="wa-consent-toggle" />
        </div>
      )}

      <button type="button" data-testid="more-details" onClick={() => setMore(!more)} aria-expanded={more}
        className="mt-3 w-full flex items-center justify-between min-h-[48px] px-1 text-[15px] font-medium text-gray-800">
        {t("more_details")}
        <ChevronDown size={18} className={`text-gray-500 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {more && (
        <div className="space-y-3 pb-1 animate-in fade-in slide-in-from-top-1 duration-150">
          <Field label={t("mobile2")}>
            <input data-testid="session-mobile2" value={mobile2} type="tel" inputMode="numeric" onChange={(e) => setMobile2(e.target.value)} className={`${inputCls} num`} />
          </Field>
          <div>
            <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("dob_label")}</span>
            <DayMonthInput testid="session-dob" value={dob} onChange={setDob} />
          </div>
          {optional.map(fieldInput)}
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-700">{t("please_fill")}: {error}</p>}
    </Sheet>
  );
}
