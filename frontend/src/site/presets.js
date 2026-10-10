import { newSection } from "@/site/registry";
import { LOOKS } from "@/site/theme";

// Starter packs: ready words for a kind of business, so a new website reads
// right before the owner types anything. Text may use {shop_name}, {city}, ...
// (filled from General). Layouts come from the "vibe" picked in the quiz.

const P = (title, text, price = "", tag = "", extra = {}) => ({ title, text, price, tag, ...extra });
const F = (icon, title, text) => ({ icon, title, text });
const Q = (q, a) => ({ q, a });

export const PACKS = [
  {
    id: "textile", name: "Fabric & textiles", icon: "shirt", look: "heritage",
    hero: { kicker: "{city}", kicker_hi: "{city}", title: "Fabric for every occasion", title_hi: "हर मौके के लिए कपड़ा", subtitle: "Suiting, shirting, kurta and dhoti fabric from the brands you trust, at honest prices.", subtitle_hi: "भरोसेमंद ब्रांड का सूटिंग, शर्टिंग, कुर्ता और धोती का कपड़ा, सही दाम पर।", image: "/images/shopfront.jpg" },
    features: [F("rupee", "Honest prices", "Fair rates on every metre."), F("gem", "Top brands", "Raymond, Siyaram's, Donear and more."), F("exchange", "Easy exchange", "No bill? No problem. If it's ours, we change it."), F("ruler", "Expert advice", "We help you pick the right cloth and length.")],
    features_hi: [["सही दाम", "हर मीटर का ईमानदार दाम।"], ["बड़े ब्रांड", "रेमंड, सियाराम्स, डोनियर और भी।"], ["आसान बदली", "बिल नहीं? कोई बात नहीं।"], ["सही सलाह", "सही कपड़ा और नाप चुनने में मदद।"]],
    products: { title: "Choose your fabric", title_hi: "अपना कपड़ा चुनिए", items: [
      P("Suiting", "For weddings and office", "", "", { image: "/images/fabrics/suiting.webp", title_hi: "सूटिंग", text_hi: "शादी और ऑफ़िस के लिए" }),
      P("Shirting", "Plain, check and print", "", "", { image: "/images/fabrics/shirting.webp", title_hi: "शर्टिंग", text_hi: "सादा, चेक और प्रिंट" }),
      P("Kurta-pyjama", "Festive and everyday", "", "", { image: "/images/fabrics/kurta-pyjama.webp", title_hi: "कुर्ता-पायजामा", text_hi: "त्योहार और रोज़ के लिए" }),
      P("Dhoti", "For pooja and weddings", "", "", { image: "/images/fabrics/dhoti.webp", title_hi: "धोती", text_hi: "पूजा और शादी के लिए" }),
      P("Jacket", "Bandhgala, Nehru, blazer", "", "", { image: "/images/fabrics/jacket.webp", title_hi: "जैकेट", text_hi: "बंदगला, नेहरू, ब्लेज़र" }),
      P("Wedding sets", "Complete sets for the groom", "", "New", { title_hi: "शादी के सेट", text_hi: "दूल्हे के लिए पूरा सेट" }),
    ] },
    faq: [Q("Do you stitch too?", "We work with trusted tailors and can arrange stitching. Ask us at the counter."), Q("Can I exchange fabric?", "Yes. If there is any problem with our fabric, bring it back, even without the bill."), Q("Which brands do you have?", "Raymond, Siyaram's, Donear, Ramraj and many more.")],
  },
  {
    id: "fashion", name: "Clothing & boutique", icon: "shirt", look: "modern",
    hero: { title: "Look your best, every day", subtitle: "Handpicked styles for men, women and kids. New arrivals every week at {shop_name}." },
    features: [F("sparkles", "Fresh styles", "New arrivals every week."), F("ruler", "Free alterations", "Perfect fit, on the house."), F("exchange", "Easy exchange", "Within 7 days with the tag."), F("rupee", "Great prices", "Style that suits your budget.")],
    products: { title: "Shop the collection", items: [P("New arrivals", "This week's freshest picks", "", "New"), P("Ethnic wear", "Kurtas, suits and sets"), P("Western wear", "Tops, dresses, denim"), P("Kids", "Comfy and colourful"), P("Party wear", "Stand out at every event"), P("Accessories", "Bags, belts and more")] },
    faq: [Q("Do you offer alterations?", "Yes, free basic alterations on all purchases."), Q("Can I exchange?", "Within 7 days with the tag and bill."), Q("Do you deliver?", "Yes, within {city}. WhatsApp us your order.")],
  },
  {
    id: "saree", name: "Sarees & ethnic wear", icon: "flower", look: "royal",
    hero: { title: "Sarees woven with love", subtitle: "Banarasi, Kanjeevaram, cotton and designer sarees, bridal lehengas and suits." },
    features: [F("gem", "Pure fabrics", "Silk mark and handloom certified."), F("crown", "Bridal specialists", "Complete trousseau under one roof."), F("palette", "Custom blouse", "Designed and stitched for you."), F("truck", "Ships anywhere", "Safe delivery across India.")],
    products: { title: "Our collections", items: [P("Silk sarees", "Banarasi and Kanjeevaram"), P("Bridal lehengas", "For your big day", "", "Bridal"), P("Cotton sarees", "Soft, everyday elegance"), P("Designer suits", "Festive and party wear"), P("Dupattas", "Phulkari, bandhani and more"), P("Kids ethnic", "Little lehengas and kurtas")] },
    faq: [Q("Do you have bridal packages?", "Yes. Book a bridal visit and we will plan the complete trousseau."), Q("Is blouse stitching available?", "Yes, with designer patterns, ready in 5-7 days."), Q("Do you ship outside {city}?", "Yes, anywhere in India.")],
  },
  {
    id: "jewellery", name: "Jewellery", icon: "gem", look: "luxe",
    hero: { title: "Jewellery for every moment", subtitle: "BIS hallmarked gold, certified diamonds and silver, crafted for generations." },
    features: [F("shield", "BIS hallmarked", "100% certified purity."), F("exchange", "Lifetime exchange", "Fair value on old gold."), F("palette", "Custom designs", "Made just for you."), F("rupee", "Low making charges", "Transparent pricing, always.")],
    products: { title: "Explore collections", items: [P("Gold", "Necklaces, bangles, rings"), P("Diamond", "Certified solitaires and sets"), P("Bridal sets", "For the big day", "", "Bridal"), P("Silver", "Gifts, idols and anklets"), P("Daily wear", "Light, elegant, everyday"), P("Men's jewellery", "Chains, kadas and rings")] },
    faq: [Q("Is all gold hallmarked?", "Yes, every piece is BIS hallmarked with HUID."), Q("Do you exchange old gold?", "Yes, at today's rate with transparent testing."), Q("Do you make custom designs?", "Yes. Share a picture and we will craft it.")],
  },
  {
    id: "salon", name: "Salon & beauty", icon: "scissors", look: "fresh",
    hero: { title: "Look good, feel amazing", subtitle: "Hair, skin, makeup and bridal services by trained experts. Walk in or book on WhatsApp." },
    features: [F("sparkles", "Trained experts", "Certified stylists and beauticians."), F("shield", "Hygiene first", "Sanitised tools, fresh towels."), F("gem", "Premium products", "Brands you know and trust."), F("calendar", "Easy booking", "Book in a minute on WhatsApp.")],
    products: { title: "Services & prices", variant: "menu", items: [P("Haircut", "Wash, cut and style", "₹299"), P("Hair colour", "Global or highlights", "₹1,499"), P("Facial", "Glow and cleanup", "₹799"), P("Waxing", "Full arms and legs", "₹499"), P("Party makeup", "HD makeup and hair", "₹2,499"), P("Bridal package", "Pre-bridal and wedding day", "₹14,999")] },
    faq: [Q("Do I need an appointment?", "Walk-ins are welcome; booking on WhatsApp avoids the wait."), Q("Do you do bridal makeup at home?", "Yes, our bridal team can come to you."), Q("Which products do you use?", "Premium professional brands only.")],
  },
  {
    id: "restaurant", name: "Restaurant & café", icon: "food", look: "earthy",
    hero: { title: "Fresh food, made with love", subtitle: "Home-style recipes, fresh ingredients and a warm welcome. Dine in, take away or order on WhatsApp." },
    features: [F("leaf", "Fresh daily", "Cooked fresh every morning."), F("heart", "Family recipes", "Taste that feels like home."), F("truck", "Home delivery", "Hot food at your door."), F("users", "Party orders", "Birthdays, kitty parties and more.")],
    products: { title: "On the menu", variant: "menu", items: [P("Thali", "Dal, sabzi, roti, rice, sweet", "₹180"), P("Paneer butter masala", "Rich, creamy, classic", "₹220"), P("Masala dosa", "Crisp, with chutney and sambar", "₹120"), P("Chole bhature", "A Sunday favourite", "₹140"), P("Cold coffee", "Thick and frothy", "₹90"), P("Gulab jamun", "Two pieces, warm", "₹60")] },
    faq: [Q("Do you deliver?", "Yes, within {city}. Order on WhatsApp or call us."), Q("Do you take party orders?", "Yes, for 20 to 500 guests."), Q("Is the food pure veg?", "Tell your customers here.")],
  },
  {
    id: "sweets", name: "Sweets & bakery", icon: "cake", look: "festive",
    hero: { title: "Sweetness in every bite", subtitle: "Pure ghee mithai, fresh namkeen and cakes for every celebration." },
    features: [F("heart", "Pure ghee", "Made the traditional way."), F("leaf", "Fresh every day", "Nothing kept overnight."), F("gift", "Gift boxes", "For festivals and weddings."), F("cake", "Custom cakes", "Designed for your occasion.")],
    products: { title: "Our specials", items: [P("Kaju katli", "Melt-in-the-mouth classic", "₹1,000/kg"), P("Rasgulla", "Soft and spongy", "₹400/kg"), P("Namkeen", "Crunchy, fresh, spicy"), P("Cakes", "Order any design", "", "Custom"), P("Festive boxes", "Diwali, Rakhi and more", "", "Gift"), P("Dry fruits", "Premium quality")] },
    faq: [Q("Do you take bulk orders?", "Yes, for weddings, festivals and corporate gifting."), Q("Can I order a custom cake?", "Yes. Share the design on WhatsApp a day before."), Q("Do you deliver?", "Yes, within {city}.")],
  },
  {
    id: "clinic", name: "Clinic & doctor", icon: "doctor", look: "minimal",
    hero: { title: "Caring for your family's health", subtitle: "Experienced doctors, modern equipment and gentle care, close to home in {city}." },
    features: [F("doctor", "Experienced doctors", "Years of trusted practice."), F("shield", "Clean and safe", "Strict hygiene at every step."), F("calendar", "Easy appointments", "Call or WhatsApp to book."), F("heart", "Gentle care", "We listen before we treat.")],
    products: { title: "Our services", items: [P("Consultation", "General physician"), P("Health check-ups", "Full body packages"), P("Lab tests", "Reports on the same day"), P("Vaccination", "Children and adults"), P("Minor procedures", "Dressing, stitches and more"), P("Home visits", "For elderly patients")] },
    faq: [Q("Do I need an appointment?", "Booking saves your time. Walk-ins are seen in order."), Q("What are the timings?", "See our opening hours below."), Q("Do you accept cards and UPI?", "Yes.")],
  },
  {
    id: "electronics", name: "Mobiles & electronics", icon: "phone_device", look: "bold",
    hero: { title: "The latest tech, the best price", subtitle: "Smartphones, TVs, appliances and accessories with easy EMI and genuine warranty." },
    features: [F("card", "Easy EMI", "0% EMI on top brands."), F("shield", "Genuine warranty", "100% original products."), F("exchange", "Exchange offers", "Get the best value for your old phone."), F("wrench", "Service support", "We help even after you buy.")],
    products: { title: "Shop by category", items: [P("Smartphones", "All major brands", "", "New"), P("Televisions", "Smart, 4K, OLED"), P("Appliances", "ACs, fridges, washing machines"), P("Laptops", "Work, study, gaming"), P("Accessories", "Chargers, cases, earphones"), P("Audio", "Speakers and soundbars")] },
    faq: [Q("Do you offer EMI?", "Yes, on cards and with Bajaj Finserv and more."), Q("Do you take exchange?", "Yes. Bring your old phone for an instant quote."), Q("Are products original?", "Always. With full brand warranty.")],
  },
  {
    id: "furniture", name: "Furniture & home", icon: "sofa", look: "earthy",
    hero: { title: "Furniture that feels like home", subtitle: "Sofas, beds, dining and décor in solid wood and modern designs, delivered and fitted." },
    features: [F("leaf", "Solid wood", "Built to last for years."), F("palette", "Custom sizes", "Made to fit your space."), F("truck", "Free delivery", "Delivered and fitted in {city}."), F("card", "Easy EMI", "Make home now, pay slowly.")],
    products: { title: "Explore rooms", items: [P("Living room", "Sofas, tables, TV units"), P("Bedroom", "Beds, wardrobes, dressers"), P("Dining", "Sets for 4, 6 and 8"), P("Office", "Desks and chairs"), P("Décor", "Lamps, mirrors, rugs"), P("Mattresses", "Sleep better", "", "New")] },
    faq: [Q("Do you make custom furniture?", "Yes, in your size, wood and finish."), Q("Is delivery free?", "Yes, within {city}, with fitting."), Q("Is there a warranty?", "Yes, on every product.")],
  },
  {
    id: "auto", name: "Car & bike showroom", icon: "car", look: "bold",
    hero: { title: "Drive home your dream today", subtitle: "New models, easy finance and test drives at your doorstep." },
    features: [F("car", "Test drive at home", "Book in one message."), F("card", "Easy finance", "Low down payment, quick approval."), F("exchange", "Exchange bonus", "Best price for your old vehicle."), F("wrench", "Trusted service", "Authorised service centre.")],
    products: { title: "Popular models", items: [P("Hatchback", "Smart city driving", "From ₹5.5 lakh"), P("Sedan", "Comfort for the family", "From ₹8 lakh"), P("SUV", "Tough and tall", "From ₹10 lakh", "Hot"), P("Electric", "Save on every km", "", "New")] },
    faq: [Q("Can I book a test drive?", "Yes, at the showroom or at home. Just message us."), Q("Do you arrange loans?", "Yes, with all major banks."), Q("Do you take exchange?", "Yes, with an on-the-spot valuation.")],
  },
  {
    id: "gym", name: "Gym & fitness", icon: "gym", look: "bold",
    hero: { title: "Stronger every day", subtitle: "Modern equipment, certified trainers and a community that keeps you going." },
    features: [F("gym", "Modern equipment", "Cardio, strength and functional."), F("users", "Certified trainers", "Plans made for your goal."), F("clock", "Open early, close late", "Train when it suits you."), F("heart", "Diet guidance", "Food plans that work.")],
    products: { title: "Membership plans", variant: "menu", items: [P("Monthly", "Full gym access", "₹1,500"), P("Quarterly", "Save 10%", "₹4,000"), P("Yearly", "Best value", "₹12,000"), P("Personal training", "One-on-one, monthly", "₹6,000")] },
    faq: [Q("Is there a free trial?", "Yes, one free session. WhatsApp us to book."), Q("Are there separate timings for women?", "Tell your members here."), Q("Do you have trainers?", "Yes, certified trainers on every shift.")],
  },
  {
    id: "grocery", name: "Kirana & supermarket", icon: "package", look: "fresh",
    hero: { title: "Everything for your home, delivered", subtitle: "Groceries, fresh produce and daily needs at the best prices in {city}." },
    features: [F("truck", "Free home delivery", "On orders above ₹500."), F("leaf", "Fresh produce", "Fruits and vegetables daily."), F("rupee", "Best prices", "Daily offers and combos."), F("chat", "Order on WhatsApp", "Send your list, we pack it.")],
    products: { title: "What we stock", items: [P("Atta, rice & dal", "Staples for every kitchen"), P("Fruits & vegetables", "Fresh every morning"), P("Dairy", "Milk, paneer, curd"), P("Snacks", "Biscuits, namkeen, chips"), P("Personal care", "Soaps, shampoo and more"), P("Household", "Cleaning and home needs")] },
    faq: [Q("How do I order?", "Send your list on WhatsApp. We confirm the total and deliver."), Q("Is delivery free?", "Free on orders above ₹500 within {city}."), Q("Do you take UPI?", "Yes, UPI, cards and cash.")],
  },
  {
    id: "services", name: "Coaching & services", icon: "book", look: "modern",
    hero: { title: "Results you can count on", subtitle: "Experienced teachers, small batches and personal attention at {shop_name}." },
    features: [F("award", "Proven results", "Toppers every year."), F("users", "Small batches", "Every student gets attention."), F("book", "Study material", "Notes and test series included."), F("calendar", "Flexible timings", "Morning and evening batches.")],
    products: { title: "Courses", items: [P("Class 9-10", "All subjects, board focus"), P("Class 11-12", "Science and commerce"), P("Competitive exams", "JEE, NEET, CUET"), P("Spoken English", "Speak with confidence"), P("Computer courses", "Basics to advanced"), P("Crash courses", "Before exams")] },
    faq: [Q("Is there a demo class?", "Yes, attend a free demo before joining."), Q("What is the batch size?", "Small batches of 15-20 students."), Q("Are there tests?", "Weekly tests with progress reports for parents.")],
  },
];

