"""Every WhatsApp message text the app can send. This file is the only source.

Two kinds of text live here:
- TEMPLATES: business-initiated messages that Meta must approve first. They are
  submitted by `scripts/whatsapp_setup.py` and cannot be edited in the app.
- FREE_FORM: plain messages, only sent inside the 24-hour customer service
  window (after the customer has messaged us).

Nothing shop-specific is written here: shop name, address, phone and links are
variables filled from the shop profile, so the same text works for every shop.

Variables are written {{name}} (Meta "named parameters"). Meta rejects a body
that starts or ends with a variable or is mostly variables, so each text keeps
enough fixed words around them.
"""
import re
from typing import Dict, List, Optional

LANGUAGES = ("english", "hindi", "hinglish")

# Meta has no Hinglish language code: Hinglish versions are submitted under
# "en" with a "_hinglish" name suffix.
_META_LANG = {"english": "en", "hindi": "hi", "hinglish": "en"}
_NAME_SUFFIX = {"english": "", "hindi": "", "hinglish": "_hinglish"}

FOOTER = "Powered by Countr OS"

# Example values sent to Meta with each template and used in the preview.
SAMPLE_VARS = {
    "customer_name": "Ravi", "shop_name": "Your Shop", "shop_address": "Main Market, Your City",
    "shop_phone": "+91 98765 43210", "date": "03 Oct 2026", "total": "4500", "discount": "500",
    "paid": "4000", "sessions": "12", "tryons": "34", "purchases": "5", "conversion": "42",
    "sales": "21500", "discounts": "1500", "top_garments": "Kurta, Trousers",
    "look_no": "3", "title": "Kurta + Pyjama", "details": "Top + Bottom",
}

