import React, { useEffect, useRef, useState } from "react";
import { useLang } from "@/i18n";
import { RotateCcw, Check, X, Upload, SwitchCamera } from "lucide-react";

// Output sizes. The viewfinder has the same shape as the output, so what staff
// see is exactly what gets saved.
const MODES = {
  person: { w: 900, h: 1100 }, // customer photo: plain portrait
  fabric: { w: 800, h: 800 },  // fabric swatch: square
};

// Centre-crop an image or video frame to the mode's output shape.
function crop(source, sw, sh, { w, h }) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ratio = w / h;
  let cw = sw, ch = sw / ratio;
  if (ch > sh) { ch = sh; cw = sh * ratio; }
  c.getContext("2d").drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.92);
}

// Full-screen camera. mode="person" is a normal photo; mode="fabric" shows a
// square guide. No checks or warnings: staff can always take the photo.
// `confirm={false}` hands the photo back the moment it is taken (the screen
// that opened the camera offers Retake), which saves a tap per photo.
export default function Camera({ onCapture, onClose, mode = "person", confirm = true }) {
  const { t } = useLang();
  const size = MODES[mode] || MODES.person;
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [stream, setStream] = useState(null);
  const [shot, setShot] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let s, alive = true;
    setErr("");
    navigator.mediaDevices?.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false,
    }).then((st) => {
      if (!alive) { st.getTracks().forEach((tr) => tr.stop()); return; }
      s = st; setStream(st);
    }).catch(() => alive && setErr(t("cam_unavailable")));
    return () => { alive = false; if (s) s.getTracks().forEach((tr) => tr.stop()); };
  }, [facing, t]);

  // The <video> is re-created after "Retake", so re-attach the stream.
  useEffect(() => {
    if (!shot && stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, shot]);

  const done = (img) => { stream?.getTracks().forEach((tr) => tr.stop()); onCapture(img); };
  const take = (img) => { navigator.vibrate?.(10); if (confirm) setShot(img); else done(img); };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    take(crop(v, v.videoWidth, v.videoHeight, size));
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { take(crop(img, img.naturalWidth, img.naturalHeight, size)); URL.revokeObjectURL(url); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const use = () => done(shot);

  // Largest box with the output's shape that fits the available space.
  const areaRef = useRef(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(area.w / size.w, area.h / size.h) || 0;
  const frame = { width: size.w * scale, height: size.h * scale };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col select-none pt-[env(safe-area-inset-top)]">
      <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" data-testid="camera-file-input" />

      <div className="flex items-center justify-between px-2 py-2">
        <button data-testid="camera-close-btn" onClick={onClose} aria-label="Close" className="w-12 h-12 flex items-center justify-center text-white rounded-full active:bg-white/10"><X size={24} /></button>
        {!shot && stream && (
          <button data-testid="camera-flip-btn" onClick={() => setFacing(facing === "environment" ? "user" : "environment")}
            aria-label="Switch camera" className="w-12 h-12 flex items-center justify-center text-white rounded-full active:bg-white/10"><SwitchCamera size={22} /></button>
        )}
      </div>

      {/* Viewfinder / captured photo, same shape as the saved output */}
      <div ref={areaRef} className="flex-1 min-h-0 mx-3 flex items-center justify-center">
        <div className="relative overflow-hidden rounded-lg bg-neutral-900" style={frame}>
          {shot ? (
            <img src={shot} alt="captured" className="absolute inset-0 w-full h-full object-cover" />
          ) : err ? (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm text-center px-6">{err}</div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted
                className={`absolute inset-0 w-full h-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`} />
              {mode === "fabric" && (
                <>
                  {/* Square guide with corner marks */}
                  <div className="absolute inset-[10%] pointer-events-none">
                    {["top-0 left-0 border-t-2 border-l-2", "top-0 right-0 border-t-2 border-r-2",
                      "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((c) => (
                      <span key={c} className={`absolute w-8 h-8 border-white ${c}`} />
                    ))}
                  </div>
                  <p className="absolute bottom-3 inset-x-0 text-center text-white text-xs px-4 pointer-events-none">
                    <span className="bg-black/50 rounded-full px-3 py-1.5">{t("cam_fabric_hint")}</span>
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      {shot ? (
        <div className="grid grid-cols-2 gap-3 p-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <button data-testid="retake-btn" onClick={() => (stream ? setShot(null) : fileRef.current?.click())}
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/10 text-white font-medium"><RotateCcw size={18} /> {t("retake")}</button>
          <button data-testid="use-photo-btn" onClick={use}
            className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white text-black font-semibold"><Check size={18} /> {t("use_photo")}</button>
        </div>
      ) : (
        <div className="grid grid-cols-3 items-center px-6 py-5 pb-[max(2.25rem,env(safe-area-inset-bottom))]">
          <button data-testid="upload-photo-btn" onClick={() => fileRef.current?.click()} aria-label={t("cam_upload")}
            className="justify-self-start w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center"><Upload size={20} /></button>
          <button data-testid="shutter-btn" onClick={capture} disabled={!stream} aria-label="Capture"
            className="justify-self-center w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform touch-manipulation">
            <span className="w-16 h-16 rounded-full bg-white" />
          </button>
          <span />
        </div>
      )}
    </div>
  );
}
