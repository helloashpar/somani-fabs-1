import React, { useState, useEffect, useRef, useCallback } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import {
  X, Plus, CheckCircle2, Monitor, Camera as CamIcon, Sparkles, AlertTriangle, Trash2, ChevronLeft, ChevronRight,
  ShoppingBag, CircleSlash, Maximize2, ArrowLeft, ChevronDown, LogOut,
} from "lucide-react";
import Avatar from "@/admin/Avatar";
import Camera from "@/admin/Camera";
import NewTrial from "@/admin/NewTrial";
import { bestColumns } from "@/lib/bestGrid";
import { loadCatalog, loadCategories } from "@/lib/catalog";
import { useWhatsApp, WaPanel, WaStatus, WaTrialActions } from "@/admin/WhatsApp";
import { HistoryCard, HistoryStrip } from "@/admin/CustomerHistory";
import { can } from "@/admin/perms";
import { BottomBar, Button, Card, Page, Sheet, Skeleton, Badge, Empty, IconButton, Field, inputCls } from "@/admin/ui";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

// While open, mirrors what this admin is viewing onto the shop display screen.
// `target` is { trial_id } for one try-on or { session_id } for "show all".
function useLiveDisplay(target) {
  const key = JSON.stringify(target);
  useEffect(() => {
    api.post("/display/preview", target).catch((e) => toast.error(apiErr(e)));
    const beat = setInterval(() => api.post("/display/heartbeat").catch(() => {}), 5000);
    return () => { clearInterval(beat); api.delete("/display/preview").catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

function useNoScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
}

function OnScreen() {
  const { t } = useLang();
  return <span className="inline-flex items-center gap-1.5 min-w-0 text-xs font-medium text-white bg-white/10 rounded-full px-3 py-1.5"><Monitor size={14} className="shrink-0" aria-hidden="true" /> <span className="truncate">{t("on_shop_screen")}</span></span>;
}

// Full-screen look. Swipe (or the arrows / arrow keys) moves between finished
// looks, and the shop screen follows. Star and Send work right here.
function PreviewModal({ trials, index, onIndex, onClose, wa, onWaChange, canStar }) {
  const { t } = useLang();
  const trial = trials[index];
  const n = trials.length;
  useLiveDisplay({ trial_id: trial.id });
  useNoScroll();
  const go = useCallback((d) => { const i = index + d; if (i >= 0 && i < n) onIndex(i); }, [index, n, onIndex]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go]);
  const startX = useRef(null);
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };
  const st = wa?.trials?.[trial.id];
  const arrow = "absolute top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-gray-950/50 text-white flex items-center justify-center backdrop-blur-sm disabled:opacity-0 transition-opacity";
  return (
    <div data-testid="preview-modal" role="dialog" aria-modal="true" aria-label={trial.description}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col animate-in fade-in duration-150 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <OnScreen />
        <div className="flex items-center gap-2 shrink-0">
          {n > 1 && <span className="num text-sm text-white/75 whitespace-nowrap">{t("look_of").replace("{i}", index + 1).replace("{n}", n)}</span>}
          <IconButton data-testid="close-preview" icon={X} label="Close" tone="onDark" onClick={onClose} size={22} />
        </div>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-16" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img key={trial.id} src={trial.generated_image} alt={trial.description} className="max-h-full max-w-full object-contain rounded-2xl animate-in fade-in duration-200 select-none" draggable={false} />
        {n > 1 && <>
          <button data-testid="preview-prev" onClick={() => go(-1)} disabled={index === 0} aria-label={t("prev_look")} className={`${arrow} left-2 sm:left-4`}><ChevronLeft size={24} /></button>
          <button data-testid="preview-next" onClick={() => go(1)} disabled={index === n - 1} aria-label={t("next_look")} className={`${arrow} right-2 sm:right-4`}><ChevronRight size={24} /></button>
        </>}
      </div>
      <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] max-w-2xl w-full mx-auto">
        <p className="text-white font-medium truncate">{trial.type || trial.description}</p>
        {trial.type && trial.description !== trial.type && <p className="text-sm text-white/60 truncate">{trial.description}</p>}
        <div className="flex items-center gap-2 mt-3 min-h-[48px]">
          <WaTrialActions trial={trial} wa={wa} onChange={onWaChange} canStar={canStar} dark />
          {st?.wa_status && <span className="ml-auto"><WaStatus status={st.wa_status} lookNo={st.look_no} error={st.wa_error} /></span>}
        </div>
      </div>
    </div>
  );
}

