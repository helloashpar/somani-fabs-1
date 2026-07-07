import React, { useState, useEffect } from "react";
import { api, apiErr, getToken } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Database, History, BarChart3, Sliders, ScrollText, Users, Monitor, Download, Trash2, Plus, X, Copy } from "lucide-react";

const TABS = [
  { id: "db", icon: Database, label: "set_db" },
  { id: "history", icon: History, label: "set_history" },
  { id: "stats", icon: BarChart3, label: "set_stats" },
  { id: "config", icon: Sliders, label: "set_config" },
  { id: "logs", icon: ScrollText, label: "set_logs" },
  { id: "admins", icon: Users, label: "set_admins" },
  { id: "display", icon: Monitor, label: "set_display" },
];

function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }

function CustomerDB() {
  const { t } = useLang();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  useEffect(() => { api.get("/customers").then((r) => setList(r.data)).catch(() => {}); }, []);
  const exportXl = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/customers/export`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "somani_customers.xlsx"; a.click();
    } catch (e) { toast.error("Export failed"); }
  };
  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-gray-500">{list.length} customers</span>
        <button data-testid="export-excel-btn" onClick={exportXl} className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg"><Download size={15} /> {t("export_excel")}</button>
      </div>
      <div className="bg-white rounded-xl border divide-y">
        {list.map((c) => (
          <button data-testid={`customer-${c.id}`} key={c.id} onClick={() => setSel(c)} className="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-50">
            <img src={c.photo} alt="" className="w-10 h-12 object-cover rounded-md border" />
            <div className="flex-1"><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-gray-500">{c.mobile}</p></div>
            <div className="text-right text-xs text-gray-400"><p>{c.stats?.total_sessions} sess</p><p className="text-emerald-600">₹{c.stats?.total_collected}</p></div>
          </button>
        ))}
      </div>
      {sel && <CustomerProfile customer={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function CustomerProfile({ customer, onClose }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/customers/${customer.id}`).then((r) => setData(r.data)).catch(() => {}); }, [customer.id]);
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[88vh] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white"><h3 className="font-semibold">{t("profile")}</h3><button onClick={onClose}><X size={22} /></button></div>
        {data && (
          <div className="p-4">
            <div className="flex gap-4 items-center mb-4">
              <img src={data.photo} alt="" className="w-20 h-24 object-cover rounded-lg border" />
              <div><p className="font-semibold text-lg">{data.name}</p><p className="text-gray-500 text-sm">{data.mobile}</p>{data.mobile2 && <p className="text-gray-400 text-xs">{data.mobile2}</p>}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">{t("total_sessions")}</p><p className="font-semibold">{data.stats.total_sessions}</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">{t("collected")}</p><p className="font-semibold text-emerald-600">₹{data.stats.total_collected}</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">{t("purchased")}</p><p className="font-semibold">{data.stats.purchased_count}</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs text-gray-400">{t("not_purchased")}</p><p className="font-semibold">{data.stats.not_purchased_count}</p></div>
            </div>
            <p className="text-sm font-medium text-gray-600 mb-2">Sessions</p>
            <div className="space-y-2">
              {data.sessions.map((s) => (
                <div key={s.id} className="flex justify-between items-center text-sm border rounded-lg p-2.5">
                  <span className="text-gray-500">{fmt(s.start_time)}</span>
                  <span className={s.purchased ? "text-emerald-600" : "text-gray-400"}>{s.status === "active" ? "Active" : s.purchased ? `✓ ₹${s.final_paid}` : "✗"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionHistory() {
  const { t } = useLang();
  const [list, setList] = useState([]);
  const [frm, setFrm] = useState(""); const [to, setTo] = useState("");
  const [edit, setEdit] = useState(null);
  const load = () => {
    let q = []; if (frm) q.push(`frm=${frm}T00:00:00`); if (to) q.push(`to=${to}T23:59:59`);
    api.get(`/sessions/history${q.length ? "?" + q.join("&") : ""}`).then((r) => setList(r.data)).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [frm, to]);
  const del = async (id) => { if (!window.confirm("Delete this session?")) return; await api.delete(`/sessions/${id}`); toast.success("Deleted"); load(); };
  const saveEdit = async () => { await api.patch(`/sessions/${edit.id}`, { purchased: edit.purchased, total_value: parseFloat(edit.total_value) || 0, discount: parseFloat(edit.discount) || 0, final_paid: parseFloat(edit.final_paid) || 0 }); toast.success("Updated"); setEdit(null); load(); };
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1"><label className="text-xs text-gray-400">{t("from_date")}</label><input data-testid="hist-from" type="date" value={frm} onChange={(e) => setFrm(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
        <div className="flex-1"><label className="text-xs text-gray-400">{t("to_date")}</label><input data-testid="hist-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" /></div>
      </div>
      <div className="bg-white rounded-xl border divide-y">
        {list.map((s) => (
          <div data-testid={`hist-${s.id}`} key={s.id} className="flex items-center gap-2 p-3">
            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{s.customer_name} <span className="text-gray-400 font-normal">{s.mobile}</span></p><p className="text-xs text-gray-400">{fmt(s.start_time)} · {s.admin_username}</p></div>
            <span className={`text-xs ${s.status === "active" ? "text-emerald-600" : s.purchased ? "text-emerald-600" : "text-gray-400"}`}>{s.status === "active" ? "Active" : s.purchased ? `✓ ₹${s.final_paid}` : "✗"}</span>
            {s.status === "closed" && <button data-testid={`edit-hist-${s.id}`} onClick={() => setEdit({ ...s })} className="text-xs text-[#1E3A8A] underline">{t("edit")}</button>}
            <button data-testid={`del-hist-${s.id}`} onClick={() => del(s.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      {edit && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl p-5 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{edit.customer_name}</h3>
            <div className="flex gap-2">
              <button onClick={() => setEdit({ ...edit, purchased: true })} className={`flex-1 py-2 rounded-lg border ${edit.purchased ? "bg-emerald-600 text-white" : ""}`}>{t("yes")}</button>
              <button onClick={() => setEdit({ ...edit, purchased: false })} className={`flex-1 py-2 rounded-lg border ${!edit.purchased ? "bg-gray-700 text-white" : ""}`}>{t("no")}</button>
            </div>
            {edit.purchased && <>
              <input placeholder={t("total_value")} value={edit.total_value} onChange={(e) => setEdit({ ...edit, total_value: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <input placeholder={t("discount")} value={edit.discount} onChange={(e) => setEdit({ ...edit, discount: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <input placeholder={t("final_paid")} value={edit.final_paid} onChange={(e) => setEdit({ ...edit, final_paid: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </>}
            <button data-testid="save-edit-hist" onClick={saveEdit} className="w-full bg-[#1E3A8A] text-white py-2.5 rounded-lg">{t("save")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stats() {
  const { t } = useLang();
  const [frm, setFrm] = useState(""); const [to, setTo] = useState("");
  const [s, setS] = useState(null);
  useEffect(() => { let q = []; if (frm) q.push(`frm=${frm}T00:00:00`); if (to) q.push(`to=${to}T23:59:59`); api.get(`/stats${q.length ? "?" + q.join("&") : ""}`).then((r) => setS(r.data)).catch(() => {}); }, [frm, to]);
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input data-testid="stats-from" type="date" value={frm} onChange={(e) => setFrm(e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
        <input data-testid="stats-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
      </div>
      {s && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-gray-400 uppercase">{t("total_sessions")}</p><p className="text-2xl font-semibold">{s.total_sessions}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-gray-400 uppercase">{t("earnings")}</p><p className="text-2xl font-semibold text-emerald-600">₹{s.total_earnings}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-gray-400 uppercase">{t("purchased")}</p><p className="text-2xl font-semibold">{s.purchased}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-gray-400 uppercase">{t("not_purchased")}</p><p className="text-2xl font-semibold">{s.not_purchased}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-gray-400 uppercase">{t("total_value")}</p><p className="text-xl font-semibold">₹{s.total_value}</p></div>
          <div className="bg-white border rounded-xl p-4"><p className="text-xs text-gray-400 uppercase">{t("discount")}</p><p className="text-xl font-semibold">₹{s.total_discount}</p></div>
        </div>
      )}
    </div>
  );
}

function Config({ isSuper }) {
  const { t } = useLang();
  const [cats, setCats] = useState([]);
  const [fields, setFields] = useState([]);
  const loadC = () => api.get("/config/categories").then((r) => setCats(r.data)).catch(() => {});
  const loadF = () => api.get("/config/fields").then((r) => setFields(r.data)).catch(() => {});
  useEffect(() => { loadC(); loadF(); }, []);

  const addCat = async () => {
    const label = prompt("Category name (e.g. Footwear)"); if (!label) return;
    const description = prompt("One line description for AI context") || "";
    const slotsRaw = prompt("Slots (comma separated from: top,bottom,third)", "top") || "top";
    const slots = slotsRaw.split(",").map((x) => x.trim()).filter(Boolean);
    await api.post("/config/categories", { label, description, slots, slot_count: slots.length, items: [], order: cats.length + 1 });
    toast.success("Added"); loadC();
  };
  const addItem = async (cat) => {
    const label = prompt("Item name (e.g. Full Sleeve Shirt)"); if (!label) return;
    const description = prompt("Item description for AI") || "";
    const items = [...(cat.items || []), { label, description }];
    await api.put(`/config/categories/${cat.id}`, { label: cat.label, description: cat.description, slots: cat.slots, slot_count: cat.slot_count, items, order: cat.order });
    loadC();
  };
  const delItem = async (cat, idx) => {
    const items = cat.items.filter((_, i) => i !== idx);
    await api.put(`/config/categories/${cat.id}`, { label: cat.label, description: cat.description, slots: cat.slots, slot_count: cat.slot_count, items, order: cat.order });
    loadC();
  };
  const delCat = async (id) => { if (!window.confirm("Delete category?")) return; await api.delete(`/config/categories/${id}`); loadC(); };
  const addField = async () => {
    const label = prompt("Field label (e.g. Date of Birth)"); if (!label) return;
    const type = prompt("Type: text / number / date / checkbox", "text") || "text";
    await api.post("/config/fields", { label, type, required: false, order: fields.length + 1 });
    toast.success("Added"); loadF();
  };
  const delField = async (id) => { await api.delete(`/config/fields/${id}`); loadF(); };

  if (!isSuper) return <p className="text-center text-gray-400 py-10 text-sm">{t("super_only")}</p>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center mb-2"><h3 className="font-semibold text-sm">Trial Categories & Items</h3><button data-testid="add-category-btn" onClick={addCat} className="text-sm text-[#1E3A8A] flex items-center gap-1"><Plus size={15} /> {t("add")}</button></div>
        <div className="space-y-3">
          {cats.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-3">
              <div className="flex justify-between items-start"><div><p className="font-medium text-sm">{c.label}</p><p className="text-xs text-gray-400">{c.description} · slots: {(c.slots || []).join(", ")}</p></div><button onClick={() => delCat(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button></div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(c.items || []).map((it, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1 text-xs">{it.label}<button onClick={() => delItem(c, i)} className="text-gray-400 hover:text-red-500"><X size={12} /></button></span>
                ))}
                <button data-testid={`add-item-${c.id}`} onClick={() => addItem(c)} className="text-xs text-[#1E3A8A] border border-dashed border-[#1E3A8A]/40 rounded-full px-2.5 py-1">+ item</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="flex justify-between items-center mb-2"><h3 className="font-semibold text-sm">Session Fields</h3><button data-testid="add-field-btn" onClick={addField} className="text-sm text-[#1E3A8A] flex items-center gap-1"><Plus size={15} /> {t("add")}</button></div>
        <div className="bg-white border rounded-xl divide-y">
          <div className="p-2.5 text-xs text-gray-400">Default: Mobile, Name, Secondary Mobile, Photo</div>
          {fields.map((f) => (
            <div key={f.id} className="flex justify-between items-center p-2.5 text-sm"><span>{f.label} <span className="text-gray-400 text-xs">({f.type})</span></span><button onClick={() => delField(f.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Logs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/logs").then((r) => setLogs(r.data)).catch(() => {}); }, []);
  return (
    <div className="bg-white border rounded-xl divide-y max-h-[70vh] overflow-y-auto">
      {logs.map((l) => (
        <div key={l.id} className="p-3 text-sm"><p><span className="font-medium">{l.admin_username}</span> <span className="text-[#1E3A8A]">{l.action}</span></p><p className="text-xs text-gray-400">{l.details} · {fmt(l.timestamp)}</p></div>
      ))}
    </div>
  );
}

function Admins({ isSuper }) {
  const { t } = useLang();
  const [list, setList] = useState([]);
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const load = () => api.get("/admins").then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async () => { if (!u || !p) return; try { await api.post("/admins", { username: u, password: p }); toast.success("Created"); setU(""); setP(""); load(); } catch (e) { toast.error(apiErr(e)); } };
  const del = async (id) => { if (!window.confirm("Delete admin?")) return; await api.delete(`/admins/${id}`); load(); };
  return (
    <div>
      <div className="bg-white border rounded-xl divide-y mb-4">
        {list.map((a) => (
          <div key={a.id} className="flex justify-between items-center p-3 text-sm"><span>{a.username} {a.role === "super" && <span className="text-amber-500">★ super</span>}</span>{isSuper && a.role !== "super" && <button data-testid={`del-admin-${a.id}`} onClick={() => del(a.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>}</div>
        ))}
      </div>
      {isSuper && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-sm">{t("add_admin")}</h3>
          <input data-testid="new-admin-username" placeholder={t("username")} value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" className="w-full border rounded-lg px-3 py-2" />
          <input data-testid="new-admin-password" placeholder={t("password")} value={p} onChange={(e) => setP(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
          <button data-testid="create-admin-btn" onClick={create} className="w-full bg-[#1E3A8A] text-white py-2.5 rounded-lg font-medium">{t("create")}</button>
        </div>
      )}
    </div>
  );
}

function DisplaySettings({ isSuper }) {
  const { t } = useLang();
  const [settings, setSettings] = useState(null);
  const [idle, setIdle] = useState("");
  useEffect(() => { api.get("/settings").then((r) => { setSettings(r.data); setIdle(r.data.idle_image || ""); }).catch(() => {}); }, []);
  const link = settings ? `${window.location.origin}/d/${settings.display_secret}` : "";
  const onFile = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => setIdle(r.result); r.readAsDataURL(f); };
  const save = async () => { try { await api.put("/settings", { idle_image: idle }); toast.success("Saved"); } catch (e) { toast.error(apiErr(e)); } };
  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase mb-2">{t("display_link")}</p>
        <div className="flex gap-2"><input data-testid="display-link" readOnly value={link} className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50" /><button data-testid="copy-link" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }} className="px-3 bg-[#1E3A8A] text-white rounded-lg"><Copy size={16} /></button></div>
        <p className="text-xs text-gray-400 mt-2">Open this on your LED screen browser. It auto-refreshes live.</p>
      </div>
      {isSuper && (
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase mb-2">{t("idle_image")}</p>
          {idle && <img src={idle} alt="" className="w-full h-40 object-contain bg-black rounded-lg mb-3" />}
          <input data-testid="idle-image-input" type="file" accept="image/*" onChange={onFile} className="text-sm" />
          <button data-testid="save-display" onClick={save} className="mt-3 w-full bg-[#1E3A8A] text-white py-2.5 rounded-lg font-medium">{t("save")}</button>
        </div>
      )}
    </div>
  );
}

export default function Settings({ user }) {
  const { t } = useLang();
  const [tab, setTab] = useState("db");
  const isSuper = user.role === "super";
  return (
    <div className="p-4 pb-12">
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-1 px-1">
        {TABS.map((tb) => (
          <button data-testid={`tab-${tb.id}`} key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-full text-sm font-medium ${tab === tb.id ? "bg-[#1E3A8A] text-white" : "bg-white border text-gray-600"}`}>
            <tb.icon size={15} /> {t(tb.label)}
          </button>
        ))}
      </div>
      {tab === "db" && <CustomerDB />}
      {tab === "history" && <SessionHistory />}
      {tab === "stats" && <Stats />}
      {tab === "config" && <Config isSuper={isSuper} />}
      {tab === "logs" && <Logs />}
      {tab === "admins" && <Admins isSuper={isSuper} />}
      {tab === "display" && <DisplaySettings isSuper={isSuper} />}
    </div>
  );
}
