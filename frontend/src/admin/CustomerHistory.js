import React, { useState } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Cake, Repeat, ShoppingBag, Wallet, CalendarClock, Pencil, Sparkles, Award } from "lucide-react";
import { Badge, Button, Card, inputCls } from "@/admin/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Today as an Indian calendar date, whatever the device's time zone.
function todayIST() {
  const [y, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmtDayMonth(v) {
  if (!v?.day || !v?.month) return "";
  return `${v.day} ${MONTHS[v.month - 1]}${v.year ? ` ${v.year}` : ""}`;
}

// Days until the next yearly occurrence of {day, month} (0 = today).
function daysUntil(v) {
  if (!v?.day || !v?.month) return null;
  const today = todayIST();
  const y = today.getUTCFullYear();
  let next = new Date(Date.UTC(y, v.month - 1, v.day));
  if (next < today) next = new Date(Date.UTC(y + 1, v.month - 1, v.day));
  return Math.round((next - today) / 86400000);
}

export function age(v) {
  if (!v?.year) return null;
  const today = todayIST();
  const had = today.getUTCMonth() + 1 > v.month || (today.getUTCMonth() + 1 === v.month && today.getUTCDate() >= v.day);
  return today.getUTCFullYear() - v.year - (had ? 0 : 1);
}

function daysAgo(iso) {
  const d = new Date(new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const t = new Date(todayIST().toISOString().slice(0, 10));
  return Math.round((t - d) / 86400000);
}

export function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); } catch { return ""; }
}

// "Oct 2026": short enough for a session tile.
function fmtMonthYear(iso) {
  try { return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); } catch { return ""; }
}

// Whole months from the first purchase to today (IST).
function monthsSince(iso) {
  const [y, m, d] = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).split("-").map(Number);
  const today = todayIST();
  const n = (today.getUTCFullYear() - y) * 12 + (today.getUTCMonth() + 1 - m) - (today.getUTCDate() < d ? 1 : 0);
  return Math.max(0, n);
}

// "With us 2 years" / "With us 5 months" / "First purchase this month".
function useTenure() {
  const { t } = useLang();
  return (iso) => {
    const n = monthsSince(iso);
    if (n < 1) return t("cs_this_month");
    if (n < 12) return t(n === 1 ? "cs_month_one" : "cs_months").replace("{n}", n);
    const y = Math.floor(n / 12);
    return t(y === 1 ? "cs_year_one" : "cs_years").replace("{n}", y);
  };
}

export const rupees = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

function useAgo() {
  const { t } = useLang();
  return (iso) => {
    const n = daysAgo(iso);
    if (n <= 0) return t("hist_today");
    if (n === 1) return t("hist_yesterday");
    return t("hist_days_ago").replace("{n}", n);
  };
}

// Birthday within a week: worth telling the staff.
function Occasions({ h, compact }) {
  const { t } = useLang();
  const n = daysUntil(h.dob);
  if (n === null || n > 7) return null;
  const text = n === 0 ? t("hist_bday_today") : n === 1 ? t("hist_bday_tomorrow") : t("hist_bday_in").replace("{n}", n);
  return (
    <div className={compact ? "mt-2" : ""}>
      <Badge tone="pink" icon={Cake}>{text}</Badge>
    </div>
  );
}

// Compact one-glance summary for a session tile on the Sessions screen.
export function HistoryStrip({ h }) {
  const { t } = useLang();
  const ago = useAgo();
  const tenure = useTenure();
  if (!h) return null;
  if (!h.last_visit) {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone="sky" icon={Sparkles}>{t("hist_new")}</Badge>
        {h.dob && <Badge icon={Cake}>{fmtDayMonth({ ...h.dob, year: null })}</Badge>}
        <Occasions h={h} compact />
      </div>
    );
  }
  return (
    <div data-testid="history-strip" className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        <Badge icon={Repeat}><span className="num">{h.visits}</span> {t(h.visits === 1 ? "hist_visit_one" : "hist_visits_short")}</Badge>
        <Badge icon={ShoppingBag}><span className="num">{h.purchased}</span> {t("hist_bought_short")}</Badge>
        <Badge icon={Wallet}><span className="num">{rupees(h.revenue)}</span></Badge>
        {h.dob && <Badge icon={Cake}>{fmtDayMonth({ ...h.dob, year: null })}</Badge>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
        <span className="flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" /> {t("hist_last_visit")}: {ago(h.last_visit)}</span>
        {h.since && (
          <span data-testid="customer-since" className="flex items-center gap-1 text-brand-700 font-medium" title={tenure(h.since)}>
            <Award size={12} aria-hidden="true" /> {t("cs_since").replace("{d}", fmtMonthYear(h.since))}
          </span>
        )}
      </div>
      <Occasions h={h} compact />
    </div>
  );
}

