import React, { useState, useEffect, useCallback } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Plus, Clock, History, Search, ChevronLeft, ChevronRight, Camera as CamIcon, Users, RefreshCw, X, MessageCircle } from "lucide-react";
import Camera from "@/admin/Camera";
import Avatar from "@/admin/Avatar";
import { HistoryStrip, DayMonthInput, dayValue } from "@/admin/CustomerHistory";
import { can } from "@/admin/perms";
import { Button, Field, Page, PageHeader, Sheet, Empty, Skeleton, Badge, IconButton, Card, inputCls } from "@/admin/ui";

function fmt(iso) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; }
}
// Days are Indian calendar days, whatever the device's time zone.
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}
function shiftDay(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function fmtDay(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function CreateSession({ onClose, onCreated, onExisting, active, fields, wa }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobile2, setMobile2] = useState("");
  const [extra, setExtra] = useState({});
  const [photo, setPhoto] = useState("");
  const [showCam, setShowCam] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  // WhatsApp consent: default from the super admin setting, or the returning
  // customer's earlier answer once they are picked from the suggestions.
  const [consent, setConsent] = useState(!!wa?.consent_default);
  const [optedOut, setOptedOut] = useState(false);
  const [dob, setDob] = useState({});

  const search = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); return; }
    try { const { data } = await api.get(`/customers/search?q=${encodeURIComponent(q)}`); setSuggestions(data); }
    catch { /* ignore */ }
  }, []);

  const pick = (c) => {
    setName(c.name || ""); setMobile(c.mobile || ""); setMobile2(c.mobile2 || "");
    setExtra(c.extra || {}); if (c.photo) setPhoto(c.photo);
    setDob(c.dob || {});
    if (c.wa) { setConsent(c.wa.opted_in || (!!wa?.consent_default && !c.wa.opted_out)); setOptedOut(c.wa.opted_out); }
    setSuggestions([]);
    toast.success("Customer details loaded");
  };

  const submit = async () => {
    if (!name.trim() || !mobile.trim()) { toast.error("Name & mobile required"); return; }
    const missing = fields.filter((f) => f.required && [undefined, null, "", false].includes(extra[f.label])).map((f) => f.label);
    if (missing.length) { toast.error(`${t("please_fill")}: ${missing.join(", ")}`); return; }
    // Same customer already in the shop: open their session instead of a second one.
    const open = active.find((s) => (s.mobile || "").trim() === mobile.trim());
    if (open) { toast.error(t("already_open")); onExisting(open.id); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/sessions", { customer_name: name, mobile, mobile2, photo, extra, dob: dayValue(dob), ...(wa?.enabled ? { wa_consent: consent } : {}) });
      onCreated(data);
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };

  if (showCam) return <Camera onCapture={(img) => { setPhoto(img); setShowCam(false); }} onClose={() => setShowCam(false)} />;

  return (
    <Sheet title={t("new_session")} subtitle={t("new_session_sub")} onClose={onClose} size="lg" closeTestId="close-create-session"
      footer={<Button data-testid="create-session-submit" onClick={submit} loading={saving} size="lg" full>{t("create_session")}</Button>}>
      <div className="grid sm:grid-cols-[1fr_200px] gap-6">
        <div className="space-y-4 min-w-0">
          <div className="relative">
            <Field label={t("mobile")}>
              <input data-testid="session-mobile" value={mobile} inputMode="numeric"
                onChange={(e) => { setMobile(e.target.value); search(e.target.value); }} className={inputCls} />
            </Field>
            {suggestions.length > 0 && (
              <div className="absolute z-10 inset-x-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-pop p-1 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-100">
                <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-gray-500">{t("returning_customers")}</p>
                {suggestions.map((c) => (
                  <button data-testid={`suggestion-${c.id}`} key={c.id} onClick={() => pick(c)}
                    className="flex items-center gap-3 w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50">
                    <Avatar src={c.thumb || c.photo} className="w-8 h-8 rounded-full shrink-0" />
                    <span className="min-w-0"><span className="block text-sm font-medium text-gray-900 truncate">{c.name}</span><span className="block text-xs text-gray-600">{c.mobile}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Field label={t("cust_name")}>
            <input data-testid="session-name" value={name} onChange={(e) => { setName(e.target.value); search(e.target.value); }} className={inputCls} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t("mobile2")}>
              <input data-testid="session-mobile2" value={mobile2} inputMode="numeric" onChange={(e) => setMobile2(e.target.value)} className={inputCls} />
            </Field>
            <div>
              <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("dob_label")}</span>
              <DayMonthInput testid="session-dob" value={dob} onChange={setDob} />
            </div>
          </div>
          {fields.map((f) => (
            f.type === "checkbox" ? (
              <label key={f.id} className="flex items-center gap-3 text-sm font-medium text-gray-800">
                <input type="checkbox" data-testid={`field-${f.id}`} checked={!!extra[f.label]} onChange={(e) => setExtra({ ...extra, [f.label]: e.target.checked })} className="w-5 h-5 rounded accent-brand-700" />
                {f.label}{f.required && <span className="text-red-600" aria-hidden="true">*</span>}
              </label>
            ) : (
              <Field key={f.id} label={<>{f.label}{f.required ? <span className="text-red-600" aria-hidden="true"> *</span> : <span className="text-gray-500 font-normal"> ({t("optional")})</span>}</>}>
                <input data-testid={`field-${f.id}`} type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                  value={extra[f.label] || ""} onChange={(e) => setExtra({ ...extra, [f.label]: e.target.value })} className={inputCls} />
              </Field>
            )
          ))}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("photo_optional")}</span>
          {photo ? (
            <div className="relative max-w-[200px]">
              <img src={photo} alt="" className="w-full aspect-[3/4] object-cover rounded-2xl border border-gray-200" />
              <div className="absolute inset-x-2 bottom-2 flex gap-2">
                <Button data-testid="recapture-photo" size="sm" variant="secondary" icon={RefreshCw} onClick={() => setShowCam(true)} className="flex-1">{t("retake")}</Button>
                <IconButton data-testid="remove-photo" icon={X} label={t("remove")} onClick={() => setPhoto("")} className="bg-white border border-gray-300 w-9 h-9" size={16} />
              </div>
            </div>
          ) : (
            <button data-testid="capture-photo-btn" onClick={() => setShowCam(true)}
              className="w-full py-6 sm:py-0 sm:aspect-[3/4] rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-brand-50 hover:border-brand-300 transition-colors flex flex-col items-center justify-center gap-2 text-gray-700">
              <span className="w-12 h-12 rounded-full bg-white shadow-card flex items-center justify-center text-brand-700"><CamIcon size={22} /></span>
              <span className="text-sm font-medium">{t("capture_photo")}</span>
              <span className="text-xs text-gray-600 px-4 text-center">{t("photo_hint")}</span>
            </button>
          )}
        </div>
      </div>
      {wa?.enabled && (
        <label data-testid="wa-consent" className="mt-5 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3.5 cursor-pointer has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/60 transition-colors">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-600 shrink-0" />
          <span className="text-sm text-gray-800">
            <span className="flex items-center gap-1.5 font-medium"><MessageCircle size={15} className="text-emerald-600" /> {t("wa_consent")}</span>
            {optedOut && <span className="block text-[13px] text-amber-800 mt-1">{t("wa_consent_optout")}</span>}
          </span>
        </label>
      )}
    </Sheet>
  );
}

function TodayPopup({ onClose }) {
  const { t } = useLang();
  const [date, setDate] = useState(todayIST());
  const [list, setList] = useState(null);
  useEffect(() => {
    setList(null);
    api.get(`/sessions/today?date=${date}`).then((r) => setList(r.data)).catch((e) => { setList([]); toast.error(apiErr(e)); });
  }, [date]);
  const shift = (d) => setDate(shiftDay(date, d));
  const bought = (list || []).filter((s) => s.purchased);
  const revenue = bought.reduce((a, s) => a + Number(s.final_paid || 0), 0);
  return (
    <Sheet title={t("past_today")} onClose={onClose}>
      <div className="flex items-center justify-between rounded-xl bg-gray-100 p-1 mb-4">
        <IconButton data-testid="day-prev" icon={ChevronLeft} label="Previous day" onClick={() => shift(-1)} className="w-9 h-9" />
        <span className="font-medium text-gray-900 text-sm">{fmtDay(date)}</span>
        <IconButton data-testid="day-next" icon={ChevronRight} label="Next day" onClick={() => shift(1)} disabled={date >= todayIST()} className="w-9 h-9 disabled:opacity-30" />
      </div>
      {list && list.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[[t("hist_visits"), list.length, "text-gray-900"], [t("hist_purchased"), bought.length, "text-gray-900"], [t("hist_revenue"), `₹${revenue.toLocaleString("en-IN")}`, "text-emerald-700"]].map(([l, v, tone]) => (
            <div key={l} className="rounded-xl bg-gray-50 px-3 py-2.5"><p className="text-xs text-gray-600">{l}</p><p className={`num font-semibold ${tone}`}>{v}</p></div>
          ))}
        </div>
      )}
      {!list ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : list.length === 0 ? (
        <Empty icon={History} title={t("today_empty")} className="py-10" />
      ) : (
        <div className="divide-y divide-gray-100">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <Avatar src={s.thumb} className="w-9 h-9 rounded-full shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{s.customer_name}</p>
                <p className="text-xs text-gray-600 num">{s.mobile} · {fmt(s.start_time)}</p>
              </div>
              {s.status === "active" ? <Badge tone="brand">{t("active")}</Badge>
                : s.purchased ? <span className="num text-sm font-medium text-emerald-700">₹{Number(s.final_paid || 0).toLocaleString("en-IN")}</span>
                  : <Badge>{t("not_purchased")}</Badge>}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// One section per staff member who started the sessions; yours first.
function groupByAdmin(list, user) {
  const groups = new Map();
  for (const s of list) {
    const id = s.admin_id || "unknown";
    if (!groups.has(id)) groups.set(id, { id, name: s.admin_username || "", mine: id === user?.id, items: [] });
    groups.get(id).items.push(s);
  }
  return [...groups.values()].sort((a, b) => (b.mine - a.mine) || a.name.localeCompare(b.name));
}

function SessionCard({ s, onOpen }) {
  const { t } = useLang();
  return (
    <button data-testid={`session-card-${s.id}`} onClick={onOpen}
      className="group text-left bg-white rounded-2xl border border-gray-200/80 shadow-card p-3.5 flex gap-4 transition-all hover:shadow-lift hover:border-brand-200 hover:-translate-y-0.5 active:translate-y-0 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <Avatar src={s.thumb} className="w-20 h-[104px] rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 truncate text-[15.5px]">{s.customer_name}</p>
          {s.has_photo === false && <Badge tone="amber" className="shrink-0">{t("entry_session")}</Badge>}
        </div>
        <p className="text-sm text-gray-600 num mt-0.5">{s.mobile}</p>
        <p className="flex items-center gap-1.5 text-[13px] text-gray-600 mt-1"><Clock size={13} /> {t("started_at")} {fmt(s.start_time)}</p>
        <HistoryStrip h={s.history} />
      </div>
    </button>
  );
}

export default function Canvas({ user, openSession }) {
  const { t } = useLang();
  const [sessions, setSessions] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [fields, setFields] = useState([]);
  const [wa, setWa] = useState(null);
  const [q, setQ] = useState("");

  const load = () => api.get("/sessions/active").then((r) => setSessions(r.data)).catch(() => setSessions([]));
  useEffect(() => {
    load();
    api.get("/config/fields").then((r) => setFields(r.data)).catch(() => {});
    api.get("/whatsapp/client-config").then((r) => setWa(r.data)).catch(() => {});
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = (sessions || []).filter((s) => !needle || [s.customer_name, s.mobile].some((v) => (v || "").toLowerCase().includes(needle)));
  const count = sessions?.length || 0;
  const canStart = can(user, "sessions_manage");

  return (
    <Page className="pb-28 lg:pb-9">
      <PageHeader title={t("canvas_title")}
        subtitle={sessions ? (count ? t("canvas_sub").replace("{n}", count) : t("canvas_sub_none")) : " "}
        actions={<>
          <Button data-testid="today-sessions-btn" variant="secondary" icon={History} onClick={() => setShowToday(true)}>{t("past_today")}</Button>
          {canStart && <Button data-testid="new-session-btn" icon={Plus} onClick={() => setShowCreate(true)} className="hidden lg:inline-flex">{t("new_session")}</Button>}
        </>} />

      {count > 4 && (
        <div className="relative mb-4 max-w-md">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input data-testid="session-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_sessions")} className={`${inputCls} pl-10`} />
        </div>
      )}

      {sessions === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
        </div>
      ) : count === 0 ? (
        <Card><Empty icon={Users} title={t("no_sessions_title")} body={t("no_sessions")}
          action={canStart && <Button icon={Plus} onClick={() => setShowCreate(true)}>{t("new_session")}</Button>} /></Card>
      ) : shown.length === 0 ? (
        <Card><Empty icon={Search} title={t("no_match")} className="py-10" /></Card>
      ) : (
        <div className="space-y-7 lg:space-y-9">
          {groupByAdmin(shown, user).map((g) => (
            <section key={g.id} data-testid={`admin-section-${g.name}`}>
              <div className="flex items-center gap-2.5 mb-3">
                <span className={`w-7 h-7 rounded-full text-[11px] font-semibold flex items-center justify-center ${g.mine ? "bg-brand-700 text-white" : "bg-gray-200 text-gray-700"}`}>{(g.name || "?").slice(0, 2).toUpperCase()}</span>
                <h2 className="font-semibold text-gray-900">{g.mine ? t("my_customers") : t("staff_customers").replace("{name}", g.name)}</h2>
                <span className="num text-sm text-gray-600">{g.items.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
                {g.items.map((s) => <SessionCard key={s.id} s={s} onOpen={() => openSession(s.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Phones: the main action sits within thumb reach. */}
      {canStart && <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-canvas via-canvas/90 to-transparent pointer-events-none">
        <Button data-testid="new-session-btn-mobile" icon={Plus} size="lg" full onClick={() => setShowCreate(true)} className="shadow-lift pointer-events-auto">{t("new_session")}</Button>
      </div>}

      {showCreate && <CreateSession fields={fields} wa={wa} active={sessions || []}
        onExisting={(id) => { setShowCreate(false); openSession(id); }} onClose={() => setShowCreate(false)} onCreated={(s) => { setShowCreate(false); load(); openSession(s.id); }} />}
      {showToday && <TodayPopup onClose={() => setShowToday(false)} />}
    </Page>
  );
}
