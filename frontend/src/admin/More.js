import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Monitor, MessageCircle, Copy, Loader2, Tag, ImagePlus, ScrollText, ListPlus, Languages, Shirt, SlidersHorizontal, Users, LogOut, Layers, Megaphone, Settings2, UserCog, Store } from "lucide-react";
import { WhatsAppScreen } from "@/admin/Marketing";
import CategoryConfig from "@/admin/CategoryConfig";
import Collection from "@/admin/Collection";
import SessionFields from "@/admin/SessionFields";
import Team from "@/admin/Team";
import General from "@/admin/General";
import { useBrand } from "@/lib/brand";
import { can, isSuper } from "@/admin/perms";
import { Button, Card, CardHeader, Crumbs, Field, MenuGroup, MenuRow, Page, PageHeader, Segmented, Skeleton, Tiles, inputCls } from "@/admin/ui";

// Everything that is not daily counter work lives in four groups. "More"
// (phones) and the sidebar (desktop) list the groups; a group opens a page of
// its settings; a setting opens its own screen. Each level has its own URL
// (?p=more, ?p=more&g=catalog, ?p=more&i=collection), so back always goes up
// one level.
export const GROUPS = [
  { id: "catalog", icon: Layers, label: "grp_catalog", sub: "grp_catalog_sub" },
  { id: "marketing", icon: Megaphone, label: "grp_marketing", sub: "grp_marketing_sub" },
  { id: "shop", icon: Settings2, label: "grp_shop", sub: "grp_shop_sub" },
  { id: "team", icon: UserCog, label: "grp_team", sub: "grp_team_sub" },
];

export const MORE_ITEMS = [
  { id: "collection", group: "catalog", icon: Shirt, label: "set_collection", sub: "tile_collection_sub", ok: (u) => can(u, "catalog_manage"), header: true },
  { id: "config", group: "catalog", icon: SlidersHorizontal, label: "set_configuration", sub: "tile_config_sub", ok: (u) => can(u, "catalog_manage"), header: true },
  { id: "whatsapp", group: "marketing", icon: MessageCircle, label: "WhatsApp", sub: "tile_whatsapp_sub", ok: (u) => can(u, "marketing_manage"), header: true },
  { id: "general", group: "shop", icon: Store, label: "set_general", sub: "tile_general_sub", ok: (u) => can(u, "settings_manage"), header: true },
  { id: "display", group: "shop", icon: Monitor, label: "set_display", sub: "tile_display_sub", ok: () => true },
  { id: "language", group: "shop", icon: Languages, label: "app_language", sub: "tile_language_sub", ok: (u) => can(u, "settings_manage"), header: true },
  { id: "watermark", group: "shop", icon: Tag, label: "watermark", sub: "tile_watermark_sub", ok: (u) => can(u, "settings_manage") },
  { id: "fields", group: "shop", icon: ListPlus, label: "cfg_session_fields", sub: "tile_fields_sub", ok: (u) => can(u, "settings_manage") },
  { id: "team", group: "team", icon: Users, label: "team", sub: "team_sub", ok: (u) => isSuper(u) },
  { id: "logs", group: "team", icon: ScrollText, label: "set_logs", sub: "logs_sub", ok: (u) => can(u, "logs_view") },
];

export function moreItems(user, group) { return MORE_ITEMS.filter((it) => it.ok(user) && (!group || it.group === group)); }
// Groups with at least one setting this admin may open.
export function moreGroups(user) { return GROUPS.filter((g) => moreItems(user, g.id).length); }

function roleLabel(user, t) { return user.is_owner ? t("role_owner") : user.role === "super" ? t("role_super") : t("role_staff"); }

// Level 1: the groups, then the account.
export default function MoreMenu({ user, onGroup, logout }) {
  const { t } = useLang();
  const groups = moreGroups(user);
  return (
    <Page>
      <PageHeader title={t("more_title")} subtitle={t("more_sub2")} />
      {groups.length > 0 && (
        <MenuGroup title={t("nav_setup")}>
          {groups.map((g) => (
            <MenuRow key={g.id} testid={`more-group-${g.id}`} icon={g.icon} title={t(g.label)}
              sub={moreItems(user, g.id).map((it) => t(it.label)).join(" · ")} onClick={() => onGroup(g.id)} />
          ))}
        </MenuGroup>
      )}
      <MenuGroup title={t("grp_account")}>
        <div className="flex items-center gap-3.5 px-4 py-3">
          <span className="w-9 h-9 rounded-full bg-brand-700 text-white text-sm font-semibold flex items-center justify-center shrink-0" aria-hidden="true">{(user.name || "").slice(0, 2).toUpperCase()}</span>
          <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900 truncate">{user.name}</span><span className="block text-[13px] text-gray-600">{roleLabel(user, t)}</span></span>
        </div>
        <MenuRow testid="logout-btn" icon={LogOut} title={t("logout")} onClick={logout} tone="danger" chevron={false} />
      </MenuGroup>
    </Page>
  );
}

