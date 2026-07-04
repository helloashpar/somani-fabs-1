import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function fmtTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
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

  const n = previews.length;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : n <= 4 ? 2 : 3;

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
    <div className="fixed inset-0 bg-black grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {previews.map((p) => (
        <div key={p.admin_id} className="relative w-full h-full overflow-hidden border border-black">
          <img src={p.image} alt="" className="w-full h-full object-contain bg-black" />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-5 py-3">
            <p className="text-white text-sm font-medium">{p.customer_name} · {p.description}</p>
            <p className="text-neutral-400 text-xs">{fmtTime(p.start_time)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
