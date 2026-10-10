import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { api, setToken, clearToken, getToken, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { LogOut, ArrowLeft, Store, BarChart3, Users, Menu, Plus, Eye, EyeOff } from "lucide-react";
import Canvas from "@/admin/Canvas";
import SessionView from "@/admin/SessionView";
import Reports from "@/admin/Reports";
import Customers from "@/admin/Customers";
import MoreMenu, { MoreGroup, MoreItem, moreGroups, GROUPS, MORE_ITEMS } from "@/admin/More";
import NewSession, { prefetchSessionConfig } from "@/admin/NewSession";
import { loadCatalog, loadCategories } from "@/lib/catalog";
import { can } from "@/admin/perms";
import { Button, Field, IconButton, inputCls } from "@/admin/ui";
import { useBrand } from "@/lib/brand";

// The shop's logo (if any) and name (Playfair) in the brand ink colour.
// Both come from Shop setup > General.
function Wordmark({ className = "", logo = "h-8 w-8" }) {
  const brand = useBrand();
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      {brand.logo_src && <img src={brand.logo_src} alt="" className={`${logo} object-contain rounded-lg shrink-0`} />}
      <span className={`font-black text-brand-900 tracking-tight truncate ${className}`} style={{ fontFamily: "Playfair Display, serif" }}>{brand.shop_name}</span>
    </span>
  );
}

const LOGIN_PHOTO = "https://images.pexels.com/photos/6766360/pexels-photo-6766360.jpeg?auto=compress&cs=tinysrgb&w=1600";
const LAST_USER = "sf_last_user";
function lastUser() { try { return localStorage.getItem(LAST_USER) || ""; } catch { return ""; } }

