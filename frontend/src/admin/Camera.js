import React, { useEffect, useRef, useState } from "react";
import { useLang } from "@/i18n";
import { Camera as CamIcon, RotateCcw, Check, X } from "lucide-react";

// Reusable full-screen camera capture with framing guide + readiness check.
export default function Camera({ onCapture, onClose }) {
  const { t } = useLang();
  const videoRef = useRef(null);
  const analyzeRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState("");
  const [shot, setShot] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let s;
    (async () => {
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (e) {
        setErr("Camera access denied. Please allow camera permission.");
      }
    })();
    return () => { if (s) s.getTracks().forEach((tr) => tr.stop()); };
  }, []);

  // readiness analysis loop
  useEffect(() => {
    if (shot) return;
    const id = setInterval(() => {
      const v = videoRef.current;
      const c = analyzeRef.current;
      if (!v || !c || v.videoWidth === 0) return;
      const w = 64, h = 64;
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(v, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let sum = 0, sumSq = 0, edge = 0, prev = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        sum += lum; sumSq += lum * lum;
        if (i > 0) edge += Math.abs(lum - prev);
        prev = lum;
      }
      const n = d.length / 4;
      const mean = sum / n;
      const sharp = edge / n; // higher = more detail/sharper
      if (mean < 45) { setReady(false); setHint(t("cam_adjust")); return; }
      if (mean > 225) { setReady(false); setHint(t("cam_adjust")); return; }
      if (sharp < 6) { setReady(false); setHint(t("cam_adjust")); return; }
      setReady(true); setHint(t("cam_ready"));
    }, 450);
    return () => clearInterval(id);
  }, [shot, t]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || v.videoWidth === 0) return;
    const c = document.createElement("canvas");
    const size = Math.min(v.videoWidth, v.videoHeight);
    c.width = 900; c.height = 1100;
    const ctx = c.getContext("2d");
    // crop center portrait
    const sw = v.videoWidth, sh = v.videoHeight;
    const targetRatio = 900 / 1100;
    let cropW = sw, cropH = sw / targetRatio;
    if (cropH > sh) { cropH = sh; cropW = sh * targetRatio; }
    const sx = (sw - cropW) / 2, sy = (sh - cropH) / 2;
    ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, 900, 1100);
    setShot(c.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <button data-testid="camera-close-btn" onClick={onClose} className="text-white p-2"><X size={24} /></button>
        <span className="text-white/80 text-sm font-admin">{t("capture_photo")}</span>
        <span className="w-8" />
      </div>

      {err ? (
        <div className="flex-1 flex items-center justify-center text-white/80 px-8 text-center">{err}</div>
      ) : shot ? (
        <>
          <div className="flex-1 flex items-center justify-center px-4">
            <img src={shot} alt="captured" className="max-h-[72vh] rounded-2xl object-contain" />
          </div>
          <div className="flex gap-3 p-5 pb-8">
            <button data-testid="retake-btn" onClick={() => setShot(null)} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/10 text-white font-medium"><RotateCcw size={18} /> {t("retake")}</button>
            <button data-testid="use-photo-btn" onClick={() => { stream?.getTracks().forEach((tr) => tr.stop()); onCapture(shot); }} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold"><Check size={18} /> {t("use_photo")}</button>
          </div>
        </>
      ) : (
        <>
          <div className="relative flex-1 overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            {/* framing guide */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`rounded-[44%/38%] border-4 transition-colors ${ready ? "border-emerald-400" : "border-white/70"}`} style={{ width: "62%", height: "74%" }} />
            </div>
            <div className="absolute top-4 inset-x-0 text-center px-6">
              <span className="inline-block bg-black/50 text-white text-sm px-4 py-2 rounded-full">{t("cam_guide")}</span>
            </div>
            <div className="absolute bottom-4 inset-x-0 text-center">
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${ready ? "bg-emerald-500 text-white" : "bg-black/60 text-white/80"}`}>
                <span className={`w-2.5 h-2.5 rounded-full ${ready ? "bg-white" : "bg-amber-400"}`} /> {hint}
              </span>
            </div>
          </div>
          <canvas ref={analyzeRef} className="hidden" />
          <div className="flex items-center justify-center py-6 pb-9">
            <button data-testid="shutter-btn" onClick={capture} disabled={!ready}
              className={`w-18 h-18 rounded-full border-4 flex items-center justify-center transition-all ${ready ? "border-emerald-400 bg-emerald-500 scale-100" : "border-white/40 bg-white/20 scale-95"}`}
              style={{ width: 72, height: 72 }}>
              <CamIcon className="text-white" size={28} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