// Level 2: one group's settings. Phones get a settings-style list (the top
// bar carries the title); desktop gets the header and a grid of tiles.
export function MoreGroup({ id, user, onOpen }) {
  const { t } = useLang();
  const g = GROUPS.find((x) => x.id === id);
  const items = g ? moreItems(user, g.id) : [];
  if (!items.length) return <Page><p className="text-center text-gray-600 py-10 text-sm">{t("no_access")}</p></Page>;
  return (
    <Page key={id}>
      <PageHeader title={t(g.label)} subtitle={t(g.sub)} className="hidden lg:flex" />
      <p className="lg:hidden px-1 mb-4 text-[15px] text-gray-600">{t(g.sub)}</p>
      <div className="lg:hidden">
        <MenuGroup>
          {items.map((it) => <MenuRow key={it.id} testid={`more-${it.id}`} icon={it.icon} title={t(it.label)} sub={t(it.sub)} onClick={() => onOpen(it.id)} />)}
        </MenuGroup>
      </div>
      <div className="hidden lg:block">
        <Tiles tiles={items.map((it) => ({ id: it.id, icon: it.icon, title: t(it.label), sub: t(it.sub) }))} onOpen={onOpen} />
      </div>
    </Page>
  );
}

// Level 3: one setting. Phones show its title and back arrow in the top bar;
// desktop shows a breadcrumb back to the group, then a page header unless the
// screen's own card already carries the title.
export function MoreItem({ id, user, onUp }) {
  const { t } = useLang();
  const it = MORE_ITEMS.find((x) => x.id === id);
  if (!it || !it.ok(user)) return <Page><p className="text-center text-gray-600 py-10 text-sm">{t("no_access")}</p></Page>;
  const g = GROUPS.find((x) => x.id === it.group);
  const body = {
    general: <General />,
    collection: <Collection />,
    config: <CategoryConfig />,
    whatsapp: <WhatsAppScreen />,
    display: <DisplaySettings canManage={can(user, "settings_manage")} />,
    language: <LanguagePanel />,
    watermark: <WatermarkPanel />,
    fields: <SessionFields />,
    team: <Team user={user} />,
    logs: <Logs />,
  }[id];
  return (
    <Page key={id}>
      <Crumbs className="hidden lg:flex" testid="crumb-back" backLabel={`${t("back")}: ${t(g.label)}`} onBack={onUp}
        trail={[{ label: t(g.label), onClick: onUp }, { label: t(it.label) }]} />
      {it.header && <PageHeader title={t(it.label)} subtitle={t(it.sub)} className="hidden lg:flex" />}
      {body}
    </Page>
  );
}

// Runs an API action and shows a toast on failure, so no button fails silently.
async function run(action, okMsg) {
  try { await action(); if (okMsg) toast.success(okMsg); return true; }
  catch (e) { toast.error(apiErr(e)); return false; }
}

function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); } catch { return ""; } }

function Logs() {
  const { t } = useLang();
  const [logs, setLogs] = useState(null);
  useEffect(() => { api.get("/logs").then((r) => setLogs(r.data)).catch((e) => { setLogs([]); toast.error(apiErr(e)); }); }, []);
  return (
    <Card>
      <CardHeader icon={ScrollText} title={t("set_logs")} subtitle={t("logs_sub")} />
      <div className="border-t border-gray-100 divide-y divide-gray-100">
        {logs === null ? <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          : logs.map((l) => (
            <div key={l.id} className="px-5 py-2.5 text-sm flex gap-3">
              <span className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">{(l.admin_username || "?").slice(0, 2).toUpperCase()}</span>
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
          <input data-testid="display-link" readOnly value={link} aria-label={t("display_link")} className={`${inputCls} bg-gray-50 text-gray-700`} onFocus={(e) => e.target.select()} />
          <Button data-testid="copy-link" icon={Copy} onClick={() => { navigator.clipboard.writeText(link); toast.success("Copied"); }} className="h-12 sm:h-11">{t("copy")}</Button>
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
            <Button data-testid="save-display" size="lg" onClick={save}>{t("save")}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// The admin app's language, for everyone in the shop.
function LanguagePanel() {
  const { lang, setLang } = useLang();
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
    <div className="grid sm:grid-cols-3 gap-3 max-w-3xl" role="radiogroup">
      {options.map((o) => {
        const on = o.id === lang;
        return (
          <button key={o.id} data-testid={`app-lang-${o.id}`} onClick={() => pick(o.id)} role="radio" aria-checked={on}
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

function WatermarkPanel() {
  const [settings, setSettings] = useState(null);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch((e) => toast.error(apiErr(e))); }, []);
  if (!settings) return <Skeleton className="h-96 rounded-2xl" />;
  return <WatermarkSettings initial={settings} />;
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
  const brand = useBrand();
  const [wm, setWm] = useState({
    watermark_text: initial.watermark_text ?? brand.shop_name,
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
                <button key={s.id} data-testid={`wm-style-${s.id}`} onClick={() => set("watermark_style")(s.id)} aria-pressed={wm.watermark_style === s.id}
                  className={`h-11 px-2 rounded-xl border text-sm font-medium transition-colors ${wm.watermark_style === s.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-300 text-gray-700 hover:border-gray-400"}`}>{s.label}</button>
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
          <Button data-testid="save-watermark" size="lg" onClick={save}>{t("save")}</Button>
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
