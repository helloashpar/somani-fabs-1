import {
  Sparkles, BadgeIndianRupee, Truck, ShieldCheck, Clock, Heart, Star, Gift, Scissors, Shirt, Gem, Leaf, Award,
  ThumbsUp, Users, Smile, Wrench, Coffee, UtensilsCrossed, Stethoscope, Car, Sofa, Smartphone, Dumbbell, Baby,
  Package, Ruler, Palette, Percent, RefreshCcw, CreditCard, MapPin, Phone, MessageCircle, Calendar, Zap, Crown,
  Flower2, Cake, Pill, Home, BookOpen, Megaphone, PanelTop, Image, LayoutGrid, Images, Quote, BarChart3, Tag,
  HelpCircle, MousePointerClick, Map, PanelBottom, Type, PlayCircle, UserRound, Handshake, Info,
} from "lucide-react";

// Every kind of section a builder website can have, with its layouts
// ("variants"), the fields the owner can edit and what a new one starts with.
// Text fields can be given in other languages (`title_hi`); text may use
// {shop_name}, {short_name}, {city}, {state} and {owner}, filled from Shop
// setup > General. The shop's facts (address, hours, phones, map) are never
// typed here: sections read them from General.

export const ICONS = {
  sparkles: Sparkles, rupee: BadgeIndianRupee, truck: Truck, shield: ShieldCheck, clock: Clock, heart: Heart,
  star: Star, gift: Gift, scissors: Scissors, shirt: Shirt, gem: Gem, leaf: Leaf, award: Award, thumbs: ThumbsUp,
  users: Users, smile: Smile, wrench: Wrench, coffee: Coffee, food: UtensilsCrossed, doctor: Stethoscope, car: Car,
  sofa: Sofa, phone_device: Smartphone, gym: Dumbbell, baby: Baby, package: Package, ruler: Ruler, palette: Palette,
  percent: Percent, exchange: RefreshCcw, card: CreditCard, pin: MapPin, phone: Phone, chat: MessageCircle,
  calendar: Calendar, zap: Zap, crown: Crown, flower: Flower2, cake: Cake, pill: Pill, home: Home, book: BookOpen,
  handshake: Handshake,
};

// Buttons a section can show. Each does something with the shop's details.
export const ACTIONS = [
  { id: "call", label: "Call the shop" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "directions", label: "Directions" },
  { id: "reviews", label: "Google reviews" },
  { id: "email", label: "Email" },
  { id: "section", label: "Go to a section" },
  { id: "link", label: "Other link" },
  { id: "none", label: "No button" },
];

const T = (key, label, extra = {}) => ({ key, label, kind: "text", lang: true, ...extra });
const A = (key, label, extra = {}) => ({ key, label, kind: "area", lang: true, ...extra });
const IMG = (key, label, extra = {}) => ({ key, label, kind: "image", ...extra });
const CTA = (key, label) => ({ key, label, kind: "cta" });
const TOGGLE = (key, label, extra = {}) => ({ key, label, kind: "toggle", ...extra });
const ITEMS = (key, label, fields, extra = {}) => ({ key, label, kind: "items", fields, ...extra });

const HEAD = [T("kicker", "Small line above"), T("title", "Heading"), A("subtitle", "Text under heading")];

