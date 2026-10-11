---
name: check-email
description: Check an HTML email against a mailflow brand profile before uploading it. Use when someone has hand-written or AI-generated HTML they want to use as a mailflow template.
---

# Check an email

1. Send the HTML to `POST $MAILFLOW_URL/api/brand/check` and read the issues it returns.
2. Explain each issue in plain words:
   - **Warnings** (it can still be published): colours outside the palette, fonts not in the profile, wider than 600px.
   - **Errors** (publishing is blocked): no unsubscribe link, or a script.
3. Offer two fixes:
   - Patch the HTML to use the brand's colours and fonts and add `{{unsubscribe}}`.
   - Better: rewrite it as blocks with the `write-email` skill, so it follows the brand automatically from then on.
