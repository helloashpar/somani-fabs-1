import React, { useState, useEffect, useCallback } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Plus, Clock, History, X, Phone, User } from "lucide-react";
import Camera from "@/admin/Camera";
import Avatar from "@/admin/Avatar";

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
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function CreateSession({ onClose, onCreated, fields }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [mobile2, setMobile2] = useState("");
  const [extra, setExtra] = useState({});
  const [photo, setPhoto] = useState("");
  const [showCam, setShowCam] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);

  const search = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); return; }
    try { const { data } = await api.get(`/customers/search?q=${encodeURIComponent(q)}`); setSuggestions(data); }
    catch { /* ignore */ }
  }, []);

  const pick = (c) => {
    setName(c.name || ""); setMobile(c.mobile || ""); setMobile2(c.mobile2 || "");
    setExtra(c.extra || {}); if (c.photo) setPhoto(c.photo);
    setSuggestions([]);
    toast.success("Customer details loaded");
  };

  const submit = async () => {
    if (!name.trim() || !mobile.trim()) { toast.error("Name & mobile required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/sessions", { customer_name: name, mobile, mobile2, photo, extra });
      onCreated(data);
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };

  if (showCam) return <Camera onCapture={(img) => { setPhoto(img); setShowCam(false); }} onClose={() => setShowCam(false)} />;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-lg">{t("new_session")}</h3>
          <button data-testid="close-create-session" onClick={onClose} className="p-1 text-gray-500"><X size={22} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="relative">
            <label className="text-xs text-gray-500 uppercase tracking-wider">{t("mobile")}</label>
            <input data-testid="session-mobile" value={mobile} inputMode="numeric"
              onChange={(e) => { setMobile(e.target.value); search(e.target.value); }}
              className="mt-1 w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#1E3A8A]" />
            {suggestions.length > 0 && (
              <div className="absolute z-10 inset-x-0 mt-1 bg-white border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                {suggestions.map((c) => (
                  <button data-testid={`suggestion-${c.id}`} key={c.id} onClick={() => pick(c)} className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0">
                    <span className="font-medium">{c.name}</span> · <span className="text-gray-500">{c.mobile}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">{t("cust_name")}</label>
            <input data-testid="session-name" value={name} onChange={(e) => { setName(e.target.value); search(e.target.value); }}
              className="mt-1 w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#1E3A8A]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">{t("mobile2")}</label>
            <input data-testid="session-mobile2" value={mobile2} inputMode="numeric" onChange={(e) => setMobile2(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#1E3A8A]" />
          </div>
          {fields.map((f) => (
            <div key={f.id}>
              <label className="text-xs text-gray-500 uppercase tracking-wider">{f.label}</label>
              {f.type === "checkbox" ? (
                <input type="checkbox" data-testid={`field-${f.id}`} checked={!!extra[f.label]} onChange={(e) => setExtra({ ...extra, [f.label]: e.target.checked })} className="mt-2 ml-1 w-5 h-5" />
              ) : (
                <input data-testid={`field-${f.id}`} type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                  value={extra[f.label] || ""} onChange={(e) => setExtra({ ...extra, [f.label]: e.target.value })}
                  className="mt-1 w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#1E3A8A]" />
              )}
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">{t("photo_optional")}</label>
            <div className="mt-1">
              {photo ? (
                <div className="flex items-center gap-3">
                  <img src={photo} alt="" className="w-20 h-24 object-cover rounded-lg border" />
                  <button data-testid="recapture-photo" onClick={() => setShowCam(true)} className="text-sm text-[#1E3A8A] underline">{t("retake")}</button>
                  <button data-testid="remove-photo" onClick={() => setPhoto("")} className="text-sm text-gray-400 underline">{t("remove")}</button>
                </div>
              ) : (
                <button data-testid="capture-photo-btn" onClick={() => setShowCam(true)} className="w-full border-2 border-dashed border-gray-300 rounded-lg py-6 text-gray-500 text-sm">{t("capture_photo")}</button>
              )}
            </div>
          </div>
          <button data-testid="create-session-submit" onClick={submit} disabled={saving} className="w-full bg-[#1E3A8A] text-white py-3 rounded-lg font-semibold disabled:opacity-50">
            {saving ? "..." : t("create_session")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayPopup({ onClose }) {
  const { t } = useLang();
  const [date, setDate] = useState(todayIST());
  const [list, setList] = useState([]);
  useEffect(() => { api.get(`/sessions/today?date=${date}`).then((r) => setList(r.data)).catch((e) => toast.error(apiErr(e))); }, [date]);
  const shift = (d) => setDate(shiftDay(date, d));
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h3 className="font-semibold">{t("past_today")}</h3>
          <button onClick={onClose} className="p-1 text-gray-500"><X size={22} /></button>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <button data-testid="day-prev" onClick={() => shift(-1)} className="px-3 py-1 bg-gray-100 rounded-lg">‹</button>
          <span className="font-medium">{fmtDay(date)}</span>
          <button data-testid="day-next" onClick={() => shift(1)} disabled={date >= todayIST()} className="px-3 py-1 bg-gray-100 rounded-lg disabled:opacity-40">›</button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          {list.length === 0 && <p className="col-span-2 text-center text-gray-400 text-sm py-6">—</p>}
          {list.map((s) => (
            <div key={s.id} className={`p-3 rounded-xl border text-sm ${s.status === "active" ? "border-emerald-300 bg-emerald-50" : "bg-gray-50"}`}>
              <p className="font-medium truncate">{s.customer_name}</p>
              <p className="text-gray-500">{s.mobile}</p>
              <p className="text-xs text-gray-400 mt-1">{fmt(s.start_time)}</p>
              {s.status === "closed" && <p className={`text-xs mt-1 ${s.purchased ? "text-emerald-600" : "text-gray-400"}`}>{s.purchased ? `✓ ₹${s.final_paid}` : "✗"}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Canvas({ user, openSession }) {
  const { t } = useLang();
  const [sessions, setSessions] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showToday, setShowToday] = useState(false);
  const [fields, setFields] = useState([]);

  const load = () => api.get("/sessions/active").then((r) => setSessions(r.data)).catch(() => {});
  useEffect(() => { load(); api.get("/config/fields").then((r) => setFields(r.data)).catch(() => {}); }, []);

  return (
    <div className="p-4 pb-28">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-xl">{t("canvas_title")}</h2>
        <button data-testid="today-sessions-btn" onClick={() => setShowToday(true)} className="flex items-center gap-1.5 text-sm text-gray-600 bg-white border rounded-full px-3 py-1.5"><History size={15} /> {t("past_today")}</button>
      </div>

      {sessions.length === 0 ? (
        <div className="text-center text-gray-400 py-20 text-sm">{t("no_sessions")}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sessions.map((s) => (
            <button data-testid={`session-card-${s.id}`} key={s.id} onClick={() => openSession(s.id)}
              className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1E3A8A] hover:shadow-sm transition-all flex gap-4">
              <Avatar src={s.thumb} className="w-16 h-20 rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-xs text-emerald-600 font-medium uppercase tracking-wide">Active</span>
                  {s.has_photo === false && <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">{t("entry_session")}</span>}
                </div>
                <div className="flex items-center gap-2 text-gray-900 font-semibold truncate"><User size={16} className="text-gray-400 shrink-0" /><span className="truncate">{s.customer_name}</span></div>
                <div className="flex items-center gap-2 text-gray-500 text-sm mt-1"><Phone size={14} />{s.mobile}</div>
                <div className="flex items-center gap-2 text-gray-400 text-xs mt-2"><Clock size={13} />{fmt(s.start_time)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <button data-testid="new-session-btn" onClick={() => setShowCreate(true)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-[#1E3A8A] text-white px-6 py-3.5 rounded-full font-semibold shadow-lg hover:bg-[#16306f]">
        <Plus size={20} /> {t("new_session")}
      </button>

      {showCreate && <CreateSession fields={fields} onClose={() => setShowCreate(false)} onCreated={(s) => { setShowCreate(false); load(); openSession(s.id); }} />}
      {showToday && <TodayPopup onClose={() => setShowToday(false)} />}
    </div>
  );
}
