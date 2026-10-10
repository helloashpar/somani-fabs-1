import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { bestColumns } from "@/lib/bestGrid";
import { useBrand, mediaSrc } from "@/lib/brand";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  catch { return ""; }
}

export default function Display() {
  const { secret } = useParams();
  const brand = useBrand();
  const [previews, setPreviews] = useState([]);
  const [idle, setIdle] = useState("");
  const [slides, setSlides] = useState([]);
  const timer = useRef(null);
  const version = useRef(null);

  useEffect(() => {
    let busy = false; // a slow answer never stacks requests up
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const { data } = await axios.get(`${API}/display/${secret}/state`, {
          params: version.current ? { v: version.current } : {},
        });
        if (data.unchanged) return;
        version.current = data.version;
        setPreviews(data.previews || []);
        setIdle(data.idle_image || "");
        setSlides(data.slides || []);
      } catch (e) { /* keep last */ }
      finally { busy = false; }
    };
    poll();
    // Every second: a cheap "unchanged" answer unless something changed. The
    // tick comes from a worker, because browsers slow a hidden tab's own
    // timers to once a minute; and a tab brought to the front checks at once.
    let stop;
    try {
      const w = new Worker(URL.createObjectURL(new Blob(["setInterval(() => postMessage(0), 1000);"], { type: "text/javascript" })));
      w.onmessage = poll;
      stop = () => w.terminate();
    } catch {
      timer.current = setInterval(poll, 1000);
      stop = () => clearInterval(timer.current);
    }
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [secret]);

  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Every open preview (any admin, any device) gets an equal share: side by
  // side for up to 3, then rows of equal blocks. Order comes from the server
  // (first in, first out), so a block keeps its place while its picture changes.
  const n = previews.length;
  const cols = n <= 3 ? Math.max(n, 1) : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols) || 1;
  const share = { w: screen.w / cols, h: screen.h / rows };

  if (n === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        {slides.length ? (
          <IdleShow slides={slides} />
        ) : idle ? (
          <img src={idle} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="text-center px-8">
            {brand.logo_src && <img src={brand.logo_src} alt="" className="mx-auto mb-8 h-40 w-40 object-contain" />}
            <div className="font-black text-white text-6xl tracking-tight" style={{ fontFamily: "Playfair Display, serif" }}>{brand.shop_name}</div>
            {(brand.legal_name || brand.city) && (
              <p className="text-neutral-500 mt-4 tracking-[0.3em] uppercase text-sm">{brand.legal_name || brand.city}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black grid"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {previews.map((p) => <Share key={p.pid || p.admin_id} preview={p} size={share} />)}
    </div>
  );
}

// One admin's share of the screen: a single try-on, or a best-fit sub-grid of
// all try-ons in a session ("show all").
function Share({ preview, size }) {
  const imgs = preview.images || [];
  const cols = bestColumns(imgs.length, size.w, size.h);
  const label = preview.mode === "session" ? `${imgs.length} try-ons` : imgs[0]?.description;
  return (
    <div className="relative min-w-0 min-h-0 overflow-hidden border border-black">
      <div className="w-full h-full grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
        {imgs.map((im) => (
          <img key={im.id} src={im.image} alt="" className="w-full h-full object-contain bg-black min-h-0 animate-in fade-in duration-300" />
        ))}
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-5 py-3 pointer-events-none">
        <p className="text-white text-sm font-medium">{preview.customer_name}{label ? ` · ${label}` : ""}</p>
        <p className="text-neutral-400 text-xs">{fmtTime(preview.start_time)}</p>
      </div>
    </div>
  );
}

// The idle screen: photos and videos one after another, on repeat. A photo
// stays for its seconds, a video plays to its end (one video alone loops).
// Each slide fades in over the last; the next photo is fetched ahead.
function IdleShow({ slides }) {
  const [at, setAt] = useState(0);
  const key = slides.map((s) => `${s.id}:${s.seconds}`).join(",");
  useEffect(() => { setAt(0); }, [key]);
  const i = at % slides.length;
  const cur = slides[i];
  const next = () => setAt((x) => (x + 1) % slides.length);
  useEffect(() => {
    if (cur.kind !== "image" || slides.length < 2) return undefined;
    const id = setTimeout(next, Math.max(3, cur.seconds || 8) * 1000);
    return () => clearTimeout(id);
  }, [cur, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const after = slides[(i + 1) % slides.length];
  return (
    <div className="relative w-full h-full">
      {cur.kind === "video" ? (
        <video key={`${cur.id}-${at}`} src={mediaSrc(cur.url)} autoPlay muted playsInline loop={slides.length === 1}
          onEnded={next} onError={next} className="absolute inset-0 w-full h-full object-contain animate-in fade-in duration-700" />
      ) : (
        <img key={`${cur.id}-${at}`} src={mediaSrc(cur.url)} alt="" onError={slides.length > 1 ? next : undefined}
          className="absolute inset-0 w-full h-full object-contain animate-in fade-in duration-700" />
      )}
      {after && after.kind === "image" && after.id !== cur.id && <link rel="preload" as="image" href={mediaSrc(after.url)} />}
    </div>
  );
}
