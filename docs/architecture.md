# Architecture

## Ownership

| Owner | Owns |
| --- | --- |
| **Host app** (the app using mailflow) | Its users, login, payment status and every other business fact. It decides who counts as an admin. |
| **mailflow** | Brand profile, templates and their versions, workflows, timers, runs and run history. |
| **Listmonk** | Delivery: sending, bounces and unsubscribes. |

mailflow stores only what it needs to send: a recipient id, an email address and the merge fields a template uses (for example `first_name` and `payment_link`). It does not copy the host app's database.

## Deployment

One mailflow deployment per host app, each with its own database and Listmonk. Host apps run a **pinned release** (a Docker image tag) and upgrade by changing the tag. Code is never copied into a host app's repo; anything a host app needs is added here as a setting, trigger or check so every deployment gets it.

## Contract with the host app

**Events in.** The host app posts signed events:

```json
{ "type": "payment_failed", "recipient": { "id": "usr_123", "email": "alex@example.com" },
  "data": { "first_name": "Alex", "payment_link": "https://…" }, "occurredAt": "2026-10-11T09:00:00Z" }
```

An event can start a run (`payment_failed`) or end one through a stop condition (`payment_succeeded`).

**Checks out.** At a check step, mailflow asks the host app a yes/no question over a signed HTTP call, for example `GET /mailflow/checks/payment-settled?recipient=usr_123`. The host app answers from its own data, so mailflow never decides who has paid.

**Admin access.** The host app links its admins to the mailflow UI with a short-lived signed token. mailflow doesn't keep its own list of users.

## Workflows

A workflow is a trigger, a list of stop conditions and a tree of steps:

- `send`: a published template version
- `wait`: a duration
- `check`: a host-app check, with a `yes` branch and a `no` branch
- `notify`: alert a person instead of emailing the recipient
- `end`

Each recipient's progress is a **run**. A wait is a stored due time, not a sleeping process, so runs survive restarts and deploys. Every step a run takes is written to its history.

## Brand and templates

- **`brand.json`** ([schema](../brand/brand.schema.json)) holds colours, fonts, button shape, card corners, footer and tone of voice. It is edited in the UI and can be exported and imported.
- **Block templates** are a list of blocks (`heading`, `text`, `button`, `divider`, `small`). They are rendered with the brand through MJML, so they are on-brand by construction.
- **HTML templates** are pasted or uploaded as-is and must pass the **brand check** before publishing:
  - warnings: colours outside the palette, fonts not in the profile, emails wider than 600px;
  - errors that block publishing: no unsubscribe link, any script.
- Templates are versioned. Workflows only send **published** versions.

## AI skills

The skills in [`skills/`](../skills) run in the admin's own AI tool, not inside mailflow, which needs no LLM key. They read the live brand profile and the allowed merge fields from the mailflow API, then upload drafts. A person previews and publishes every draft.
