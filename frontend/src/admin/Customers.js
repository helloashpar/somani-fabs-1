import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Database, Download, Search, Cake, MessageCircle, Plus, Info, Pencil, Check, X } from "lucide-react";
import Avatar from "@/admin/Avatar";
import { fmtDayMonth, fmtDate, rupees } from "@/admin/CustomerHistory";
import { can } from "@/admin/perms";
import { Badge, Button, Card, Empty, IconButton, Page, PageHeader, Sheet, Skeleton, inputCls } from "@/admin/ui";
import { useBrand, slug } from "@/lib/brand";

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
function fmt(iso) { try { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }); } catch { return ""; } }

const PAGE = 80; // rows rendered at a time; more appear on scroll

export default function Customers({ user, onStart }) {
  const { t } = useLang();
  const brand = useBrand();
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { api.get("/customers").then((r) => setList(r.data)).catch((e) => { setList([]); toast.error(apiErr(e)); }); }, []);
  useEffect(() => { setLimit(PAGE); }, [q]);
  // Long lists render in pages as the user scrolls.
  useEffect(() => {
    const onScroll = () => { if (window.innerHeight + window.scrollY > document.body.scrollHeight - 600) setLimit((l) => l + PAGE); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const needle = q.trim().toLowerCase();
  const all = list || [];
  const shown = needle ? all.filter((c) => [c.name, c.mobile, c.mobile2].some((v) => (v || "").toLowerCase().includes(needle))) : all;
  const exportXl = async () => {
    try {
      // axios rejects non-2xx responses, so an error is never saved as the .xlsx file.
      const { data } = await api.get("/customers/export", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a"); a.href = url; a.download = `${slug(brand.shop_name)}_customers.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error("Export failed. Please try again."); }
  };
  const canExport = can(user, "customers_export");
  return (
    <Page>
      <PageHeader title={t("nav_customers")} subtitle={list ? `${needle ? `${shown.length} / ` : ""}${all.length} ${t("customers_count")}` : " "}
        actions={canExport && <>
          <Button data-testid="export-excel-btn" variant="secondary" icon={Download} onClick={exportXl} className="hidden sm:inline-flex">{t("export_excel")}</Button>
          <IconButton data-testid="export-excel-btn-mobile" icon={Download} label={t("export_excel")} onClick={exportXl} className="sm:hidden border border-gray-300 bg-white" />
        </>} />
      {/* Search stays in reach while scrolling a long list. */}
      <div className="sticky top-14 lg:top-0 z-20 -mx-4 px-4 py-2 mb-2 bg-canvas/95 backdrop-blur-md sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <div className="relative lg:max-w-md">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true" />
          <input data-testid="customer-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_customers")} aria-label={t("search_customers")} className={`${inputCls} pl-10`} />
        </div>
      </div>
      <Card className="overflow-hidden">
        {list === null ? (
          <div className="p-4 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : shown.length === 0 ? (
          <Empty icon={Database} title={needle ? t("no_match") : t("no_customers")} className="py-12" />
        ) : (
          <>
            {/* Desktop: table */}
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 border-b border-gray-200 bg-gray-50/60">
                  <th className="font-medium px-5 py-3">{t("col_customer")}</th>
                  <th className="font-medium px-3 py-3">{t("hist_dob")}</th>
                  <th className="font-medium px-3 py-3 text-right">{t("hist_visits")}</th>
                  <th className="font-medium px-3 py-3 text-right">{t("hist_purchased")}</th>
                  <th className="font-medium px-3 py-3 text-right">{t("hist_revenue")}</th>
                  <th className="font-medium px-5 py-3 text-right">{t("hist_last_visit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.slice(0, limit).map((c) => (
                  <tr key={c.id} data-testid={`customer-${c.id}`} onClick={() => setSel(c)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar src={c.thumb || c.photo} className="w-9 h-9 rounded-full shrink-0" />
                        <div className="min-w-0"><p className="font-medium text-gray-900 truncate">{c.name}</p><p className="text-xs text-gray-600 num">{c.mobile}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{c.dob ? fmtDayMonth({ ...c.dob, year: null }) : <span className="text-gray-400">-</span>}</td>
                    <td className="px-3 py-2.5 text-right num">{c.stats?.total_sessions}</td>
                    <td className="px-3 py-2.5 text-right num">{c.stats?.purchased_count}</td>
                    <td className="px-3 py-2.5 text-right num font-medium text-emerald-700">{inr(c.stats?.total_collected)}</td>
                    <td className="px-5 py-2.5 text-right text-gray-700">{c.stats?.last_visit ? fmtDate(c.stats.last_visit) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Phones: list */}
            <div className="md:hidden divide-y divide-gray-100">
              {shown.slice(0, limit).map((c) => (
                <button data-testid={`customer-m-${c.id}`} key={c.id} onClick={() => setSel(c)} className="w-full text-left flex items-center gap-3 px-4 py-2.5 min-h-[64px] active:bg-gray-50">
                  <Avatar src={c.thumb || c.photo} className="w-11 h-11 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0"><p className="font-medium text-gray-900 truncate">{c.name}</p><p className="text-sm text-gray-600 num">{c.mobile}</p></div>
                  <div className="text-right shrink-0"><p className="text-sm font-semibold text-emerald-700 num">{inr(c.stats?.total_collected)}</p><p className="text-xs text-gray-600 num">{c.stats?.total_sessions} {t(c.stats?.total_sessions === 1 ? "hist_visit_one" : "hist_visits_short")}</p></div>
                </button>
              ))}
            </div>
          </>
        )}
      </Card>
      {sel && <CustomerProfile customer={sel} onClose={() => setSel(null)} canEdit={can(user, "customers_edit")}
        onRenamed={(name) => setList((l) => (l || []).map((c) => (c.id === sel.id ? { ...c, name } : c)))}
        onStart={can(user, "sessions_manage") && onStart ? (c) => { setSel(null); onStart(c); } : null} />}
    </Page>
  );
}

// The customer's name with an edit button. The mobile number identifies the
// customer and stays; a misspelt or changed name can be corrected here.
function NameEditor({ id, name, canEdit, onSaved }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e?.preventDefault();
    const v = draft.trim().replace(/\s+/g, " ");
    if (!v) { toast.error(t("name_required")); return; }
    if (v === name) { setDraft(null); return; }
    setSaving(true);
    try {
      const { data } = await api.put(`/customers/${id}`, { name: v });
      toast.success(t("name_saved")); setDraft(null); onSaved(data.name);
    } catch (err) { toast.error(apiErr(err)); }
    setSaving(false);
  };
  if (draft !== null) {
    return (
      <form onSubmit={save} className="flex items-center gap-1.5">
        <input data-testid="customer-name-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={80}
          aria-label={t("cust_name")} className={`${inputCls} h-10 text-base font-semibold`} onKeyDown={(e) => e.key === "Escape" && setDraft(null)} />
        <IconButton data-testid="customer-name-save" type="submit" icon={Check} label={t("save")} disabled={saving} className="shrink-0 !bg-brand-700 !text-white hover:!bg-brand-800" />
        <IconButton type="button" icon={X} label={t("cancel")} onClick={() => setDraft(null)} className="shrink-0" />
      </form>
    );
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      <p data-testid="customer-name" className="font-semibold text-xl tracking-tight text-gray-900 truncate">{name}</p>
      {canEdit && <IconButton data-testid="customer-name-edit" icon={Pencil} size={16} label={t("edit_name")} onClick={() => setDraft(name)} className="shrink-0 -my-2" />}
    </div>
  );
}

// Everything the shop knows about one customer: contact, birthday, visits,
// money, WhatsApp consent, every custom field, and each visit.
function CustomerProfile({ customer, onClose, onStart, canEdit, onRenamed }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/customers/${customer.id}`).then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e))); }, [customer.id]);
  const extra = data?.extra || {};
  const fieldLabels = data ? [...data.custom_fields, ...Object.keys(extra).filter((k) => !data.custom_fields.includes(k))] : [];
  const showValue = (v) => (v === true ? t("yes") : v === false ? t("no") : v === undefined || v === null || v === "" ? "-" : String(v));
  const st = data?.stats;
  return (
    <Sheet title={t("profile")} onClose={onClose} size="lg"
      footer={onStart && <Button data-testid="profile-start-session" icon={Plus} size="xl" full disabled={!data} onClick={() => onStart({ ...data, id: customer.id })}>{t("start_for")}</Button>}>
      {!data ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>
      ) : (
        <div data-testid="customer-profile" className="space-y-5">
          <div className="flex gap-4 items-center">
            <Avatar src={data.photo} className="w-20 h-24 rounded-xl shrink-0" />
            <div className="min-w-0 flex-1">
              <NameEditor id={customer.id} name={data.name} canEdit={canEdit} onSaved={(name) => { setData({ ...data, name }); onRenamed(name); }} />
              <p className="text-gray-700 text-sm num">
                <a href={`tel:${data.mobile}`} className="underline-offset-2 hover:underline">{data.mobile}</a>{data.mobile2 ? ` · ${data.mobile2}` : ""}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Badge tone={data.dob ? "pink" : "gray"} icon={Cake}>{data.dob ? `${fmtDayMonth(data.dob)}${data.age !== null && data.age !== undefined ? ` · ${data.age} ${t("years")}` : ""}` : t("not_added")}</Badge>
                <Badge tone={data.wa.opted_out ? "red" : data.wa.opted_in ? "green" : "gray"} icon={MessageCircle}>
                  {data.wa.opted_out ? t("prof_wa_out") : data.wa.opted_in ? t("prof_wa_in") : t("prof_wa_none")}
                </Badge>
              </div>
            </div>
          </div>
          <div>
            {/* Three rows of three: visits, money, dates. */}
            <div className="grid grid-cols-3 gap-2">
              <ProfileBox label={t("hist_visits")}>{st.total_sessions}</ProfileBox>
              <ProfileBox label={t("hist_purchased")} tone="text-emerald-700">{st.purchased_count}</ProfileBox>
              <ProfileBox label={t("not_purchased")} tone={st.not_purchased_count ? "text-red-700" : "text-gray-900"}>{st.not_purchased_count}</ProfileBox>
              <ProfileBox label={t("hist_revenue")} tone="text-emerald-700">{rupees(st.total_collected)}</ProfileBox>
              <ProfileBox label={t("prof_discount")}>{rupees(st.total_discount)}</ProfileBox>
              <ProfileBox label={t("total_value")}>{rupees(st.total_value)}</ProfileBox>
              <ProfileBox label={t("hist_last_visit")}>{st.last_visit ? fmtDate(st.last_visit) : "-"}</ProfileBox>
              <ProfileBox label={t("prof_first_visit")}>{st.first_visit ? fmtDate(st.first_visit) : "-"}</ProfileBox>
              <ProfileBox label={t("prof_since")}>{st.first_purchase ? fmtDate(st.first_purchase) : "-"}</ProfileBox>
            </div>
            <p className="text-[13px] text-gray-600 mt-2 flex gap-1.5"><Info size={15} className="shrink-0 mt-px" aria-hidden="true" />{t("prof_dates_note")}</p>
          </div>
          {fieldLabels.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-2">{t("prof_fields")}</p>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {fieldLabels.map((k) => (
                  <div key={k} className="flex justify-between gap-3 px-3.5 py-2.5 text-sm"><span className="text-gray-600">{k}</span><span className="font-medium text-gray-900 text-right">{showValue(extra[k])}</span></div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-2">{t("prof_visits")}</p>
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {data.sessions.map((s) => (
                <div key={s.id} className="flex justify-between items-center gap-3 text-sm px-3.5 py-2.5">
                  <span className="text-gray-700 num">{fmt(s.start_time)}</span>
                  {s.status === "active" ? <Badge tone="brand">{t("active")}</Badge>
                    : s.purchased ? <span className="num font-medium text-emerald-700">{inr(s.final_paid)}{s.discount ? <span className="text-gray-600 font-normal"> ({t("discount")} {inr(s.discount)})</span> : null}</span>
                      : <Badge>{t("not_purchased")}</Badge>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function ProfileBox({ label, children, tone = "text-gray-900" }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5 min-w-0">
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`num font-semibold text-sm sm:text-[15px] mt-0.5 ${tone}`}>{children}</p>
    </div>
  );
}
