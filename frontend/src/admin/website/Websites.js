import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Lock, Rocket, Pencil, Copy, Trash2, ExternalLink, Sparkles, LayoutTemplate, FilePlus2, Globe, Store, MoreHorizontal } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import { ICONS } from "@/site/registry";
import { PACKS, VIBES, buildSite, blankSite } from "@/site/presets";
import { LOOKS, PALETTES } from "@/site/theme";
import { Badge, Button, Card, Empty, Sheet, Skeleton } from "@/admin/ui";
import Frame from "@/admin/website/Frame";
import Builder from "@/admin/website/Builder";
import Quiz from "@/admin/website/Quiz";

// Shop setup > Website: up to 3 websites, one of them live on the shop's
// address. The classic website is the shop's original page and is locked.
// New ones come from the style quiz, a starter pack or a blank page, and are
// edited in the builder.

function Thumb({ site }) {
  const brand = useBrand();
  const payload = useMemo(() => (site.kind === "classic"
    ? { classic: true, brand }
    : { config: site.config, brand, lang: "en", editing: false }), [site, brand]);
  return (
    <div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl bg-gray-100">
      <div className="absolute inset-0"><Frame payload={payload} interactive={false} className="h-full w-full" /></div>
    </div>
  );
}

function SiteCard({ site, live, onEdit, onPublish, onDuplicate, onDelete, canAdd }) {
  const [menu, setMenu] = useState(false);
  const locked = site.locked || site.kind !== "builder";
  const updated = (() => { try { return new Date(site.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { return ""; } })();
  return (
    <Card className={`overflow-hidden ${live ? "ring-2 ring-emerald-500/60" : ""}`} data-testid={`site-card-${site.id}`}>
      <button type="button" onClick={locked ? undefined : onEdit} className={`block w-full ${locked ? "cursor-default" : ""}`} aria-label={`Open ${site.name}`}>
        <Thumb site={site} />
      </button>
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-gray-900">{site.name}</p>
            <p className="mt-0.5 text-[13px] text-gray-600">{locked ? "Made for your shop · can't be edited" : `Edited ${updated}${site.updated_by ? ` by ${site.updated_by}` : ""}`}</p>
          </div>
          {live ? <Badge tone="green" icon={Globe}>Live</Badge> : <Badge tone="gray">Draft</Badge>}
          {locked && <Badge tone="amber" icon={Lock}>Locked</Badge>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!locked && <Button size="sm" icon={Pencil} onClick={onEdit} data-testid={`site-edit-${site.id}`}>Edit</Button>}
          {!live && <Button size="sm" variant={locked ? "primary" : "secondary"} icon={Rocket} onClick={onPublish} data-testid={`site-publish-${site.id}`}>Make live</Button>}
          <a href={live ? "/" : `/site-preview/${site.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-gray-700 hover:bg-gray-100">
            <ExternalLink size={15} /> {live ? "Open site" : "Preview"}
          </a>
          {!locked && (
            <div className="relative ml-auto">
              <button type="button" aria-label="More" onClick={() => setMenu((m) => !m)} className="grid h-9 w-9 place-items-center rounded-xl text-gray-600 hover:bg-gray-100"><MoreHorizontal size={18} /></button>
              {menu && (
                <div className="absolute bottom-10 right-0 z-20 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-pop" onMouseLeave={() => setMenu(false)}>
                  <button type="button" disabled={!canAdd} onClick={() => { setMenu(false); onDuplicate(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"><Copy size={15} /> Duplicate</button>
                  <button type="button" disabled={live} onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40"><Trash2 size={15} /> Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function NewSiteSheet({ onClose, onQuiz, onCreate, creating }) {
  const [mode, setMode] = useState(null);
  const [pack, setPack] = useState(PACKS[0].id);
  const [look, setLook] = useState("");
  if (mode === "pack") {
    const p = PACKS.find((x) => x.id === pack);
    const lookId = look || p.look;
    return (
      <Sheet title="Start from a starter pack" subtitle="Ready words for your kind of business, in the look you pick" onClose={onClose} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setMode(null)}>Back</Button>
          <Button loading={creating} onClick={() => {
            const vibe = (VIBES.find((v) => v.looks[0] === lookId) || VIBES.find((v) => v.looks.includes(lookId)) || VIBES[1]).id;
            onCreate(`${p.name}`, buildSite({ pack, vibe, look: lookId }), `pack:${pack}`);
          }}>Create and edit</Button></div>}>
        <p className="mb-2 text-sm font-medium text-gray-800">Business</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PACKS.map((x) => {
            const I = ICONS[x.icon];
            return (
              <button key={x.id} type="button" onClick={() => { setPack(x.id); setLook(""); }} aria-pressed={pack === x.id}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium ${pack === x.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                <I size={17} className="shrink-0" /> {x.name}
              </button>
            );
          })}
        </div>
        <p className="mb-2 mt-5 text-sm font-medium text-gray-800">Look</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {LOOKS.map((l) => {
            const pal = PALETTES.find((x) => x.id === l.theme.palette);
            return (
              <button key={l.id} type="button" onClick={() => setLook(l.id)} aria-pressed={lookId === l.id}
                className={`overflow-hidden rounded-xl border-2 text-left ${lookId === l.id ? "border-brand-600" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="flex h-10"><span className="flex-[3]" style={{ background: pal.primary }} /><span className="flex-1" style={{ background: pal.accent }} /><span className="flex-1" style={{ background: l.theme.mode === "dark" ? pal.night : pal.bg }} /></span>
                <span className="block px-2.5 py-1.5 text-[13px] font-medium text-gray-800">{l.name}{l.id === p.look ? " ★" : ""}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }
  const opt = (icon, title, sub, onClick, testid, tag) => {
    const I = icon;
    return (
      <button type="button" data-testid={testid} onClick={onClick}
        className="flex w-full items-start gap-4 rounded-2xl border border-gray-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><I size={24} /></span>
        <span className="min-w-0"><span className="flex items-center gap-2 font-semibold text-gray-900">{title}{tag && <Badge tone="brand">{tag}</Badge>}</span><span className="mt-0.5 block text-sm text-gray-600">{sub}</span></span>
      </button>
    );
  };
  return (
    <Sheet title="New website" subtitle="It starts as a draft. Your live website stays as it is." onClose={onClose}>
      <div className="space-y-3">
        {opt(Sparkles, "Take the style quiz", "7 quick taps and see a website made for your shop", onQuiz, "new-site-quiz", "Recommended")}
        {opt(LayoutTemplate, "Starter pack", "Pick your business and a look", () => setMode("pack"), "new-site-pack")}
        {opt(FilePlus2, "Blank page", "Header, hero, visit us and footer: build the rest yourself", () => onCreate("My website", blankSite(), "blank"), "new-site-blank")}
      </div>
    </Sheet>
  );
}

export default function Websites() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = () => api.get("/websites").then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>;
  const canAdd = data.sites.length < data.limit;

  const create = async (name, config, origin) => {
    setCreating(true);
    try {
      const { data: site } = await api.post("/websites", { name, config, origin });
      setData((d) => ({ ...d, sites: [...d.sites, site] }));
      setCreatingNew(false); setQuiz(false);
      setEditing(site);
      toast.success("Website created");
    } catch (e) { toast.error(apiErr(e)); }
    setCreating(false);
  };
  const publish = async (site) => {
    if (!window.confirm(`Make “${site.name}” the website visitors see?`)) return;
    try { await api.post(`/websites/${site.id}/publish`); setData((d) => ({ ...d, live_id: site.id })); toast.success(`${site.name} is now live`); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const duplicate = async (site) => {
    try { const { data: copy } = await api.post(`/websites/${site.id}/duplicate`); setData((d) => ({ ...d, sites: [...d.sites, copy] })); toast.success("Copied"); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async (site) => {
    if (!window.confirm(`Delete “${site.name}”? This can't be undone.`)) return;
    try { await api.delete(`/websites/${site.id}`); setData((d) => ({ ...d, sites: d.sites.filter((s) => s.id !== site.id) })); toast.success("Deleted"); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="space-y-5" data-testid="websites">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <Store size={18} className="shrink-0 text-brand-700" />
        <p className="min-w-0 flex-1">Keep up to {data.limit} websites and switch which one is live at any time. Shop name, logo, address, hours and contact come from <b>General</b>.</p>
        <Button data-testid="new-website" icon={Plus} disabled={!canAdd} onClick={() => setCreatingNew(true)}>New website</Button>
      </div>
      {!canAdd && <p className="text-sm text-gray-600">You have {data.limit} websites, the most you can keep. Delete a draft to make a new one.</p>}
      {data.sites.length === 0 ? (
        <Card><Empty icon={Globe} title="No websites yet" body="Take the style quiz to make your first one in a minute." action={<Button icon={Plus} onClick={() => setCreatingNew(true)}>New website</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.sites.map((s) => (
            <SiteCard key={s.id} site={s} live={data.live_id === s.id} canAdd={canAdd}
              onEdit={() => setEditing(s)} onPublish={() => publish(s)} onDuplicate={() => duplicate(s)} onDelete={() => remove(s)} />
          ))}
          {canAdd && (
            <button type="button" onClick={() => setCreatingNew(true)}
              className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-card"><Plus size={22} /></span>
              <span className="font-medium">New website</span>
              <span className="text-sm">{data.limit - data.sites.length} more allowed</span>
            </button>
          )}
        </div>
      )}
      {creatingNew && <NewSiteSheet onClose={() => setCreatingNew(false)} onQuiz={() => { setCreatingNew(false); setQuiz(true); }} onCreate={create} creating={creating} />}
      {quiz && <Quiz initialName="My new website" onCancel={() => setQuiz(false)} onCreate={create} creating={creating} />}
      {editing && (
        <Builder site={editing} live={data.live_id === editing.id}
          onClose={() => { setEditing(null); load(); }}
          onSaved={(s) => setData((d) => ({ ...d, sites: d.sites.map((x) => (x.id === s.id ? s : x)) }))}
          onPublished={(id) => setData((d) => ({ ...d, live_id: id }))} />
      )}
    </div>
  );
}
