# Skills

Agent skills for writing on-brand emails with mailflow. Each folder holds a `SKILL.md` that works with Claude Code, Codex and other agents that read skills.

| Skill | Does |
| --- | --- |
| [write-email](write-email/SKILL.md) | Writes an email as blocks in the saved brand and tone, then uploads it as a draft. |
| [check-email](check-email/SKILL.md) | Checks pasted HTML against the brand before upload. |
| [create-brand-profile](create-brand-profile/SKILL.md) | Drafts a `brand.json` from a website. |

The skills need two environment variables: `MAILFLOW_URL` (your deployment) and `MAILFLOW_TOKEN` (an admin API token).

## API

- `GET /api/brand` returns the saved `brand.json`.
- `GET /api/merge-fields` lists the fields your app has actually sent per event type, for example `payment_link`.
- `POST /api/templates` uploads a draft (`{ slug, name, subject, content: { kind: "blocks", blocks } }`). Every upload becomes a new unpublished version.
- `POST /api/brand/check` with `{ html }` returns `{ issues }`.

All calls send `Authorization: Bearer $MAILFLOW_TOKEN`, matching `MAILFLOW_API_TOKEN` on the server.
