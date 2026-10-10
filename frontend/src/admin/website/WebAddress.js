import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Copy, Link2, BookOpen, CheckCircle2, Clock3, RefreshCw, Trash2 } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { Button, Card, Sheet, Skeleton, inputCls } from "@/admin/ui";
import { useW } from "@/admin/website/words";

// Shop setup > Website, at the bottom: the website's domain address. It is hosted
// by us at the current address; a shop may also point a domain it owns here
// by adding two DNS records where it bought the domain. Short on the page,
// with a step-by-step guide in a pop-up.

function CopyText({ text }) {
  const w = useW();
  return (
    <button type="button" onClick={() => { try { navigator.clipboard.writeText(text); toast.success(w("Copied")); } catch { /* ignore */ } }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2 py-1 font-mono text-[13px] text-gray-900 ring-1 ring-gray-200 hover:ring-brand-300" title={w("Copy")}>
      <span className="truncate">{text}</span><Copy size={13} className="shrink-0 text-brand-700" aria-hidden="true" />
    </button>
  );
}

// The two records to add where the domain was bought.
function Records({ info }) {
  const w = useW();
  const rows = [
    ["A", "@", info.server_ip || "—"],
    ["CNAME", "www", info.current],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="grid grid-cols-[4.5rem_3.5rem_1fr] gap-2 bg-gray-50 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-gray-600">
        <span>{w("Type")}</span><span>{w("Name")}</span><span>{w("Points to")}</span>
      </div>
      {rows.map(([t, n, v]) => (
        <div key={t} className="grid grid-cols-[4.5rem_3.5rem_1fr] items-center gap-2 border-t border-gray-100 px-3 py-2 text-sm">
          <span className="font-semibold text-gray-900">{t}</span><span className="font-mono text-gray-800">{n}</span><span className="min-w-0"><CopyText text={v} /></span>
        </div>
      ))}
    </div>
  );
}

function Guide({ info, onClose }) {
  const w = useW();
  const steps = [
    [w("Get a domain address"), w("Buy one (like myshop.com) from a seller such as GoDaddy, Hostinger or BigRock. Already have one? Skip this.")],
    [w("Write it here"), w("Type it in the box and tap Connect.")],
    [w("Open its settings"), w("Sign in where you bought it and open “DNS” or “Manage DNS”.")],
    [w("Add two records"), w("Add these two, exactly as shown. If there is already an A record for @ or a record for www, change it to this.")],
    [w("Wait a little"), w("It can take a few minutes, sometimes up to a day. Then tap “Check again”.")],
    [w("Done"), w("Customers can open your website at your own address. Your current address keeps working too.")],
  ];
  return (
    <Sheet testid="domain-guide" title={w("Use your own domain address")} subtitle={w("Your website stays with us. You only point your address here.")} onClose={onClose} size="lg"
      footer={<div className="flex justify-end"><Button onClick={onClose}>{w("OK, got it")}</Button></div>}>
      <ol className="space-y-4">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">{t}</p>
              <p className="text-sm text-gray-600">{d}</p>
              {i === 3 && info && <div className="mt-2"><Records info={info} /></div>}
            </div>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

export default function WebAddress() {
  const w = useW();
  const [info, setInfo] = useState(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // null | "checking" | {bare, www, found}
  const [guide, setGuide] = useState(false);

  const check = async () => {
    setStatus("checking");
    try { const { data } = await api.post("/websites/domain/check"); setStatus(data); }
    catch (e) { setStatus(null); toast.error(apiErr(e)); }
  };
  useEffect(() => {
    api.get("/websites/domain").then((r) => { setInfo(r.data); if (r.data.custom) check(); }).catch((e) => toast.error(apiErr(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (domain) => {
    setBusy(true);
    try {
      const { data } = await api.put("/websites/domain", { domain });
      setInfo(data); setValue("");
      if (data.custom) { toast.success(w("Saved. Now add the two records where you bought it.")); check(); } else { setStatus(null); toast.success(w("Removed")); }
    } catch (e) { toast.error(apiErr(e)); }
    setBusy(false);
  };

  if (!info) return <Skeleton className="h-40 rounded-2xl" />;
  const connected = status && status !== "checking" && (status.bare || status.www);
  return (
    <Card data-testid="web-address">
      <div className="flex items-start gap-3 px-5 pt-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Globe size={16} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-gray-900">{w("Domain address")}</h3>
          <p className="text-sm text-gray-600">{w("Where customers open your website.")}</p>
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5 pt-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
          <span className="text-sm text-gray-600">{w("Now:")}</span>
          <a href={`https://${info.current}`} target="_blank" rel="noreferrer" className="font-medium text-brand-700 hover:underline break-all">{info.current}</a>
          <span className="ml-auto text-[12.5px] text-gray-500">{w("Included, always on")}</span>
        </div>

        {info.custom ? (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 size={16} className="text-gray-500" aria-hidden="true" />
              <span className="font-medium text-gray-900 break-all">{info.custom}</span>
              {status === "checking" ? <span className="text-[13px] text-gray-500">{w("Checking…")}</span>
                : connected ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[13px] font-medium text-emerald-800"><CheckCircle2 size={14} /> {w("Connected")}</span>
                  : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[13px] font-medium text-amber-800"><Clock3 size={14} /> {w("Waiting for setup")}</span>}
              <span className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" icon={RefreshCw} onClick={check} disabled={status === "checking"}>{w("Check again")}</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => save("")} disabled={busy} aria-label={w("Remove")} />
              </span>
            </div>
            {!connected && (
              <>
                <p className="text-[13px] text-gray-600">{w("Add these two records where you bought your address:")}</p>
                <Records info={info} />
              </>
            )}
          </div>
        ) : (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (value.trim()) save(value); }}>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="myshop.com" inputMode="url" autoCapitalize="none" autoCorrect="off"
              aria-label={w("Your own domain address (optional)")} className={inputCls} data-testid="domain-input" />
            <Button type="submit" loading={busy} disabled={!value.trim()} className="shrink-0" data-testid="domain-connect">{w("Connect")}</Button>
          </form>
        )}
        <button type="button" onClick={() => setGuide(true)} data-testid="domain-guide-open"
          className="flex w-full items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-3 text-left transition hover:bg-brand-100">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white"><BookOpen size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-brand-900">{w("How to connect your own domain address")}</span>
            <span className="block text-[12.5px] text-brand-900/75">{w("Step-by-step guide, takes 5 minutes")}</span>
          </span>
          <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-brand-700 shadow-card">{w("Open guide")}</span>
        </button>
      </div>
      {guide && <Guide info={info} onClose={() => setGuide(false)} />}
    </Card>
  );
}
