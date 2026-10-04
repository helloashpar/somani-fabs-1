import React, { useState, useEffect, useRef } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { X, Plus, RefreshCw, CheckCircle2, Monitor, Camera as CamIcon, Sparkles, AlertTriangle, Trash2, ChevronLeft, ChevronRight, LogOut, ShoppingBag, CircleSlash, Maximize2 } from "lucide-react";
import Avatar from "@/admin/Avatar";
import Camera from "@/admin/Camera";
import NewTrial from "@/admin/NewTrial";
import { bestColumns } from "@/lib/bestGrid";
import { loadCatalog } from "@/lib/catalog";
import { useWhatsApp, WaPanel, WaStatus, WaTrialActions } from "@/admin/WhatsApp";
import { HistoryCard } from "@/admin/CustomerHistory";
import { can } from "@/admin/perms";
import { Button, Card, Page, Sheet, Skeleton, Badge, Empty, IconButton, Field, inputCls } from "@/admin/ui";

const PAGE = 12;

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

function OnScreen() {
  const { t } = useLang();
  return <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-white/10 rounded-full px-3 py-1.5"><Monitor size={14} /> {t("on_shop_screen")}</span>;
}

function PreviewModal({ trial, onClose }) {
  useLiveDisplay({ trial_id: trial.id });
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div data-testid="preview-modal" className="fixed inset-0 z-50 bg-gray-950/95 flex flex-col animate-in fade-in duration-150" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
        <OnScreen />
        <IconButton data-testid="close-preview" icon={X} label="Close" tone="onDark" onClick={onClose} size={22} />
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <img src={trial.generated_image} alt={trial.description} className="max-h-full max-w-full object-contain rounded-2xl animate-in zoom-in-[0.97] duration-200" />
      </div>
      <p className="text-center py-4 px-6 text-white/75 text-sm">{trial.description}</p>
    </div>
  );
}

