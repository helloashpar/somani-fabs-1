import React, { useState, useEffect } from "react";
import { api, setToken, clearToken, getToken, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { LogOut, Settings as SettingsIcon, ArrowLeft, Store } from "lucide-react";
import Canvas from "@/admin/Canvas";
import SessionView from "@/admin/SessionView";
import Settings, { SETTINGS_TABS, visibleTabs } from "@/admin/Settings";
import { Button, Field, IconButton, inputCls } from "@/admin/ui";

// The shop wordmark (Playfair) in the brand ink colour.
function Wordmark({ className = "" }) {
  return <span className={`font-black text-brand-900 tracking-tight ${className}`} style={{ fontFamily: "Playfair Display, serif" }}>Somani Fabs</span>;
}

// Split screen on desktop: the shop's own fabric photo on the left, sign-in on the right.
const LOGIN_PHOTO = "https://images.pexels.com/photos/6766360/pexels-photo-6766360.jpeg?auto=compress&cs=tinysrgb&w=1600";

function Login({ onLogin }) {
  const { t } = useLang();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username: u, password: p });
      setToken(data.token);
      onLogin(data.user);
    } catch (err) { toast.error(apiErr(err)); }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-canvas font-admin grid lg:grid-cols-2">
      <div className="relative hidden lg:block overflow-hidden">
        <img src={LOGIN_PHOTO} alt="Folded premium suiting fabrics" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-900/85 via-brand-900/30 to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-12 text-white">
          <p className="text-3xl font-semibold tracking-tight max-w-md leading-snug">{t("login_pitch")}</p>
          <p className="text-white/75 mt-3 max-w-md">{t("login_pitch_sub")}</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Wordmark className="text-3xl" />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mt-8">{t("login_title")}</h1>
          <p className="text-gray-600 mt-1">{t("login_sub")}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label={t("username")}>
              <input data-testid="login-username" value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoComplete="username" className={inputCls} />
            </Field>
            <Field label={t("password")}>
              <input data-testid="login-password" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" className={inputCls} />
            </Field>
            <Button data-testid="login-submit" type="submit" size="lg" full loading={loading} className="mt-2">{t("login_btn")}</Button>
          </form>
        </div>
      </div>
    </div>
  );
}

function initials(name = "") { return name.slice(0, 2).toUpperCase(); }

function LiveShopButton({ on, onClick }) {
  const { t } = useLang();
  return (
    <button data-testid="nav-sessions" onClick={onClick} aria-current={on ? "page" : undefined}
      className={`group flex items-center gap-3 w-full h-14 px-4 rounded-2xl text-base font-semibold transition-all active:scale-[0.98]
        ${on ? "bg-brand-700 text-white shadow-lift" : "bg-brand-50 text-brand-800 hover:bg-brand-100"}`}>
      <Store size={20} />
      <span className="flex-1 text-left">{t("canvas_title")}</span>
      {/* Live indicator: the shop floor is being worked right now. */}
      <span className="relative flex w-2.5 h-2.5" aria-hidden="true">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${on ? "bg-white" : "bg-brand-500"}`} />
        <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${on ? "bg-white" : "bg-brand-500"}`} />
      </span>
    </button>
  );
}

function Sidebar({ user, view, go, logout }) {
  const { t } = useLang();
  const tabs = visibleTabs(user);
  const item = (on) => `group flex items-center gap-3 w-full h-10 px-3 rounded-xl text-[14.5px] font-medium transition-colors ${on ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"}`;
  const groups = [
    { label: t("nav_insights"), ids: ["stats", "db", "history"] },
    { label: t("nav_setup"), ids: ["catalog", "marketing", "admins", "more"] },
  ];
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-white border-r border-gray-200 z-30">
      <div className="h-16 flex items-center px-6"><Wordmark className="text-xl" /></div>
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        {/* Live Shop is where the day's work happens: it stands apart from the rest. */}
        <LiveShopButton on={view.name !== "settings"} onClick={() => go({ name: "canvas" })} />
        {groups.map((g) => {
          const items = tabs.filter((tb) => g.ids.includes(tb.id));
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <p className="px-3 mb-1.5 text-xs font-medium text-gray-500">{g.label}</p>
              <div className="space-y-0.5">
                {items.map((tb) => (
                  <button key={tb.id} data-testid={`nav-${tb.id}`} onClick={() => go({ name: "settings", tab: tb.id })}
                    className={item(view.name === "settings" && view.tab === tb.id)}>
                    <tb.icon size={18} /> {t(tb.label)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-gray-100 p-3 flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-brand-700 text-white text-sm font-semibold flex items-center justify-center shrink-0">{initials(user.username)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{user.username}</p>
          <p className="text-xs text-gray-600">{user.is_owner ? t("role_owner") : user.role === "super" ? t("role_super") : t("role_staff")}</p>
        </div>
        <IconButton data-testid="logout-btn-desktop" icon={LogOut} label={t("logout")} onClick={logout} />
      </div>
    </aside>
  );
}

export default function AdminApp() {
  const { t, setLang } = useLang();
  const [user, setUser] = useState(undefined);
  const [view, setView] = useState({ name: "canvas" });
  // The app speaks the shop's language (More Settings > Language).
  useEffect(() => { if (user?.app_language) setLang(user.app_language); }, [user, setLang]);

  useEffect(() => {
    if (!getToken()) { setUser(null); return; }
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => { clearToken(); setUser(null); });
  }, []);
  // Each screen starts at the top.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view.name, view.id]);

  const logout = () => { clearToken(); setUser(null); setView({ name: "canvas" }); };

  if (user === undefined) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-canvas"><Wordmark className="text-2xl opacity-40 animate-pulse" /></div>;
  }
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  const title = view.name === "settings" ? t(SETTINGS_TABS.find((x) => x.id === view.tab)?.label || "settings") : view.name === "session" ? t("session") : "";

  return (
    <div className="min-h-[100dvh] bg-canvas font-admin text-gray-900">
      <Sidebar user={user} view={view} go={setView} logout={logout} />

      {/* Phone / tablet top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200">
        <div className="h-14 px-2 flex items-center gap-1">
          {view.name !== "canvas" ? (
            <>
              <IconButton data-testid="topbar-back" icon={ArrowLeft} label={t("back")} onClick={() => setView({ name: "canvas" })} />
              <span className="font-semibold text-gray-900 truncate">{title}</span>
            </>
          ) : <Wordmark className="text-lg px-2" />}
          <div className="ml-auto flex items-center">
            {view.name !== "settings" && <IconButton data-testid="open-settings" icon={SettingsIcon} label={t("settings")} onClick={() => setView({ name: "settings", tab: visibleTabs(user)[0]?.id })} />}
            <IconButton data-testid="logout-btn" icon={LogOut} label={t("logout")} onClick={logout} />
          </div>
        </div>
      </header>

      <main className="lg:pl-64">
        {view.name === "canvas" && <Canvas user={user} openSession={(id) => setView({ name: "session", id })} />}
        {view.name === "session" && <SessionView sessionId={view.id} user={user} onBack={() => setView({ name: "canvas" })} />}
        {view.name === "settings" && <Settings user={user} tab={view.tab || "stats"} onTab={(tab) => setView({ name: "settings", tab })} />}
      </main>
    </div>
  );
}
