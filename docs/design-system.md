# Design system: Countr OS admin app

Every screen of the admin web app (`frontend/src/admin/*`) follows this guide.
Read it before adding or changing UI, and reuse what is already here instead of
inventing new styles. The public home page (`pages/Landing.js`) and the shop
display screen (`pages/Display.js`) are separate and do not follow it.

**Source of truth in code**

| What | Where |
|---|---|
| Colour, font, shadow tokens | `frontend/tailwind.config.js` (`brand`, `canvas`, `font-ui`, `shadow-card/lift/pop`) |
| Global admin styles (font, focus ring, skeleton, reduced motion) | `frontend/src/index.css` (`.font-admin`, `.num`, `.skeleton`) |
| Shared components | `frontend/src/admin/ui.js` |
| All visible text (English, Hindi, Hinglish) | `frontend/src/i18n.js` |

---

## 1. Principles

1. **Staff first, phone first.** Staff use the app standing at the counter, one-handed. The main action on a screen sits within thumb reach. Desktop (the owner) gets more room, not a different app.
2. **Content is the hero.** Try-on images, customer photos and money are what people look at. The interface stays quiet around them.
3. **One way to do each thing.** One accent colour, one sheet, one button family, one tile pattern. If you need something new, add it to `ui.js` and to this file.
4. **Never leave people guessing.** Every list has a loading state, an empty state with the next step, and errors in plain words.

## 2. Colour

One accent: the **Countr OS green** from the logo. Neutrals are Tailwind `gray`.

| Token | Hex | Use |
|---|---|---|
| `brand-50` | `#ECFBF1` | Selected/active backgrounds (sidebar item, chips, icon tiles) |
| `brand-100` / `200` | `#D2F5DE` / `#A6EBBF` | Hover borders, soft fills |
| `brand-500` | `#1BC152` | Logo green: focus ring, small highlights. **Not for text on white** (too light) |
| `brand-600` | `#04AE3E` | Decorative accents only |
| `brand-700` | `#007F47` | **Primary buttons, links, active tab text.** White text on it passes WCAG AA |
| `brand-800` | `#046539` | Primary button hover |
| `brand-900` | `#063424` | Logo ink: wordmark, dark overlays |
| `canvas` | `#F5F7F6` | Page background behind cards |
| `white` | | Cards, sheets, inputs |
| `gray-900` / `700` / `600` | | Headings / body / secondary text |
| `gray-500` | | Placeholder text, icons. Do not go lighter for readable text |

**Meaning colours (only for their meaning):** `emerald` = money and WhatsApp delivered; `red` = delete, failed, errors; `amber` = waiting or warning; `pink` = birthday; `sky` = new customer. Never use them as decoration.

Rules: no second accent colour. No gradients except dark scrims over photos. No pure `#000`.

## 3. Typography

- **UI font:** Geist (`.font-admin` on the app root). **Numbers:** add the `num` class for tabular figures (money, counts, phone numbers).
- **Shop wordmark:** "Somani Fabs" in Playfair Display, colour `brand-900`. It is the shop's logo: do not restyle it.

| Role | Classes |
|---|---|
| Page title | `text-2xl lg:text-[28px] font-semibold tracking-tight` (via `PageHeader`) |
| Section / card title | `text-[15px] font-semibold text-gray-900` |
| Body | `text-[15px]` or `text-sm text-gray-700` |
| Secondary | `text-sm text-gray-600` |
| Caption / meta | `text-xs text-gray-600` |
| Field label | `text-sm font-medium text-gray-800` (above the input, never a placeholder-as-label) |

No uppercase letter-spaced "eyebrow" labels above headings.

## 4. Shape, space, elevation