# Template header kinds: None (no header) or "image".
TEMPLATES: Dict[str, Dict] = {
    "session_welcome": {
        "category": "UTILITY", "header": None, "phase": 1,
        "body": {
            "english": (
                "Hi {{customer_name}}, welcome to {{shop_name}}! Your virtual try-on session has "
                "started. Tap the button below and we will send every look you try on right here "
                "on WhatsApp."),
            "hindi": (
                "नमस्ते {{customer_name}}, {{shop_name}} में आपका स्वागत है! आपका वर्चुअल ट्राई-ऑन "
                "सेशन शुरू हो गया है। नीचे दिया बटन दबाएं, आप जो भी लुक ट्राई करेंगे वह यहीं "
                "WhatsApp पर भेज दिया जाएगा।"),
            "hinglish": (
                "Namaste {{customer_name}}, {{shop_name}} mein aapka swagat hai! Aapka virtual "
                "try-on session shuru ho gaya hai. Neeche diya button dabayein, aap jo bhi look "
                "try karenge woh yahin WhatsApp par bhej diya jayega."),
        },
        "buttons": [{"type": "QUICK_REPLY", "text": {
            "english": "Send my looks", "hindi": "मेरे लुक्स भेजें", "hinglish": "Mere looks bhejein"}}],
    },
    "purchase_receipt": {
        "category": "UTILITY", "header": None, "phase": 1,
        "body": {
            "english": (
                "Hi {{customer_name}}, thank you for shopping at {{shop_name}}!\n\n"
                "Purchase summary\nDate: {{date}}\nTotal: ₹{{total}}\nDiscount: ₹{{discount}}\n"
                "Amount paid: ₹{{paid}}\n\nVisit us: {{shop_address}}\nCall us: {{shop_phone}}\n\n"
                "We look forward to seeing you again."),
            "hindi": (
                "नमस्ते {{customer_name}}, {{shop_name}} से खरीदारी करने के लिए धन्यवाद!\n\n"
                "खरीदारी का विवरण\nतारीख: {{date}}\nकुल राशि: ₹{{total}}\nछूट: ₹{{discount}}\n"
                "भुगतान: ₹{{paid}}\n\nपता: {{shop_address}}\nफ़ोन: {{shop_phone}}\n\n"
                "आपसे फिर मिलने का इंतज़ार रहेगा।"),
            "hinglish": (
                "Namaste {{customer_name}}, {{shop_name}} se kharidari karne ke liye dhanyavaad!\n\n"
                "Kharidari ka vivaran\nTareekh: {{date}}\nTotal: ₹{{total}}\nDiscount: ₹{{discount}}\n"
                "Bhugtan: ₹{{paid}}\n\nPata: {{shop_address}}\nPhone: {{shop_phone}}\n\n"
                "Aapse phir milne ka intezaar rahega."),
        },
        "buttons": [],
    },
    "followup_looks": {
        "category": "MARKETING", "header": "image", "phase": 2,
        "body": {
            "english": (
                "Hi {{customer_name}}, here are the looks you tried at {{shop_name}} today. "
                "Liked one of them? Come back anytime to see the fabrics in person."),
            "hindi": (
                "नमस्ते {{customer_name}}, ये हैं वो लुक्स जो आपने आज {{shop_name}} में ट्राई किए। "
                "कोई पसंद आया? कपड़ा खुद देखने के लिए कभी भी दुकान पर आएं।"),
            "hinglish": (
                "Namaste {{customer_name}}, yeh rahe woh looks jo aapne aaj {{shop_name}} mein "
                "try kiye. Koi pasand aaya? Kapda khud dekhne ke liye kabhi bhi dukaan par aayein."),
        },
        "buttons": [{"type": "URL", "link": "map", "text": {
            "english": "Get directions", "hindi": "रास्ता देखें", "hinglish": "Rasta dekhein"}}],
    },
    "review_request": {
        "category": "MARKETING", "header": None, "phase": 2,
        "body": {
            "english": (
                "Hi {{customer_name}}, thank you for choosing {{shop_name}}! How was your "
                "experience? A quick Google review helps us a lot and takes less than a minute."),
            "hindi": (
                "नमस्ते {{customer_name}}, {{shop_name}} को चुनने के लिए धन्यवाद! आपका अनुभव कैसा "
                "रहा? एक छोटा सा Google रिव्यू हमारी बहुत मदद करता है और एक मिनट से कम लगता है।"),
            "hinglish": (
                "Namaste {{customer_name}}, {{shop_name}} ko chunne ke liye dhanyavaad! Aapka "
                "anubhav kaisa raha? Ek chhota sa Google review humari bahut madad karta hai aur "
                "ek minute se kam lagta hai."),
        },
        "buttons": [{"type": "URL", "link": "review", "text": {
            "english": "Leave a review", "hindi": "रिव्यू दें", "hinglish": "Review dein"}}],
    },
    "share_your_look": {
        "category": "MARKETING", "header": None, "phase": 3,
        "body": {
            "english": (
                "Hi {{customer_name}}, we hope you are enjoying your new outfit from {{shop_name}}! "
                "We would love to see how it turned out. Just reply to this message with a photo."),
            "hindi": (
                "नमस्ते {{customer_name}}, उम्मीद है {{shop_name}} से लिया आपका नया आउटफिट आपको पसंद "
                "आ रहा है! हम देखना चाहेंगे कि वह कैसा बना। बस इस मैसेज के जवाब में एक फ़ोटो भेजें।"),
            "hinglish": (
                "Namaste {{customer_name}}, umeed hai {{shop_name}} se liya aapka naya outfit aapko "
                "pasand aa raha hai! Hum dekhna chahenge ki woh kaisa bana. Bas is message ke "
                "jawab mein ek photo bhejein."),
        },
        "buttons": [],
    },
    # Win-back comes in two versions because a template's header is fixed: one
    # plain, one with the image the super admin uploads.
    "winback_new_arrivals": {
        "category": "MARKETING", "header": None, "phase": 3,
        "body": {
            "english": (
                "Hi {{customer_name}}, it has been a while! New fabrics have arrived at "
                "{{shop_name}}. Visit us to try them on virtually before you buy."),
            "hindi": (
                "नमस्ते {{customer_name}}, काफ़ी समय हो गया! {{shop_name}} में नए कपड़े आए हैं। "
                "खरीदने से पहले उन्हें वर्चुअली ट्राई करने ज़रूर आएं।"),
            "hinglish": (
                "Namaste {{customer_name}}, kaafi samay ho gaya! {{shop_name}} mein naye kapde aaye "
                "hain. Kharidne se pehle unhe virtually try karne zaroor aayein."),
        },
        "buttons": [{"type": "URL", "link": "map", "text": {
            "english": "Get directions", "hindi": "रास्ता देखें", "hinglish": "Rasta dekhein"}}],
    },
    "winback_new_arrivals_img": {
        "category": "MARKETING", "header": "image", "phase": 3,
        "body": None,  # same body as winback_new_arrivals
        "same_as": "winback_new_arrivals",
        "buttons": None,
    },
    "birthday_wish": {
        "category": "MARKETING", "header": None, "phase": 3,
        "body": {
            "english": (
                "Happy birthday, {{customer_name}}! Warm wishes from all of us at {{shop_name}}. "
                "May the year ahead bring you joy and good health."),
            "hindi": (
                "जन्मदिन की हार्दिक शुभकामनाएं, {{customer_name}}! {{shop_name}} परिवार की ओर से "
                "ढेर सारी बधाई। आने वाला साल आपके लिए खुशियां और अच्छी सेहत लाए।"),
            "hinglish": (
                "Janamdin ki hardik shubhkamnayein, {{customer_name}}! {{shop_name}} parivaar ki "
                "taraf se dher saari badhai. Aane wala saal aapke liye khushiyan aur achhi sehat laye."),
        },
        "buttons": [],
    },
    "daily_summary": {
        "category": "UTILITY", "header": None, "phase": 2,
        "body": {
            "english": (
                "Daily report for {{shop_name}} on {{date}}.\n\nSessions: {{sessions}}\n"
                "Try-ons: {{tryons}}\nPurchases: {{purchases}} ({{conversion}}% conversion)\n"
                "Sales: ₹{{sales}}\nDiscounts given: ₹{{discounts}}\nMost tried: {{top_garments}}\n\n"
                "This is your automatic end-of-day summary."),
            "hindi": (
                "दैनिक रिपोर्ट: {{shop_name}}, तारीख {{date}}।\n\nसेशन: {{sessions}}\n"
                "ट्राई-ऑन: {{tryons}}\nखरीदारी: {{purchases}} ({{conversion}}% कन्वर्ज़न)\n"
                "बिक्री: ₹{{sales}}\nदी गई छूट: ₹{{discounts}}\nसबसे ज़्यादा ट्राई: {{top_garments}}\n\n"
                "यह आपकी दिन के अंत की स्वचालित रिपोर्ट है।"),
            "hinglish": (
                "Daily report {{shop_name}} ki, tareekh {{date}}.\n\nSessions: {{sessions}}\n"
                "Try-ons: {{tryons}}\nKharidari: {{purchases}} ({{conversion}}% conversion)\n"
                "Bikri: ₹{{sales}}\nDiya gaya discount: ₹{{discounts}}\nSabse zyada try: {{top_garments}}\n\n"
                "Yeh aapki din ke ant ki automatic report hai."),
        },
        "buttons": [],
    },
}

