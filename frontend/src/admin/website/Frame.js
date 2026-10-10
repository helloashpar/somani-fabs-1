import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// A website drawn inside an iframe (/site-frame) at a real device width and
// scaled to fit, so phone layouts are true phone layouts. `payload` is sent
// on every change; `onMessage` gets clicks and edits from inside.

export const DEVICES = { desktop: 1280, tablet: 820, phone: 390 };

export default function Frame({ payload, onMessage, device = "desktop", interactive = true, scrollTo, className = "", fit = "width" }) {
  const box = useRef(null);
  const frame = useRef(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const width = DEVICES[device] || DEVICES.desktop;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin || !e.data || e.data.source !== "site-frame") return;
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      if (e.data.type === "ready") setReady(true);
      else if (onMessage) onMessage(e.data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onMessage]);

  useEffect(() => {
    if (ready && frame.current) frame.current.contentWindow.postMessage({ source: "site-builder", type: "render", ...payload }, window.location.origin);
  }, [ready, payload]);

  useEffect(() => {
    if (ready && scrollTo && frame.current) frame.current.contentWindow.postMessage({ source: "site-builder", type: "scroll", id: scrollTo.id }, window.location.origin);
  }, [ready, scrollTo]);

  const scale = size.w ? Math.min(1, size.w / width) : 0;
  const height = fit === "width" ? (size.h ? size.h / (scale || 1) : 800) : 900;
  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      {scale > 0 && (
        <iframe ref={frame} title="Website preview" src="/site-frame"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", left: Math.max(0, (size.w - width * scale) / 2) }}
          className={`absolute top-0 border-0 bg-white ${interactive ? "" : "pointer-events-none"}`} />
      )}
    </div>
  );
}