- **Radius rule:** cards, sheets, tiles and images = `rounded-2xl`; buttons and inputs = `rounded-xl`; badges, chips and avatars = `rounded-full`.
- **Spacing:** page padding comes from `Page` (`px-4 py-5` on phones, `lg:px-10 lg:py-9`). Gaps between cards `gap-3 lg:gap-4`. Card padding `p-4` / `p-5`.
- **Heights:** inputs and medium buttons `h-11` (44px touch target), small buttons `h-9`, large `h-12`.
- **Shadows:** `shadow-card` on resting cards, `shadow-lift` on hover / floating actions, `shadow-pop` on sheets and menus. Borders are `border-gray-200/80`.

## 5. Layout and navigation

- **Desktop (`lg`, 1024px+):** fixed left sidebar (256px).
  - **Live Shop** comes first and stands apart: a large filled button with a pulsing live dot. It is the day-to-day work screen (sessions on the shop floor); everything else is secondary.
  - Then *Insights* (Statistics, Customer Database, Session History) and *Setup* (Catalog, Admins, Marketing, More Settings), filtered by the admin's permissions.
  - The user (name and role) and logout sit at the bottom. There is no language picker here: the language is a shop setting (More Settings > Language).
- **Phones and tablets:** sticky top bar (back arrow, page title, settings, logout). Settings shows a horizontal tab strip; its ‹ › arrows **slide the strip**, tapping a tab opens it.
- **Three levels, always shown the same way** (`ui.js`):
  1. **Area**: sidebar item / phone tab (e.g. Marketing). Header: `PageHeader`.
  2. **Hub tile** (e.g. WhatsApp): `HubPage` shows tiles; opening one shows a `SubHeader`: back button, breadcrumb "Marketing › WhatsApp", then the title with its icon.
  3. **Sections** inside it (e.g. Connection, Templates): `UnderlineTabs` directly under the SubHeader. Never pills for navigation.
  Content cards below do not repeat the section name as their title.
- **Main action within thumb reach:** on phones, the primary action of a screen (New Session, New Try-On) is a full-width button fixed to the bottom. On desktop it sits in the page header.
- **Session page:** desktop has two columns (customer, history and WhatsApp on the left at 320px; try-on gallery on the right). Phones stack them.
- **Language:** one shop-wide setting stored on the server, applied at sign-in for everyone. The public home page is always English.
- **Multi-column layouts** must say what happens below `lg` / `sm` in the same component.

## 6. Components (`admin/ui.js`)

| Component | Use it for |
|---|---|
| `Page` | Wrapper for every screen's content |
| `PageHeader` | Title, one-line subtitle, actions on the right |
| `Card`, `CardHeader` | Grouped content. `CardHeader` takes an icon, title, subtitle and actions |
| `Button` | `primary` (one per area), `secondary`, `ghost`, `soft`, `danger`, `dangerSoft`, `success`; sizes `sm` / `md` / `lg`; `icon`, `loading`, `full` |
| `IconButton` | Icon-only actions. Always pass `label` (it becomes the accessible name) |
| `Field` + `inputCls` / `selectCls` | Label above input, hint or error below |
| `Sheet` | **Every form and detail pop-up.** Bottom sheet on phones, dialog from `sm`. Sizes `sm` / `md` / `lg` / `xl`. Put the main button in `footer`. `locked` while saving |
| `Segmented` | 2 to 5 mutually exclusive options (date ranges, yes/no, types) |
| `Toggle` | On/off settings that save immediately |
| `Badge` | Status and small facts. Tones: `gray`, `brand`, `green`, `amber`, `red`, `pink`, `sky` |
| `Stat` | One number with a label (Statistics, KPIs) |
| `HubPage` (`Tiles`, `SubHeader`) | **Hub screens**: Catalog, Marketing, More Settings. One tile per area; a tile opens its screen under a `SubHeader` (back + breadcrumb) |
| `UnderlineTabs` | Sections inside a hub screen (level 3) |
| `Empty` | Empty states: icon, short title, one sentence, the action that fills it |
| `Skeleton` | Loading placeholders shaped like the final content (no spinners for page loads) |

