import React, { useEffect, useState } from "react";
import { useLang } from "@/i18n";
import { SlidersHorizontal, Shirt } from "lucide-react";
import CategoryConfig from "@/admin/CategoryConfig";
import Collection from "@/admin/Collection";
import { loadCatalog, loadCategories } from "@/lib/catalog";
import { Badge, HubPage } from "@/admin/ui";

// Settings -> Catalog: two tiles. Configuration says what can be tried on
// (categories, groups, styles); Collection holds the fabrics.
export default function Catalog({ isSuper, title, subtitle }) {
  const { t } = useLang();
  const [counts, setCounts] = useState({});

  useEffect(() => {
    if (!isSuper) return;
    loadCategories().then((c) => setCounts((x) => ({ ...x, cats: c.length }))).catch(() => {});
    loadCatalog({ force: true }).then((f) => setCounts((x) => ({ ...x, fabrics: f.length }))).catch(() => {});
  }, [isSuper]);

  if (!isSuper) return <p className="text-center text-gray-600 py-10 text-sm">{t("super_only")}</p>;

  const count = (n, unit) => (n !== undefined ? <Badge tone="brand"><span className="num">{n}</span> {unit}</Badge> : null);
  return (
    <HubPage title={title} subtitle={subtitle} testid="catalog"
      tiles={[
        { id: "config", icon: SlidersHorizontal, title: t("set_configuration"), sub: t("tile_config_sub"), meta: count(counts.cats, t("tile_categories")) },
        { id: "collection", icon: Shirt, title: t("set_collection"), sub: t("tile_collection_sub"), meta: count(counts.fabrics, t("fs_fabrics")) },
      ]}
      render={(id) => (id === "config" ? <CategoryConfig /> : <Collection />)} />
  );
}
