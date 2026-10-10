import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Lock, Rocket, Pencil, Copy, Trash2, ExternalLink, Sparkles, LayoutTemplate, FilePlus2, MoreHorizontal,
  ArrowRight, ArrowDown, Check, Layers, Monitor,
} from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useBrand } from "@/lib/brand";
import { ICONS } from "@/site/registry";
import { PACKS, VIBES, buildSite, blankSite } from "@/site/presets";
import { LOOKS, PALETTES } from "@/site/theme";
import { Badge, Button, Card, Sheet, Skeleton } from "@/admin/ui";
import Frame from "@/admin/website/Frame";
import Builder from "@/admin/website/Builder";
import Quiz from "@/admin/website/Quiz";
import { useW } from "@/admin/website/words";
import WebAddress from "@/admin/website/WebAddress";

// Phones (narrower than a tablet) can see and switch variations but never
// open the quiz or the editor.
function usePhone() {
  const q = "(max-width: 767px)";
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return on;
}

// Shop setup > Website. The shop has one website and keeps up to 3
// variations of it. Exactly one variation is live (what customers see); the
// others are drafts only the shop sees, to edit and preview freely until one
// is made live in its place. The original website is locked.

function Thumb({ site }) {
  const brand = useBrand();
  const payload = useMemo(() => (site.kind === "classic"
    ? { classic: true, brand }
    : { config: site.config, brand, lang: "en", editing: false }), [site, brand]);
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
      <div className="absolute inset-0"><Frame payload={payload} interactive={false} className="h-full w-full" /></div>
    </div>
  );
}

const siteName = (site, w) => (site.kind === "classic" && site.name === "Classic website" ? w("Original website") : site.name);
const editedOn = (site, w) => {
  if (site.kind !== "builder") return w("Made for your shop. Can't be edited.");
  let d = "";
  try { d = new Date(site.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); } catch { /* ignore */ }
  return site.updated_by ? w("Edited {date} by {name}", { date: d, name: site.updated_by }) : w("Edited {date}", { date: d });
};