Avatars use `admin/Avatar.js` (customer photo or a silhouette).

## 7. Patterns

- **Hub with tiles:** when a Settings area holds several unrelated settings, make it a hub (`Tiles`) rather than one long page. Each tile: icon, title, one-line description, optional `Badge` (count or status).
- **Lists:** tables on desktop (`md:table`), simple rows on phones. Rows are clickable when they open something.
- **Forms:** open in a `Sheet`. Validate on submit with a toast in plain words. Keep the user's input after an error.
- **Destructive actions:** `IconButton` with `Trash2` and red hover, plus a `window.confirm`. Never a big red button for normal flows (End Session is `secondary`).
- **Money:** `₹` + Indian grouping (`toLocaleString("en-IN")`) + `num`. Revenue in `emerald-700`.
- **Dates and times:** always Indian time (`timeZone: "Asia/Kolkata"`). Relative times ("4 days ago") where recency matters.

## 8. States and feedback

- **Loading:** `Skeleton` blocks the size of the real content.
- **Empty:** `Empty` with the next step ("Start a session when a customer walks in").
- **Errors:** `toast.error(apiErr(e))` for actions; inline red text under a field for form validation. Messages are short and say what to do.
- **Success:** a short toast ("Saved", "Sent"). No toast for routine navigation.
- **Pressed:** buttons scale to 98% on press. Hover lifts cards by 2px.

## 9. Motion

Short and purposeful: sheets slide up (200ms), screens fade in (150 to 200ms), cards lift on hover. Use `tailwindcss-animate` classes (`animate-in fade-in slide-in-from-bottom-*`). No looping animations except loading indicators. `prefers-reduced-motion` turns animation off (handled in `index.css`).

## 10. Icons

`lucide-react` only, default `strokeWidth` 2, sizes 15 to 18 in controls and 22 to 26 in tiles and empty states. Do not draw custom SVG icons. Every icon-only button needs a label.

## 11. Copy

- Every visible string goes through `t("key")` and must exist in **all three languages** in `i18n.js` (Hinglish, English, Hindi).
- Short and plain: button labels of 1 to 3 words, subtitles of one line.
- **No em-dashes or en-dashes** in UI text. Use a full stop, comma, colon or brackets. Use `-` for an empty value.
- Correct plurals ("1 visit", "2 visits").

## 12. Accessibility

- Text contrast at least 4.5:1 (`gray-600` or darker on white for secondary text; `brand-700` for green text).
- Touch targets at least 40px (`h-10`/`h-11`).
- Visible keyboard focus (green ring from `index.css`). Escape closes sheets.
- Images have `alt`; decorative ones `alt=""`.

## 13. Theme

Light only for now (a bright shop floor). All colours come from tokens, so a dark theme can be added later by redefining them, not by editing screens.

## 14. Testing hooks

Keep existing `data-testid` values when you restyle. Add one to every new interactive element (`kebab-case`, `<area>-<element>`). When a control exists twice for phone and desktop, suffix the phone copy with `-mobile`.

## 15. Permissions

Every action button, tab and tile is shown only when the signed-in admin may
use it: `can(user, "<key>")` from `admin/perms.js`. The server checks the same
permission. Adding a feature? Follow the checklist in
[permissions.md](permissions.md).

## 16. Checklist before shipping a UI change

- [ ] Uses `ui.js` components and tokens; no new hex colours, no `#1E3A8A`-style literals
- [ ] Works at 375px wide and at 1440px; main action reachable on phones
- [ ] Loading, empty and error states present
- [ ] All new text in `i18n.js` in three languages; no em-dashes
- [ ] Icon buttons have labels; contrast and touch sizes respected
- [ ] `data-testid` on new interactive elements
- [ ] Gated with `can(user, ...)` and checked on the server (see permissions.md)
- [ ] This file updated if you added a component or pattern
