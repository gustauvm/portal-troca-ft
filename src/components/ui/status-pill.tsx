"use client";

import { Badge } from "@/components/ui/badge";
import { getLaunchLabel, getWorkflowLabel } from "@/lib/utils/status";
import type { LaunchStatus, WorkflowStatus } from "@/lib/types";

export function WorkflowStatusPill({ status }: { status: WorkflowStatus }) {
  const variant =
    status === "approved"
      ? "success"
      : status === "rejected"
        ? "danger"
        : status === "cancelled"
          ? "warning"
          : "brand";

  return <Badge variant={variant}>{getWorkflowLabel(status)}</Badge>;
}

export function LaunchStatusPill({ status }: { status: LaunchStatus }) {
  const variant =
    status === "matched"
      ? "success"
      : status === "error"
        ? "danger"
        : status === "not_found"
          ? "warning"
          : "neutral";

  return <Badge variant={variant}>{getLaunchLabel(status)}</Badge>;
}
