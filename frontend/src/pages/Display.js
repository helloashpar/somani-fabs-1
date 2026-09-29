import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { bestColumns } from "@/lib/bestGrid";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
  catch { return ""; }
}

export default function Display() {
  const { secret } = useParams();
  const [previews, setPreviews] = useState([]);
  const [idle, setIdle] = useState("");
  const timer = useRef(null);
  const version = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await axios.get(`${API}/display/${secret}/state`, {
          params: version.current ? { v: version.current } : {},
        });
        if (data.unchanged) return;
        version.current = data.version;
        setPreviews(data.previews || []);
        setIdle(data.idle_image || "");
      } catch (e) { /* keep last */ }
    };
    poll();
    timer.current = setInterval(poll, 2000);
    return () => clearInterval(timer.current);
  }, [secret]);

  const [screen, setScreen] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setScreen({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Every admin on the screen gets an equal share: side by side for up to 3,
  // then rows of equal tiles. Order comes from the server (first in, first out).
  const n = previews.length;
  const cols = n <= 3 ? Math.max(n, 1) : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols) || 1;
  const share = { w: screen.w / cols, h: screen.h / rows };

  if (n === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        {idle ? (
          <img src={idle} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="text-center">
            <div className="font-black text-white text-6xl tracking-tight" style={{ fontFamily: "Playfair Display, serif" }}>Somani Fabs</div>
            <p className="text-neutral-500 mt-4 tracking-[0.3em] uppercase text-sm">Shivnarayan Shivbhagwan Somani</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black grid"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {previews.map((p) => <Share key={p.admin_id} preview={p} size={share} />)}
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
          <img key={im.id} src={im.image} alt="" className="w-full h-full object-contain bg-black min-h-0" />
        ))}
      </div>
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-5 py-3 pointer-events-none">
        <p className="text-white text-sm font-medium">{preview.customer_name}{label ? ` · ${label}` : ""}</p>
        <p className="text-neutral-400 text-xs">{fmtTime(preview.start_time)}</p>
      </div>
    </div>
  );
}