// Sign-in with a mobile number (any format: 72299 00422, +91..., 0...) or an
// email. The last one used is remembered on this device, so staff usually only
// type the password. Password managers and paste work.
function Login({ onLogin }) {
  const { t } = useLang();
  const remembered = lastUser();
  const [u, setU] = useState(remembered);
  const [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!u.trim() || !p) { setError(t("login_wrong")); return; }
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/auth/login", { login: u.trim(), password: p });
      setToken(data.token);
      try { localStorage.setItem(LAST_USER, u.trim()); } catch { /* storage off */ }
      onLogin(data.user);
    } catch (err) {
      setError([400, 401].includes(err?.response?.status) ? t("login_wrong") : apiErr(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white lg:bg-canvas font-admin grid lg:grid-cols-2">
      <div className="relative hidden lg:block overflow-hidden">
        <img src={LOGIN_PHOTO} alt="Folded premium suiting fabrics" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-900/85 via-brand-900/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-12 text-white">
          <p className="text-3xl font-semibold tracking-tight max-w-md leading-snug">{t("login_pitch")}</p>
          <p className="text-white/80 mt-3 max-w-md">{t("login_pitch_sub")}</p>
        </div>
      </div>
      <div className="flex flex-col justify-center px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-10">
        <div className="w-full max-w-sm mx-auto">
          <Wordmark className="text-[32px]" logo="h-12 w-12" />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mt-10">{t("login_title")}</h1>
          <p className="text-gray-600 mt-1">{t("login_sub")}</p>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label={t("login_id")}>
              <input data-testid="login-username" value={u} onChange={(e) => setU(e.target.value)} autoFocus={!remembered}
                type="text" placeholder="98765 43210"
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" enterKeyHint="next" className={inputCls} />
            </Field>
            <Field label={t("password")}>
              <div className="relative">
                <input data-testid="login-password" type={show ? "text" : "password"} value={p} onChange={(e) => setP(e.target.value)} autoFocus={!!remembered}
                  autoComplete="current-password" enterKeyHint="go" aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} className={`${inputCls} pr-12`} />
                <IconButton type="button" icon={show ? EyeOff : Eye} label={show ? t("hide_pw") : t("show_pw")} onClick={() => setShow(!show)} size={18}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2" />
              </div>
            </Field>
            {error && <p id="login-error" role="alert" className="text-sm text-red-700">{error}</p>}
            <Button data-testid="login-submit" type="submit" size="xl" full loading={loading} className="!mt-6">{t("login_btn")}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function initials(name = "") { return name.slice(0, 2).toUpperCase(); }

// Screens are kept in the URL (?p=reports, ?s=<session>, ?p=more&g=team,
// ?p=more&i=team), so
// the phone's back button and gesture work and every screen can be linked.
function useRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const route = { page: params.get("p") || "shop", session: params.get("s"), group: params.get("g"), item: params.get("i") };
  const go = (r, opts) => {
    const q = new URLSearchParams();
    if (r.session) q.set("s", r.session);
    else {
      if (r.page && r.page !== "shop") q.set("p", r.page);
      if (r.item) q.set("i", r.item);
      else if (r.group) q.set("g", r.group);
    }
    const search = q.toString() ? `?${q}` : "";
    if (search === location.search) return;
    navigate({ search }, opts);
  };
  // Back inside the app when there is history to go back to; otherwise up to Shop.
  const back = (fallback = {}) => (location.key !== "default" ? navigate(-1) : go(fallback, { replace: true }));
  return { route, go, back };
}

function Sidebar({ user, route, group, go, onNew, logout }) {
  const { t } = useLang();
  const groups = moreGroups(user);
  const item = (on) => `flex items-center gap-3 w-full h-10 px-3 rounded-xl text-[14.5px] font-medium transition-colors ${on ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"}`;
  const main = [
    { id: "shop", icon: Store, label: t("canvas_title"), ok: true },
    { id: "reports", icon: BarChart3, label: t("nav_reports"), ok: can(user, "history_view") || can(user, "stats_view") },
    { id: "customers", icon: Users, label: t("nav_customers"), ok: can(user, "customers_view") },
  ].filter((x) => x.ok);
  const onPage = (id) => !route.session && route.page === id;
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-white border-r border-gray-200 z-30">
      <div className="h-16 flex items-center px-6"><Wordmark className="text-xl" /></div>
      {can(user, "sessions_manage") && (
        <div className="px-3 pb-3"><Button data-testid="new-session-btn-sidebar" icon={Plus} full onClick={onNew}>{t("new_session")}</Button></div>
      )}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6" aria-label="Main">
        <div className="space-y-0.5">
          {main.map((m) => (
            <button key={m.id} data-testid={m.id === "shop" ? "nav-sessions" : `nav-${m.id}`} onClick={() => go({ page: m.id })}
              aria-current={(m.id === "shop" ? onPage("shop") || !!route.session : onPage(m.id)) ? "page" : undefined}
              className={item(m.id === "shop" ? onPage("shop") || !!route.session : onPage(m.id))}>
              <m.icon size={18} aria-hidden="true" /> {m.label}
            </button>
          ))}
        </div>
        {groups.length > 0 && (
          <div>
            <p className="px-3 mb-1.5 text-xs font-medium text-gray-500">{t("nav_setup")}</p>
            <div className="space-y-0.5">
              {groups.map((g) => {
                const on = route.page === "more" && group === g.id;
                return (
                  <button key={g.id} data-testid={`nav-group-${g.id}`} onClick={() => go({ page: "more", group: g.id })} aria-current={on ? "page" : undefined} className={item(on)}>
                    <g.icon size={18} aria-hidden="true" /> {t(g.label)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>
      <div className="border-t border-gray-100 p-3 flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-brand-700 text-white text-sm font-semibold flex items-center justify-center shrink-0" aria-hidden="true">{initials(user.name)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
          <p className="text-xs text-gray-600">{user.is_owner ? t("role_owner") : user.role === "super" ? t("role_super") : t("role_staff")}</p>
        </div>
        <IconButton data-testid="logout-btn-desktop" icon={LogOut} label={t("logout")} onClick={logout} />
      </div>
    </aside>
  );
}

// Phones: five thumb-reach destinations, with New Session in the middle so a
// walk-in customer is one tap away from any screen.
function BottomNav({ user, route, go, onNew }) {
  const { t } = useLang();
  const tabs = [
    { id: "shop", icon: Store, label: t("nav_shop"), ok: true },
    { id: "reports", icon: BarChart3, label: t("nav_reports"), ok: can(user, "history_view") || can(user, "stats_view") },
    { id: "new", ok: can(user, "sessions_manage") },
    { id: "customers", icon: Users, label: t("nav_customers"), ok: can(user, "customers_view") },
    { id: "more", icon: Menu, label: t("nav_more"), ok: true },
  ].filter((x) => x.ok);
  return (
    <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch h-16 max-w-xl mx-auto">
        {tabs.map((tb) => {
          if (tb.id === "new") {
            return (
              <div key="new" className="flex-1 flex items-center justify-center">
                <button data-testid="new-session-btn-mobile" onClick={onNew} aria-label={t("new_session")}
                  className="w-14 h-11 rounded-2xl bg-brand-700 text-white flex items-center justify-center shadow-lift active:scale-95 transition-transform touch-manipulation">
                  <Plus size={24} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            );
          }
          const on = route.page === tb.id && !route.session;
          return (
            <button key={tb.id} data-testid={`tab-${tb.id}`} onClick={() => go({ page: tb.id })} aria-current={on ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[11.5px] font-medium transition-colors touch-manipulation ${on ? "text-brand-700" : "text-gray-600 active:text-gray-900"}`}>
              <span className={`w-14 h-7 rounded-full flex items-center justify-center transition-colors ${on ? "bg-brand-50" : ""}`}>
                <tb.icon size={21} strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
              </span>
              {tb.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function AdminApp() {
  const { t, setLang } = useLang();
  const [user, setUser] = useState(undefined);
  const [creating, setCreating] = useState(null); // null | {} | { customer }
  const { route, go, back } = useRoute();
  // The app speaks the shop's language (More > Language).
  useEffect(() => { if (user?.app_language) setLang(user.app_language); }, [user, setLang]);

  useEffect(() => {
    if (!getToken()) { setUser(null); return; }
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => { clearToken(); setUser(null); });
  }, []);
  // Signed in: fetch what the first New Session / New Try-On needs, so both open instantly.
  useEffect(() => {
    if (!user) return;
    prefetchSessionConfig();
    loadCategories().catch(() => {});
    loadCatalog().catch(() => {});
  }, [user]);
  // Each screen starts at the top.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [route.page, route.session, route.group, route.item]);

  const logout = () => { clearToken(); setUser(null); go({ page: "shop" }, { replace: true }); };

  if (user === undefined) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-canvas"><Wordmark className="text-2xl opacity-40 animate-pulse" /></div>;
  }
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  // Pages this admin may not open fall back to the shop.
  const allowed = {
    shop: true, more: true,
    reports: can(user, "history_view") || can(user, "stats_view"),
    customers: can(user, "customers_view"),
  };
  const page = allowed[route.page] ? route.page : "shop";
  const inSession = !!route.session;
  // More has three levels: groups, one group's settings, one setting.
  const moreItem = page === "more" && route.item ? MORE_ITEMS.find((x) => x.id === route.item) : null;
  const moreGroup = page === "more" ? GROUPS.find((x) => x.id === (moreItem ? moreItem.group : route.group)) : null;
  const toGroup = (g) => go({ page: "more", group: g });
  const upFromItem = () => back({ page: "more", group: moreItem.group });
  const openNew = (customer) => setCreating(customer ? { customer } : {});

  return (
    <div className="min-h-[100dvh] bg-canvas font-admin text-gray-900">
      <Sidebar user={user} route={{ ...route, page }} group={moreGroup?.id} go={go} onNew={() => openNew()} logout={logout} />

      {/* Phones: slim top bar. Sub-screens get a back arrow and their title; the session screen draws its own. */}
      {!inSession && (
        <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 pt-[env(safe-area-inset-top)]">
          <div className="h-14 px-1 flex items-center gap-1">
            {moreGroup ? (
              <>
                <IconButton data-testid="topbar-back" icon={ArrowLeft} label={t("back")} onClick={() => (moreItem ? upFromItem() : back({ page: "more" }))} />
                <span className="min-w-0 leading-tight">
                  {moreItem && <span className="block text-xs text-gray-600 truncate">{t(moreGroup.label)}</span>}
                  <span className="block font-semibold text-gray-900 truncate">{t(moreItem ? moreItem.label : moreGroup.label)}</span>
                </span>
              </>
            ) : <Wordmark className="text-lg px-3" />}
          </div>
        </header>
      )}

      <main className={`lg:pl-64 ${inSession ? "" : "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0"}`}>
        {inSession ? (
          <SessionView key={route.session} sessionId={route.session} user={user} onBack={() => back({ page: "shop" })} />
        ) : page === "reports" ? (
          <Reports user={user} />
        ) : page === "customers" ? (
          <Customers user={user} onStart={(c) => openNew(c)} />
        ) : page === "more" ? (
          moreItem ? <MoreItem id={moreItem.id} user={user} onUp={upFromItem} />
            : moreGroup ? <MoreGroup id={moreGroup.id} user={user} onOpen={(id) => go({ page: "more", item: id })} />
            : <MoreMenu user={user} logout={logout} onGroup={toGroup} />
        ) : (
          <Canvas user={user} openSession={(id) => go({ session: id })} onNew={() => openNew()} openReports={() => go({ page: "reports" })} />
        )}
      </main>

      {!inSession && <BottomNav user={user} route={{ ...route, page }} go={go} onNew={() => openNew()} />}

      {creating && (
        <NewSession initial={creating.customer} onClose={() => setCreating(null)}
          onExisting={(id) => { setCreating(null); go({ session: id }); }}
          onCreated={(s) => { setCreating(null); go({ session: s.id }); }} />
      )}
    </div>
  );
}