// One variation. All of them look alike and sit in one list; the live one
// has a pulsing "Live" badge and a green outline.
function SiteCard({ site, live, onEdit, onPublish, onDuplicate, onDelete }) {
  const w = useW();
  const [menu, setMenu] = useState(false);
  const editable = site.kind === "builder" && !site.locked;
  const small = "inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-colors";
  return (
    <Card className={`flex flex-col overflow-hidden ${live ? "ring-2 ring-emerald-500/60" : ""}`} data-testid={`site-card-${site.id}`}>
      <button type="button" onClick={editable ? onEdit : undefined} className={`relative block w-full ${editable ? "" : "cursor-default"}`} aria-label={w("Open {name}", { name: siteName(site, w) })}>
        <Thumb site={site} />
        {live && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[12px] font-semibold text-white shadow-lg" data-testid="live-badge">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-white" /></span>
            {w("Live")}
          </span>
        )}
        {!live && !editable && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11.5px] font-medium text-amber-800 shadow"><Lock size={11} /> {w("Locked")}</span>}
      </button>
      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <p className="truncate text-[13.5px] font-semibold text-gray-900" title={editedOn(site, w)}>{siteName(site, w)}</p>
        <p className="truncate text-[12px] text-gray-500">{live ? w("Customers see this one") : editable ? w("Only you can see it") : w("Original design")}</p>
        <div className="mt-auto flex items-center gap-1 pt-2">
          {live ? (
            <a href="/" target="_blank" rel="noreferrer" className={`${small} bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}><ExternalLink size={13} /> {w("Open")}</a>
          ) : (
            <button type="button" onClick={onPublish} data-testid={`site-publish-${site.id}`} className={`${small} bg-brand-700 text-white hover:bg-brand-800`}><Rocket size={13} /> {w("Make live")}</button>
          )}
          {editable && <button type="button" onClick={onEdit} data-testid={`site-edit-${site.id}`} aria-label={w("Edit")} title={w("Edit")} className={`${small} hidden text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 md:inline-flex`}><Pencil size={13} /> {w("Edit")}</button>}
          {!live && (
            <div className="relative ml-auto">
              <button type="button" aria-label={w("More")} aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="grid h-8 w-8 place-items-center rounded-lg text-gray-600 hover:bg-gray-100"><MoreHorizontal size={17} /></button>
              {menu && (
                <>
                  <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                  <div className="absolute bottom-9 right-0 z-20 w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-pop">
                    <a href={`/site-preview/${site.id}`} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-gray-50"><ExternalLink size={15} /> {w("Preview in new tab")}</a>
                    {editable && <button type="button" onClick={() => { setMenu(false); onDuplicate(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-gray-50"><Copy size={15} /> {w("Make a copy")}</button>}
                    {editable && <button type="button" onClick={() => { setMenu(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-700 hover:bg-red-50"><Trash2 size={15} /> {w("Delete")}</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// Phones: designing needs a big screen, so instead of the editor or the quiz
// a short note says to use a computer.
function ComputerSheet({ onClose }) {
  const w = useW();
  return (
    <Sheet testid="use-computer" size="sm" onClose={onClose}
      footer={<Button full onClick={onClose}>{w("OK")}</Button>}>
      <div className="flex flex-col items-center pt-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Monitor size={26} /></span>
        <p className="mt-4 text-[17px] font-semibold text-gray-900">{w("Please use a computer or laptop")}</p>
        <p className="mt-1 text-sm text-gray-600">{w("This feature works on a bigger screen.")}</p>
      </div>
    </Sheet>
  );
}

// "Make live": shows which variation customers will see instead.
function PublishSheet({ site, current, onClose, onConfirm }) {
  const w = useW();
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onConfirm(); setBusy(false); };
  return (
    <Sheet title={w("Make “{name}” live?", { name: siteName(site, w) })} onClose={onClose} locked={busy}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{w("Cancel")}</Button><Button icon={Rocket} loading={busy} onClick={go} data-testid="publish-confirm">{w("Make live")}</Button></div>}>
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        {current && (
          <div className="overflow-hidden rounded-xl border border-gray-200 opacity-70">
            <Thumb site={current} />
            <p className="truncate px-3 py-2 text-[13px] text-gray-600"><span className="font-medium text-gray-800">{w("Now:")}</span> {siteName(current, w)}</p>
          </div>
        )}
        <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-700"><ArrowRight size={18} className="hidden sm:block" /><ArrowDown size={18} className="sm:hidden" /></span>
        <div className="overflow-hidden rounded-xl border-2 border-emerald-500">
          <Thumb site={site} />
          <p className="truncate px-3 py-2 text-[13px] text-gray-600"><span className="font-medium text-emerald-800">{w("New:")}</span> {siteName(site, w)}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-gray-700">
        <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" /> {w("Customers will see “{name}” on your website right away.", { name: siteName(site, w) })}</li>
        {current && <li className="flex gap-2"><Check size={17} className="mt-0.5 shrink-0 text-emerald-600" /> {w("“{name}” is kept here. You can make it live again any time.", { name: siteName(current, w) })}</li>}
      </ul>
    </Sheet>
  );
}

function DeleteSheet({ site, onClose, onConfirm }) {
  const w = useW();
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); await onConfirm(); setBusy(false); };
  return (
    <Sheet title={w("Delete “{name}”?", { name: siteName(site, w) })} subtitle={w("It is removed for good. This can't be undone.")} onClose={onClose} size="sm" locked={busy}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={busy}>{w("Cancel")}</Button><Button variant="danger" icon={Trash2} loading={busy} onClick={go} data-testid="delete-confirm">{w("Delete")}</Button></div>}>
      <div className="overflow-hidden rounded-xl border border-gray-200"><Thumb site={site} /></div>
    </Sheet>
  );
}

// All 3 places are used: pick one to delete, then carry on to a new one.
function FullSheet({ data, onClose, onDelete, onContinue }) {
  const w = useW();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const full = data.sites.length >= data.limit;
  const del = async (s) => { setBusy(true); await onDelete(s); setBusy(false); setConfirm(null); };
  return (
    <Sheet testid="variations-full" title={full ? w("You already have {n} variations", { n: data.limit }) : w("There's room now")}
      subtitle={full ? w("Delete one to make room for a new variation.") : w("You can make your new variation.")} onClose={onClose} locked={busy}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{w("Cancel")}</Button><Button icon={Plus} disabled={full} onClick={onContinue} data-testid="full-continue">{w("New variation")}</Button></div>}>
      <ul className="space-y-2">
        {data.sites.map((s) => {
          const live = data.live_id === s.id;
          const locked = s.locked || s.kind !== "builder";
          return (
            <li key={s.id} className="rounded-xl border border-gray-200 p-2.5">
              <div className="flex items-center gap-3">
                <div className="w-24 shrink-0 overflow-hidden rounded-lg border border-gray-100"><Thumb site={s} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{siteName(s, w)}</p>
                  <p className="text-[12.5px] text-gray-600">{live ? w("Live: can't be deleted") : locked ? w("Original: can't be deleted") : w("Only you can see it")}</p>
                </div>
                {!live && !locked && confirm !== s.id && (
                  <Button size="sm" variant="dangerSoft" icon={Trash2} onClick={() => setConfirm(s.id)} data-testid={`full-delete-${s.id}`}>{w("Delete")}</Button>
                )}
              </div>
              {confirm === s.id && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                  <p className="flex-1 text-[13px] text-red-800">{w("Delete for good? This can't be undone.")}</p>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>{w("Keep")}</Button>
                  <Button size="sm" variant="danger" loading={busy} onClick={() => del(s)} data-testid={`full-delete-confirm-${s.id}`}>{w("Delete")}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function NewSheet({ data, onClose, onQuiz, onCreate, onCopy, creating }) {
  const w = useW();
  const [mode, setMode] = useState(null);
  const [pack, setPack] = useState(PACKS[0].id);
  const [look, setLook] = useState("");
  const copyable = data.sites.filter((s) => s.kind === "builder");
  const nextName = w("Variation {n}", { n: data.sites.length + 1 });
  if (mode === "pack") {
    const p = PACKS.find((x) => x.id === pack);
    const lookId = look || p.look;
    return (
      <Sheet title={w("Pick a ready design")} subtitle={w("Choose your kind of shop and a look. Ready words and pictures are filled in, and you can change everything.")} onClose={onClose} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setMode(null)}>{w("Back")}</Button>
          <Button loading={creating} onClick={() => {
            const vibe = (VIBES.find((v) => v.looks[0] === lookId) || VIBES.find((v) => v.looks.includes(lookId)) || VIBES[1]).id;
            onCreate(w(p.name), buildSite({ pack, vibe, look: lookId }), `pack:${pack}`);
          }}>{w("Make it and start editing")}</Button></div>}>
        <p className="mb-2 text-sm font-medium text-gray-800">{w("Your kind of shop")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PACKS.map((x) => {
            const I = ICONS[x.icon];
            return (
              <button key={x.id} type="button" onClick={() => { setPack(x.id); setLook(""); }} aria-pressed={pack === x.id}
                className={`flex min-h-[48px] items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium ${pack === x.id ? "border-brand-600 bg-brand-50 text-brand-800" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                <I size={17} className="shrink-0" /> {w(x.name)}
              </button>
            );
          })}
        </div>
        <p className="mb-2 mt-5 text-sm font-medium text-gray-800">{w("Look")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {LOOKS.map((l) => {
            const pal = PALETTES.find((x) => x.id === l.theme.palette);
            return (
              <button key={l.id} type="button" onClick={() => setLook(l.id)} aria-pressed={lookId === l.id}
                className={`overflow-hidden rounded-xl border-2 text-left ${lookId === l.id ? "border-brand-600" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="flex h-10"><span className="flex-[3]" style={{ background: pal.primary }} /><span className="flex-1" style={{ background: pal.accent }} /><span className="flex-1" style={{ background: l.theme.mode === "dark" ? pal.night : pal.bg }} /></span>
                <span className="block px-2.5 py-1.5 text-[13px] font-medium text-gray-800">{w(l.name)}{l.id === p.look ? ` · ${w("Suggested")}` : ""}</span>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }
  if (mode === "copy") {
    return (
      <Sheet title={w("Copy a variation")} subtitle={w("The copy is a draft. The one you copy stays as it is.")} onClose={onClose}
        footer={<div className="flex justify-end"><Button variant="ghost" onClick={() => setMode(null)}>{w("Back")}</Button></div>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {copyable.map((s) => (
            <button key={s.id} type="button" disabled={creating} onClick={() => onCopy(s)} className="overflow-hidden rounded-xl border-2 border-gray-200 text-left transition hover:border-brand-400 disabled:opacity-50">
              <Thumb site={s} />
              <span className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-900"><Copy size={15} className="text-brand-700" /> {siteName(s, w)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    );
  }
  const opt = (icon, title, sub, onClick, testid, tag) => {
    const I = icon;
    return (
      <button type="button" data-testid={testid} onClick={onClick} disabled={creating}
        className="flex w-full items-start gap-4 rounded-2xl border border-gray-200 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><I size={24} /></span>
        <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">{title}{tag && <Badge tone="brand">{tag}</Badge>}</span><span className="mt-0.5 block text-sm text-gray-600">{sub}</span></span>
      </button>
    );
  };
  return (
    <Sheet testid="new-variation" title={w("New variation")} subtitle={w("Only you will see it. Your live website stays as it is until you make this one live.")} onClose={onClose}>
      <div className="space-y-3">
        {opt(Sparkles, w("Answer a few questions"), w("A few quick taps and we make a design for your shop"), onQuiz, "new-site-quiz", w("Easiest"))}
        {opt(LayoutTemplate, w("Pick a ready design"), w("Choose your kind of shop and a look"), () => setMode("pack"), "new-site-pack")}
        {copyable.length > 0 && opt(Copy, w("Copy one you already have"), w("Start from one of your variations"), () => setMode("copy"), "new-site-copy")}
        {opt(FilePlus2, w("Start empty"), w("Just the top bar, a big welcome, your address and the bottom bar. Add the rest yourself."), () => onCreate(nextName, blankSite(), "blank"), "new-site-blank")}
      </div>
    </Sheet>
  );
}

export default function Websites() {
  const w = useW();
  const phone = usePhone();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sheet, setSheet] = useState(null); // "new" | "full" | {publish} | {remove}
  const [quiz, setQuiz] = useState(false);
  const [creating, setCreating] = useState(false);
  const load = () => api.get("/websites").then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="space-y-4"><Skeleton className="h-72 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div></div>;
  const full = data.sites.length >= data.limit;
  const live = data.sites.find((s) => s.id === data.live_id);
  // Live first, then the others in the order they were made.
  const ordered = [...(live ? [live] : []), ...data.sites.filter((s) => s.id !== data.live_id)];
  const startNew = () => (phone ? setSheet({ computer: "new" }) : setSheet(full ? "full" : "new"));
  const edit = (s) => (phone ? setSheet({ computer: "edit" }) : setEditing(s));

  const create = async (name, config, origin) => {
    setCreating(true);
    try {
      const { data: site } = await api.post("/websites", { name, config, origin });
      setData((d) => ({ ...d, sites: [...d.sites, site] }));
      setSheet(null); setQuiz(false);
      setEditing(site);
      toast.success(w("Variation made. Only you can see it."));
    } catch (e) { toast.error(apiErr(e)); }
    setCreating(false);
  };
  const copy = async (site) => {
    setCreating(true);
    try {
      const { data: c } = await api.post(`/websites/${site.id}/duplicate`);
      setData((d) => ({ ...d, sites: [...d.sites, c] }));
      setSheet(null);
      toast.success(w("Copy made"));
    } catch (e) { toast.error(apiErr(e)); }
    setCreating(false);
  };
  const publish = async (site) => {
    try {
      await api.post(`/websites/${site.id}/publish`);
      setData((d) => ({ ...d, live_id: site.id }));
      setSheet(null);
      toast.success(w("“{name}” is live now", { name: siteName(site, w) }));
    } catch (e) { toast.error(apiErr(e)); }
  };
  const remove = async (site) => {
    try {
      await api.delete(`/websites/${site.id}`);
      setData((d) => ({ ...d, sites: d.sites.filter((s) => s.id !== site.id) }));
      if (sheet && sheet.remove) setSheet(null);
      toast.success(w("Deleted"));
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="space-y-6" data-testid="websites">
      {phone && (
        <p className="flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="use-computer-note">
          <Monitor size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{w("To design or edit your website, please use a computer or laptop.")}</span>
        </p>
      )}
      {/* How it works, in three steps. */}
      <ol className="hidden gap-2 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 md:grid md:grid-cols-3">
        {[[Layers, w("Make a variation"), w("A new look for your website")], [Pencil, w("Edit and check it"), w("Only you can see it")], [Rocket, w("Make it live"), w("Customers see it right away")]].map(([I, t, d], i) => (
          <li key={t} className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-brand-700 shadow-card"><I size={17} /></span>
            <span className="min-w-0"><span className="block font-semibold">{i + 1}. {t}</span><span className="block text-[13px] text-brand-900/75">{d}</span></span>
          </li>
        ))}
      </ol>

      <section>
        <div className="mb-2 flex flex-wrap items-end gap-x-3 gap-y-1 px-1">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-gray-800">{w("Your variations")} <span className="font-normal text-gray-500">· {w("{used} of {limit} used", { used: data.sites.length, limit: data.limit })}</span></h2>
            <p className="text-[13px] text-gray-600">{w("Customers see only the live one. The others are for you to try ideas.")}</p>
          </div>
          <Button size="sm" icon={Plus} onClick={startNew} data-testid="new-website">{w("New variation")}</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ordered.map((s) => (
            <SiteCard key={s.id} site={s} live={s.id === data.live_id} onEdit={() => edit(s)} onPublish={() => setSheet({ publish: s })}
              onDuplicate={() => (full ? setSheet("full") : copy(s))} onDelete={() => setSheet({ remove: s })} />
          ))}
          {!full && (
            <button type="button" onClick={startNew} data-testid="new-website-tile"
              className="flex min-h-[9rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gray-300 px-3 text-center text-gray-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-card"><Plus size={18} /></span>
              <span className="text-sm font-medium">{w("New variation")}</span>
              <span className="text-[12px]">{w("{n} more allowed", { n: data.limit - data.sites.length })}</span>
            </button>
          )}
        </div>
      </section>

      <WebAddress />

      {sheet === "new" && <NewSheet data={data} onClose={() => setSheet(null)} onQuiz={() => { setSheet(null); setQuiz(true); }} onCreate={create} onCopy={copy} creating={creating} />}
      {sheet === "full" && <FullSheet data={data} onClose={() => setSheet(null)} onDelete={remove} onContinue={() => setSheet("new")} />}
      {sheet && sheet.publish && <PublishSheet site={sheet.publish} current={live} onClose={() => setSheet(null)} onConfirm={() => publish(sheet.publish)} />}
      {sheet && sheet.computer && <ComputerSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.remove && <DeleteSheet site={sheet.remove} onClose={() => setSheet(null)} onConfirm={() => remove(sheet.remove)} />}
      {quiz && <Quiz initialName={w("Variation {n}", { n: data.sites.length + 1 })} onCancel={() => setQuiz(false)} onCreate={create} creating={creating} />}
      {editing && (
        <Builder site={editing} live={data.live_id === editing.id} liveSite={live}
          onClose={() => { setEditing(null); load(); }}
          onSaved={(s) => setData((d) => ({ ...d, sites: d.sites.map((x) => (x.id === s.id ? s : x)) }))}
          onPublished={(id) => setData((d) => ({ ...d, live_id: id }))} />
      )}
    </div>
  );
}
