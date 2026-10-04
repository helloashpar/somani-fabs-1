import React, { useState, useEffect } from "react";
import { api, apiErr } from "@/lib/api";
import { useLang } from "@/i18n";
import { toast } from "sonner";
import { Plus, Trash2, Type, Hash, CalendarDays, CheckSquare, ListPlus } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, IconButton, Segmented, Sheet, Skeleton, inputCls } from "@/admin/ui";

const TYPES = [
  { id: "text", icon: Type }, { id: "number", icon: Hash },
  { id: "date", icon: CalendarDays }, { id: "checkbox", icon: CheckSquare },
];

// Settings -> More Settings -> Session fields: extra questions on the New
// Session form. Answers are kept on the customer and in the Excel export.
export default function SessionFields() {
  const { t } = useLang();
  const [fields, setFields] = useState(null);
  const [adding, setAdding] = useState(null); // { label, type, required }
  const [saving, setSaving] = useState(false);
  const load = () => api.get("/config/fields").then((r) => setFields(r.data)).catch((e) => { setFields([]); toast.error(apiErr(e)); });
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!adding.label.trim()) { toast.error(t("sf_label_needed")); return; }
    setSaving(true);
    try {
      await api.post("/config/fields", { label: adding.label.trim(), type: adding.type, required: adding.required, order: (fields?.length || 0) + 1 });
      toast.success("Added"); setAdding(null); load();
    } catch (e) { toast.error(apiErr(e)); }
    setSaving(false);
  };
  const del = async (f) => {
    if (!window.confirm(`${t("delete")} "${f.label}"?`)) return;
    try { await api.delete(`/config/fields/${f.id}`); load(); } catch (e) { toast.error(apiErr(e)); }
  };
  const setRequired = async (f, required) => {
    try { await api.patch(`/config/fields/${f.id}`, { required }); load(); } catch (e) { toast.error(apiErr(e)); }
  };
  const typeIcon = (type) => (TYPES.find((x) => x.id === type) || TYPES[0]).icon;

  return (
    <>
      <Card>
        <CardHeader icon={ListPlus} title={t("cfg_session_fields")} subtitle={t("sf_sub")}
          actions={<Button data-testid="add-field-btn" size="sm" icon={Plus} onClick={() => setAdding({ label: "", type: "text", required: false })}>{t("add")}</Button>} />
        <div className="border-t border-gray-100">
          <p className="px-5 py-3 text-sm text-gray-600 bg-gray-50/60">{t("sf_default")}</p>
          {fields === null ? (
            <div className="p-4 space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : fields.length === 0 ? (
            <Empty icon={ListPlus} title={t("sf_empty")} body={t("sf_empty_body")} className="py-10" />
          ) : (
            <div className="divide-y divide-gray-100">
              {fields.map((f) => {
                const Icon = typeIcon(f.type);
                return (
                  <div key={f.id} data-testid={`field-row-${f.id}`} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-700 flex items-center justify-center shrink-0"><Icon size={15} /></span>
                    <p className="flex-1 min-w-0 font-medium text-gray-900 truncate">{f.label}</p>
                    <Badge className="hidden sm:inline-flex">{t(`sf_type_${f.type}`)}</Badge>
                    <button data-testid={`field-required-${f.id}`} onClick={() => setRequired(f, !f.required)} title={t("sf_tap_to_change")}
                      className={`h-7 px-2.5 rounded-full text-xs font-medium transition-colors ${f.required ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                      {f.required ? t("required") : t("optional")}
                    </button>
                    <IconButton icon={Trash2} label={t("delete")} size={16} onClick={() => del(f)} className="hover:!text-red-600 hover:!bg-red-50" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
      {adding && (
        <Sheet title={t("sf_add_title")} onClose={() => setAdding(null)} size="sm"
          footer={<Button data-testid="save-field" onClick={save} loading={saving} size="lg" full>{t("add")}</Button>}>
          <div className="space-y-4">
            <Field label={t("sf_label")} hint={t("sf_label_hint")}>
              <input data-testid="field-label" autoFocus value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} className={inputCls} />
            </Field>
            <div>
              <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("sf_type")}</span>
              <Segmented testid="field-type" value={adding.type} onChange={(type) => setAdding({ ...adding, type })}
                options={TYPES.map((x) => ({ id: x.id, label: t(`sf_type_${x.id}`) }))} />
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-800 mb-1.5">{t("sf_required_q")}</span>
              <Segmented testid="field-required" value={adding.required ? "yes" : "no"} onChange={(v) => setAdding({ ...adding, required: v === "yes" })}
                options={[{ id: "no", label: t("optional") }, { id: "yes", label: t("required") }]} />
              <p className="text-[13px] text-gray-600 mt-1.5">{adding.required ? (adding.type === "checkbox" ? t("sf_required_checkbox") : t("sf_required_hint")) : t("sf_optional_hint")}</p>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
