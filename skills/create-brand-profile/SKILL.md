---
name: create-brand-profile
description: Draft a mailflow brand.json from a company's website or screenshots. Use when setting up mailflow for a new app or refreshing its brand.
---

# Create a brand profile

1. Look at the website or screenshots the user gives you. Note:
   - the main action colour (buttons, links);
   - the text colour, a muted grey and the page background;
   - whether headings are serif or sans-serif;
   - button shape and how rounded things are.
2. Map what you found onto [brand.schema.json](../../brand/brand.schema.json):
   - `font`: the closest email-safe pair. `classic` is serif headings, `modern` is clean sans, `friendly` is rounded sans. Use `inter` only if the site uses Inter or a close relative.
   - `colors`: exact hex values. Check that text on `card` and white on `primary` both have at least 4.5:1 contrast. If one doesn't, darken it and tell the user.
   - `tone`: two or three sentences describing how the site writes.
3. Validate against the schema and show the JSON to the user.
4. Tell them to import it in mailflow's Brand tab, adjust it there, and save. Don't push it to the API directly; the person saving it is the one who approves it.