// "Show all": every finished try-on of the session, on the phone and on the
// shop screen (sharing the screen equally with other admins' previews).
function ShowAllModal({ sessionId, trials, onClose }) {
  useLiveDisplay({ session_id: sessionId });
  const box = useRef(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cols = bestColumns(trials.length, size.w, size.h);
  return (
    <div data-testid="show-all-modal" className="fixed inset-0 z-50 bg-gray-950 flex flex-col animate-in fade-in duration-150">
      <div className="flex justify-between items-center p-3">
        <OnScreen />
        <IconButton data-testid="close-show-all" icon={X} label="Close" tone="onDark" onClick={onClose} size={22} />
      </div>
      <div ref={box} className="flex-1 grid gap-1 p-1 min-h-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
        {trials.map((tr) => (
          <img key={tr.id} src={tr.generated_image} alt={tr.description} className="w-full h-full object-contain min-h-0" />
        ))}
      </div>
    </div>
  );
}

function EndSession({ onClose, onEnd }) {
  const { t } = useLang();
  const [purchased, setPurchased] = useState(null);
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [paidEdited, setPaidEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  // Final paid follows total - discount until staff type their own amount.
  useEffect(() => {
    if (paidEdited) return;
    const tv = parseFloat(total) || 0, dv = parseFloat(discount) || 0;
    setPaid(total === "" ? "" : String(Math.max(tv - dv, 0)));
  }, [total, discount, paidEdited]);

  const submit = async () => {
    if (purchased === null) { toast.error("Select purchased or not"); return; }
    const tv = parseFloat(total) || 0, dv = parseFloat(discount) || 0, pv = parseFloat(paid) || 0;
    if (purchased) {
      if (tv < 0 || dv < 0 || pv < 0) { toast.error("Amounts cannot be negative"); return; }
      if (dv > tv) { toast.error("Discount cannot be more than the total value"); return; }
    }
    setSaving(true);
    await onEnd(purchased ? { purchased, total_value: tv, discount: dv, final_paid: pv } : { purchased });
    setSaving(false);
  };
  const choice = (on, tone) => `flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border-2 font-medium transition-all active:scale-[0.98] ${on ? tone : "border-gray-200 text-gray-700 hover:border-gray-300"}`;
  const money = (testid, label, value, onChange) => (
    <Field label={label}>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
        <input data-testid={testid} inputMode="decimal" value={value} onChange={onChange} className={`${inputCls} pl-8 num`} />
      </div>
    </Field>
  );
  return (
    <Sheet title={t("end_session")} subtitle={t("purchased_q")} onClose={onClose} size="sm" locked={saving}
      footer={<Button data-testid="confirm-end-session" onClick={submit} loading={saving} size="lg" full>{t("save")}</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <button data-testid="purchased-yes" onClick={() => setPurchased(true)} className={choice(purchased === true, "border-emerald-500 bg-emerald-50 text-emerald-800")}>
          <ShoppingBag size={22} /> {t("yes")}
        </button>
        <button data-testid="purchased-no" onClick={() => setPurchased(false)} className={choice(purchased === false, "border-gray-700 bg-gray-50 text-gray-900")}>
          <CircleSlash size={22} /> {t("no")}
        </button>
      </div>
      {purchased && (
        <div className="space-y-4 mt-5 animate-in fade-in slide-in-from-top-1 duration-200">
          {money("total-value", t("total_value"), total, (e) => setTotal(e.target.value))}
          {money("discount", t("discount"), discount, (e) => setDiscount(e.target.value))}
          {money("final-paid", t("final_paid"), paid, (e) => { setPaidEdited(true); setPaid(e.target.value); })}
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
            <img src={tr.generated_image} alt={tr.description} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
            <span className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-gray-950/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Maximize2 size={15} /></span>
          </button>
        ) : tr.status === "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center bg-red-50">
            <AlertTriangle data-testid={`trial-failed-${tr.id}`} size={26} className="text-red-600" />
            <p className="text-[13px] text-red-800">{tr.error || t("gen_failed")}</p>
          </div>
        ) : (
          <div className="absolute inset-0 skeleton rounded-none flex flex-col items-center justify-center gap-2 text-gray-600">
            <Sparkles size={22} className="text-brand-500 animate-pulse" />
            <span className="text-xs font-medium">{t("generating_short")}</span>
          </div>
        )}
        {tr.fabric_thumb && <img src={tr.fabric_thumb} alt="fabric" className="absolute left-2 bottom-2 w-10 h-10 rounded-lg object-cover ring-2 ring-white shadow-card" />}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-sm font-medium text-gray-900 truncate" title={tr.description}>{tr.type || tr.description}</p>
        {tr.type && tr.description !== tr.type && <p className="text-xs text-gray-600 truncate">{tr.description}</p>}
        {st?.wa_status && <WaStatus status={st.wa_status} lookNo={st.look_no} error={st.wa_error} />}
        <div className="mt-auto pt-2 flex items-center gap-1">
          {done ? <WaTrialActions trial={tr} wa={wa} onChange={onWaChange} canStar={canStar} />
            : canRemove && <Button data-testid={`retry-trial-${tr.id}`} variant="ghost" size="sm" icon={Trash2} onClick={onRemove} className="-ml-2 text-gray-600">{t("remove")}</Button>}
        </div>
      </div>
    </Card>
  );
}

function CustomerCard({ session, closed, entry, onPhoto, onEnd, canManage }) {
  const { t } = useLang();
  return (
    <Card className="p-4 lg:p-5">
      <div className="flex gap-4">
        {entry ? <Avatar className="w-20 h-[104px] lg:w-24 lg:h-32 rounded-xl shrink-0" />
          : <img src={session.photo} alt="" className="w-20 h-[104px] lg:w-24 lg:h-32 object-cover rounded-xl border border-gray-200 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h1 className="text-lg lg:text-xl font-semibold tracking-tight text-gray-900 truncate">{session.customer_name}</h1>
            {entry && <Badge tone="amber">{t("entry_session")}</Badge>}
            {closed && <Badge icon={CheckCircle2}>{t("closed")}</Badge>}
          </div>
          <p className="text-sm text-gray-600 num mt-0.5">{session.mobile}{session.mobile2 ? ` · ${session.mobile2}` : ""}</p>
          {!closed && canManage && (
            <div className="flex flex-wrap gap-2 mt-3">
              {!entry && <Button data-testid="change-photo-btn" variant="secondary" size="sm" icon={RefreshCw} onClick={onPhoto}>{t("change_photo")}</Button>}
              <Button data-testid="end-session-btn" variant="secondary" size="sm" icon={LogOut} onClick={onEnd}>{t("end_session")}</Button>
            </div>
          )}
          {closed && (
            <p className="mt-3 text-sm font-medium">
              {session.purchased ? <span className="text-emerald-700 num">{t("purchased")} · ₹{Number(session.final_paid || 0).toLocaleString("en-IN")}</span>
                : <span className="text-gray-600">{t("not_purchased")}</span>}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function SessionView({ sessionId, user, onBack }) {
  const { t } = useLang();
  const [session, setSession] = useState(null);
  const [trials, setTrials] = useState([]);
  const [page, setPage] = useState(0);
  const [showNewTrial, setShowNewTrial] = useState(false);
  const [preview, setPreview] = useState(null);
  const [showEnd, setShowEnd] = useState(false);
  const [showCam, setShowCam] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { info: wa, reload: reloadWa } = useWhatsApp(sessionId, session?.status === "active");

  const load = () => api.get(`/sessions/${sessionId}`).then((r) => { setSession(r.data); setTrials(r.data.trials || []); return r.data; }).catch(() => null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [sessionId]);
  // Warm the fabric catalog so New Try-On search is instant.
  useEffect(() => { loadCatalog().catch(() => {}); }, []);

  // While any try-on is still generating (e.g. after reopening the session),
  // refresh the list so it switches to its image or failed state by itself.
  const anyGenerating = trials.some((tr) => tr.status === "generating");
  useEffect(() => {
    if (!anyGenerating) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyGenerating, sessionId]);

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

  if (!session) {
    return (
      <Page>
        <div className="grid lg:grid-cols-[320px_1fr] gap-6">
          <Skeleton className="h-36 lg:h-[460px] rounded-2xl" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}</div>
        </div>
      </Page>
    );
  }

  const closed = session.status === "closed";
  const entry = !session.photo;
  const canTry = can(user, "trials_create");
  const finished = trials.filter((tr) => tr.generated_image);
  // Newest first: the look just made is the one staff want.
  const ordered = [...trials].reverse();
  const totalPages = Math.ceil(ordered.length / PAGE) || 1;
  const visible = ordered.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <Page className="pb-28 lg:pb-9">
      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-5 lg:gap-8 items-start">
        <div className="space-y-4 lg:sticky lg:top-8">
          <CustomerCard session={session} closed={closed} entry={entry} canManage={can(user, "sessions_manage")} onPhoto={() => setShowCam(true)} onEnd={() => setShowEnd(true)} />
          <HistoryCard h={session.history} customerId={session.customer_id} onSaved={load} canEdit={can(user, "customers_edit")} />
          <WaPanel sessionId={sessionId} session={session} wa={wa} finished={finished} onChange={reloadWa} user={user} />
        </div>

        <div className="min-w-0">
          {entry ? (
            !closed && can(user, "sessions_manage") && (
              <Card>
                <Empty icon={CamIcon} title={t("add_photo_tryon")} body={t("entry_desc")}
                  action={<Button data-testid="convert-tryon-btn" icon={CamIcon} size="lg" onClick={() => setShowCam(true)}>{t("capture_photo")}</Button>} />
              </Card>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-xl font-semibold tracking-tight text-gray-900">{t("trials")} <span className="num text-gray-500 font-normal">{trials.length}</span></h2>
                <div className="flex gap-2">
                  {finished.length > 1 && <Button data-testid="show-all-btn" variant="secondary" icon={Monitor} onClick={() => setShowAll(true)}>{t("show_all")}</Button>}
                  {!closed && canTry && <Button data-testid="new-trial-btn" icon={Plus} onClick={() => setShowNewTrial(true)} className="hidden lg:inline-flex">{t("nt_title")}</Button>}
                </div>
              </div>

              {trials.length === 0 ? (
                <Card><Empty icon={Sparkles} title={t("no_tryons_title")} body={t("no_tryons_body")}
                  action={!closed && canTry && <Button icon={Plus} onClick={() => setShowNewTrial(true)}>{t("nt_title")}</Button>} /></Card>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:gap-4">
                  {visible.map((tr) => (
                    <TrialCard key={tr.id} tr={tr} wa={wa} onView={() => setPreview(tr)} onRemove={() => removeTrial(tr.id)} onWaChange={reloadWa}
                      canRemove={can(user, "trials_delete")} canStar={canTry} />
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <IconButton data-testid="trials-prev" icon={ChevronLeft} label="Previous" disabled={page === 0} onClick={() => setPage(page - 1)} className="border border-gray-300 bg-white disabled:opacity-40" />
                  <span className="text-sm text-gray-600 num">{page + 1} / {totalPages}</span>
                  <IconButton data-testid="trials-next" icon={ChevronRight} label="Next" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="border border-gray-300 bg-white disabled:opacity-40" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Phones: New try-on within thumb reach. */}
      {!closed && !entry && canTry && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-canvas via-canvas/90 to-transparent pointer-events-none">
          <Button data-testid="new-trial-btn-mobile" icon={Plus} size="lg" full onClick={() => setShowNewTrial(true)} className="shadow-lift pointer-events-auto">{t("nt_title")}</Button>
        </div>
      )}

      {showNewTrial && <NewTrial sessionId={sessionId} onClose={() => setShowNewTrial(false)} onDone={(tid) => {
        setShowNewTrial(false);
        setPage(0);
        load().then((data) => {
          if (data && tid) {
            const tr = (data.trials || []).find((x) => x.id === tid);
            if (tr && tr.generated_image) setPreview(tr);
          }
        });
      }} />}
      {preview && <PreviewModal trial={preview} onClose={() => setPreview(null)} />}
      {showAll && <ShowAllModal sessionId={sessionId} trials={finished} onClose={() => setShowAll(false)} />}
      {showEnd && <EndSession onClose={() => setShowEnd(false)} onEnd={endSession} />}
    </Page>
  );
}
