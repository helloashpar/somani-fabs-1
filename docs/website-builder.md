# Website builder (Shop setup › Website)

One-page websites for shops, built from a fixed design system, so every edit
costs nothing to run (no AI per change).

## Model

- The shop has one website and keeps up to 3 **variations** of it
  (`backend/websites.py`, `MAX_SITES`); one is live on `/`, the others are
  drafts only the shop sees. The admin screens say "variation", never
  "website", for these. When all 3 are used, "New variation" asks the owner to
  delete one first.
- `classic`: the original hand-made page (`pages/Landing.js`). Locked.
- `builder`: a `config` = `theme` tokens + ordered `sections` (type, layout
  variant, tone, content) + `settings` (floating WhatsApp, call bar, language
  switch, SEO). Every save keeps the previous version (last 15).
- Shop facts (name, logo, address, hours, phones, map, reviews, socials) are
  never stored in a website: sections read them from Shop setup › General
  (`backend/brand.py`). Text may use `{shop_name}`, `{short_name}`, `{city}`,
  `{state}`, `{owner}`.
- Languages: a variation is one language (the default; `settings.multilingual`
  false) or English + हिंदी. Only two-language variations show "Add in हिंदी"
  in the editor and a language switch on the site (`language_switch`, style
  `lang_style`: button / toggle / text / icon). Any text field `key` can then
  have `key_hi`; empty falls back to the main text. Older variations without
  the setting count as two-language unless their switch was off.
- Phones (under 768px) see the variations, make one live and set the web
  address, but never open the quiz or the editor: they are asked to use a
  computer.
- Domain address: hosted here at `PUBLIC_BASE_URL`; a shop may save its own
  domain (`settings.custom_domain`) and point it here with an A record (@ →
  this server's IP) and a CNAME (www → current address). `/api/websites/domain`
  saves it, `/domain/check` looks up DNS. HTTPS for the new name is set up on
  the server separately.

## Frontend (`frontend/src/site`)

| File | What |
|---|---|
| `theme.js` | Palettes, font pairs, corners, buttons, spacing, textures, motion, one-tap looks → CSS variables |
| `registry.js` | Section types: layouts, editable fields, defaults, icons, button actions |
| `kit.js` | Editable text (`T`), images (`Img`), buttons (`Action`), the section frame and toolbar |
| `sections.js` | Every section in every layout |
| `presets.js` | Starter packs per business type, quiz vibes → layouts (`buildSite`) |
| `Site.js` | Renderer, live site (`/`), draft preview (`/site-preview/:id`), builder frame (`/site-frame`) |

Admin: `admin/website/` (`Websites` list, `Quiz`, `Builder`, `Frame`,
`fields`, `facts`, `words`).

- `words.js`: every word of General and Website screens in the admin app's
  language (English / Hinglish / Hindi), keyed by the English text:
  `w("Make live")`. Add new text there in all three.
- `facts.js`: the shop details each section shows (from General). The editor
  lists them per section with their current value and opens General at that
  exact field; tapping one in the preview (`useFact` in `kit.js`) does the
  same.
- A section whose layout has soft decorative shapes (`decor` in the registry,
  `s-decor` class in `sections.js`) can switch them off (`style.decor`).
The builder previews in an iframe (`/site-frame`) at real device widths and
talks to it with `postMessage` (render / select / edit / image / action).

## Adding things

- **Palette, font pair, look**: add an entry in `theme.js`.
- **Layout of an existing section**: add it to the type's `variants` in
  `registry.js` and draw it in `sections.js`.
- **New section type**: add it to `SECTIONS` in `registry.js` and `RENDER` in
  `sections.js`. Use only `--t-*` / `--s-*` variables for colour so it works
  in every theme and tone. The backend checks only shape and size; unknown
  types are skipped when drawn.
