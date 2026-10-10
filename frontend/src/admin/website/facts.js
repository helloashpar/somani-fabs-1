import { Image, Store, UserRound, MapPin, Clock, Phone, MessageCircle, Mail, Map, Star, Share2 } from "lucide-react";
import { formatAddress, hoursSummary } from "@/lib/brand";

// Shop details a website shows but does not store: they are kept once in
// Shop setup > General. The builder lists, per section, exactly which ones it
// shows, what they are now and where to change them. `card` is the General
// card that holds the detail, `field` the input to put the cursor in.

const SOCIAL = [["instagram", "Instagram"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["x", "X"], ["linkedin", "LinkedIn"], ["website", "Website"]];

export const FACTS = {
  logo: { label: "Logo", icon: Image, card: "identity", field: "logo", value: (b, w) => (b.logo_src ? w("Added") : "") },
  shop_name: { label: "Shop name", icon: Store, card: "identity", field: "shop_name", value: (b) => b.shop_name },
  legal_name: { label: "Firm / Owner name", icon: UserRound, card: "identity", field: "legal_name", value: (b) => b.legal_name },
  address: { label: "Address", icon: MapPin, card: "address", field: "address_street", value: (b) => formatAddress(b) },
  hours: { label: "Opening hours", icon: Clock, card: "hours", field: "hours", value: (b) => hoursSummary(b, "en") },
  phones: { label: "Phone numbers", icon: Phone, card: "contact", field: "phone-0", value: (b) => (b.phones || []).join(", ") },
  whatsapp: {
    label: "WhatsApp number", icon: MessageCircle, card: "contact", field: "whatsapp",
    value: (b, w) => b.whatsapp || ((b.phones || [])[0] ? `${b.phones[0]} (${w("your first phone number")})` : ""),
  },
  emails: { label: "Email", icon: Mail, card: "contact", field: "email-0", value: (b) => (b.emails || []).join(", ") },
  maps: { label: "Google Maps link", icon: Map, card: "map", field: "maps_url", optional: true, value: (b, w) => (b.maps_url ? w("Added") : w("Not added: your address is used")) },
  reviews: { label: "Google reviews link", icon: Star, card: "map", field: "reviews_url", value: (b, w) => (b.reviews_url ? w("Added") : "") },
  social: { label: "Social media links", icon: Share2, card: "social", field: "social", value: (b) => SOCIAL.filter(([k]) => b[k]).map(([, n]) => n).join(", ") },
};

// What a button needs from the shop details to work.
const ACTION_FACT = { call: "phones", whatsapp: "whatsapp", directions: "maps", reviews: "reviews", email: "emails" };

// {shop_name}, {city}, ... in the section's text.
const VAR_FACT = { shop_name: "shop_name", short_name: "shop_name", city: "address", state: "address", owner: "legal_name" };

function textVars(content) {
  const found = new Set();
  const scan = (v) => {
    if (typeof v === "string") (v.match(/\{(\w+)\}/g) || []).forEach((m) => VAR_FACT[m.slice(1, -1)] && found.add(VAR_FACT[m.slice(1, -1)]));
    else if (Array.isArray(v)) v.forEach(scan);
    else if (v && typeof v === "object") Object.values(v).forEach(scan);
  };
  scan(content);
  return [...found];
}

// The shop details one section shows, in a sensible order.
export function factsFor(section) {
  const c = section.content || {};
  const out = [];
  const add = (...ids) => ids.forEach((id) => id && !out.includes(id) && out.push(id));
  switch (section.type) {
    case "header": add("logo", "shop_name"); break;
    case "hero":
      if (c.show_hours || (section.variant === "split" && c.show_image !== false)) add("hours");
      if (c.show_rating) add("reviews");
      if (section.variant === "arch" && c.show_image !== false) add("shop_name");
      break;
    case "testimonials": if (c.reviews_button) add("reviews"); break;
    case "products": if (c.enquire) add("whatsapp"); break;
    case "contact":
      add("address");
      if (c.show_hours !== false) add("hours");
      add("phones", "whatsapp", "emails", "maps");
      break;
    case "footer":
      add("logo", "shop_name", "legal_name", "address", "phones", "emails", "social");
      if (section.variant === "columns") add("hours");
      break;
    default: break;
  }
  ["cta", "cta2"].forEach((k) => add(ACTION_FACT[c[k]]));
  add(...textVars(c));
  return out;
}

// The shop details the website's own switches use (floating buttons).
export function factsForSettings(settings = {}) {
  const out = [];
  if (settings.whatsapp_button) out.push("whatsapp");
  if (settings.call_bar) out.push("phones", "maps");
  return out;
}

export { ACTION_FACT };