export const VIBES = [
  { id: "traditional", name: "Traditional & warm", desc: "Rich colours, arches, a heritage feel", looks: ["heritage", "festive", "royal", "earthy"] },
  { id: "modern", name: "Modern & clean", desc: "Crisp, simple, lots of white space", looks: ["modern", "minimal", "fresh"] },
  { id: "luxury", name: "Luxury & premium", desc: "Dark, elegant, big photos", looks: ["luxe", "heritage", "minimal"] },
  { id: "fun", name: "Bold & playful", desc: "Loud colours, big type, energy", looks: ["bold", "playful", "fresh", "festive"] },
];

// Section layouts that suit each vibe. `alt` gives a second arrangement, for
// "Try another layout".
const LAYOUTS = {
  traditional: [
    ["header", "classic"], ["hero", "arch"], ["features", "icons", "tint"], ["products", "arches"], ["about", "side"],
    ["offer", "ticket", "brand"], ["testimonials", "cards", "tint"], ["faq", "accordion"], ["contact", "split"], ["footer", "columns", "dark"],
  ],
  modern: [
    ["header", "classic"], ["hero", "split"], ["stats", "row"], ["features", "cards", "tint"], ["products", "cards"],
    ["gallery", "grid"], ["testimonials", "cards", "tint"], ["faq", "accordion"], ["cta", "card"], ["contact", "cards"], ["footer", "simple", "dark"],
  ],
  luxury: [
    ["header", "centered", "page", { transparent: true }], ["hero", "fullbleed"], ["about", "quote"], ["products", "overlay"],
    ["gallery", "masonry"], ["testimonials", "spotlight", "tint"], ["cta", "band", "dark"], ["contact", "bigmap"], ["footer", "giant", "dark"],
  ],
  fun: [
    ["announce", "marquee", "brand"], ["header", "minimal"], ["hero", "poster"], ["features", "bento"], ["products", "scroll"],
    ["offer", "banner", "brand"], ["testimonials", "wall", "tint"], ["faq", "columns"], ["cta", "card"], ["contact", "compact"], ["footer", "simple", "dark"],
  ],
};
const ALT = {
  hero: { arch: "collage", split: "centered", fullbleed: "split", poster: "centered", collage: "arch", centered: "split" },
  products: { arches: "cards", cards: "scroll", overlay: "arches", scroll: "overlay" },
  features: { icons: "list", cards: "bento", bento: "cards", list: "icons" },
  about: { side: "timeline", quote: "side", timeline: "side" },
  testimonials: { cards: "spotlight", spotlight: "cards", wall: "cards" },
  contact: { split: "cards", cards: "split", bigmap: "split", compact: "split" },
  footer: { columns: "simple", simple: "columns", giant: "columns" },
  gallery: { grid: "mosaic", masonry: "grid", mosaic: "masonry" },
};

