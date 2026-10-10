import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Film, Trash2, ChevronLeft, ChevronRight, Loader2, Play, Plus } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { mediaSrc } from "@/lib/brand";
import { useLang } from "@/i18n";
import { Button, Card, CardHeader, Skeleton } from "@/admin/ui";

// Shop setup > Display screen: what the shop screen shows when no try-on is
// on it. Up to 5 photos and videos that play one after another in a loop:
// photos for the seconds chosen, videos to their end; one video alone loops.

const W = {
  hinglish: {
    title: "Khaali screen par kya dikhe", sub: "Jab koi try-on nahi chal raha. 5 tak photos aur videos, ek ke baad ek, baar-baar.",
    add: "Photo ya video jodein", addSub: "Photo 10 MB tak, video 50 MB tak", seconds: "{n} sec", plays: "Poora chalega",
    loops: "Baar-baar chalega", empty: "Abhi kuch nahi. Screen par dukaan ka naam aur logo dikhega.", save: "Save", saved: "Save ho gaya. Screen par turant badal jayega.",
    uploading: "Upload ho raha hai…", full: "5 tak hi jod sakte hain", left: "Pehle", right: "Baad mein", remove: "Hatayein", order: "{i} / {n}",
  },
  hindi: {
    title: "खाली स्क्रीन पर क्या दिखे", sub: "जब कोई ट्राई-ऑन नहीं चल रहा। 5 तक फ़ोटो और वीडियो, एक के बाद एक, बार-बार।",
    add: "फ़ोटो या वीडियो जोड़ें", addSub: "फ़ोटो 10 MB तक, वीडियो 50 MB तक", seconds: "{n} सेकंड", plays: "पूरा चलेगा",
    loops: "बार-बार चलेगा", empty: "अभी कुछ नहीं। स्क्रीन पर दुकान का नाम और लोगो दिखेगा।", save: "सेव करें", saved: "सेव हो गया। स्क्रीन पर तुरंत बदल जाएगा।",
    uploading: "अपलोड हो रहा है…", full: "5 तक ही जोड़ सकते हैं", left: "पहले", right: "बाद में", remove: "हटाएं", order: "{i} / {n}",
  },
  english: {
    title: "Idle screen", sub: "Shown when no try-on is on screen. Up to 5 photos and videos, one after another, on repeat.",
    add: "Add photo or video", addSub: "Photos up to 10 MB, videos up to 50 MB", seconds: "{n} sec", plays: "Plays in full",
    loops: "Plays on repeat", empty: "Nothing yet. The screen shows your shop name and logo.", save: "Save", saved: "Saved. The screen changes right away.",
    uploading: "Uploading…", full: "You can add up to 5", left: "Earlier", right: "Later", remove: "Remove", order: "{i} / {n}",
  },
};
const SECONDS = [5, 8, 10, 15, 20, 30];

export default function IdleScreen() {
  const { lang } = useLang();
  const words = W[lang] || W.english;
  const t = (k, v = {}) => words[k].replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m));
  const [slides, setSlides] = useState(null);
  const [max, setMax] = useState(5);
  const [removed, setRemoved] = useState([]);
  const [uploads, setUploads] = useState([]); // [{key, name, pct}]
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const input = useRef(null);

  useEffect(() => {
    api.get("/display/slides").then((r) => { setSlides(r.data.slides); setMax(r.data.max); })
      .catch((e) => { setSlides([]); toast.error(apiErr(e)); });
  }, []);

  const change = (fn) => { setSlides(fn); setDirty(true); };
  const room = max - (slides || []).length - uploads.length;

  const onFiles = async (e) => {
    const files = [...e.target.files].slice(0, Math.max(room, 0));
    e.target.value = "";
    if (!files.length) { toast.error(t("full")); return; }
    for (const f of files) {
      const key = `${f.name}-${Date.now()}-${Math.random()}`;
      setUploads((u) => [...u, { key, name: f.name, pct: 0 }]);
      try {
        const form = new FormData();
        form.append("file", f);
        const { data } = await api.post("/display/media", form, {
          onUploadProgress: (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0 } : x))),
        });
        change((s) => [...s, data]);
      } catch (err) { toast.error(`${f.name}: ${apiErr(err)}`); }
      setUploads((u) => u.filter((x) => x.key !== key));
    }
  };

  const move = (i, d) => change((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  const remove = (i) => { setRemoved((r) => [...r, slides[i].id]); change((s) => s.filter((_, j) => j !== i)); };
  const setSec = (i, v) => change((s) => s.map((x, j) => (j === i ? { ...x, seconds: v } : x)));

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/display/slides", { slides: slides.map((s) => ({ id: s.id, seconds: s.seconds })), removed });
      setSlides(data.slides); setRemoved([]); setDirty(false);
      toast.success(t("saved"));
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };

  if (!slides) return <Skeleton className="h-64 rounded-2xl" />;
  const single = slides.length === 1;
  return (
    <Card data-testid="idle-screen">
      <CardHeader icon={ImagePlus} title={t("title")} subtitle={t("sub")} />
      <div className="px-5 pb-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {slides.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden" data-testid="idle-slide">
              <div className="relative aspect-video bg-gray-950">
                {s.kind === "video"
                  ? <video src={mediaSrc(s.url)} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" />
                  : <img src={mediaSrc(s.url)} alt="" className="absolute inset-0 h-full w-full object-contain" />}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{t("order", { i: i + 1, n: slides.length })}</span>
                {s.kind === "video" && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><Play size={12} fill="currentColor" /></span>}
              </div>
              <div className="flex items-center gap-1 p-1.5">
                {s.kind === "video" ? (
                  <span className="flex-1 truncate px-1 text-[12px] text-gray-600"><Film size={12} className="mr-1 inline" />{single ? t("loops") : t("plays")}</span>
                ) : (
                  <select value={s.seconds} onChange={(e) => setSec(i, Number(e.target.value))} aria-label={t("seconds", { n: "" })}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-1.5 text-[12.5px]">
                    {[...new Set([...SECONDS, s.seconds])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{t("seconds", { n })}</option>)}
                  </select>
                )}
                <button type="button" aria-label={t("left")} disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-7 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-25"><ChevronLeft size={16} /></button>
                <button type="button" aria-label={t("right")} disabled={i === slides.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-7 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-25"><ChevronRight size={16} /></button>
                <button type="button" aria-label={t("remove")} onClick={() => remove(i)} className="grid h-8 w-7 place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          {uploads.map((u) => (
            <div key={u.key} className="grid aspect-video place-items-center rounded-xl border border-dashed border-brand-300 bg-brand-50 text-center text-[12.5px] text-brand-800">
              <span><Loader2 size={18} className="mx-auto mb-1 animate-spin" />{t("uploading")} {u.pct}%</span>
            </div>
          ))}
          {room > 0 && (
            <button type="button" onClick={() => input.current.click()} data-testid="idle-add"
              className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 px-2 text-center text-gray-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <Plus size={20} /><span className="text-[13px] font-medium">{t("add")}</span><span className="text-[11px] text-gray-500">{t("addSub")}</span>
            </button>
          )}
        </div>
        <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" className="sr-only" onChange={onFiles} data-testid="idle-input" />
        {slides.length === 0 && uploads.length === 0 && <p className="text-sm text-gray-600">{t("empty")}</p>}
        <div className="flex justify-end">
          <Button data-testid="save-display" size="lg" onClick={save} loading={saving} disabled={!dirty || uploads.length > 0}>{t("save")}</Button>
        </div>
      </div>
    </Card>
  );
}
