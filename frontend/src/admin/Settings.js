import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Database, History, BarChart3, Sliders, ScrollText, Users, Monitor, Download, Trash2, Plus, X, Copy, Search, Loader2 } from "lucide-react";
import Avatar from "@/admin/Avatar";

const TABS = [
  { id: "db", icon: Database, label: "set_db" },
  { id: "history", icon: History, label: "set_history" },
  { id: "stats", icon: BarChart3, label: "set_stats" },
  { id: "config", icon: Sliders, label: "set_config" },
  { id: "logs", icon: ScrollText, label: "set_logs" },
  { id: "admins", icon: Users, label: "set_admins" },
  { id: "display", icon: Monitor, label: "set_display" },
];

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

function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; } }

function CustomerDB() {
  const { t } = useLang();
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/customers").then((r) => setList(r.data)).catch((e) => toast.error(apiErr(e))); }, []);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? list.filter((c) => [c.name, c.mobile, c.mobile2].some((v) => (v || "").toLowerCase().includes(needle)))
    : list;
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
    <div>
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm text-gray-500">{needle ? `${shown.length} / ${list.length}` : list.length} customers</span>
        <button data-testid="export-excel-btn" onClick={exportXl} className="flex items-center gap-1.5 text-sm bg-emerald-600 text-white px-3 py-1.5 rounded-lg"><Download size={15} /> {t("export_excel")}</button>
      </div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input data-testid="customer-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_customers")}
          className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#1E3A8A] bg-white" />
      </div>
      <div className="bg-white rounded-xl border divide-y">
        {shown.length === 0 && <p className="text-center text-gray-400 text-sm py-6">—</p>}
        {shown.map((c) => (
          <button data-testid={`customer-${c.id}`} key={c.id} onClick={() => setSel(c)} className="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-50">
            <Avatar src={c.thumb || c.photo} className="w-10 h-12 rounded-md shrink-0" />
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
  useEffect(() => { api.get(`/customers/${customer.id}`).then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e))); }, [customer.id]);
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[88vh] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white"><h3 className="font-semibold">{t("profile")}</h3><button onClick={onClose}><X size={22} /></button></div>
        {data && (
          <div className="p-4">
            <div className="flex gap-4 items-center mb-4">
              <Avatar src={data.photo} className="w-20 h-24 rounded-lg shrink-0" />
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
    api.get(`/sessions/history${rangeQuery(frm, to)}`).then((r) => setList(r.data)).catch((e) => toast.error(apiErr(e)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [frm, to]);
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
  useEffect(() => { api.get(`/stats${rangeQuery(frm, to)}`).then((r) => setS(r.data)).catch((e) => toast.error(apiErr(e))); }, [frm, to]);
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
  const [editing, setEditing] = useState(null); // { cat, idx, label, description }
  const loadC = () => api.get("/config/categories").then((r) => setCats(r.data)).catch((e) => toast.error(apiErr(e)));
  const loadF = () => api.get("/config/fields").then((r) => setFields(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { loadC(); loadF(); }, []);

  const saveItems = (cat, items, okMsg) =>
    run(() => api.put(`/config/categories/${cat.id}`, { label: cat.label, description: cat.description, slots: cat.slots, items, order: cat.order }), okMsg);

  const addCat = async () => {
    const label = prompt("Category name (e.g. Sherwani Set)"); if (!label) return;
    const description = prompt("One line description") || "";
    const slotsRaw = prompt("Slots, comma separated, from: top, bottom, third", "top") || "top";
    const slots = slotsRaw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (await run(() => api.post("/config/categories", { label, description, slots, items: [], order: cats.length + 1 }), "Added")) loadC();
  };
  const addItem = (cat) => setEditing({ cat, idx: -1, label: "", description: "" });
  const editItem = (cat, idx) => setEditing({ cat, idx, label: cat.items[idx].label, description: cat.items[idx].description || "" });
  const saveItem = async () => {
    const { cat, idx } = editing;
    const label = editing.label.trim();
    if (!label) { toast.error("Item name is required"); return; }
    const item = { label, description: editing.description.trim() };
    const items = idx === -1 ? [...(cat.items || []), item] : cat.items.map((it, i) => (i === idx ? item : it));
    if (await saveItems(cat, items, "Saved")) { setEditing(null); loadC(); }
  };
  const delItem = async (cat, idx) => {
    if (!window.confirm(`Remove ${cat.items[idx].label}?`)) return;
    if (await saveItems(cat, cat.items.filter((_, i) => i !== idx))) loadC();
  };
  const delCat = async (id) => { if (!window.confirm("Delete category?")) return; if (await run(() => api.delete(`/config/categories/${id}`), "Deleted")) loadC(); };
  const addField = async () => {
    const label = prompt("Field label (e.g. Date of Birth)"); if (!label) return;
    const type = (prompt("Type: text / number / date / checkbox", "text") || "text").trim().toLowerCase();
    if (await run(() => api.post("/config/fields", { label, type, required: false, order: fields.length + 1 }), "Added")) loadF();
  };
  const delField = async (id) => { if (!window.confirm("Delete field?")) return; if (await run(() => api.delete(`/config/fields/${id}`))) loadF(); };

  if (!isSuper) return <p className="text-center text-gray-400 py-10 text-sm">{t("super_only")}</p>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center mb-2"><h3 className="font-semibold text-sm">Trial Categories & Items</h3><button data-testid="add-category-btn" onClick={addCat} className="text-sm text-[#1E3A8A] flex items-center gap-1"><Plus size={15} /> {t("add")}</button></div>
        <div className="space-y-3">
          {cats.map((c) => (
            <div key={c.id} className="bg-white border rounded-xl p-3">
              <div className="flex justify-between items-start"><div><p className="font-medium text-sm">{c.label}</p><p className="text-xs text-gray-400">{c.description} · slots: {(c.slots || []).join(", ")}</p></div><button onClick={() => delCat(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={15} /></button></div>
              <div className="mt-2 divide-y border rounded-lg">
                {(c.items || []).map((it, i) => (
                  <div key={i} className="flex items-start gap-2 p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{it.label}</p>
                      <p className="text-xs text-gray-400 line-clamp-2">{it.description || "No AI description"}</p>
                    </div>
                    <button data-testid={`edit-item-${c.id}-${i}`} onClick={() => editItem(c, i)} className="text-xs text-[#1E3A8A] underline shrink-0">{t("edit")}</button>
                    <button onClick={() => delItem(c, i)} className="text-gray-400 hover:text-red-500 shrink-0" aria-label="Remove item"><X size={14} /></button>
                  </div>
                ))}
              </div>
              <button data-testid={`add-item-${c.id}`} onClick={() => addItem(c)} className="mt-2 text-xs text-[#1E3A8A] border border-dashed border-[#1E3A8A]/40 rounded-full px-2.5 py-1">+ item</button>
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setEditing(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold">{editing.idx === -1 ? "Add item" : "Edit item"} · {editing.cat.label}</h3>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Item name</label>
              <input data-testid="item-label" value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Description for AI</label>
              <textarea data-testid="item-description" rows={5} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="How this garment should look: length, collar, sleeves, fit, tucked in or not..." className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              <p className="text-xs text-gray-400 mt-1">The AI follows this when stitching the fabric into this garment.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 py-2.5 rounded-lg border">{t("cancel")}</button>
              <button data-testid="save-item" onClick={saveItem} className="flex-1 bg-[#1E3A8A] text-white py-2.5 rounded-lg font-medium">{t("save")}</button>
            </div>
          </div>
        </div>
      )}
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
  useEffect(() => { api.get("/logs").then((r) => setLogs(r.data)).catch((e) => toast.error(apiErr(e))); }, []);
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
  const load = () => api.get("/admins").then((r) => setList(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!u.trim() || !p) { toast.error("Enter a username and password"); return; }
    if (p.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (await run(() => api.post("/admins", { username: u.trim(), password: p }), "Created")) { setU(""); setP(""); load(); }
  };
  const del = async (id) => { if (!window.confirm("Delete admin?")) return; if (await run(() => api.delete(`/admins/${id}`), "Deleted")) load(); };
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
          <input data-testid="new-admin-password" type="password" autoComplete="new-password" placeholder={`${t("password")} (min 8)`} value={p} onChange={(e) => setP(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
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
      {isSuper && settings && <WatermarkSettings initial={settings} />}
    </div>
  );
}

const WM_STYLES = [
  { id: "lattice", label: "Tiled grid" },
  { id: "diagonal", label: "Diagonal" },
  { id: "center", label: "Centre" },
  { id: "corner", label: "Corner" },
  { id: "band", label: "Bottom strip" },
];

function Segmented({ value, options, onChange, testid }) {
  return (
    <div className="grid gap-1 p-1 bg-gray-100 rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} data-testid={`${testid}-${o.id}`} onClick={() => onChange(o.id)}
          className={`py-1.5 rounded-md text-xs font-medium ${value === o.id ? "bg-white shadow-sm text-[#1E3A8A]" : "text-gray-500"}`}>{o.label}</button>
      ))}
    </div>
  );
}

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
    <div className="bg-white border rounded-xl p-4 space-y-4">
      <p className="text-xs text-gray-400 uppercase">{t("watermark")}</p>
      <div>
        <label className="text-xs text-gray-500">{t("watermark_text")} · max 2 lines</label>
        <textarea data-testid="watermark-text" rows={2} value={wm.watermark_text} onChange={(e) => set("watermark_text")(e.target.value)}
          className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm resize-none ${tooMany || tooLong ? "border-red-400" : ""}`} />
        {(tooMany || tooLong) && <p className="text-xs text-red-500 mt-1">Up to 2 lines, 40 characters each</p>}
      </div>
      <div>
        <label className="text-xs text-gray-500">Type</label>
        <div className="mt-1 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {WM_STYLES.map((s) => (
            <button key={s.id} data-testid={`wm-style-${s.id}`} onClick={() => set("watermark_style")(s.id)}
              className={`py-2 px-1 rounded-lg border text-xs font-medium ${wm.watermark_style === s.id ? "border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]" : "border-gray-200 text-gray-600"}`}>{s.label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500">Visibility</label>
          <div className="mt-1"><Segmented testid="wm-vis" value={wm.watermark_visibility} onChange={set("watermark_visibility")}
            options={[{ id: "subtle", label: "Subtle" }, { id: "medium", label: "Medium" }, { id: "strong", label: "Strong" }]} /></div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Text</label>
          <div className="mt-1"><Segmented testid="wm-weight" value={wm.watermark_weight} onChange={set("watermark_weight")}
            options={[{ id: "regular", label: "Regular" }, { id: "bold", label: "Bold" }]} /></div>
        </div>
      </div>
      <div className="relative rounded-lg overflow-hidden bg-gray-100 flex justify-center">
        {preview ? <img data-testid="wm-preview" src={preview} alt="Watermark preview" className="max-h-80 object-contain" />
          : <div className="h-60" />}
        {loading && <Loader2 className="absolute top-2 right-2 animate-spin text-white drop-shadow" size={18} />}
      </div>
      <p className="text-xs text-gray-400">{t("watermark_note")}</p>
      <button data-testid="save-watermark" onClick={save} className="w-full bg-[#1E3A8A] text-white py-2.5 rounded-lg font-medium">{t("save")}</button>
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