# Free-form messages: only sent inside the 24-hour window. Not submitted to Meta.
FREE_FORM: Dict[str, Dict[str, str]] = {
    "welcome_ack": {
        "english": "Great! Your looks will appear here.",
        "hindi": "बढ़िया! आपके लुक्स यहीं आएंगे।",
        "hinglish": "Badhiya! Aapke looks yahin aayenge.",
    },
    # Sent instead of the paid welcome template when the window is already open.
    "welcome_open": {
        "english": "Hi {{customer_name}}, welcome to {{shop_name}}! Your try-on looks will appear here.",
        "hindi": "नमस्ते {{customer_name}}, {{shop_name}} में आपका स्वागत है! आपके ट्राई-ऑन लुक्स यहीं आएंगे।",
        "hinglish": "Namaste {{customer_name}}, {{shop_name}} mein aapka swagat hai! Aapke try-on looks yahin aayenge.",
    },
    "look_caption": {
        "english": "Look #{{look_no}} — {{title}}\n{{details}}\n— {{shop_name}}",
        "hindi": "लुक #{{look_no}} — {{title}}\n{{details}}\n— {{shop_name}}",
        "hinglish": "Look #{{look_no}} — {{title}}\n{{details}}\n— {{shop_name}}",
    },
    "stop_confirm": {
        "english": ("You have been unsubscribed and will not get any more messages from "
                    "{{shop_name}}. Reply START anytime to subscribe again."),
        "hindi": ("आपको अनसब्सक्राइब कर दिया गया है, अब {{shop_name}} से कोई मैसेज नहीं आएगा। "
                  "दोबारा जुड़ने के लिए कभी भी START लिखें।"),
        "hinglish": ("Aapko unsubscribe kar diya gaya hai, ab {{shop_name}} se koi message nahi "
                     "aayega. Dobara judne ke liye kabhi bhi START likhein."),
    },
    "start_confirm": {
        "english": "Welcome back! You will get messages from {{shop_name}} again. Reply STOP anytime to unsubscribe.",
        "hindi": "फिर से स्वागत है! अब आपको {{shop_name}} से मैसेज मिलेंगे। बंद करने के लिए कभी भी STOP लिखें।",
        "hinglish": "Phir se swagat hai! Ab aapko {{shop_name}} se messages milenge. Band karne ke liye kabhi bhi STOP likhein.",
    },
    "auto_reply": {
        "english": ("Thanks for your message! This number only sends try-on looks and updates. "
                    "For help please call {{shop_phone}}."),
        "hindi": "आपके मैसेज के लिए धन्यवाद! इस नंबर से सिर्फ़ ट्राई-ऑन लुक्स और अपडेट भेजे जाते हैं। मदद के लिए {{shop_phone}} पर कॉल करें।",
        "hinglish": ("Aapke message ke liye dhanyavaad! Is number se sirf try-on looks aur updates "
                     "bheje jaate hain. Madad ke liye {{shop_phone}} par call karein."),
    },
    # Prefilled in the wa.me link behind the shop's backup QR code (printed at
    # the counter). The customer is matched to their session by phone number.
    "qr_prefill": {
        "english": "Hi! Please send my try-on looks.",
        "hindi": "नमस्ते! कृपया मेरे ट्राई-ऑन लुक्स भेजें।",
        "hinglish": "Namaste! Please mere try-on looks bhejein.",
    },
}

