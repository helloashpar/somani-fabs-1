import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { RefreshCw, Download, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { UnderlineTabs } from "@/admin/ui";

// Super admin only (the backend enforces it too). Template text is fixed in
// backend/whatsapp_templates.py and only previewed here.
const GUIDE = "https://github.com/helloashpar/somani-fabs-1/blob/main/docs/whatsapp-setup.md";

const SECTIONS = [
  { id: "connection", label: "mk_connection" },
  { id: "profile", label: "mk_profile" },
  { id: "automations", label: "mk_automations" },
  { id: "templates", label: "mk_templates" },
  { id: "log", label: "mk_log" },
  { id: "optouts", label: "mk_optouts" },
];

const LANG_LABEL = { english: "English", hindi: "हिंदी", hinglish: "Hinglish" };

function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; } }

function Card({ title, children, right }) {
  return (
    <div className="bg-white border border-gray-200/80 shadow-card rounded-2xl p-5 space-y-3">
      {(title || right) && <div className="flex items-center justify-between gap-3"><p className="text-[15px] font-semibold text-gray-900">{title}</p>{right}</div>}
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, testid }) {
  return (
    <button data-testid={testid} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${checked ? "bg-brand-700" : "bg-gray-300"}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between gap-3 text-sm"><span className="text-gray-500">{label}</span><span className="font-medium text-right">{value ?? "-"}</span></div>;
}

function Connection({ config }) {
  const { t } = useLang();
  const [st, setSt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState("");
  const [qr, setQr] = useState(null);
  const load = () => {
    setLoading(true);
    api.get("/whatsapp/status").then((r) => setSt(r.data)).catch((e) => toast.error(apiErr(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => { if (config.enabled) api.get("/whatsapp/qr").then((r) => setQr(r.data)).catch(() => {}); }, [config.enabled]);
  const test = async () => {
    try { await api.post("/whatsapp/test", { to }); toast.success(t("st_sent")); } catch (e) { toast.error(apiErr(e)); }
  };
  const phone = st?.phone || {};
  return (
    <div className="space-y-4">
      <Card title={t("mk_status")} right={<button onClick={load} className="text-gray-400 p-1" aria-label={t("mk_refresh")}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}</button>}>
        {config.enabled ? (
          <p className="text-sm text-emerald-700 font-medium flex items-center gap-1.5">{t("mk_connected")}</p>
        ) : (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-medium">{t("mk_not_connected")}</p>
            {config.missing_env?.length > 0 && <p className="text-xs mt-1">{t("mk_missing")}: {config.missing_env.join(", ")}</p>}
            {!config.flag_on && <p className="text-xs mt-1">WHATSAPP_ENABLED=false</p>}
          </div>
        )}
        {st?.error && <p className="text-sm text-red-600">{st.error}</p>}
        {st?.phone && <>
          <Row label={t("mk_number")} value={phone.display_phone_number} />
          <Row label={t("mk_display_name")} value={`${phone.verified_name || "-"} · ${phone.name_status || "?"}`} />
          <Row label={t("mk_quality")} value={phone.quality_rating} />
          <Row label={t("mk_tier")} value={phone.messaging_limit_tier} />
        </>}
        <Row label={t("mk_last_webhook")} value={st?.last_webhook_at ? fmt(st.last_webhook_at) : t("mk_never")} />
        <a href={GUIDE} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline inline-flex items-center gap-1">{t("mk_setup_guide")} <ExternalLink size={13} /></a>
      </Card>

      {config.enabled && (
        <Card title={t("mk_test_send")}>
          <div className="flex gap-2">
            <input data-testid="wa-test-to" value={to} onChange={(e) => setTo(e.target.value)} inputMode="tel" placeholder="98765 43210" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button data-testid="wa-test-send" onClick={test} disabled={!to.trim()} className="px-4 bg-brand-700 text-white rounded-lg text-sm disabled:opacity-50">{t("mk_send")}</button>
          </div>
        </Card>
      )}

      {st?.templates?.length > 0 && (
        <Card title={t("mk_tpl_status")}>
          <div className="divide-y text-sm -mx-1">
            {st.templates.map((tp) => {
              const changed = tp.category && tp.category !== tp.requested_category;
              const color = tp.status === "APPROVED" ? "text-emerald-700" : tp.status === "REJECTED" ? "text-red-600" : "text-amber-700";
              return (
                <div key={`${tp.name}-${tp.language}`} className="px-1 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="truncate">{tp.name} <span className="text-gray-400 text-xs">{LANG_LABEL[tp.language]}</span></span>
                    <span className={`text-xs font-semibold ${color}`}>{tp.status}</span>
                  </div>
                  <p className="text-xs text-gray-400">{t("mk_meta_category")}: {tp.category || "-"} {tp.rejected_reason && tp.rejected_reason !== "NONE" ? `· ${tp.rejected_reason}` : ""}</p>
                  {changed && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> {t("mk_category_changed")} ({tp.requested_category} → {tp.category})</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {qr && (
        <Card title={t("mk_qr")}>
          <p className="text-xs text-gray-500">{t("mk_qr_desc")}</p>
          <img data-testid="wa-qr" src={qr.image} alt="WhatsApp QR" className="w-48 h-48 mx-auto" />
          <a href={qr.image} download="whatsapp-qr.png" className="w-full flex items-center justify-center gap-2 bg-brand-700 hover:bg-brand-800 text-white h-11 rounded-xl text-sm font-medium"><Download size={16} /> {t("mk_download")}</a>
        </Card>
      )}
    </div>
  );
}

// Name, address, phone and the map / review links are the shop's details from
// Shop setup > General (shown here read-only). Message buttons link to
// <site>/r/review and <site>/r/map, which open those links.
const FROM_GENERAL = [
  ["name", "mk_shop_name"], ["short_name", "mk_short_name"], ["address", "mk_address"],
  ["phone", "mk_phone"], ["maps_url", "mk_maps"], ["review_url", "mk_review"],
];

function Profile({ config }) {
  const { t } = useLang();
  const p = config.shop_profile;
  const base = config.public_base_url || window.location.origin;
  return (
    <div className="space-y-4">
      <Card title={t("mk_from_general")} right={<a href="/admin?p=more&i=general" className="text-sm font-medium text-brand-700 hover:underline shrink-0">{t("mk_edit_general")}</a>}>
        <p className="text-sm text-gray-600">{t("mk_from_general_sub")}</p>
        <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {FROM_GENERAL.map(([k, label]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-3 py-2.5 text-sm">
              <dt className="text-gray-600">{t(label)}</dt>
              <dd data-testid={`profile-${k}`} className={`min-w-0 break-words ${p[k] ? "text-gray-900" : "text-gray-400"}`}>{p[k] || "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5 break-all" data-testid="profile-links">
          {t("mk_links_note")}<br />{base}/r/review<br />{base}/r/map
        </div>
      </Card>
    </div>
  );
}

function Automations({ config, onSaved }) {
  const { t } = useLang();
  const w = config.whatsapp;
  const save = async (patch) => {
    try { await api.put("/whatsapp/config", { whatsapp: patch }); onSaved(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const Item = ({ title, desc, checked, onChange, testid, children }) => (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="flex-1"><p className="text-sm font-medium">{title}</p>{desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}</div>
        <Toggle testid={testid} checked={checked} onChange={onChange} />
      </div>
      {children}
    </div>
  );
  return (
    <div className="space-y-4">
      <Card title={t("mk_language")}>
        <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
          {config.languages.map((l) => (
            <button key={l} data-testid={`wa-lang-${l}`} onClick={() => save({ language: l })}
              className={`py-1.5 rounded-md text-xs font-medium ${w.language === l ? "bg-white shadow-sm text-brand-700" : "text-gray-500"}`}>{LANG_LABEL[l]}</button>
          ))}
        </div>
      </Card>
      <Card title={t("mk_automations")}>
        <div className="divide-y">
          <Item testid="au-welcome" title={t("au_welcome")} desc={t("au_welcome_desc")} checked={w.welcome.on} onChange={(v) => save({ welcome: { on: v } })} />
          <Item testid="au-looks" title={t("au_looks")} desc={t("au_looks_desc")} checked={w.send_looks.on} onChange={(v) => save({ send_looks: { on: v } })}>
            {w.send_looks.on && (
              <div className="flex items-center gap-3 mt-3 pl-3 border-l-2 border-gray-100">
                <p className="flex-1 text-sm">{t("au_allow_staff")}</p>
                <Toggle testid="au-allow-staff" checked={w.send_looks.allow_staff} onChange={(v) => save({ send_looks: { allow_staff: v } })} />
              </div>
            )}
          </Item>
          <Item testid="au-consent" title={t("au_consent_default")} desc={t("au_consent_default_desc")} checked={w.consent_default} onChange={(v) => save({ consent_default: v })} />
          <Item testid="au-receipt" title={t("au_receipt")} desc={t("au_receipt_desc")} checked={w.receipt.on} onChange={(v) => save({ receipt: { on: v } })} />
        </div>
      </Card>
    </div>
  );
}

function Bubble({ children, header, footer, buttons }) {
  return (
    <div className="bg-[#E7FFDB] rounded-lg rounded-tl-none p-3 shadow-sm max-w-sm text-sm">
      {header === "image" && <div className="h-24 bg-emerald-100 rounded mb-2 flex items-center justify-center text-xs text-emerald-700">image</div>}
      <p className="whitespace-pre-wrap text-gray-800">{children}</p>
      {footer && <p className="text-[11px] text-gray-400 mt-1.5">{footer}</p>}
      {buttons?.map((b, i) => (
        <div key={i} className="mt-2 pt-2 border-t border-emerald-200 text-center text-sky-600 text-sm font-medium" title={b.url || ""}>{b.text}</div>
      ))}
    </div>
  );
}

function Templates({ config }) {
  const { t } = useLang();
  const [lang, setLang] = useState(config.whatsapp.language);
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/whatsapp/templates?lang=${lang}`).then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e))); }, [lang]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-lg">
        {config.languages.map((l) => (
          <button key={l} onClick={() => setLang(l)} className={`py-1.5 rounded-md text-xs font-medium ${lang === l ? "bg-white shadow-sm text-brand-700" : "text-gray-500"}`}>{LANG_LABEL[l]}</button>
        ))}
      </div>
      <p className="text-xs text-gray-400">{t("mk_read_only")}</p>
      {data?.templates.map((tp) => (
        <div key={tp.name} className="bg-[#EFEAE2] rounded-xl p-3 space-y-2">
          <p className="text-xs text-gray-600 font-medium">{tp.meta_name} <span className="text-gray-400">· {tp.category} · phase {tp.phase}</span></p>
          <Bubble header={tp.header} footer={tp.footer} buttons={tp.buttons}>{tp.body}</Bubble>
        </div>
      ))}
      {data && (
        <Card title={t("mk_free_form")}>
          {data.free_form.map((f) => (
            <div key={f.name}><p className="text-xs text-gray-400 mb-1">{f.name}</p><Bubble>{f.body}</Bubble></div>
          ))}
        </Card>
      )}
    </div>
  );
}

const PURPOSES = ["welcome", "look", "receipt", "welcome_ack", "auto_reply", "stop_confirm", "start_confirm", "inbound", "test"];
const STATUSES = ["sending", "sent", "delivered", "read", "failed", "received"];

function Log() {
  const { t } = useLang();
  const [f, setF] = useState({ direction: "", purpose: "", status: "", frm: "", to: "" });
  const [data, setData] = useState(null);
  useEffect(() => {
    const q = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    api.get(`/whatsapp/messages${q ? `?${q}` : ""}`).then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  }, [f]);
  const sel = "border rounded-lg px-2 py-1.5 text-sm bg-white";
  return (
    <div className="space-y-3">
      {data && (
        <Card title={t("mk_month")}>
          <div className="flex flex-wrap gap-2">
            {Object.keys(data.month_counts).length === 0 && <span className="text-sm text-gray-400">0</span>}
            {Object.entries(data.month_counts).map(([k, v]) => (
              <span key={k} className="text-xs bg-gray-100 rounded-full px-3 py-1"><b>{v}</b> {k.toLowerCase()}</span>
            ))}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-3 gap-2">
        <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })} className={sel}>
          <option value="">{t("mk_all")}</option><option value="out">{t("mk_out")}</option><option value="in">{t("mk_in")}</option>
        </select>
        <select value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} className={sel}>
          <option value="">{t("mk_all")}</option>{PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={sel}>
          <option value="">{t("mk_all")}</option>{STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <input type="date" value={f.frm} onChange={(e) => setF({ ...f, frm: e.target.value })} className={`flex-1 ${sel}`} />
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={`flex-1 ${sel}`} />
      </div>
      <div className="bg-white border rounded-xl divide-y max-h-[65vh] overflow-y-auto">
        {data?.messages.length === 0 && <p className="text-center text-gray-400 text-sm py-6">-</p>}
        {data?.messages.map((m) => (
          <div key={m.id} className="p-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{m.direction === "in" ? "←" : "→"} {m.phone} <span className="text-gray-400 font-normal text-xs">{m.purpose}{m.template ? ` · ${m.template}` : ""}</span></span>
              <span className={`text-xs ${m.status === "failed" ? "text-red-600" : "text-gray-500"}`}>{m.status}</span>
            </div>
            {m.body && <p className="text-xs text-gray-500 line-clamp-2 whitespace-pre-wrap">{m.body}</p>}
            {m.error && <p className="text-xs text-red-600">{m.error}</p>}
            <p className="text-[11px] text-gray-400">{fmt(m.created_at)} · {m.billed_category || m.category || ""}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptOuts() {
  const { t } = useLang();
  const [list, setList] = useState(null);
  useEffect(() => { api.get("/whatsapp/optouts").then((r) => setList(r.data)).catch((e) => toast.error(apiErr(e))); }, []);
  return (
    <div className="bg-white border rounded-xl divide-y">
      {list?.length === 0 && <p className="text-center text-gray-400 text-sm py-6">{t("mk_no_optouts")}</p>}
      {list?.map((c) => (
        <div key={c.phone} className="flex justify-between p-3 text-sm">
          <span>{c.name || "-"} <span className="text-gray-400">{c.phone}</span></span>
          <span className="text-xs text-gray-500">{fmt(c.opted_out_at)}</span>
        </div>
      ))}
    </div>
  );
}

// Marketing > WhatsApp: connection, shop profile, automations, templates, log, opt-outs.
function WhatsAppSettings({ config, reload }) {
  const { t } = useLang();
  const [section, setSection] = useState("connection");
  return (
    <div>
      <UnderlineTabs testid="mk" value={section} onChange={setSection} tabs={SECTIONS.map((s) => ({ id: s.id, label: t(s.label) }))} />
      <div key={section} className="animate-in fade-in duration-150">
        {section === "connection" && <Connection config={config} />}
        {section === "profile" && <Profile config={config} />}
        {section === "automations" && <Automations config={config} onSaved={reload} />}
        {section === "templates" && <Templates config={config} />}
        {section === "log" && <Log />}
        {section === "optouts" && <OptOuts />}
      </div>
    </div>
  );
}

// More > WhatsApp (marketing_manage; the backend enforces it too).
export function WhatsAppScreen() {
  const [config, setConfig] = useState(null);
  const load = () => api.get("/whatsapp/config").then((r) => setConfig(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);
  if (!config) return <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-gray-500" /></div>;
  return <WhatsAppSettings config={config} reload={load} />;
}
