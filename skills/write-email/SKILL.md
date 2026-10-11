---
name: write-email
description: Write a transactional or lifecycle email for mailflow as on-brand blocks and upload it as a draft. Use when asked to write, draft or rewrite an email template for a mailflow deployment.
---

# Write an email

1. Fetch the brand: `GET $MAILFLOW_URL/api/brand`. Read `tone` and follow it.
2. Fetch the allowed merge fields: `GET $MAILFLOW_URL/api/merge-fields`. Use only these, written as `{{field}}`.
3. Write the email as blocks. Never write HTML, colours or fonts; the brand handles all of that.

   ```json
   [
     { "type": "heading", "text": "Hi {{first_name}}," },
     { "type": "text", "text": "One short paragraph per block." },
     { "type": "button", "label": "Verb-first action", "href": "{{payment_link}}" },
     { "type": "divider" },
     { "type": "small", "text": "Reassurance or how to get help." }
   ]
   ```

   Rules:
   - one main action, so at most one `button`;
   - a subject under 50 characters;
   - no claims, prices or promises the user didn't give you;
   - no unsubscribe text, because mailflow adds it.
4. Show the subject and blocks to the user. Upload only after they confirm: `POST $MAILFLOW_URL/api/templates`.
5. Tell them the draft's name and that they need to preview and publish it in mailflow before any workflow can send it.