// Day + month (required) and year (optional) picker for the date of birth.
export function DayMonthInput({ value, onChange, testid }) {
  const { t } = useLang();
  const v = value || {};
  const set = (k, x) => onChange({ ...v, [k]: x ? Number(x) : null });
  const cls = `${inputCls} px-2.5`;
  return (
    <div className="grid grid-cols-[1fr_1.3fr_1.4fr] gap-2">
      <select data-testid={`${testid}-day`} aria-label={t("day")} value={v.day || ""} onChange={(e) => set("day", e.target.value)} className={cls}>
        <option value="">{t("day")}</option>
        {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
      </select>
      <select data-testid={`${testid}-month`} aria-label={t("month")} value={v.month || ""} onChange={(e) => set("month", e.target.value)} className={cls}>
        <option value="">{t("month")}</option>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <input data-testid={`${testid}-year`} aria-label={t("year_opt")} inputMode="numeric" maxLength={4} placeholder={t("year_opt")} value={v.year || ""}
        onChange={(e) => set("year", e.target.value.replace(/\D/g, ""))} className={cls} />
    </div>
  );
}

// Only send complete dates; null means "leave unchanged" to the backend.
export function dayValue(v) {
  return v?.day && v?.month ? { day: v.day, month: v.month, year: v.year || null } : null;
}

function Stat({ icon: Icon, label, children, tone = "text-gray-900", onEdit, className = "" }) {
  return (
    <div className={`rounded-xl bg-gray-50 px-3 py-2.5 min-w-0 ${className}`}>
      <p className="text-xs text-gray-600 flex items-center gap-1.5"><Icon size={13} className="text-gray-500" /> {label}</p>
      <div className={`font-semibold text-[15px] mt-0.5 flex items-center gap-1.5 ${tone}`}>
        <span className="truncate num">{children}</span>
        {onEdit && <button onClick={onEdit} aria-label={label} className="ml-auto w-7 h-7 -my-1 -mr-1 rounded-lg flex items-center justify-center text-gray-500 hover:text-brand-700 hover:bg-white shrink-0"><Pencil size={13} /></button>}
      </div>
    </div>
  );
}

// Full "who is this customer" card on the session page.
export function HistoryCard({ h, customerId, onSaved, canEdit = true }) {
  const { t } = useLang();
  const ago = useAgo();
  const tenure = useTenure();
  const [edit, setEdit] = useState(null);
  if (!h) return null;
  const save = async () => {
    try {
      await api.put(`/customers/${customerId}/dates`, { dob: dayValue(edit.dob) || {} });
      toast.success("Saved"); setEdit(null); onSaved();
    } catch (e) { toast.error(apiErr(e)); }
  };
  const years = age(h.dob);
  const first = !h.last_visit;
  return (
    <Card data-testid="history-card" className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[15px] font-semibold text-gray-900">{t("hist_title")}</p>
        {first && <Badge tone="sky" icon={Sparkles}>{t("hist_new")}</Badge>}
      </div>
      {/* Loyalty ribbon: how long they have been buying here. */}
      {h.since ? (
        <div data-testid="customer-since-card" className="mb-2 flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2.5">
          <span className="w-9 h-9 rounded-full bg-white text-brand-700 flex items-center justify-center shrink-0 shadow-card"><Award size={18} aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-800">{t("cs_since").replace("{d}", fmtDate(h.since))}</p>
            <p className="text-xs text-brand-700">{tenure(h.since)}</p>
          </div>
        </div>
      ) : !first && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600">
          <Award size={14} aria-hidden="true" /> {t("cs_none")}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={Cake} label={t("hist_dob")} onEdit={canEdit ? () => setEdit({ dob: h.dob || {} }) : null} className="col-span-2">
          {h.dob ? <>{fmtDayMonth(h.dob)}{years !== null && <span className="text-gray-600 font-normal"> · {years} {t("years")}</span>}</> : <span className="text-gray-500 font-normal">{t("not_added")}</span>}
        </Stat>
        <Stat icon={Repeat} label={t("hist_visits")}>{h.visits}</Stat>
        <Stat icon={ShoppingBag} label={t("hist_purchased")}>{h.purchased}</Stat>
        <Stat icon={Wallet} label={t("hist_revenue")}>{rupees(h.revenue)}</Stat>
        <Stat icon={CalendarClock} label={t("hist_last_visit")}>
          {first ? <span className="text-gray-600 font-normal">{t("hist_first_visit")}</span>
            : <span title={fmtDate(h.last_visit)}>{ago(h.last_visit)}</span>}
        </Stat>
      </div>
      <div className="mt-3 empty:hidden"><Occasions h={h} /></div>
      {edit && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div><span className="block text-sm font-medium text-gray-800 mb-1.5">{t("dob_label")}</span><DayMonthInput testid="edit-dob" value={edit.dob} onChange={(v) => setEdit({ ...edit, dob: v })} /></div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEdit(null)} className="flex-1">{t("cancel")}</Button>
            <Button data-testid="save-dates" size="sm" onClick={save} className="flex-1">{t("save")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