export const SECTIONS = {
  announce: {
    name: "Announcement bar", icon: Megaphone, group: "Top",
    desc: "A thin strip on top for an offer or news",
    variants: [{ id: "bar", name: "Bar" }, { id: "marquee", name: "Scrolling" }],
    fields: [T("text", "Message"), CTA("cta", "Button")],
    defaults: { text: "Festive offer: flat 10% off this week", cta: "whatsapp", cta_label: "Ask now" },
    tone: "brand",
  },
  header: {
    name: "Header", icon: PanelTop, group: "Top",
    desc: "Logo, shop name, menu and a main button",
    variants: [{ id: "classic", name: "Logo left" }, { id: "centered", name: "Centred" }, { id: "split", name: "Split menu" }, { id: "minimal", name: "Minimal" }],
    fields: [T("tagline", "Small line under the name"), CTA("cta", "Header button"), TOGGLE("show_menu", "Show menu"), TOGGLE("transparent", "See-through over the first section")],
    defaults: { tagline: "{city}", cta: "call", cta_label: "", show_menu: true, transparent: false },
    tone: "page",
  },
  hero: {
    name: "Hero", icon: Sparkles, group: "Story",
    desc: "The big first impression",
    variants: [{ id: "split", name: "Text + photo" }, { id: "fullbleed", name: "Full photo" }, { id: "centered", name: "Centred" }, { id: "collage", name: "Collage" }, { id: "arch", name: "Arch frame" }, { id: "poster", name: "Poster" }],
    fields: [...HEAD, TOGGLE("show_image", "Show photo", { variants: ["split", "centered", "collage", "arch", "poster"], defaultOn: true }),
      IMG("image", "Main photo", { when: (c) => c.show_image !== false }), IMG("image2", "Photo 2", { variants: ["collage"], when: (c) => c.show_image !== false }), IMG("image3", "Photo 3", { variants: ["collage"], when: (c) => c.show_image !== false }),
      CTA("cta", "Main button"), CTA("cta2", "Second button"), TOGGLE("show_hours", "Show open / closed badge"), TOGGLE("show_rating", "Show reviews badge")],
    defaults: { kicker: "{city}", title: "Welcome to {shop_name}", subtitle: "Quality you can trust, prices you will love. Come visit us in {city}.", cta: "whatsapp", cta_label: "", cta2: "directions", cta2_label: "", show_hours: true, show_rating: false, show_image: true },
    tone: "page",
    decor: ["split", "centered", "collage", "arch"],
  },
  about: {
    name: "About", icon: Info, group: "Story",
    desc: "Your story, in your words",
    variants: [{ id: "side", name: "Photo beside" }, { id: "centered", name: "Centred" }, { id: "quote", name: "Big quote" }, { id: "timeline", name: "Timeline" }],
    fields: [...HEAD, A("body", "Story"), IMG("image", "Photo"), T("signature", "Signed by"),
      ITEMS("items", "Milestones", [T("year", "Year"), T("title", "What happened")], { variants: ["timeline"], max: 8 })],
    defaults: { kicker: "Our story", title: "A name {city} trusts", body: "{shop_name} started with one simple idea: treat every customer like family. Years later, that is still how we work: honest advice, fair prices and things we are proud to sell.", signature: "{owner}", items: [{ year: "1990", title: "The first shop opens" }, { year: "2005", title: "A bigger showroom" }, { year: "Today", title: "Thousands of happy families" }] },
    tone: "page",
  },
  features: {
    name: "Why choose us", icon: LayoutGrid, group: "Story",
    desc: "Your strengths, with icons",
    variants: [{ id: "icons", name: "Icons" }, { id: "cards", name: "Cards" }, { id: "bento", name: "Bento" }, { id: "list", name: "Checklist" }],
    fields: [...HEAD, ITEMS("items", "Points", [{ key: "icon", label: "Icon", kind: "icon" }, T("title", "Title"), A("text", "Text")], { max: 8 })],
    defaults: { kicker: "Why us", title: "Why families choose us", items: [
      { icon: "rupee", title: "Fair prices", text: "Honest rates on every item, always." },
      { icon: "gem", title: "Top quality", text: "Only products we would use ourselves." },
      { icon: "exchange", title: "Easy exchange", text: "Not happy? Bring it back, we will sort it." },
      { icon: "smile", title: "Warm service", text: "Advice from people who know their work." },
    ] },
    tone: "tint",
  },
  products: {
    name: "Products & services", icon: Tag, group: "Showcase",
    desc: "What you sell, with photos and prices",
    variants: [{ id: "cards", name: "Cards" }, { id: "arches", name: "Arches" }, { id: "scroll", name: "Side scroll" }, { id: "overlay", name: "Photo tiles" }, { id: "menu", name: "Price list" }],
    fields: [...HEAD, TOGGLE("enquire", "“Ask on WhatsApp” on each item"),
      ITEMS("items", "Items", [IMG("image", "Photo"), T("title", "Name"), A("text", "Short note"), T("price", "Price", { lang: false }), T("tag", "Tag (like New)")], { max: 24 })],
    defaults: { kicker: "Shop by category", title: "What we offer", enquire: true, items: [
      { title: "New arrivals", text: "Fresh picks for the season", price: "", tag: "New" },
      { title: "Best sellers", text: "Our customers' favourites", price: "", tag: "" },
      { title: "Festive specials", text: "For weddings and celebrations", price: "", tag: "" },
      { title: "Everyday", text: "Great value for daily use", price: "", tag: "" },
    ] },
    tone: "page",
  },
  gallery: {
    name: "Photo gallery", icon: Images, group: "Showcase",
    desc: "Your shop, products and happy customers",
    variants: [{ id: "grid", name: "Grid" }, { id: "masonry", name: "Masonry" }, { id: "mosaic", name: "Mosaic" }, { id: "strip", name: "Film strip" }],
    fields: [...HEAD, ITEMS("items", "Photos", [IMG("image", "Photo"), T("caption", "Caption")], { max: 24 })],
    defaults: { kicker: "Gallery", title: "Step inside", items: [{ caption: "" }, { caption: "" }, { caption: "" }, { caption: "" }, { caption: "" }, { caption: "" }] },
    tone: "page",
  },
  offer: {
    name: "Offer", icon: Percent, group: "Showcase",
    desc: "A sale, coupon or festive deal",
    variants: [{ id: "banner", name: "Banner" }, { id: "ticket", name: "Coupon" }, { id: "split", name: "With photo" }],
    fields: [T("kicker", "Small line above"), T("title", "Offer"), A("text", "Details"), T("code", "Coupon code", { lang: false }), T("until", "Valid till"), IMG("image", "Photo", { variants: ["split"] }), CTA("cta", "Button")],
    defaults: { kicker: "Limited time", title: "Flat 20% off", text: "On the festive collection. Show this page at the shop.", code: "FESTIVE20", until: "", cta: "whatsapp", cta_label: "Claim on WhatsApp" },
    tone: "brand",
    decor: ["banner"],
  },
  testimonials: {
    name: "Reviews", icon: Quote, group: "Trust",
    desc: "What customers say about you",
    variants: [{ id: "cards", name: "Cards" }, { id: "spotlight", name: "Spotlight" }, { id: "wall", name: "Scrolling wall" }],
    fields: [...HEAD, TOGGLE("reviews_button", "“See all reviews” button (Google)"),
      ITEMS("items", "Reviews", [A("quote", "Review"), T("name", "Name"), T("place", "Place / detail"), { key: "rating", label: "Stars", kind: "rating" }], { max: 12 })],
    defaults: { kicker: "Reviews", title: "Loved by our customers", reviews_button: true, items: [
      { quote: "Great collection and very honest people. We bought everything for my sister's wedding here.", name: "Priya S.", place: "{city}", rating: 5 },
      { quote: "They take time to explain and never push. Prices are better than the big stores.", name: "Rahul M.", place: "{city}", rating: 5 },
      { quote: "Been coming here for years. Quality is always the same: excellent.", name: "Anita K.", place: "{city}", rating: 5 },
    ] },
    tone: "tint",
  },
  stats: {
    name: "Numbers", icon: BarChart3, group: "Trust",
    desc: "Years, customers, products: big numbers",
    variants: [{ id: "row", name: "Row" }, { id: "cards", name: "Cards" }, { id: "band", name: "Bold band" }],
    fields: [T("title", "Heading (optional)"), ITEMS("items", "Numbers", [T("value", "Number", { lang: false }), T("label", "Label")], { max: 4 })],
    defaults: { title: "", items: [{ value: "30+", label: "Years of trust" }, { value: "10,000+", label: "Happy customers" }, { value: "500+", label: "Products" }, { value: "4.8★", label: "Google rating" }] },
    tone: "page",
  },
  brands: {
    name: "Brands", icon: Award, group: "Trust",
    desc: "Brands you stock or partners",
    variants: [{ id: "grid", name: "Grid" }, { id: "marquee", name: "Scrolling" }],
    fields: [T("title", "Heading"), ITEMS("items", "Brands", [IMG("image", "Logo"), T("name", "Name", { lang: false })], { max: 16 })],
    defaults: { title: "Brands we stock", items: [{ name: "Brand one" }, { name: "Brand two" }, { name: "Brand three" }, { name: "Brand four" }] },
    tone: "page",
  },
  team: {
    name: "Team", icon: UserRound, group: "Trust",
    desc: "The faces behind the counter",
    variants: [{ id: "circles", name: "Circles" }, { id: "cards", name: "Cards" }],
    fields: [...HEAD, ITEMS("items", "People", [IMG("image", "Photo"), T("name", "Name"), T("role", "Role")], { max: 12 })],
    defaults: { kicker: "Our people", title: "Meet the family", items: [{ name: "{owner}", role: "Founder" }, { name: "Team member", role: "Manager" }, { name: "Team member", role: "Expert" }] },
    tone: "page",
  },
  video: {
    name: "Video", icon: PlayCircle, group: "Showcase",
    desc: "A YouTube video of your shop or products",
    variants: [{ id: "wide", name: "Wide" }, { id: "split", name: "With text" }],
    fields: [...HEAD, { key: "url", label: "YouTube link", kind: "text", lang: false, placeholder: "https://youtube.com/watch?v=..." }],
    defaults: { kicker: "Watch", title: "Take a tour", url: "" },
    tone: "page",
  },
  faq: {
    name: "Questions", icon: HelpCircle, group: "Trust",
    desc: "Answers to what people ask most",
    variants: [{ id: "accordion", name: "Accordion" }, { id: "columns", name: "Two columns" }],
    fields: [...HEAD, ITEMS("items", "Questions", [T("q", "Question"), A("a", "Answer")], { max: 16 })],
    defaults: { kicker: "FAQ", title: "Questions people ask", items: [
      { q: "Do you deliver?", a: "Yes, within {city}. Message us on WhatsApp with what you need." },
      { q: "Can I exchange an item?", a: "Of course. Bring it back within 7 days with the tag." },
      { q: "Do you accept UPI and cards?", a: "Yes: UPI, all cards and cash." },
    ] },
    tone: "page",
  },
  text: {
    name: "Text", icon: Type, group: "Story",
    desc: "A heading and a paragraph",
    variants: [{ id: "left", name: "Left" }, { id: "centered", name: "Centred" }],
    fields: [...HEAD, A("body", "Text")],
    defaults: { kicker: "", title: "A few words", subtitle: "", body: "Write anything here: your promise, a note for customers or news." },
    tone: "page",
  },
  cta: {
    name: "Call to action", icon: MousePointerClick, group: "Contact",
    desc: "A bold invitation to call, chat or visit",
    variants: [{ id: "band", name: "Band" }, { id: "card", name: "Card" }, { id: "split", name: "With photo" }],
    fields: [T("title", "Heading"), A("text", "Text"), IMG("image", "Photo", { variants: ["split"] }), CTA("cta", "Main button"), CTA("cta2", "Second button")],
    defaults: { title: "Come see it for yourself", text: "Visit {shop_name} today, or message us and we will help you choose.", cta: "whatsapp", cta_label: "", cta2: "call", cta2_label: "" },
    tone: "brand",
    decor: ["card"],
  },
  contact: {
    name: "Visit us", icon: Map, group: "Contact",
    desc: "Address, hours, map and contact from your shop details",
    variants: [{ id: "split", name: "Map beside" }, { id: "cards", name: "Cards" }, { id: "bigmap", name: "Big map" }, { id: "compact", name: "Compact" }],
    fields: [T("kicker", "Small line above"), T("title", "Heading"), A("subtitle", "Text"), TOGGLE("show_map", "Show map"), TOGGLE("show_hours", "Show opening hours")],
    defaults: { kicker: "Visit us", title: "Come say hello", subtitle: "", show_map: true, show_hours: true },
    tone: "page",
  },
  footer: {
    name: "Footer", icon: PanelBottom, group: "Contact",
    desc: "Name, contact, social links",
    variants: [{ id: "simple", name: "Simple" }, { id: "columns", name: "Columns" }, { id: "giant", name: "Giant name" }],
    fields: [A("note", "Note (like GST number)"), TOGGLE("show_staff", "Staff login link")],
    defaults: { note: "", show_staff: true },
    tone: "dark",
  },
};