_VAR = re.compile(r"\{\{(\w+)\}\}")


def check_language(lang: str) -> str:
    return lang if lang in LANGUAGES else "hinglish"


def variables(text: str) -> List[str]:
    """Variable names in order of first appearance."""
    seen = []
    for name in _VAR.findall(text or ""):
        if name not in seen:
            seen.append(name)
    return seen


def fill(text: str, values: Dict[str, object]) -> str:
    return _VAR.sub(lambda m: str(values.get(m.group(1), m.group(0))), text)


def _spec(name: str) -> Dict:
    t = TEMPLATES[name]
    if t.get("same_as"):
        base = TEMPLATES[t["same_as"]]
        t = {**t, "body": base["body"], "buttons": base["buttons"]}
    return t


def body(name: str, lang: str) -> str:
    return _spec(name)["body"][check_language(lang)]


def meta_name(name: str, lang: str) -> str:
    return name + _NAME_SUFFIX[check_language(lang)]


def meta_language(lang: str) -> str:
    return _META_LANG[check_language(lang)]


def render(name: str, lang: str, values: Dict[str, object]) -> Dict:
    """Template as the customer will see it (for previews and the message log)."""
    t = _spec(name)
    lang = check_language(lang)
    return {
        "name": name, "meta_name": meta_name(name, lang), "language": meta_language(lang),
        "category": t["category"], "header": t["header"], "phase": t["phase"],
        "body": fill(t["body"][lang], values), "footer": FOOTER,
        "buttons": [{"type": b["type"], "text": b["text"][lang]} for b in t["buttons"]],
    }


def free_text(key: str, lang: str, values: Dict[str, object]) -> str:
    return fill(FREE_FORM[key][check_language(lang)], values)


def submission(name: str, lang: str, base_url: str, header_handle: Optional[str] = None) -> Dict:
    """Payload for POST /{waba_id}/message_templates (named parameters)."""
    t = _spec(name)
    lang = check_language(lang)
    text = t["body"][lang]
    comps: List[Dict] = []
    if t["header"] == "image":
        comps.append({"type": "HEADER", "format": "IMAGE",
                      "example": {"header_handle": [header_handle or ""]}})
    comps.append({"type": "BODY", "text": text, "example": {"body_text_named_params": [
        {"param_name": v, "example": SAMPLE_VARS.get(v, v)} for v in variables(text)]}})
    comps.append({"type": "FOOTER", "text": FOOTER})
    buttons = []
    for b in t["buttons"]:
        if b["type"] == "QUICK_REPLY":
            buttons.append({"type": "QUICK_REPLY", "text": b["text"][lang]})
        else:
            # One fixed base URL; the link kind is the dynamic suffix, e.g.
            # https://app.example.com/r/review
            base = base_url.rstrip("/") + "/r/"
            buttons.append({"type": "URL", "text": b["text"][lang], "url": base + "{{1}}",
                            "example": [base + b["link"]]})
    if buttons:
        comps.append({"type": "BUTTONS", "buttons": buttons})
    return {"name": meta_name(name, lang), "language": meta_language(lang),
            "category": t["category"], "parameter_format": "NAMED", "components": comps}


def _param_text(value) -> str:
    # Meta rejects parameter text with new lines, tabs or runs of spaces.
    text = re.sub(r"\s+", " ", str(value if value is not None else "")).strip()
    return text[:1000] or "-"


def send_components(name: str, lang: str, values: Dict[str, object],
                    media_id: Optional[str] = None, payload: str = "") -> List[Dict]:
    """`components` for sending the template with these values."""
    t = _spec(name)
    lang = check_language(lang)
    comps: List[Dict] = []
    if t["header"] == "image":
        comps.append({"type": "header", "parameters": [{"type": "image", "image": {"id": media_id}}]})
    comps.append({"type": "body", "parameters": [
        {"type": "text", "parameter_name": v, "text": _param_text(values.get(v))}
        for v in variables(t["body"][lang])]})
    for i, b in enumerate(t["buttons"]):
        if b["type"] == "QUICK_REPLY":
            comps.append({"type": "button", "sub_type": "quick_reply", "index": str(i),
                          "parameters": [{"type": "payload", "payload": payload or name.upper()}]})
        else:
            comps.append({"type": "button", "sub_type": "url", "index": str(i),
                          "parameters": [{"type": "text", "text": b["link"]}]})
    return comps
