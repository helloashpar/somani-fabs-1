import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/i18n";
import { Plus, Search, Users, ChevronRight, Clock } from "lucide-react";
import Avatar from "@/admin/Avatar";
import { HistoryStrip } from "@/admin/CustomerHistory";
import { can } from "@/admin/perms";
import { Button, Page, PageHeader, Empty, Skeleton, Card, inputCls } from "@/admin/ui";

function fmt(iso) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; }
}

// "Just now", "12 min", "2 hr": how long the customer has been in the shop.
export function useSince() {
  const { t } = useLang();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(id); }, []);
  return (iso) => {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (!(min >= 1)) return t("just_now");
    if (min < 60) return t("min_ago").replace("{n}", min);
    return t("hr_ago").replace("{n}", Math.floor(min / 60));
  };
}

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// One line about today, tappable into Reports.
function TodayStrip({ user, today, onOpen }) {
  const { t } = useLang();
  if (!today) return <Skeleton className="h-14 rounded-2xl mb-5" />;
  const bought = today.filter((s) => s.purchased);
  const revenue = bought.reduce((a, s) => a + Number(s.final_paid || 0), 0);
  const showMoney = can(user, "stats_view");
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag data-testid="today-sessions-btn" onClick={onOpen}
      className="w-full mb-5 flex items-center gap-3.5 rounded-2xl bg-white border border-gray-200/80 shadow-card px-4 h-14 text-left transition-colors hover:border-brand-200 active:bg-gray-50">
      <span className="text-sm font-medium text-gray-600">{t("today_label")}</span>
      <span className="flex items-baseline gap-1"><span className="num font-semibold text-gray-900">{today.length}</span><span className="text-sm text-gray-600">{t("visits_n")}</span></span>
      <span className="flex items-baseline gap-1"><span className="num font-semibold text-gray-900">{bought.length}</span><span className="text-sm text-gray-600">{t("bought_n")}</span></span>
      {showMoney && <span className="num font-semibold text-emerald-700">{inr(revenue)}</span>}
      {onOpen && <ChevronRight size={18} className="ml-auto text-gray-400 shrink-0" aria-hidden="true" />}
    </Tag>
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

function SessionCard({ s, since, onOpen }) {
  const { t } = useLang();
  return (
    <button data-testid={`session-card-${s.id}`} onClick={onOpen}
      className="group w-full text-left bg-white rounded-2xl border border-gray-200/80 shadow-card p-3 flex gap-3.5 transition-all hover:shadow-lift hover:border-brand-200 active:scale-[0.99] touch-manipulation">
      <Avatar src={s.thumb} className="w-16 h-20 rounded-xl shrink-0" />
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-900 truncate text-base">{s.customer_name}</p>
          <span className="shrink-0 inline-flex items-center gap-1 text-[13px] text-gray-600 num" title={`${t("started_at")} ${fmt(s.start_time)}`}>
            <Clock size={13} aria-hidden="true" /> {since(s.start_time)}
          </span>
        </div>
        <p className="text-sm text-gray-600 num">{s.mobile}</p>
        <HistoryStrip h={s.history} />
      </div>
    </button>
  );
}

export default function Canvas({ user, openSession, onNew, openReports }) {
  const { t } = useLang();
  const since = useSince();
  const [sessions, setSessions] = useState(null);
  const [today, setToday] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    api.get("/sessions/active").then((r) => setSessions(r.data)).catch(() => setSessions((x) => x || []));
    api.get("/sessions/today").then((r) => setToday(r.data)).catch(() => setToday((x) => x || []));
  }, []);
  // Live: other staff start and end sessions too. Refresh while the tab is visible.
  useEffect(() => {
    load();
    const id = setInterval(() => { if (document.visibilityState === "visible") load(); }, 15000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = (sessions || []).filter((s) => !needle || [s.customer_name, s.mobile].some((v) => (v || "").toLowerCase().includes(needle)));
  const count = sessions?.length || 0;
  const canStart = can(user, "sessions_manage");
  const groups = groupByAdmin(shown, user);
  const canReports = can(user, "history_view") || can(user, "stats_view");

  return (
    <Page>
      <PageHeader title={t("canvas_title")}
        subtitle={sessions ? (count ? t("canvas_sub").replace("{n}", count) : t("canvas_sub_none")) : " "}
        actions={canStart && <Button data-testid="new-session-btn" icon={Plus} onClick={onNew} className="hidden lg:inline-flex">{t("new_session")}</Button>} />

      <TodayStrip user={user} today={today} onOpen={canReports ? openReports : undefined} />

      {count > 4 && (
        <div className="relative mb-4 lg:max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input data-testid="session-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_sessions")} aria-label={t("search_sessions")} className={`${inputCls} pl-10`} />
        </div>
      )}

      {sessions === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[106px] rounded-2xl" />)}
        </div>
      ) : count === 0 ? (
        <Card><Empty icon={Users} title={t("no_sessions_title")} body={t("no_sessions")}
          action={canStart && <Button size="lg" icon={Plus} onClick={onNew}>{t("new_session")}</Button>} /></Card>
      ) : shown.length === 0 ? (
        <Card><Empty icon={Search} title={t("no_match")} className="py-10" /></Card>
      ) : (
        <div className="space-y-6 lg:space-y-8">
          {groups.map((g) => (
            <section key={g.id} data-testid={`admin-section-${g.name}`}>
              {groups.length > 1 && (
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className={`w-7 h-7 rounded-full text-[11px] font-semibold flex items-center justify-center ${g.mine ? "bg-brand-700 text-white" : "bg-gray-200 text-gray-700"}`} aria-hidden="true">{(g.name || "?").slice(0, 2).toUpperCase()}</span>
                  <h2 className="font-semibold text-gray-900">{g.mine ? t("my_customers") : t("staff_customers").replace("{name}", g.name)}</h2>
                  <span className="num text-sm text-gray-600">{g.items.length}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
                {g.items.map((s) => <SessionCard key={s.id} s={s} since={since} onOpen={() => openSession(s.id)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
