import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { UserPlus, Shield, Crown, Users, Trash2, Info, RotateCcw, Phone, Mail, AlertTriangle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Segmented, Sheet, Skeleton, Toggle, inputCls } from "@/admin/ui";
import { PERM_GROUPS } from "@/admin/perms";

function fmtDate(iso) { try { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); } catch { return ""; } }
const initials = (n = "") => n.replace(/^\+91\s*/, "").slice(0, 2).toUpperCase();
// "9876543210" -> "+91 98765 43210"
export const fmtMobile = (m = "") => (m.length === 10 ? `+91 ${m.slice(0, 5)} ${m.slice(5)}` : m);

function RoleBadge({ a }) {
  const { t } = useLang();
  if (a.is_owner) return <Badge tone="brand" icon={Crown}>{t("role_owner")}</Badge>;
  if (a.role === "super") return <Badge tone="brand" icon={Shield}>{t("role_super")}</Badge>;
  return <Badge>{t("role_staff")}</Badge>;
}

// Create or edit one admin. Every admin signs in with their mobile number
// (required) or email (optional). Staff get a permission matrix (recommended
// values pre-ticked); super admins have every permission and manage the team.
function AdminSheet({ admin, registry, me, onClose, onSaved }) {
  const { t } = useLang();
  const isNew = !admin;
  const defaults = Object.fromEntries(registry.map((p) => [p.key, p.staff]));
  const [name, setName] = useState(admin?.full_name || "");
  const [mobile, setMobile] = useState(admin?.mobile ? fmtMobile(admin.mobile) : "");
  const [email, setEmail] = useState(admin?.email || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(admin?.role || "admin");
  const [perms, setPerms] = useState(admin && admin.role !== "super" ? { ...admin.permissions } : defaults);
  const [active, setActive] = useState(admin ? admin.active : true);
  const [saving, setSaving] = useState(false);
  const owner = admin?.is_owner;
  const self = admin && admin.id === me.id;
  const lockedRole = owner || self;

  const save = async () => {
    setSaving(true);
    try {
      if (!mobile.trim() && !owner) { toast.error(t("adm_mobile_needed")); setSaving(false); return; }
      if (isNew) {
        if (password.length < 8) { toast.error(t("password_hint")); setSaving(false); return; }
        await api.post("/admins", { name: name.trim(), mobile: mobile.trim(), email: email.trim(), password, role, permissions: perms });
        toast.success(t("admin_created"));
      } else if (owner) {
        await api.put(`/admins/${admin.id}`, { name: name.trim() });
        toast.success("Saved");
      } else {
        const body = { name: name.trim(), mobile: mobile.trim(), email: email.trim(), permissions: perms };
        if (!lockedRole) { body.role = role; body.active = active; }
        if (password) body.password = password;
        await api.put(`/admins/${admin.id}`, body);
        toast.success("Saved");
      }
      onSaved();
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };
  const del = async () => {
    if (!window.confirm(`${t("delete")} ${admin.name}?`)) return;
    try { await api.delete(`/admins/${admin.id}`); toast.success("Deleted"); onSaved(); } catch (e) { toast.error(apiErr(e)); }
  };

  const onCount = registry.filter((p) => perms[p.key]).length;
  return (
    <Sheet title={isNew ? t("add_admin") : admin.name} subtitle={isNew ? t("add_admin_sub") : null} onClose={onClose} size="lg" locked={saving}
      testid="admin-sheet"
      footer={(
        <div className="flex gap-2">
          {!isNew && !self && !owner && <Button data-testid="delete-admin" variant="dangerSoft" icon={Trash2} onClick={del}>{t("delete")}</Button>}
          <Button data-testid="save-admin" onClick={save} loading={saving} className="flex-1">{isNew ? t("create") : t("save")}</Button>
        </div>
      )}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("adm_name")} hint={t("adm_name_hint")} className="sm:col-span-2">
            <input data-testid="admin-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={60} className={inputCls} />
          </Field>
          <Field label={`${t("adm_mobile")} *`} hint={owner ? t("adm_owner_env") : t("adm_mobile_hint")}>
            <input data-testid="admin-mobile" type="tel" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={owner}
              placeholder="98765 43210" autoComplete="off" className={`${inputCls} ${owner ? "text-gray-600" : ""}`} />
          </Field>
          <Field label={t("adm_email")} hint={owner ? t("adm_owner_env") : t("adm_email_hint")}>
            <input data-testid="admin-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={owner}
              autoCapitalize="none" autoComplete="off" className={`${inputCls} ${owner ? "text-gray-600" : ""}`} />
          </Field>
          {!owner && (
            <Field label={isNew ? t("password") : t("new_password")} hint={isNew ? t("password_hint") : t("new_password_hint")} className="sm:col-span-2">
              <input data-testid="new-admin-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            </Field>
          )}
        </div>
      {owner ? (
        <div className="flex gap-3 rounded-xl bg-brand-50 text-brand-900 p-4 text-sm">
          <Crown size={18} className="shrink-0 mt-0.5 text-brand-700" />
          <p>{t("owner_note")}</p>
        </div>
      ) : (
        <>

          <div>
            <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("role")}</span>
            <Segmented testid="admin-role" value={role} onChange={lockedRole ? () => {} : setRole}
              options={[{ id: "admin", label: t("role_staff") }, { id: "super", label: t("role_super") }]} />
            {lockedRole && !isNew && <p className="text-[13px] text-gray-600 mt-1.5">{t("own_role_locked")}</p>}
          </div>

          {role === "super" ? (
            <div data-testid="super-note" className="flex gap-3 rounded-xl bg-amber-50 text-amber-900 p-4 text-sm">
              <Info size={18} className="shrink-0 mt-0.5" />
              <p>{t("super_note")}</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-medium text-gray-800">{t("access")} <span className="num text-gray-600 font-normal">({onCount}/{registry.length})</span></p>
                <Button data-testid="perm-recommended" variant="ghost" size="sm" icon={RotateCcw} onClick={() => setPerms(defaults)}>{t("perm_recommended")}</Button>
              </div>
              <div className="rounded-2xl border border-gray-200 divide-y divide-gray-100">
                {PERM_GROUPS.map((g) => {
                  const items = registry.filter((p) => p.group === g);
                  if (!items.length) return null;
                  return (
                    <div key={g} className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-600 mb-1">{t(`pg_${g}`)}</p>
                      {items.map((p) => (
                        <div key={p.key} className="flex items-center gap-3 py-2">
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-gray-900">{t(`perm_${p.key}`)}</span>
                            {p.staff && <span className="block text-xs text-gray-500">{t("perm_recommended_on")}</span>}
                          </span>
                          <Toggle testid={`perm-${p.key}`} label={t(`perm_${p.key}`)} checked={!!perms[p.key]} onChange={(v) => setPerms({ ...perms, [p.key]: v })} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <p className="text-[13px] text-gray-600 mt-2 flex gap-1.5"><Shield size={14} className="shrink-0 mt-0.5" /> {t("team_super_only")}</p>
            </div>
          )}

          {!isNew && !lockedRole && (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
              <span className="flex-1">
                <span className="block text-sm font-medium text-gray-900">{t("account_active")}</span>
                <span className="block text-[13px] text-gray-600">{t("account_active_hint")}</span>
              </span>
              <Toggle testid="admin-active" label={t("account_active")} checked={active} onChange={setActive} />
            </div>
          )}
        </>
      )}
      </div>
    </Sheet>
  );
}

export default function Team({ user }) {
  const { t } = useLang();
  const [list, setList] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [sheet, setSheet] = useState(null); // { admin: null | {...} }
  const load = () => api.get("/admins").then((r) => setList(r.data)).catch((e) => { setList([]); toast.error(apiErr(e)); });
  useEffect(() => {
    load();
    api.get("/permissions").then((r) => setRegistry(r.data)).catch(() => {});
  }, []);
  const total = registry.length;
  return (
    <Card>
      <CardHeader icon={Users} title={t("team")} subtitle={t("team_sub")}
        actions={<Button data-testid="add-admin-btn" size="sm" icon={UserPlus} onClick={() => setSheet({ admin: null })} disabled={!total}>{t("add_admin")}</Button>} />
      <div className="border-t border-gray-100 divide-y divide-gray-100">
        {list === null ? <div className="p-4 space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          : list.map((a) => {
            const on = Object.values(a.permissions || {}).filter(Boolean).length;
            return (
              <button key={a.id} data-testid={`admin-row-${a.mobile || a.id}`} onClick={() => total && setSheet({ admin: a })}
                className={`w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${a.active ? "" : "opacity-60"}`}>
                <span className={`w-9 h-9 rounded-full text-sm font-semibold flex items-center justify-center shrink-0 ${a.role === "super" ? "bg-brand-700 text-white" : "bg-gray-100 text-gray-700"}`}>{initials(a.name)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-gray-900 truncate">{a.name}{a.id === user.id && <span className="text-gray-600 font-normal"> ({t("you")})</span>}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-gray-600">
                    {a.mobile && a.full_name && <span className="inline-flex items-center gap-1 num"><Phone size={11} aria-hidden="true" />{fmtMobile(a.mobile)}</span>}
                    {a.email && <span className="inline-flex items-center gap-1 truncate"><Mail size={11} aria-hidden="true" />{a.email}</span>}
                    <span>{a.created_by && a.created_by !== "system" ? `${t("added_by")} ${a.created_by} · ` : ""}{fmtDate(a.created_at)}</span>
                  </span>
                </span>
                {!a.mobile && <Badge tone="red" icon={AlertTriangle}>{t("adm_no_mobile")}</Badge>}
                {!a.active && <Badge tone="red">{t("turned_off")}</Badge>}
                {a.role !== "super" && total > 0 && <Badge className="hidden sm:inline-flex"><span className="num">{on}/{total}</span> {t("access")}</Badge>}
                <RoleBadge a={a} />
              </button>
            );
          })}
      </div>
      {sheet && <AdminSheet admin={sheet.admin} registry={registry} me={user} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); load(); }} />}
    </Card>
  );
}
