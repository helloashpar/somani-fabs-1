import React, { useState, useEffect, useRef } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { X, Eye, Plus, ImageIcon, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import Camera from "@/admin/Camera";
import NewTrial from "@/admin/NewTrial";

const PAGE = 10;

function PreviewModal({ trial, onClose }) {
  const beat = useRef(null);
  useEffect(() => {
    api.post("/display/preview", { trial_id: trial.id }).catch(() => {});
    beat.current = setInterval(() => api.post("/display/heartbeat").catch(() => {}), 5000);
    return () => { clearInterval(beat.current); api.delete("/display/preview").catch(() => {}); };
  }, [trial.id]);
  return (
    <div data-testid="preview-modal" className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={onClose}>
      <div className="flex justify-end p-4"><button data-testid="close-preview" onClick={onClose} className="text-white p-2 bg-white/10 rounded-full"><X size={24} /></button></div>
      <div className="flex-1 flex items-center justify-center px-4 pb-6" onClick={(e) => e.stopPropagation()}>
        <img src={trial.generated_image} alt="" className="max-h-full max-w-full object-contain rounded-xl" />
      </div>
      <div className="text-center pb-6 text-white/70 text-sm">{trial.description}</div>
    </div>
  );
}

function EndSession({ onClose, onEnd }) {
  const { t } = useLang();
  const [purchased, setPurchased] = useState(null);
  const [total, setTotal] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const submit = () => {
    if (purchased === null) { toast.error("Select purchased or not"); return; }
    onEnd({ purchased, total_value: parseFloat(total) || 0, discount: parseFloat(discount) || 0, final_paid: parseFloat(paid) || 0 });
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b"><h3 className="font-semibold">{t("end_session")}</h3><button onClick={onClose} className="p-1 text-gray-500"><X size={22} /></button></div>
        <div className="p-4 space-y-4">
          <p className="text-sm font-medium">{t("purchased_q")}</p>
          <div className="flex gap-3">
            <button data-testid="purchased-yes" onClick={() => setPurchased(true)} className={`flex-1 py-2.5 rounded-lg border font-medium ${purchased === true ? "bg-emerald-600 text-white border-emerald-600" : "border-gray-300"}`}>{t("yes")}</button>
            <button data-testid="purchased-no" onClick={() => setPurchased(false)} className={`flex-1 py-2.5 rounded-lg border font-medium ${purchased === false ? "bg-gray-700 text-white border-gray-700" : "border-gray-300"}`}>{t("no")}</button>
          </div>
          {purchased && (
            <div className="space-y-3">
              <input data-testid="total-value" inputMode="numeric" placeholder={t("total_value")} value={total} onChange={(e) => setTotal(e.target.value)} className="w-full border rounded-lg px-3 py-2.5" />
              <input data-testid="discount" inputMode="numeric" placeholder={t("discount")} value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-full border rounded-lg px-3 py-2.5" />
              <input data-testid="final-paid" inputMode="numeric" placeholder={t("final_paid")} value={paid} onChange={(e) => setPaid(e.target.value)} className="w-full border rounded-lg px-3 py-2.5" />
            </div>
          )}
          <button data-testid="confirm-end-session" onClick={submit} className="w-full bg-[#DC2626] text-white py-3 rounded-lg font-semibold">{t("save")}</button>
        </div>
      </div>
    </div>
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

  const load = () => api.get(`/sessions/${sessionId}`).then((r) => { setSession(r.data); setTrials(r.data.trials || []); return r.data; }).catch(() => null);
  useEffect(() => { load(); }, [sessionId]);

  const changePhoto = async (img) => {
    setShowCam(false);
    try { await api.post(`/sessions/${sessionId}/photo`, { photo: img }); toast.success("Photo updated"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const endSession = async (data) => {
    try { await api.post(`/sessions/${sessionId}/end`, data); toast.success("Session closed"); onBack(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  if (!session) return <div className="p-8 text-center text-gray-400">...</div>;

  const totalPages = Math.ceil(trials.length / PAGE) || 1;
  const visible = trials.slice(page * PAGE, page * PAGE + PAGE);
  const closed = session.status === "closed";

  if (showCam) return <Camera onCapture={changePhoto} onClose={() => setShowCam(false)} />;

  return (
    <div className="p-4 pb-28">
      {/* Customer header */}
      <div className="bg-white rounded-xl border p-4 flex items-center gap-4 mb-4">
        <img src={session.photo} alt="" className="w-16 h-20 object-cover rounded-lg border" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{session.customer_name}</p>
          <p className="text-sm text-gray-500">{session.mobile}{session.mobile2 ? ` · ${session.mobile2}` : ""}</p>
          {!closed && <button data-testid="change-photo-btn" onClick={() => setShowCam(true)} className="text-xs text-[#1E3A8A] underline mt-1 flex items-center gap-1"><RefreshCw size={12} /> {t("change_photo")}</button>}
        </div>
        {!closed && <button data-testid="end-session-btn" onClick={() => setShowEnd(true)} className="text-sm bg-[#DC2626] text-white px-3 py-2 rounded-lg font-medium">{t("end_session")}</button>}
        {closed && <span className="text-xs text-gray-400 flex items-center gap-1"><CheckCircle2 size={14} /> Closed</span>}
      </div>

      {/* Trials list */}
      <h3 className="font-semibold text-gray-700 mb-2">{t("trials")} ({trials.length})</h3>
      <div className="bg-white rounded-xl border divide-y">
        {visible.length === 0 && <p className="text-center text-gray-400 text-sm py-8">—</p>}
        {visible.map((tr) => (
          <div data-testid={`trial-row-${tr.id}`} key={tr.id} className="flex items-center gap-3 p-3">
            <img src={tr.fabric_thumb} alt="fabric" className="w-12 h-12 object-cover rounded-md border shrink-0" />
            {tr.generated_image ? (
              <img src={tr.generated_image} alt="tryon" className="w-12 h-14 object-cover rounded-md border shrink-0" />
            ) : (
              <div className="w-12 h-14 rounded-md border shrink-0 flex items-center justify-center bg-gray-50">
                {tr.status === "failed"
                  ? <span data-testid={`trial-failed-${tr.id}`} className="text-red-500 text-xl font-bold">!</span>
                  : <Loader2 className="animate-spin text-gray-400" size={16} />}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{tr.type}</p>
              <p className="text-xs text-gray-500 truncate">{tr.status === "failed" ? t("gen_failed") : tr.description}</p>
            </div>
            {tr.generated_image
              ? <button data-testid={`view-trial-${tr.id}`} onClick={() => setPreview(tr)} className="flex items-center gap-1 text-sm text-[#1E3A8A] border border-[#1E3A8A]/30 rounded-lg px-3 py-1.5"><Eye size={15} /> {t("view")}</button>
              : <button data-testid={`retry-trial-${tr.id}`} onClick={async () => { await api.delete(`/trials/${tr.id}`).catch(() => {}); load(); }} className="text-sm text-gray-500 border border-gray-300 rounded-lg px-3 py-1.5">{t("remove")}</button>}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button data-testid="trials-prev" disabled={page === 0} onClick={() => setPage(page - 1)} className="px-4 py-1.5 bg-white border rounded-lg disabled:opacity-40">‹</button>
          <span className="text-sm text-gray-500">{page + 1} / {totalPages}</span>
          <button data-testid="trials-next" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} className="px-4 py-1.5 bg-white border rounded-lg disabled:opacity-40">›</button>
        </div>
      )}

      {!closed && (
        <button data-testid="new-trial-btn" onClick={() => setShowNewTrial(true)}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-[#1E3A8A] text-white py-4 rounded-xl font-semibold hover:bg-[#16306f]">
          <Plus size={20} /> {t("new_trial")}
        </button>
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
      {showEnd && <EndSession onClose={() => setShowEnd(false)} onEnd={endSession} />}
    </div>
  );
}
