import React, { useState, useEffect, useRef } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { X, Camera as CamIcon, Check, Loader2 } from "lucide-react";
import Camera from "@/admin/Camera";

const SLOT_LABEL = { top: "Top", bottom: "Bottom", third: "3rd Layer" };

export default function NewTrial({ sessionId, onClose, onDone }) {
  const { t } = useLang();
  const [cats, setCats] = useState([]);
  const [step, setStep] = useState("type"); // type | slots | generating
  const [cat, setCat] = useState(null);
  const [slotIdx, setSlotIdx] = useState(0);
  const [garments, setGarments] = useState([]); // {slot, garment_type, fabric_b64}
  const [showCam, setShowCam] = useState(false);
  const [pendingFabric, setPendingFabric] = useState("");
  const cancelled = useRef(false);

  useEffect(() => { api.get("/config/categories").then((r) => setCats(r.data)).catch(() => {}); }, []);
  useEffect(() => () => { cancelled.current = true; }, []);

  const slots = cat?.slots || [];
  const curSlot = slots[slotIdx];

  const chooseCat = (c) => { setCat(c); setStep("slots"); setSlotIdx(0); setGarments([]); setPendingFabric(""); };

  const confirmGarment = (gtype) => {
    if (!pendingFabric) { toast.error(t("fabric_photo")); return; }
    const next = [...garments, { slot: curSlot, garment_type: gtype, fabric_b64: pendingFabric }];
    setGarments(next);
    setPendingFabric("");
    if (slotIdx + 1 < slots.length) {
      setSlotIdx(slotIdx + 1);
    } else {
      generate(next);
    }
  };

  const generate = async (gs) => {
    setStep("generating");
    try {
      const { data } = await api.post(`/sessions/${sessionId}/trials/generate`, { type: cat.label, garments: gs });
      const tid = data.id;
      const started = Date.now();
      const poll = async () => {
        if (cancelled.current) return;
        try {
          const { data: tr } = await api.get(`/trials/${tid}`);
          if (cancelled.current) return;
          if (tr.status === "done") { toast.success("Try-on ready"); onDone(tr); return; }
          if (tr.status === "failed") { toast.error(tr.error || "Image generation failed"); setStep("slots"); return; }
        } catch (e) { /* transient — keep polling */ }
        if (Date.now() - started > 180000) { toast.error("Generation timed out. Please try again."); setStep("slots"); return; }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 2500);
    } catch (e) {
      toast.error(apiErr(e));
      setStep("slots");
    }
  };

  if (showCam) return <Camera onCapture={(img) => { setPendingFabric(img); setShowCam(false); }} onClose={() => setShowCam(false)} />;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={step === "generating" ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto no-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h3 className="font-semibold">{step === "type" ? t("select_type") : cat?.label}</h3>
          {step !== "generating" && <button data-testid="close-trial" onClick={onClose} className="p-1 text-gray-500"><X size={22} /></button>}
        </div>

        {step === "type" && (
          <div className="p-4 grid grid-cols-1 gap-3">
            {cats.map((c) => (
              <button data-testid={`trial-type-${c.id}`} key={c.id} onClick={() => chooseCat(c)}
                className="text-left p-4 rounded-xl border border-gray-200 hover:border-[#1E3A8A] hover:bg-blue-50/30 transition-all">
                <p className="font-semibold text-gray-900">{c.label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{c.description}</p>
              </button>
            ))}
          </div>
        )}

        {step === "slots" && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              {slots.map((s, i) => (
                <span key={s} className={`text-xs px-2 py-1 rounded-full ${i === slotIdx ? "bg-[#1E3A8A] text-white" : i < slotIdx ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>{SLOT_LABEL[s] || s}{i < slotIdx ? " ✓" : ""}</span>
              ))}
            </div>
            <p className="text-sm font-medium text-gray-700 mb-2">{SLOT_LABEL[curSlot] || curSlot} — {t("fabric_photo")}</p>
            {pendingFabric ? (
              <div className="flex items-center gap-3 mb-4">
                <img src={pendingFabric} alt="" className="w-24 h-24 object-cover rounded-lg border" />
                <button data-testid="retake-fabric" onClick={() => setShowCam(true)} className="text-sm text-[#1E3A8A] underline">{t("retake")}</button>
              </div>
            ) : (
              <button data-testid="capture-fabric-btn" onClick={() => setShowCam(true)} className="w-full border-2 border-dashed border-gray-300 rounded-xl py-8 text-gray-500 flex flex-col items-center gap-2 mb-4">
                <CamIcon size={26} /> <span className="text-sm">{t("fabric_photo")}</span>
              </button>
            )}
            <p className="text-sm font-medium text-gray-700 mb-2">{t("garment_type")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(cat?.items || []).map((it, i) => (
                <button data-testid={`garment-${i}`} key={i} onClick={() => confirmGarment(it.label)} disabled={!pendingFabric}
                  className="p-3 rounded-lg border border-gray-200 text-sm text-left hover:border-[#1E3A8A] disabled:opacity-40 disabled:cursor-not-allowed">
                  <span className="font-medium block">{it.label}</span>
                  <span className="text-xs text-gray-400">{it.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "generating" && (
          <div className="p-12 flex flex-col items-center gap-4 text-center">
            <Loader2 className="animate-spin text-[#1E3A8A]" size={40} />
            <p className="text-gray-600">{t("generating")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
