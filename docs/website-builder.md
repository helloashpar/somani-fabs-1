# Website builder (Shop setup › Website)

One-page websites for shops, built from a fixed design system, so every edit
costs nothing to run (no AI per change).

## Model

- A shop keeps up to 3 websites (`backend/websites.py`, `MAX_SITES`); one is
  live on `/`. The others are drafts.
- `classic`: the original hand-made page (`pages/Landing.js`). Locked.
- `builder`: a `config` = `theme` tokens + ordered `sections` (type, layout
  variant, tone, content) + `settings` (floating WhatsApp, call bar, language
  switch, SEO). Every save keeps the previous version (last 15).
- Shop facts (name, logo, address, hours, phones, map, reviews, socials) are
  never stored in a website: sections read them from Shop setup › General
  (`backend/brand.py`). Text may use `{shop_name}`, `{short_name}`, `{city}`,
  `{state}`, `{owner}`.
- Translations: any text field `key` can have `key_hi`. Empty falls back to
  the main text.

## Frontend (`frontend/src/site`)

| File | What |
|---|---|
| `theme.js` | Palettes, font pairs, corners, buttons, spacing, textures, motion, one-tap looks → CSS variables |
| `registry.js` | Section types: layouts, editable fields, defaults, icons, button actions |
| `kit.js` | Editable text (`T`), images (`Img`), buttons (`Action`), the section frame and toolbar |
| `sections.js` | Every section in every layout |
| `presets.js` | Starter packs per business type, quiz vibes → layouts (`buildSite`) |
| `Site.js` | Renderer, live site (`/`), draft preview (`/site-preview/:id`), builder frame (`/site-frame`) |

Admin: `admin/website/` (`Websites` list, `Quiz`, `Builder`, `Frame`, `fields`).
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