// Fill a section's content from the pack.
function contentFor(type, pack, goal) {
  const def = { ...newSection(type).content };
  const cta = goal === "visit" ? "directions" : goal || "whatsapp";
  const second = cta === "directions" ? "call" : "directions";
  switch (type) {
    case "header": return { ...def, cta };
    case "hero": return { ...def, ...pack.hero, cta, cta2: second, show_hours: true, show_rating: true };
    case "features": {
      const items = pack.features.map((f, i) => (pack.features_hi ? { ...f, title_hi: pack.features_hi[i][0], text_hi: pack.features_hi[i][1] } : f));
      return { ...def, items, ...(pack.id === "textile" ? { kicker_hi: "क्यों हम", title_hi: "परिवार हमें क्यों चुनते हैं" } : {}) };
    }
    case "products": return { ...def, title: pack.products.title, ...(pack.products.title_hi ? { title_hi: pack.products.title_hi } : {}), items: pack.products.items, enquire: true };
    case "faq": return { ...def, items: pack.faq };
    case "cta": return { ...def, cta, cta2: second };
    case "offer": return { ...def, cta: "whatsapp" };
    default: return def;
  }
}

// A complete website config from the quiz answers / pack choice.
export function buildSite({ pack: packId = "fashion", vibe = "modern", look, theme = {}, goal = "whatsapp", alt = false }) {
  const pack = PACKS.find((p) => p.id === packId) || PACKS[0];
  const lookTheme = (LOOKS.find((l) => l.id === (look || pack.look)) || LOOKS[2]).theme;
  const rows = LAYOUTS[vibe] || LAYOUTS.modern;
  const sections = rows.map(([type, variant, tone, extra]) => {
    const v = alt && ALT[type] && ALT[type][variant] ? ALT[type][variant] : variant;
    let use = v;
    // Price lists read best as a list, whatever the vibe.
    if (type === "products" && pack.products.variant === "menu") use = "menu";
    const s = newSection(type, use, { ...contentFor(type, pack, goal), ...(extra || {}) });
    if (tone) s.style = { tone };
    return s;
  });
  return {
    theme: { ...lookTheme, ...theme },
    settings: { whatsapp_button: goal === "whatsapp", call_bar: goal === "call" || goal === "visit", language_switch: true, default_lang: "en", seo_title: "", seo_description: "" },
    sections,
  };
}

// A minimal website to start from scratch.
export function blankSite() {
  return {
    theme: { ...LOOKS[2].theme },
    settings: { whatsapp_button: true, call_bar: true, language_switch: true, default_lang: "en" },
    sections: [newSection("header"), newSection("hero"), newSection("contact"), newSection("footer")],
  };
}
