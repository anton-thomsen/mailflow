# Skills

Agent skills for writing on-brand emails with mailflow. Each folder holds a `SKILL.md` that works with Claude Code, Codex and other agents that read skills.

> **Draft.** The mailflow API these skills call isn't built yet; the endpoints below are the planned contract.

| Skill | Does |
| --- | --- |
| [write-email](write-email/SKILL.md) | Writes an email as blocks in the saved brand and tone, then uploads it as a draft. |
| [check-email](check-email/SKILL.md) | Checks pasted HTML against the brand before upload. |
| [create-brand-profile](create-brand-profile/SKILL.md) | Drafts a `brand.json` from a website. |

The skills need two environment variables: `MAILFLOW_URL` (your deployment) and `MAILFLOW_TOKEN` (an admin API token).

## Planned API

- `GET /api/brand` returns the saved `brand.json`.
- `GET /api/merge-fields` lists the fields templates may use, for example `first_name` and `payment_link`.
- `POST /api/templates` uploads a draft (`{ name, subject, content: { kind: "blocks", blocks } }`).
- `POST /api/brand/check` checks HTML against the brand and returns the issues found.