// "Show all": every finished try-on of the session, on the phone and on the
// shop screen (sharing the screen equally with other admins' previews).
function ShowAllModal({ sessionId, trials, onClose }) {
  useLiveDisplay({ session_id: sessionId });
  useNoScroll();
  const box = useRef(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const cols = bestColumns(trials.length, size.w, size.h);
  return (
    <div data-testid="show-all-modal" role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-gray-950 flex flex-col animate-in fade-in duration-150 pt-[env(safe-area-inset-top)]">
      <div className="flex justify-between items-center px-3 py-2">
        <OnScreen />
        <IconButton data-testid="close-show-all" icon={X} label="Close" tone="onDark" onClick={onClose} size={22} />
      </div>
      <div ref={box} className="flex-1 grid gap-1 p-1 min-h-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
        {trials.map((tr) => (
          <img key={tr.id} src={tr.generated_image} alt={tr.description} className="w-full h-full object-contain min-h-0" />
        ))}
      </div>
    </div>
  );
}

// Finish: "Didn't buy" closes the session in one tap. "Bought" asks for the
// bill; what the customer pays follows bill minus discount unless changed.
function EndSession({ name, onClose, onEnd }) {
  const { t } = useLang();
  const [bought, setBought] = useState(false);
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [paidEdited, setPaidEdited] = useState(false);
  const [editPaid, setEditPaid] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (paidEdited) return;
    const tv = parseFloat(total) || 0, dv = parseFloat(discount) || 0;
    setPaid(total === "" ? "" : String(Math.max(tv - dv, 0)));
  }, [total, discount, paidEdited]);

  const notBought = async () => { setSaving("no"); await onEnd({ purchased: false }); setSaving(""); };
  const save = async () => {
    const tv = parseFloat(total) || 0, dv = parseFloat(discount) || 0, pv = parseFloat(paid) || 0;
    if (tv < 0 || dv < 0 || pv < 0) { setError("Amounts cannot be negative"); return; }
    if (dv > tv) { setError("Discount cannot be more than the bill amount"); return; }
    setError("");
    setSaving("yes");
    await onEnd({ purchased: true, total_value: tv, discount: dv, final_paid: pv });
    setSaving("");
  };
  const money = (testid, label, value, onChange, props = {}) => (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true">₹</span>
        <input data-testid={testid} inputMode="decimal" enterKeyHint="done" value={value} onChange={onChange} className={`${inputCls} pl-8 num`} {...props} />
      </div>
    </Field>
  );
  const choice = (on) => `flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border-2 font-semibold text-[15px] transition-all active:scale-[0.98] touch-manipulation disabled:opacity-50 ${on}`;
  return (
    <Sheet title={t("end_session")} subtitle={name} onClose={onClose} size="sm" locked={!!saving}
      footer={bought && <Button data-testid="confirm-end-session" onClick={save} loading={saving === "yes"} size="xl" full>
        {t("save_amount")}{paid ? <span className="num"> · {inr(paid)}</span> : null}</Button>}>
      <p className="text-sm text-gray-600 mb-3">{t("purchased_q")}</p>
      <div className="grid grid-cols-2 gap-3">
        <button data-testid="purchased-yes" onClick={() => setBought(true)} disabled={!!saving} aria-pressed={bought}
          className={choice(bought ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-800 hover:border-gray-300")}>
          <ShoppingBag size={24} aria-hidden="true" /> {t("bought")}
        </button>
        <button data-testid="purchased-no" onClick={notBought} disabled={!!saving}
          className={choice("border-gray-200 text-gray-800 hover:border-gray-300")}>
          {saving === "no" ? <span className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-gray-700 animate-spin" /> : <CircleSlash size={24} aria-hidden="true" />} {t("didnt_buy")}
        </button>
      </div>
      {bought && (
        <div className="space-y-4 mt-5 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 gap-3">
            {money("total-value", t("bill_amount"), total, (e) => setTotal(e.target.value), { autoFocus: true })}
            {money("discount", t("discount"), discount, (e) => setDiscount(e.target.value))}
          </div>
          {editPaid ? money("final-paid", t("final_paid"), paid, (e) => { setPaidEdited(true); setPaid(e.target.value); }, { autoFocus: true }) : (
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-700">{t("final_amount")}</span>
              <span className="flex items-center gap-3">
                <span data-testid="final-paid-value" className="num text-lg font-semibold text-emerald-700">{inr(paid)}</span>
                <button data-testid="edit-final-paid" onClick={() => setEditPaid(true)} className="text-sm font-medium text-brand-700 underline underline-offset-2">{t("final_edit")}</button>
              </span>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

// One try-on as a gallery tile: the image is the content.
function TrialCard({ tr, wa, onView, onRemove, onWaChange, canRemove, canStar }) {
  const { t } = useLang();
  const st = wa?.trials?.[tr.id];
  const done = !!tr.generated_image;
  return (
    <Card as="div" data-testid={`trial-row-${tr.id}`} className="overflow-hidden flex flex-col animate-in fade-in zoom-in-[0.98] duration-300">
      <div className="relative aspect-[3/4] bg-gray-100">
        {done ? (
          <button data-testid={`view-trial-${tr.id}`} onClick={onView} aria-label={t("view")} className="group absolute inset-0">
            <img src={tr.generated_image} alt={tr.description} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <span className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-gray-950/50 text-white hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true"><Maximize2 size={15} /></span>
          </button>
        ) : tr.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-red-50">
            <AlertTriangle data-testid={`trial-failed-${tr.id}`} size={26} className="text-red-600" />
            <p className="text-[13px] text-red-800 line-clamp-4">{tr.error || t("gen_failed")}</p>
          </div>
        ) : (
          <div data-testid={`trial-generating-${tr.id}`} className="absolute inset-0 skeleton rounded-none flex flex-col items-center justify-center gap-2 text-gray-700">
            <Sparkles size={24} className="text-brand-600 animate-pulse" aria-hidden="true" />
            <span className="text-sm font-medium">{t("generating_short")}</span>
          </div>
        )}
        {tr.fabric_thumb && <img src={tr.fabric_thumb} alt="" className="absolute left-2 bottom-2 w-10 h-10 rounded-lg object-cover ring-2 ring-white shadow-card" />}
      </div>
      <div className="p-2.5 sm:p-3 flex-1 flex flex-col gap-0.5">
        <p className="text-sm font-medium text-gray-900 truncate" title={tr.description}>{tr.type || tr.description}</p>
        {tr.type && tr.description !== tr.type && <p className="text-xs text-gray-600 truncate">{tr.description}</p>}
        {st?.wa_status && <WaStatus status={st.wa_status} lookNo={st.look_no} error={st.wa_error} />}
        <div className="mt-auto pt-1.5 flex items-center gap-1">
          {done ? <WaTrialActions trial={tr} wa={wa} onChange={onWaChange} canStar={canStar} />
            : tr.status === "failed" && canRemove && <Button data-testid={`retry-trial-${tr.id}`} variant="ghost" size="sm" icon={Trash2} onClick={onRemove} className="-ml-2 text-gray-700">{t("remove")}</Button>}
        </div>
      </div>
    </Card>
  );
}

// Who the customer is, compactly. Tapping the photo retakes it. On phones the
// full history card opens under it; on desktop it is always shown.
function CustomerHeader({ session, closed, entry, canManage, onPhoto, onEnd, details, onDetails }) {
  const { t } = useLang();
  const canPhoto = !closed && canManage;
  const PhotoTag = canPhoto ? "button" : "div";
  return (
    <Card className="p-3 lg:p-5">
      <div className="flex gap-3.5 lg:gap-4">
        <PhotoTag data-testid={canPhoto && !entry ? "change-photo-btn" : undefined} onClick={canPhoto ? onPhoto : undefined}
          aria-label={canPhoto ? (entry ? t("capture_photo") : t("change_photo")) : undefined}
          className="relative shrink-0 rounded-xl overflow-hidden">
          {entry ? <Avatar className="w-[72px] h-[92px] lg:w-24 lg:h-32 rounded-xl" />
            : <img src={session.photo} alt="" className="w-[72px] h-[92px] lg:w-24 lg:h-32 object-cover rounded-xl border border-gray-200" />}
          {canPhoto && <span className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-gray-950/60 text-white flex items-center justify-center" aria-hidden="true"><CamIcon size={14} /></span>}
        </PhotoTag>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="text-lg lg:text-xl font-semibold tracking-tight text-gray-900 truncate">{session.customer_name}</h1>
            {closed && <Badge icon={CheckCircle2}>{t("closed")}</Badge>}
          </div>
          <p className="text-sm text-gray-600 num">{session.mobile}{session.mobile2 ? ` · ${session.mobile2}` : ""}</p>
          {closed ? (
            <p className="mt-2 text-sm font-medium">
              {session.purchased ? <span className="text-emerald-700 num">{t("purchased")} · {inr(session.final_paid)}</span>
                : <span className="text-gray-600">{t("not_purchased")}</span>}
            </p>
          ) : <div className="lg:hidden"><HistoryStrip h={session.history} /></div>}
          {!closed && canManage && (
            <Button data-testid="end-session-btn" variant="secondary" size="sm" icon={LogOut} onClick={onEnd} className="hidden lg:inline-flex mt-3">{t("end_session")}</Button>
          )}
        </div>
      </div>
      {session.history && (
        <button data-testid="toggle-details" onClick={onDetails} aria-expanded={details}
          className="lg:hidden mt-2 -mb-1 w-full flex items-center justify-center gap-1 h-10 text-sm font-medium text-gray-700 rounded-xl active:bg-gray-50">
          {details ? t("hide_details") : t("details")}
          <ChevronDown size={16} className={`transition-transform ${details ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
    </Card>
  );
}

export default function SessionView({ sessionId, user, onBack }) {
  const { t } = useLang();
  const [session, setSession] = useState(null);
  const [trials, setTrials] = useState([]);
  const [missing, setMissing] = useState(false);
  const [showNewTrial, setShowNewTrial] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const [showEnd, setShowEnd] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [details, setDetails] = useState(false);
  const [pending, setPending] = useState([]); // try-ons generating, opened when ready
  const { info: wa, reload: reloadWa } = useWhatsApp(sessionId, session?.status === "active");

  const load = useCallback(() => api.get(`/sessions/${sessionId}`)
    .then((r) => { setSession(r.data); setTrials(r.data.trials || []); return r.data; })
    .catch((e) => { if (e?.response?.status === 404) setMissing(true); return null; }), [sessionId]);
  useEffect(() => { load(); }, [load]);
  // Warm the fabric catalog and try-on types so New Try-On opens instantly.
  useEffect(() => { loadCatalog().catch(() => {}); loadCategories().catch(() => {}); }, []);

  // Something covering the screen? Then a finished look waits for a tap.
  const covered = useRef(false);
  covered.current = !!(previewId || showNewTrial || showEnd || showAll || showCam);

  // Newest first: the look just made is the one staff want.
  const ordered = [...trials].reverse();
  const finished = ordered.filter((tr) => tr.generated_image);
  const previewIdx = finished.findIndex((tr) => tr.id === previewId);

  const reveal = useCallback((tid, data) => {
    const tr = (data?.trials || []).find((x) => x.id === tid);
    if (!tr?.generated_image) return;
    navigator.vibrate?.(15);
    if (!covered.current) setPreviewId(tid);
    else toast.success(t("nt_ready"), { action: { label: t("look_ready_view"), onClick: () => setPreviewId(tid) } });
  }, [t]);

  // Watch the try-ons this screen started with the tiny status call, and load
  // the session (with its images) only once each one is finished.
  useEffect(() => {
    if (!pending.length) return;
    let alive = true, busy = false;
    const id = setInterval(async () => {
      if (busy) return;
      busy = true;
      for (const tid of pending) {
        try {
          const { data: st } = await api.get(`/trials/${tid}/status`);
          if (!alive) break;
          if (st.status === "done" || st.status === "failed") {
            setPending((p) => p.filter((x) => x !== tid));
            const data = await load();
            if (st.status === "failed") toast.error(st.error || t("gen_failed"));
            else reveal(tid, data);
          }
        } catch (e) {
          // Removed meanwhile: stop watching it. Anything else is transient.
          if (e?.response?.status === 404) setPending((p) => p.filter((x) => x !== tid));
        }
      }
      busy = false;
    }, 2500);
    return () => { alive = false; clearInterval(id); };
  }, [pending, load, reveal, t]);

  // Try-ons still generating from before (e.g. after reopening the session).
  const orphan = trials.some((tr) => tr.status === "generating" && !pending.includes(tr.id));
  useEffect(() => {
    if (!orphan) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [orphan, load]);

  const onSubmitted = (tid, status) => {
    setShowNewTrial(false);
    load().then((data) => { if (status === "done") reveal(tid, data); });
    if (status !== "done") setPending((p) => [...p, tid]);
  };

  const removeTrial = async (id) => {
    try { await api.delete(`/trials/${id}`); } catch (e) { if (e?.response?.status !== 404) toast.error(apiErr(e)); }
    load();
  };

  const changePhoto = async (img) => {
    setShowCam(false);
    const wasEntry = !session?.photo;
    try {
      await api.post(`/sessions/${sessionId}/photo`, { photo: img });
      toast.success("Photo updated");
      await load();
      // Converting a customer-entry session: go straight to the first try-on.
      if (wasEntry) setShowNewTrial(true);
    } catch (e) { toast.error(apiErr(e)); }
  };

  const endSession = async (data) => {
    try { await api.post(`/sessions/${sessionId}/end`, data); toast.success("Session closed"); onBack(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  if (showCam) return <Camera onCapture={changePhoto} onClose={() => setShowCam(false)} />;

  // Phones: own top bar with the customer's name (the app bar is hidden here).
  const topBar = (
    <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 pt-[env(safe-area-inset-top)]">
      <div className="h-14 px-1 flex items-center gap-1">
        <IconButton data-testid="topbar-back" icon={ArrowLeft} label={t("back")} onClick={onBack} />
        <span className="font-semibold text-gray-900 truncate">{session?.customer_name || t("session")}</span>
      </div>
    </header>
  );

  if (missing) {
    return <>{topBar}<Page><Card><Empty icon={AlertTriangle} title={t("no_match")} action={<Button onClick={onBack}>{t("back")}</Button>} /></Card></Page></>;
  }

  if (!session) {
    return (
      <>
        {topBar}
        <Page>
          <div className="grid lg:grid-cols-[320px_1fr] gap-4 lg:gap-8">
            <Skeleton className="h-[118px] lg:h-[460px] rounded-2xl" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}</div>
          </div>
        </Page>
      </>
    );
  }

  const closed = session.status === "closed";
  const entry = !session.photo;
  const canTry = can(user, "trials_create");
  const canManage = can(user, "sessions_manage");
  const showBar = !closed && (canManage || (canTry && !entry));

  return (
    <>
      {topBar}
      <Page className={showBar ? "pb-28 lg:pb-9" : ""}>
        {/* Phones: customer, try-ons, then WhatsApp. Desktop: details left, try-ons right. */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8 lg:items-start">
          <aside className="contents lg:block lg:space-y-4 lg:sticky lg:top-8">
            <div className="order-1">
              <CustomerHeader session={session} closed={closed} entry={entry} canManage={canManage}
                onPhoto={() => setShowCam(true)} onEnd={() => setShowEnd(true)} details={details} onDetails={() => setDetails(!details)} />
            </div>
            <div className={`order-2 ${details ? "animate-in fade-in slide-in-from-top-1 duration-150" : "hidden"} lg:block`}>
              <HistoryCard h={session.history} customerId={session.customer_id} onSaved={load} canEdit={can(user, "customers_edit")} />
            </div>
            <div className="order-4 empty:hidden">
              <WaPanel sessionId={sessionId} session={session} wa={wa} finished={finished} onChange={reloadWa} user={user} />
            </div>
          </aside>

          <section className="order-3 min-w-0">
            {entry ? (
              !closed && canManage && (
                <Card>
                  <Empty icon={CamIcon} title={t("add_photo_tryon")} body={t("entry_desc")}
                    action={<Button data-testid="convert-tryon-btn" icon={CamIcon} size="lg" onClick={() => setShowCam(true)} className="hidden lg:inline-flex">{t("capture_photo")}</Button>} />
                </Card>
              )
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-3 lg:mb-4">
                  <h2 className="text-lg lg:text-xl font-semibold tracking-tight text-gray-900">{t("trials")} <span className="num text-gray-500 font-normal">{trials.length}</span></h2>
                  <div className="flex gap-2">
                    {finished.length > 1 && <Button data-testid="show-all-btn" variant="secondary" size="sm" icon={Monitor} onClick={() => setShowAll(true)} className="lg:h-11 lg:px-4">{t("show_all")}</Button>}
                    {!closed && canTry && <Button data-testid="new-trial-btn" icon={Plus} onClick={() => setShowNewTrial(true)} className="hidden lg:inline-flex">{t("nt_title")}</Button>}
                  </div>
                </div>

                {trials.length === 0 ? (
                  <Card><Empty icon={Sparkles} title={t("no_tryons_title")} body={t("no_tryons_body")}
                    action={!closed && canTry && <Button size="lg" icon={Plus} onClick={() => setShowNewTrial(true)} className="hidden lg:inline-flex">{t("nt_title")}</Button>} /></Card>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:gap-4">
                    {ordered.map((tr) => (
                      <TrialCard key={tr.id} tr={tr} wa={wa} onView={() => setPreviewId(tr.id)} onRemove={() => removeTrial(tr.id)} onWaChange={reloadWa}
                        canRemove={can(user, "trials_delete")} canStar={canTry} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </Page>

      {/* Phones: Finish and the next try-on within thumb reach. */}
      {showBar && (
        <BottomBar>
          {canManage && <Button data-testid="end-session-btn-mobile" variant="secondary" size="lg" onClick={() => setShowEnd(true)} className="flex-1">{t("finish")}</Button>}
          {entry ? (canManage && <Button data-testid="convert-tryon-btn-mobile" icon={CamIcon} size="lg" onClick={() => setShowCam(true)} className="flex-[2]">{t("capture_photo")}</Button>)
            : canTry && <Button data-testid="new-trial-btn-mobile" icon={Plus} size="lg" onClick={() => setShowNewTrial(true)} className="flex-[2]">{t("nt_title")}</Button>}
        </BottomBar>
      )}

      {showNewTrial && <NewTrial sessionId={sessionId} onClose={() => setShowNewTrial(false)} onSubmitted={onSubmitted} />}
      {previewIdx >= 0 && <PreviewModal trials={finished} index={previewIdx} onIndex={(i) => setPreviewId(finished[i].id)} onClose={() => setPreviewId(null)}
        wa={wa} onWaChange={reloadWa} canStar={canTry} />}
      {showAll && <ShowAllModal sessionId={sessionId} trials={finished} onClose={() => setShowAll(false)} />}
      {showEnd && <EndSession name={session.customer_name} onClose={() => setShowEnd(false)} onEnd={endSession} />}
    </>
  );
}
