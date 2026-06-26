import React, { useState, useEffect } from "react";
import { api, setToken, clearToken, getToken, apiErr } from "@/lib/api";
import { useLang, LANGS } from "@/i18n";
import { toast } from "sonner";
import { Globe, LogOut, Settings as SettingsIcon, ArrowLeft } from "lucide-react";
import Canvas from "@/admin/Canvas";
import SessionView from "@/admin/SessionView";
import Settings from "@/admin/Settings";

function LangPicker() {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button data-testid="admin-lang-btn" onClick={() => setOpen(!open)} className="p-2 text-gray-600 hover:text-[#1E3A8A]"><Globe size={20} /></button>
      {open && (
        <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border z-50">
          {LANGS.map((l) => (
            <button key={l.id} data-testid={`admin-lang-${l.id}`} onClick={() => { setLang(l.id); setOpen(false); }}
              className={`block w-full text-left px-4 py-2 text-sm ${lang === l.id ? "text-[#DC2626] font-semibold" : "text-gray-700"}`}>{l.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center px-5 font-admin">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-8">
        <div className="font-display font-black text-2xl text-[#1E3A8A] mb-1" style={{ fontFamily: "Playfair Display, serif" }}>Somani Fabs</div>
        <p className="text-gray-400 text-sm mb-7">{t("login_title")}</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">{t("username")}</label>
            <input data-testid="login-username" value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none"
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#1E3A8A]" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500">{t("password")}</label>
            <input data-testid="login-password" type="password" value={p} onChange={(e) => setP(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#1E3A8A]" />
          </div>
          <button data-testid="login-submit" disabled={loading} className="w-full bg-[#1E3A8A] text-white py-3 rounded-lg font-semibold hover:bg-[#16306f] disabled:opacity-50">
            {loading ? "..." : t("login_btn")}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { t } = useLang();
  const [user, setUser] = useState(undefined);
  const [view, setView] = useState({ name: "canvas" });

  useEffect(() => {
    if (!getToken()) { setUser(null); return; }
    api.get("/auth/me").then((r) => setUser(r.data)).catch(() => { clearToken(); setUser(null); });
  }, []);

  const logout = () => { clearToken(); setUser(null); setView({ name: "canvas" }); };

  if (user === undefined) return <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] text-gray-400">...</div>;
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  return (
    <div className="min-h-screen bg-[#F3F4F6] font-admin">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="h-14 px-4 flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            {view.name !== "canvas" && (
              <button data-testid="topbar-back" onClick={() => setView({ name: "canvas" })} className="p-1.5 text-gray-600"><ArrowLeft size={20} /></button>
            )}
            <span className="font-display font-black text-lg text-[#1E3A8A]" style={{ fontFamily: "Playfair Display, serif" }}>Somani Fabs</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400 mr-1 hidden sm:inline">{user.username}{user.role === "super" ? " ★" : ""}</span>
            <LangPicker />
            <button data-testid="open-settings" onClick={() => setView({ name: "settings" })} className="p-2 text-gray-600 hover:text-[#1E3A8A]"><SettingsIcon size={20} /></button>
            <button data-testid="logout-btn" onClick={logout} className="p-2 text-gray-600 hover:text-[#DC2626]"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto">
        {view.name === "canvas" && <Canvas user={user} openSession={(id) => setView({ name: "session", id })} />}
        {view.name === "session" && <SessionView sessionId={view.id} user={user} onBack={() => setView({ name: "canvas" })} />}
        {view.name === "settings" && <Settings user={user} />}
      </main>
    </div>
  );
}
