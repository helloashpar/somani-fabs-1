import React, { useState, useEffect, useRef } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import {
  Database, History, BarChart3, Shirt, Users, Monitor, MessageCircle, Download, Trash2, Copy, Search, Loader2,
  ChevronLeft, ChevronRight, Cake, Pencil, IndianRupee, Percent, ShoppingBag, Receipt, CircleSlash, Tag, ImagePlus, ScrollText, UserPlus, Shield, SlidersHorizontal, ListPlus, Languages,
} from "lucide-react";
import Avatar from "@/admin/Avatar";
import { fmtDayMonth, fmtDate, rupees } from "@/admin/CustomerHistory";
import Marketing from "@/admin/Marketing";
import Catalog from "@/admin/Catalog";
import SessionFields from "@/admin/SessionFields";
import Team from "@/admin/Team";
import { can, isSuper as isSuperUser } from "@/admin/perms";
import { Badge, HubPage, Button, Card, CardHeader, Empty, Field, IconButton, Page, PageHeader, Segmented, Sheet, Skeleton, Stat, inputCls } from "@/admin/ui";

// `perm`: the permission needed to see the tab (see perms.js); `superOnly`: team management.
export const SETTINGS_TABS = [
  { id: "stats", icon: BarChart3, label: "set_stats", sub: "stats_sub", perm: "stats_view" },
  { id: "db", icon: Database, label: "set_db", sub: "customers_sub", perm: "customers_view" },
  { id: "history", icon: History, label: "set_history", sub: "history_sub", perm: "history_view" },
  { id: "catalog", icon: Shirt, label: "set_catalog", sub: "catalog_sub", perm: "catalog_manage" },
  { id: "admins", icon: Users, label: "set_admins", sub: "admins_sub", superOnly: true },
  { id: "marketing", icon: MessageCircle, label: "set_marketing", sub: "marketing_sub", perm: "marketing_manage" },
  { id: "more", icon: SlidersHorizontal, label: "set_more", sub: "more_sub" },
];

const HUBS = new Set(["catalog", "marketing", "more"]);

export function visibleTabs(user) {
  return SETTINGS_TABS.filter((tb) => (tb.superOnly ? isSuperUser(user) : !tb.perm || can(user, tb.perm)));
}

// Runs an API action and shows a toast on failure, so no button fails silently.
async function run(action, okMsg) {
  try { await action(); if (okMsg) toast.success(okMsg); return true; }
  catch (e) { toast.error(apiErr(e)); return false; }
}

// Date inputs give YYYY-MM-DD; the backend treats them as Indian calendar days.
function rangeQuery(frm, to) {
  const q = [];
  if (frm) q.push(`frm=${frm}`);
  if (to) q.push(`to=${to}`);
  return q.length ? `?${q.join("&")}` : "";
}

function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; } }
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
function todayIST() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function daysBack(n) {
  const [y, m, d] = todayIST().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
}

