import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { History, Pencil, Trash2, CalendarRange, ShoppingBag, CircleSlash } from "lucide-react";
import Avatar from "@/admin/Avatar";
import { can } from "@/admin/perms";
import { Badge, Button, Card, Empty, Field, IconButton, Page, PageHeader, Segmented, Sheet, Skeleton, inputCls } from "@/admin/ui";

// Reports = statistics + session history for one period. One date picker
// drives both, so checking "how did today go" is a single tap.

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; } }
function todayIST() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function daysBack(n) {
  const [y, m, d] = todayIST().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}
// Date inputs give YYYY-MM-DD; the backend treats them as Indian calendar days.
function rangeQuery(frm, to) {
  const q = [];
  if (frm) q.push(`frm=${frm}`);
  if (to) q.push(`to=${to}`);
  return q.length ? `?${q.join("&")}` : "";
}

// Quick ranges; custom dates fold out on demand.
function RangePicker({ frm, to, setFrm, setTo }) {
  const { t } = useLang();
  const today = todayIST();
  const presets = [
    { id: "today", label: t("range_today"), f: today, to: today },
    { id: "yesterday", label: t("range_yesterday"), f: daysBack(1), to: daysBack(1) },
    { id: "7", label: t("range_7"), f: daysBack(6), to: today },
    { id: "30", label: t("range_30"), f: daysBack(29), to: today },
    { id: "all", label: t("range_all"), f: "", to: "" },
  ];
  const preset = presets.find((p) => p.f === frm && p.to === to)?.id;
  const [custom, setCustom] = useState(!preset);
  return (
    <div className="mb-5">
      <div className="flex gap-2">
        <Segmented testid="range" value={custom ? "" : preset} onChange={(id) => { const p = presets.find((x) => x.id === id); setFrm(p.f); setTo(p.to); setCustom(false); }}
          options={presets.map((p) => ({ id: p.id, label: p.label }))} fit className="flex-1 lg:flex-none lg:w-[480px]" />
        <button data-testid="range-custom" onClick={() => setCustom(!custom)} aria-pressed={custom} aria-label={t("custom_range")} title={t("custom_range")}
          className={`w-11 shrink-0 rounded-xl flex items-center justify-center transition-colors ${custom ? "bg-brand-700 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
          <CalendarRange size={18} aria-hidden="true" />
        </button>
      </div>
      {custom && (
        <div className="grid grid-cols-2 gap-2 mt-2 lg:max-w-md animate-in fade-in slide-in-from-top-1 duration-150">
          <Field label={t("from_date")}><input data-testid="range-from" type="date" value={frm} max={to || today} onChange={(e) => setFrm(e.target.value)} className={inputCls} /></Field>
          <Field label={t("to_date")}><input data-testid="range-to" type="date" value={to} min={frm} max={today} onChange={(e) => setTo(e.target.value)} className={inputCls} /></Field>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "text-gray-900", hint }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-card px-4 py-3.5 min-w-0">
      <p className="text-sm font-medium text-gray-700 truncate">{label}</p>
      <p className={`num mt-1 text-[22px] lg:text-[26px] font-semibold tracking-tight truncate ${tone}`}>{value}</p>
      {hint && <div className="text-[13px] text-gray-700 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{hint}</div>}
    </div>
  );
}

function Stats({ s }) {
  const { t } = useLang();
  if (!s) return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[92px] rounded-2xl" />)}</div>;
  const conv = s.total_sessions ? Math.round((s.purchased / s.total_sessions) * 1000) / 10 : 0;
  const avg = s.purchased ? s.total_earnings / s.purchased : 0;
  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label={t("earnings")} value={inr(s.total_earnings)} tone="text-emerald-700"
          hint={s.total_discount ? <span>{t("discount")} <b className="num font-semibold text-gray-900">{inr(s.total_discount)}</b></span> : null} />
        <Kpi label={t("conversion")} value={`${conv}%`} hint={<>
          <span className="inline-flex items-center gap-1"><ShoppingBag size={13} className="text-emerald-700" aria-hidden="true" /><b className="num font-semibold text-gray-900">{s.purchased}</b> {t("purchased")}</span>
          <span className="inline-flex items-center gap-1"><CircleSlash size={13} className="text-gray-500" aria-hidden="true" /><b className="num font-semibold text-gray-900">{s.not_purchased}</b> {t("not_purchased")}</span>
        </>} />
        <Kpi label={t("avg_bill")} value={inr(avg)} />
        <Kpi label={t("total_value")} value={inr(s.total_value)} />
      </div>
      <p className="text-xs text-gray-600 mt-2">{t("closed_sessions_only")}</p>
    </div>
  );
}

function EditSheet({ edit, setEdit, onSave }) {
  const { t } = useLang();
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); await onSave(); setSaving(false); };
  const money = (k, label) => (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">₹</span>
        <input inputMode="decimal" value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className={`${inputCls} pl-8 num`} />
      </div>
    </Field>
  );
  return (
    <Sheet title={edit.customer_name} subtitle={t("purchased_q")} onClose={() => setEdit(null)} size="sm" locked={saving}
      footer={<Button data-testid="save-edit-hist" onClick={save} loading={saving} size="xl" full>{t("save")}</Button>}>
      <Segmented value={edit.purchased ? "yes" : "no"} onChange={(v) => setEdit({ ...edit, purchased: v === "yes" })}
        options={[{ id: "yes", label: t("bought") }, { id: "no", label: t("didnt_buy") }]} />
      {edit.purchased && (
        <div className="space-y-4 mt-4">
          {money("total_value", t("bill_amount"))}
          {money("discount", t("discount"))}
          {money("final_paid", t("final_paid"))}
        </div>
      )}
    </Sheet>
  );
}

function SessionList({ user, list, reload }) {
  const { t } = useLang();
  const [edit, setEdit] = useState(null);
  const del = async (id) => {
    if (!window.confirm("Delete this session?")) return;
    try { await api.delete(`/sessions/${id}`); toast.success("Deleted"); reload(); } catch (e) { toast.error(apiErr(e)); }
  };
  const saveEdit = async () => {
    const tv = parseFloat(edit.total_value) || 0, dv = parseFloat(edit.discount) || 0;
    if (edit.purchased && dv > tv) { toast.error("Discount cannot be more than the bill amount"); return; }
    try {
      await api.patch(`/sessions/${edit.id}`, { purchased: !!edit.purchased, total_value: tv, discount: dv, final_paid: parseFloat(edit.final_paid) || 0 });
      toast.success("Updated"); setEdit(null); reload();
    } catch (e) { toast.error(apiErr(e)); }
  };
  return (
    <>
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-semibold text-gray-900">{t("set_history")}</h2>
        {list && <span className="text-sm text-gray-700 num">{list.length} {list.length === 1 ? t("session_1") : t("sessions_n")}</span>}
      </div>
      <Card className="overflow-hidden">
        {list === null ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.length === 0 ? (
          <Empty icon={History} title={t("today_empty")} className="py-12" />
        ) : (
          <div className="divide-y divide-gray-100">
            {list.map((s) => (
              <div data-testid={`hist-${s.id}`} key={s.id} className="flex items-center gap-3 pl-4 pr-2 lg:pl-5 lg:pr-3 py-2.5 min-h-[64px]">
                <Avatar src={s.thumb} className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{s.customer_name}</p>
                  <p className="text-sm text-gray-700 truncate"><span className="num">{fmt(s.start_time)}</span> · {s.admin_username}</p>
                </div>
                {s.status === "active" ? <Badge tone="brand">{t("active")}</Badge>
                  : s.purchased ? <span className="num text-sm font-semibold text-emerald-700">{inr(s.final_paid)}</span>
                    : <Badge>{t("not_purchased")}</Badge>}
                <div className="flex shrink-0">
                  {s.status === "closed" && can(user, "history_edit") && <IconButton data-testid={`edit-hist-${s.id}`} icon={Pencil} label={t("edit")} size={17} onClick={() => setEdit({ ...s })} />}
                  {can(user, "history_delete") && <IconButton data-testid={`del-hist-${s.id}`} icon={Trash2} label={t("delete")} size={17} onClick={() => del(s.id)} className="hover:!text-red-600 hover:!bg-red-50" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit && <EditSheet edit={edit} setEdit={setEdit} onSave={saveEdit} />}
    </>
  );
}

export default function Reports({ user }) {
  const { t } = useLang();
  const [frm, setFrm] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [stats, setStats] = useState(null);
  const [list, setList] = useState(null);
  const showStats = can(user, "stats_view");
  const showList = can(user, "history_view");

  const load = () => {
    const q = rangeQuery(frm, to);
    if (showStats) api.get(`/stats${q}`).then((r) => setStats(r.data)).catch((e) => toast.error(apiErr(e)));
    if (showList) api.get(`/sessions/history${q}`).then((r) => setList(r.data)).catch((e) => { setList([]); toast.error(apiErr(e)); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setStats(null); setList(null); load(); }, [frm, to]);

  return (
    <Page>
      <PageHeader title={t("nav_reports")} subtitle={t("reports_sub")} />
      <RangePicker frm={frm} to={to} setFrm={setFrm} setTo={setTo} />
      {showStats && <Stats s={stats} />}
      {showList && <SessionList user={user} list={list} reload={load} />}
      {!showStats && !showList && <Card><Empty icon={History} title={t("no_access")} /></Card>}
    </Page>
  );
}
