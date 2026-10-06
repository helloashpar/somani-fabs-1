import React, { useState, useEffect, useCallback } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Send, Star, Check, CheckCheck, Clock, AlertCircle, Loader2, MessageCircle } from "lucide-react";
import { Button, Card } from "@/admin/ui";
import { can } from "@/admin/perms";

const ACTIVE = ["queued", "sending"];

// WhatsApp state of one session: consent, 24-hour window and each look's
// delivery status. Polls while something can still change.
export function useWhatsApp(sessionId, live) {
  const [info, setInfo] = useState(null);
  const load = useCallback(
    () => api.get(`/whatsapp/sessions/${sessionId}`).then((r) => setInfo(r.data)).catch(() => {}),
    [sessionId],
  );
  useEffect(() => { load(); }, [load]);
  const busy = info && Object.values(info.trials || {}).some((tr) => ACTIVE.includes(tr.wa_status));
  const poll = info?.enabled && (live || busy);
  useEffect(() => {
    if (!poll) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [poll, load]);
  return { info, reload: load };
}

export function WaStatus({ status, lookNo, error }) {
  const { t } = useLang();
  if (!status) return null;
  const icon = {
    queued: <Clock size={12} />, sending: <Loader2 size={12} className="animate-spin" />,
    sent: <Check size={12} />, delivered: <CheckCheck size={12} />,
    read: <CheckCheck size={12} className="text-sky-600" />, failed: <AlertCircle size={12} />,
  }[status];
  const color = status === "failed" ? "text-red-700" : status === "queued" ? "text-amber-800" : "text-emerald-700";
  return (
    <span data-testid="wa-status" title={error || ""} className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <MessageCircle size={12} />{lookNo ? <span className="num">#{lookNo}</span> : null} {icon} {t(`st_${status}`)}
    </span>
  );
}

// Star + "Send to WhatsApp" buttons for one finished try-on.
export function WaTrialActions({ trial, wa, onChange, canStar = true, dark = false }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const st = wa?.trials?.[trial.id] || {};
  const starred = st.starred ?? trial.starred;
  const toggleStar = async () => {
    try { await api.patch(`/trials/${trial.id}/star`, { starred: !starred }); onChange(); }
    catch (e) { toast.error(apiErr(e)); }
  };
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/whatsapp/trials/${trial.id}/send`);
      if (data.wa_status === "queued") toast.message(t("wa_queued_toast"));
      else if (data.wa_status === "failed") toast.error(data.wa_error || t("st_failed"));
      onChange();
    } catch (e) { toast.error(apiErr(e)); }
    setBusy(false);
  };
  const canSend = wa?.enabled && wa.can_send_looks && wa.consent;
  const done = ["queued", "sending", "sent", "delivered", "read"].includes(st.wa_status);
  return (
    <>
      <button data-testid={`star-trial-${trial.id}`} onClick={toggleStar} disabled={!canStar} aria-label={t("wa_star")} aria-pressed={!!starred} title={t("wa_star")}
        className={`${dark ? "w-12 h-12 bg-white/10" : "w-10 h-10 -ml-2"} inline-flex items-center justify-center rounded-xl transition-colors active:scale-95 ${starred ? "text-amber-400" : dark ? "text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"}`}>
        <Star size={dark ? 22 : 19} fill={starred ? "currentColor" : "none"} />
      </button>
      {canSend && !done && (
        <button data-testid={`wa-send-${trial.id}`} onClick={send} disabled={busy} aria-label={t("wa_send")} title={t("wa_send")}
          className={`ml-auto ${dark ? "h-12 px-5 bg-emerald-600 text-white hover:bg-emerald-700" : "h-10 px-3 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"} inline-flex items-center gap-1.5 rounded-xl text-sm font-medium transition-colors active:scale-[0.97] disabled:opacity-50`}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} aria-hidden="true" />}<span className={dark ? "" : "hidden sm:inline"}>{t("wa_send_short")}</span>
        </button>
      )}
    </>
  );
}

// Session-level card: is the customer reachable, and what to do if not.
export function WaPanel({ sessionId, session, wa, finished, onChange, user }) {
  const { t } = useLang();
  const [busy, setBusy] = useState("");
  if (!wa?.enabled || !wa.phone) return null;
  const closed = session.status === "closed";
  const act = async (key, fn, ok) => {
    setBusy(key);
    try { const { data } = await fn(); if (ok) toast.success(ok); onChange(data); }
    catch (e) { toast.error(apiErr(e)); }
    setBusy("");
  };
  const unsent = finished.filter((tr) => !(wa.trials?.[tr.id]?.wa_status)
    || wa.trials[tr.id].wa_status === "failed");

  let state;
  if (wa.opted_out) state = { tone: "bg-gray-100 text-gray-600", icon: MessageCircle, text: t("wa_opted_out") };
  else if (!wa.consent) state = { tone: "bg-gray-100 text-gray-600", icon: MessageCircle, text: t("wa_no_consent") };
  else if (wa.window_open) state = { tone: "bg-emerald-50 text-emerald-700", icon: CheckCheck, text: t("wa_open") };
  else state = { tone: "bg-amber-50 text-amber-800", icon: Clock, text: t("wa_waiting") };

  const actions = [];
  if (!wa.consent && !wa.opted_out && !closed && can(user, "sessions_manage")) {
    actions.push(<Button key="c" data-testid="wa-give-consent" variant="secondary" size="sm" disabled={!!busy}
      onClick={() => act("consent", () => api.post(`/whatsapp/sessions/${sessionId}/consent`, { consent: true }))}>{t("wa_give_consent")}</Button>);
  }
  if (wa.consent && !wa.window_open && !closed && session.has_photo !== false && can(user, "whatsapp_send")) {
    actions.push(<Button key="i" data-testid="wa-resend-invite" variant="secondary" size="sm" loading={busy === "invite"} disabled={!!busy}
      onClick={() => act("invite", () => api.post(`/whatsapp/sessions/${sessionId}/invite`), t("st_sent"))}>{t("wa_resend_invite")}</Button>);
  }
  if (wa.consent && wa.can_send_looks && unsent.length > 1) {
    actions.push(<Button key="a" data-testid="wa-send-all" variant="success" size="sm" icon={Send} loading={busy === "all"} disabled={!!busy}
      onClick={() => act("all", () => api.post(`/whatsapp/sessions/${sessionId}/send-all`))}>{t("wa_send_all")} ({unsent.length})</Button>);
  }
  if (wa.consent && closed && session.purchased && can(user, "whatsapp_send")) {
    actions.push(<Button key="r" data-testid="wa-resend-receipt" variant="secondary" size="sm" loading={busy === "receipt"} disabled={!!busy}
      onClick={() => act("receipt", () => api.post(`/whatsapp/sessions/${sessionId}/receipt`), t("st_sent"))}>{t("wa_resend_receipt")}</Button>);
  }

  return (
    <Card data-testid="wa-panel" className="p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-gray-900"><MessageCircle size={17} className="text-emerald-600" /> WhatsApp</p>
        {wa.welcome && <span className="text-xs text-gray-600">{t("wa_invite")}: {t(`st_${wa.welcome.status}`)}</span>}
      </div>
      <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${state.tone}`}>
        <state.icon size={16} className="mt-0.5 shrink-0" /> <span>{state.text}</span>
      </div>
      {wa.welcome?.status === "failed" && wa.welcome.error && <p className="text-[13px] text-red-700 mt-2">{wa.welcome.error}</p>}
      {actions.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
      {wa.receipt && <p className="text-xs text-gray-600 mt-2.5">{t("wa_receipt")}: {t(`st_${wa.receipt.status}`)}</p>}
    </Card>
  );
}