export const GROUPS = ["Top", "Story", "Showcase", "Trust", "Contact"];
export const TONES = [
  { id: "page", name: "Page" },
  { id: "tint", name: "Tinted" },
  { id: "brand", name: "Brand" },
  { id: "dark", name: "Dark" },
];

let counter = 0;
export function newId(type) {
  counter += 1;
  return `${type}-${Date.now().toString(36).slice(-4)}${counter}`;
}

export function newSection(type, variant, content) {
  const def = SECTIONS[type];
  return {
    id: newId(type), type, variant: variant || def.variants[0].id, hidden: false,
    content: JSON.parse(JSON.stringify(content || def.defaults)), style: { tone: def.tone },
  };
}

// Fields shown for a section's current layout (and its other choices).
export function fieldsFor(section) {
  const def = SECTIONS[section.type];
  return def ? def.fields.filter((f) => (!f.variants || f.variants.includes(section.variant)) && (!f.when || f.when(section.content))) : [];
}

// True when the section's current layout has soft decorative shapes, which
// the owner may switch off.
export function hasDecor(section) {
  const def = SECTIONS[section.type];
  if (!def || !def.decor) return false;
  if (section.type === "hero" && section.content.show_image === false && section.variant !== "fullbleed") return true;
  return def.decor.includes(section.variant);
}

// A copy of a section's content where a field's empty translations are dropped
// (keeps saved websites small).
export function prune(content) {
  return Object.fromEntries(Object.entries(content).filter(([k, v]) => !(/_[a-z]{2}$/.test(k) && v === "")));
}