// Quick ranges plus an optional custom from/to.
function RangePicker({ frm, to, setFrm, setTo, testid }) {
  const { t } = useLang();
  const today = todayIST();
  const presets = [
    { id: "today", label: t("range_today"), f: today, to: today },
    { id: "7", label: t("range_7"), f: daysBack(6), to: today },
    { id: "30", label: t("range_30"), f: daysBack(29), to: today },
    { id: "all", label: t("range_all"), f: "", to: "" },
  ];
  const current = presets.find((p) => p.f === frm && p.to === to)?.id || "custom";
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
      <Segmented value={current} onChange={(id) => { const p = presets.find((x) => x.id === id); setFrm(p.f); setTo(p.to); }}
        options={presets.map((p) => ({ id: p.id, label: p.label }))} className="lg:w-[420px]" />
      <div className="flex items-center gap-2">
        <input data-testid={`${testid}-from`} type="date" aria-label={t("from_date")} value={frm} onChange={(e) => setFrm(e.target.value)} className={`${inputCls} lg:w-40`} />
        <span className="text-gray-600 text-sm">{t("to_date")}</span>
        <input data-testid={`${testid}-to`} type="date" aria-label={t("to_date")} value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} lg:w-40`} />
      </div>
    </div>
  );
}

function Stats() {
  const { t } = useLang();
  const [frm, setFrm] = useState(todayIST()); const [to, setTo] = useState(todayIST());
  const [s, setS] = useState(null);
  useEffect(() => {
    setS(null);
    api.get(`/stats${rangeQuery(frm, to)}`).then((r) => setS(r.data)).catch((e) => toast.error(apiErr(e)));
  }, [frm, to]);
  const conv = s && s.total_sessions ? Math.round((s.purchased / s.total_sessions) * 1000) / 10 : 0;
  const avg = s && s.purchased ? s.total_earnings / s.purchased : 0;
  return (
    <>
      <RangePicker frm={frm} to={to} setFrm={setFrm} setTo={setTo} testid="stats" />
      {!s ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-3 lg:space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <Stat icon={IndianRupee} label={t("earnings")} value={inr(s.total_earnings)} tone="text-emerald-700" />
            <Stat icon={Users} label={t("total_sessions")} value={s.total_sessions} hint={t("closed_sessions_only")} />
            <Stat icon={Percent} label={t("conversion")} value={`${conv}%`} hint={`${s.purchased} / ${s.total_sessions}`} />
            <Stat icon={Receipt} label={t("avg_bill")} value={inr(avg)} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <Stat icon={ShoppingBag} label={t("purchased")} value={s.purchased} />
            <Stat icon={CircleSlash} label={t("not_purchased")} value={s.not_purchased} />
            <Stat icon={IndianRupee} label={t("total_value")} value={inr(s.total_value)} />
            <Stat icon={Tag} label={t("discount")} value={inr(s.total_discount)} />
          </div>
        </div>
      )}
    </>
  );
}

function CustomerDB({ user }) {
  const { t } = useLang();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/customers").then((r) => setList(r.data)).catch((e) => { setList([]); toast.error(apiErr(e)); }); }, []);
  const needle = q.trim().toLowerCase();
  const all = list || [];
  const shown = needle ? all.filter((c) => [c.name, c.mobile, c.mobile2].some((v) => (v || "").toLowerCase().includes(needle))) : all;
  const exportXl = async () => {
    try {
      // axios rejects non-2xx responses, so an error is never saved as the .xlsx file.
      const { data } = await api.get("/customers/export", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a"); a.href = url; a.download = "somani_customers.xlsx"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error("Export failed. Please try again."); }
  };
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input data-testid="customer-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_customers")} className={`${inputCls} pl-10`} />
        </div>
        <div className="flex items-center gap-3 sm:ml-auto">
          <span className="text-sm text-gray-600 num">{needle ? `${shown.length} / ${all.length}` : all.length} {t("customers_count")}</span>
          {can(user, "customers_export") && <Button data-testid="export-excel-btn" variant="secondary" icon={Download} onClick={exportXl}>{t("export_excel")}</Button>}
        </div>
      </div>
      <Card className="overflow-hidden">
        {list === null ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : shown.length === 0 ? (
          <Empty icon={Database} title={needle ? t("no_match") : t("no_customers")} className="py-12" />
        ) : (
          <>
            {/* Desktop: table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b border-gray-200 bg-gray-50/60">
                  <th className="font-medium px-5 py-3">{t("col_customer")}</th>
                  <th className="font-medium px-3 py-3">{t("hist_dob")}</th>
                  <th className="font-medium px-3 py-3 text-right">{t("hist_visits")}</th>
                  <th className="font-medium px-3 py-3 text-right">{t("hist_purchased")}</th>
                  <th className="font-medium px-3 py-3 text-right">{t("hist_revenue")}</th>
                  <th className="font-medium px-5 py-3 text-right">{t("hist_last_visit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((c) => (
                  <tr key={c.id} data-testid={`customer-${c.id}`} onClick={() => setSel(c)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar src={c.thumb || c.photo} className="w-9 h-9 rounded-full shrink-0" />
                        <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{c.name}</p><p className="text-xs text-gray-600 num">{c.mobile}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{c.dob ? fmtDayMonth({ ...c.dob, year: null }) : <span className="text-gray-400">-</span>}</td>
                    <td className="px-3 py-2.5 text-right num">{c.stats?.total_sessions}</td>
                    <td className="px-3 py-2.5 text-right num">{c.stats?.purchased_count}</td>
                    <td className="px-3 py-2.5 text-right num font-medium text-emerald-700">{inr(c.stats?.total_collected)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-700">{c.stats?.last_visit ? fmtDate(c.stats.last_visit) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phones: list */}
            <div className="md:hidden divide-y divide-gray-100">
              {shown.map((c) => (
                <button data-testid={`customer-m-${c.id}`} key={c.id} onClick={() => setSel(c)} className="w-full text-left flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                  <Avatar src={c.thumb || c.photo} className="w-10 h-10 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0"><p className="font-medium text-gray-900 truncate">{c.name}</p><p className="text-xs text-gray-600 num">{c.mobile}</p></div>
                  <div className="text-right"><p className="text-sm font-medium text-emerald-700 num">{inr(c.stats?.total_collected)}</p><p className="text-xs text-gray-600 num">{c.stats?.total_sessions} {t(c.stats?.total_sessions === 1 ? "hist_visit_one" : "hist_visits_short")}</p></div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
      {sel && <CustomerProfile customer={sel} onClose={() => setSel(null)} />}
    </>
  );
}

// Everything the shop knows about one customer: contact, birthday, visits,
// money, WhatsApp consent, every custom field, and each visit.
function CustomerProfile({ customer, onClose }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/customers/${customer.id}`).then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e))); }, [customer.id]);
  const extra = data?.extra || {};
  const fieldLabels = data ? [...data.custom_fields, ...Object.keys(extra).filter((k) => !data.custom_fields.includes(k))] : [];
  const showValue = (v) => (v === true ? t("yes") : v === false ? t("no") : v === undefined || v === null || v === "" ? "-" : String(v));
  const st = data?.stats;
  return (
    <Sheet title={t("profile")} onClose={onClose} size="lg">
      {!data ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
      ) : (
        <div data-testid="customer-profile" className="space-y-5">
          <div className="flex gap-4 items-center">
            <Avatar src={data.photo} className="w-20 h-24 rounded-xl shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-xl tracking-tight text-gray-900 truncate">{data.name}</p>
              <p className="text-gray-700 text-sm num">{data.mobile}{data.mobile2 ? ` · ${data.mobile2}` : ""}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge tone={data.dob ? "pink" : "gray"} icon={Cake}>{data.dob ? `${fmtDayMonth(data.dob)}${data.age !== null && data.age !== undefined ? ` · ${data.age} ${t("years")}` : ""}` : t("not_added")}</Badge>
                <Badge tone={data.wa.opted_out ? "red" : data.wa.opted_in ? "green" : "gray"} icon={MessageCircle}>
                  {data.wa.opted_out ? t("prof_wa_out") : data.wa.opted_in ? t("prof_wa_in") : t("prof_wa_none")}
                </Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <ProfileBox label={t("hist_visits")}>{st.total_sessions}</ProfileBox>
            <ProfileBox label={t("hist_purchased")} tone="text-emerald-700">{st.purchased_count}</ProfileBox>
            <ProfileBox label={t("not_purchased")} tone={st.not_purchased_count ? "text-red-700" : "text-gray-900"}>{st.not_purchased_count}</ProfileBox>
            <ProfileBox label={t("hist_revenue")} tone="text-emerald-700">{rupees(st.total_collected)}</ProfileBox>
            <ProfileBox label={t("prof_discount")}>{rupees(st.total_discount)}</ProfileBox>
            <ProfileBox label={t("hist_last_visit")}>{st.last_visit ? fmtDate(st.last_visit) : "-"}</ProfileBox>
            <ProfileBox label={t("prof_first_visit")}>{st.first_visit ? fmtDate(st.first_visit) : "-"}</ProfileBox>
            <ProfileBox label={t("prof_since")}>{data.created_at ? fmtDate(data.created_at) : "-"}</ProfileBox>
          </div>
          {fieldLabels.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">{t("prof_fields")}</p>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {fieldLabels.map((k) => (
                  <div key={k} className="flex justify-between gap-3 px-3.5 py-2.5 text-sm"><span className="text-gray-600">{k}</span><span className="font-medium text-gray-900 text-right">{showValue(extra[k])}</span></div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">{t("prof_visits")}</p>
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {data.sessions.map((s) => (
                <div key={s.id} className="flex justify-between items-center gap-3 text-sm px-3.5 py-2.5">
                  <span className="text-gray-700">{fmt(s.start_time)}</span>
                  {s.status === "active" ? <Badge tone="brand">{t("active")}</Badge>
                    : s.purchased ? <span className="num font-medium text-emerald-700">{inr(s.final_paid)}{s.discount ? <span className="text-gray-600 font-normal"> ({t("discount")} {inr(s.discount)})</span> : null}</span>
                      : <Badge>{t("not_purchased")}</Badge>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ProfileBox({ label, children, tone = "text-gray-900" }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5 min-w-0">
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`num font-semibold text-[15px] mt-0.5 truncate ${tone}`}>{children}</p>
    </div>
  );
}

function SessionHistory({ user }) {
  const { t } = useLang();
  const [list, setList] = useState(null);
  const [frm, setFrm] = useState(daysBack(6)); const [to, setTo] = useState(todayIST());
  const [edit, setEdit] = useState(null);
  const load = () => {
    api.get(`/sessions/history${rangeQuery(frm, to)}`).then((r) => setList(r.data)).catch((e) => { setList([]); toast.error(apiErr(e)); });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setList(null); load(); }, [frm, to]);
  const del = async (id) => {
    if (!window.confirm("Delete this session?")) return;
    if (await run(() => api.delete(`/sessions/${id}`), "Deleted")) load();
  };
  const saveEdit = async () => {
    const tv = parseFloat(edit.total_value) || 0, dv = parseFloat(edit.discount) || 0;
    if (edit.purchased && dv > tv) { toast.error("Discount cannot be more than the total value"); return; }
    const ok = await run(() => api.patch(`/sessions/${edit.id}`, { purchased: !!edit.purchased, total_value: tv, discount: dv, final_paid: parseFloat(edit.final_paid) || 0 }), "Updated");
    if (ok) { setEdit(null); load(); }
  };
  return (
    <>
      <RangePicker frm={frm} to={to} setFrm={setFrm} setTo={setTo} testid="hist" />
      <Card className="overflow-hidden">
        {list === null ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.length === 0 ? (
          <Empty icon={History} title={t("today_empty")} className="py-12" />
        ) : (
          <div className="divide-y divide-gray-100">
            {list.map((s) => (
              <div data-testid={`hist-${s.id}`} key={s.id} className="flex items-center gap-3 px-4 lg:px-5 py-3">
                <Avatar src={s.thumb} className="w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{s.customer_name} <span className="text-gray-600 font-normal num">{s.mobile}</span></p>
                  <p className="text-xs text-gray-600">{fmt(s.start_time)} · {s.admin_username}</p>
                </div>
                {s.status === "active" ? <Badge tone="brand">{t("active")}</Badge>
                  : s.purchased ? <span className="num text-sm font-medium text-emerald-700">{inr(s.final_paid)}</span>
                    : <Badge>{t("not_purchased")}</Badge>}
                <div className="flex shrink-0">
                  {s.status === "closed" && can(user, "history_edit") && <IconButton data-testid={`edit-hist-${s.id}`} icon={Pencil} label={t("edit")} size={16} onClick={() => setEdit({ ...s })} />}
                  {can(user, "history_delete") && <IconButton data-testid={`del-hist-${s.id}`} icon={Trash2} label={t("delete")} size={16} onClick={() => del(s.id)} className="hover:!text-red-600 hover:!bg-red-50" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {edit && (
        <Sheet title={edit.customer_name} subtitle={t("purchased_q")} onClose={() => setEdit(null)} size="sm"
          footer={<Button data-testid="save-edit-hist" onClick={saveEdit} size="lg" full>{t("save")}</Button>}>
          <Segmented value={edit.purchased ? "yes" : "no"} onChange={(v) => setEdit({ ...edit, purchased: v === "yes" })}
            options={[{ id: "yes", label: t("yes") }, { id: "no", label: t("no") }]} />
          {edit.purchased && (
            <div className="space-y-4 mt-4">
              <Field label={t("total_value")}><input inputMode="decimal" value={edit.total_value} onChange={(e) => setEdit({ ...edit, total_value: e.target.value })} className={`${inputCls} num`} /></Field>
              <Field label={t("discount")}><input inputMode="decimal" value={edit.discount} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} className={`${inputCls} num`} /></Field>
              <Field label={t("final_paid")}><input inputMode="decimal" value={edit.final_paid} onChange={(e) => setEdit({ ...edit, final_paid: e.target.value })} className={`${inputCls} num`} /></Field>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

function Logs() {
  const { t } = useLang();
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get("/logs").then((r) => setLogs(r.data)).catch((e) => { setLogs([]); toast.error(apiErr(e)); }); }, []);
  return (
    <Card>
      <CardHeader icon={ScrollText} title={t("set_logs")} subtitle={t("logs_sub")} />
      <div className="max-h-[480px] overflow-y-auto border-t border-gray-100 divide-y divide-gray-100">
        {logs === null ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          : logs.map((l) => (
            <div key={l.id} className="px-5 py-2.5 text-sm flex gap-3">
              <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{(l.admin_username || "?").slice(0, 2).toUpperCase()}</span>
              <div className="min-w-0">
                <p className="text-gray-900"><span className="font-medium">{l.admin_username}</span> <span className="text-brand-700">{(l.action || "").replace(/_/g, " ")}</span></p>
                <p className="text-xs text-gray-600 truncate">{l.details} · {fmt(l.timestamp)}</p>
              </div>
            </div>
          ))}
      </div>
    </Card>
  );
}

function Admins({ user }) {
  return (
    <div className="space-y-4">
      <Team user={user} />
      {can(user, "logs_view") && <Logs />}
    </div>
  );
}

function DisplaySettings({ canManage }) {
  const { t } = useLang();
  const [settings, setSettings] = useState(null);
  const [idle, setIdle] = useState("");
  useEffect(() => {
    api.get("/settings").then((r) => { setSettings(r.data); setIdle(r.data.idle_image || ""); })
      .catch((e) => toast.error(apiErr(e)));
  }, []);
  const link = settings ? `${window.location.origin}/d/${settings.display_secret}` : "";
  const onFile = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 6 * 1024 * 1024) { toast.error("Image is too large (max 6 MB)"); return; }
    const r = new FileReader(); r.onload = () => setIdle(r.result); r.readAsDataURL(f);
  };
  const save = () => run(() => api.put("/settings", { idle_image: idle }), "Saved");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader icon={Monitor} title={t("display_link")} subtitle={t("display_link_hint")} />
        <div className="px-5 pb-5 flex gap-2">
          <input data-testid="display-link" readOnly value={link} className={`${inputCls} bg-gray-50 text-gray-700`} onFocus={(e) => e.target.select()} />
          <Button data-testid="copy-link" icon={Copy} onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }}>{t("copy")}</Button>
        </div>
      </Card>
      {canManage && (
        <Card>
          <CardHeader icon={ImagePlus} title={t("idle_image")} subtitle={t("idle_image_hint")} />
          <div className="px-5 pb-5 grid sm:grid-cols-[1fr_auto] gap-4 items-end">
            <label className="block cursor-pointer">
              {idle ? <img src={idle} alt="" className="w-full h-48 object-contain bg-gray-950 rounded-xl" />
                : <span className="flex flex-col items-center justify-center h-48 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-700 text-sm gap-2 hover:bg-brand-50 hover:border-brand-300 transition-colors"><ImagePlus size={24} className="text-brand-700" />{t("upload_image")}</span>}
              <input data-testid="idle-image-input" type="file" accept="image/*" onChange={onFile} className="sr-only" />
            </label>
            <Button data-testid="save-display" onClick={save}>{t("save")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function WatermarkPanel() {
  const [settings, setSettings] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch((e) => toast.error(apiErr(e))); }, []);
  if (!settings) return <Skeleton className="h-96 rounded-2xl" />;
  return <WatermarkSettings initial={settings} />;
}

// The admin app's language, for everyone in the shop (More Settings > Language).
function LanguagePanel() {
  const { t, lang, setLang } = useLang();
  const [saving, setSaving] = useState("");
  const pick = async (id) => {
    if (id === lang) return;
    setSaving(id);
    if (await run(() => api.put("/settings", { app_language: id }))) setLang(id);
    setSaving("");
  };
  const options = [
    { id: "english", label: "English", sample: "Start a new session" },
    { id: "hindi", label: "हिंदी", sample: "नया सेशन शुरू करें" },
    { id: "hinglish", label: "Hinglish", sample: "Naya session shuru karein" },
  ];
  return (
    <div className="grid sm:grid-cols-3 gap-3 max-w-3xl">
      {options.map((o) => {
        const on = o.id === lang;
        return (
          <button key={o.id} data-testid={`app-lang-${o.id}`} onClick={() => pick(o.id)} aria-pressed={on}
            className={`text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.98] ${on ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
            <span className="flex items-center justify-between">
              <span className="font-semibold text-gray-900">{o.label}</span>
              {saving === o.id ? <Loader2 size={18} className="animate-spin text-brand-700" />
                : <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${on ? "border-brand-700 bg-brand-700" : "border-gray-300"}`}>{on && <span className="w-2 h-2 rounded-full bg-white" />}</span>}
            </span>
            <span className="block text-sm text-gray-600 mt-2">{o.sample}</span>
          </button>
        );
      })}
    </div>
  );
}

// Settings -> More Settings: one tile per area, like Catalog.
function MoreSettings({ canManage, title, subtitle }) {
  const { t, lang } = useLang();
  const langLabel = { english: "English", hindi: "हिंदी", hinglish: "Hinglish" }[lang];
  const tiles = [
    { id: "display", icon: Monitor, title: t("set_display"), sub: t("tile_display_sub") },
    ...(canManage ? [
      { id: "language", icon: Languages, title: t("app_language"), sub: t("tile_language_sub"), meta: <Badge tone="brand">{langLabel}</Badge> },
      { id: "watermark", icon: Tag, title: t("watermark"), sub: t("tile_watermark_sub") },
      { id: "fields", icon: ListPlus, title: t("cfg_session_fields"), sub: t("tile_fields_sub") },
    ] : []),
  ];
  return (
    <HubPage title={title} subtitle={subtitle} testid="more" tiles={tiles}
      render={(id) => ({
        display: <DisplaySettings canManage={canManage} />,
        language: <LanguagePanel />,
        watermark: <WatermarkPanel />,
        fields: <SessionFields />,
      }[id])} />
  );
}

const WM_STYLES = [
  { id: "lattice", label: "Tiled grid" },
  { id: "diagonal", label: "Diagonal" },
  { id: "center", label: "Centre" },
  { id: "corner", label: "Corner" },
  { id: "band", label: "Bottom strip" },
];

// Watermark editor. The preview is drawn by the server exactly as it will be
// burned into try-on images, and refreshes as the settings change.
function WatermarkSettings({ initial }) {
  const { t } = useLang();
  const [wm, setWm] = useState({
    watermark_text: initial.watermark_text ?? "Somani Fabs",
    watermark_style: initial.watermark_style || "lattice",
    watermark_visibility: initial.watermark_visibility || "subtle",
    watermark_weight: initial.watermark_weight || "regular",
  });
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setWm((w) => ({ ...w, [k]: v }));

  const lines = wm.watermark_text.split("\n");
  const tooMany = lines.filter((l) => l.trim()).length > 2;
  const tooLong = lines.some((l) => l.trim().length > 40);

  useEffect(() => {
    if (tooMany || tooLong) return;
    let alive = true;
    setLoading(true);
    const id = setTimeout(() => {
      api.post("/settings/watermark-preview", wm)
        .then((r) => alive && setPreview(r.data.image))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    }, 350);
    return () => { alive = false; clearTimeout(id); };
  }, [wm, tooMany, tooLong]);

  const save = () => {
    if (tooMany || tooLong) { toast.error("Up to 2 lines, 40 characters each"); return; }
    run(() => api.put("/settings", wm), "Saved");
  };

  return (
    <Card>
      <CardHeader icon={Tag} title={t("watermark")} subtitle={t("watermark_note")} />
      <div className="px-5 pb-5 grid lg:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <div className="space-y-5">
          <Field label={t("watermark_text")} hint="Up to 2 lines, 40 characters each" error={tooMany || tooLong ? "Up to 2 lines, 40 characters each" : null}>
            <textarea data-testid="watermark-text" rows={2} value={wm.watermark_text} onChange={(e) => set("watermark_text")(e.target.value)}
              className={`${inputCls} h-auto py-2.5 resize-none ${tooMany || tooLong ? "border-red-500" : ""}`} />
          </Field>
          <div>
            <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("wm_type")}</span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {WM_STYLES.map((s) => (
                <button key={s.id} data-testid={`wm-style-${s.id}`} onClick={() => set("watermark_style")(s.id)}
                  className={`h-10 px-2 rounded-xl border text-sm font-medium transition-colors ${wm.watermark_style === s.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-300 text-gray-700 hover:border-gray-400"}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("wm_visibility")}</span>
              <Segmented testid="wm-vis" value={wm.watermark_visibility} onChange={set("watermark_visibility")}
                options={[{ id: "subtle", label: "Subtle" }, { id: "medium", label: "Medium" }, { id: "strong", label: "Strong" }]} />
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("wm_weight")}</span>
              <Segmented testid="wm-weight" value={wm.watermark_weight} onChange={set("watermark_weight")}
                options={[{ id: "regular", label: "Regular" }, { id: "bold", label: "Bold" }]} />
            </div>
          </div>
          <Button data-testid="save-watermark" onClick={save}>{t("save")}</Button>
        </div>
        <div className="relative rounded-xl overflow-hidden bg-gray-100 flex justify-center items-center min-h-60">
          {preview ? <img data-testid="wm-preview" src={preview} alt="Watermark preview" className="max-h-96 object-contain" />
            : <Skeleton className="absolute inset-0 rounded-none" />}
          {loading && <Loader2 className="absolute top-2 right-2 animate-spin text-white drop-shadow" size={18} />}
        </div>
      </div>
    </Card>
  );
}

export default function Settings({ user, tab = "stats", onTab }) {
  const { t } = useLang();
  const tabs = visibleTabs(user);
  const idx = Math.max(0, tabs.findIndex((tb) => tb.id === tab));
  const current = tabs[idx];
  const arrow = "shrink-0 w-10 flex items-center justify-center text-gray-600 hover:text-brand-700 disabled:opacity-25 disabled:hover:text-gray-600";
  const bar = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: true });
  const measure = () => {
    const el = bar.current; if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  const slide = (d) => bar.current?.scrollBy({ left: d * bar.current.clientWidth * 0.7, behavior: "smooth" });
  // Keep the active tab visible, and know when the strip can slide further.
  useEffect(() => {
    bar.current?.querySelector("[data-on='1']")?.scrollIntoView({ block: "nearest", inline: "center" });
    measure();
  }, [tab]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <div className="pb-12">
      {/* Phones and tablets: scrollable tab strip with back / forward arrows. The sidebar does this on desktop. */}
      <div className="lg:hidden sticky top-14 z-20 bg-white/90 backdrop-blur-md border-b border-gray-200 flex items-stretch">
        <button data-testid="tab-prev" onClick={() => slide(-1)} disabled={!edges.left} aria-label="Scroll tabs left" className={`${arrow} border-r border-gray-100`}><ChevronLeft size={18} /></button>
        <nav ref={bar} onScroll={measure} className="flex-1 min-w-0 flex overflow-x-auto no-scrollbar px-1">
          {tabs.map((tb) => {
            const on = current.id === tb.id;
            return (
              <button data-testid={`tab-${tb.id}`} key={tb.id} data-on={on ? "1" : "0"} onClick={() => onTab(tb.id)}
                className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 h-12 text-sm font-medium transition-colors ${on ? "text-brand-700" : "text-gray-600 hover:text-gray-900"}`}>
                <tb.icon size={15} /> {t(tb.label)}
                <span className={`absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-colors ${on ? "bg-brand-700" : "bg-transparent"}`} />
              </button>
            );
          })}
        </nav>
        <button data-testid="tab-next" onClick={() => slide(1)} disabled={!edges.right} aria-label="Scroll tabs right" className={`${arrow} border-l border-gray-100`}><ChevronRight size={18} /></button>
      </div>
      <Page key={current.id} className="animate-in fade-in duration-200">
        {/* Hubs (tiles) draw their own header so they can show a back button inside. */}
        {!HUBS.has(current.id) && <PageHeader title={t(current.label)} subtitle={t(current.sub)} className="hidden lg:flex" />}
        {current.id === "db" && <CustomerDB user={user} />}
        {current.id === "stats" && <Stats />}
        {current.id === "history" && <SessionHistory user={user} />}
        {current.id === "catalog" && <Catalog isSuper={can(user, "catalog_manage")} title={t(current.label)} subtitle={t(current.sub)} />}
        {current.id === "admins" && <Admins user={user} />}
        {current.id === "marketing" && <Marketing isSuper={can(user, "marketing_manage")} title={t(current.label)} subtitle={t(current.sub)} />}
        {current.id === "more" && <MoreSettings canManage={can(user, "settings_manage")} title={t(current.label)} subtitle={t(current.sub)} />}
      </Page>
    </div>
  );
}
