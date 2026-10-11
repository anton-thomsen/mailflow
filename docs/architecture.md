# Architecture

## Ownership

| Owner | Owns |
| --- | --- |
| **Host app** (the app using mailflow) | Its users, login, payment status and every other business fact. It decides who counts as an admin. |
| **mailflow** | Brand profile, templates and their versions, workflows, timers, runs and run history. |
| **Listmonk** | Delivery over SMTP. |

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

**Checks out.** At a check step, mailflow asks the host app a yes/no question with a signed `POST <HOST_URL>/checks` carrying `{ check, recipientId, runId, data }`, where `data` is the data from the event that started the run. The host app answers `{ "result": true | false }` from its own data, so mailflow never decides who has paid. A failed check is retried with backoff, and after five attempts the run stops and is marked for a person to look at.

**Admin access.** The host app links its admins to `/sso?token=…` with a 60-second signed token. mailflow then sets a 12-hour session cookie. mailflow doesn't keep its own list of users.

## Workflows

A workflow is a trigger, a list of stop conditions and a tree of steps:

- `send`: the latest published version of a template
- `wait`: a number of minutes, hours or days
- `check`: a host-app check, with a `yes` branch and a `no` branch

Branches never rejoin. The end of any list ends the run.

Each recipient's progress is a **run**. A wait is a stored due time, not a sleeping process, so runs survive restarts and deploys. Every step a run takes is written to its history.

- A run stores a snapshot of its workflow, so editing a workflow never strands a run halfway through.
- There is one active run per workflow and recipient, enforced with a partial unique index.
- Workers claim due runs with a short lease, so several replicas never process the same run.
- Each email step sends **at most once**. mailflow writes a delivery row before calling Listmonk. If a crash leaves that row pending, the run stops for a person to look at instead of risking a second email.
- A send that Listmonk refuses is retried with backoff. A missing merge field, a bad link or an unpublished template stops the run rather than sending a broken email.

## Brand and templates

- **`brand.json`** ([schema](../brand/brand.schema.json)) holds colours, fonts, button shape, card corners, footer and tone of voice. It is edited in the UI and can be exported and imported.
- **Block templates** are a list of blocks (`heading`, `text`, `button`, `divider`, `small`). They are rendered with the brand through MJML, so they are on-brand by construction.
- **HTML templates** are pasted or uploaded as-is and must pass the **brand check** before publishing:
  - warnings: colours outside the palette, fonts not in the profile, emails wider than 600px;
  - errors that block publishing: a script, or JavaScript in an attribute or link.
- **Unsubscribe.** Listmonk's transactional API has no unsubscribe tag. When the host app sends an `unsubscribe_url` field, block templates add the link to the footer.
- Templates are versioned. Workflows only send **published** versions.

## AI skills

The skills in [`skills/`](../skills) run in the admin's own AI tool, not inside mailflow, which needs no LLM key. They read the live brand profile and the allowed merge fields from the mailflow API, then upload drafts. A person previews and publishes every draft.
