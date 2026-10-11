import type { RunStatus } from "@prisma/client";
import { Badge, type Tone } from "../../_components/ui";

const RUN_STATUS: Record<RunStatus, { tone: Tone; label: string }> = {
  active: { tone: "blue", label: "Active" },
  completed: { tone: "green", label: "Completed" },
  stopped: { tone: "neutral", label: "Stopped" },
  failed: { tone: "red", label: "Needs attention" },
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return <Badge tone={RUN_STATUS[status].tone}>{RUN_STATUS[status].label}</Badge>;
}
