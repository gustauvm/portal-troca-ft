"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/utils/fetcher";
import type { OpsLaunchHistoryResponse } from "@/lib/types";

type OpsLaunchHistoryFilters = {
  page: number;
  limit: number;
  groupKey?: string;
  requestType?: string;
  payrollReference?: string;
  companyId?: string;
  careerId?: string;
  scheduleId?: string;
  shiftId?: string;
  workplaceId?: string;
  search?: string;
  includeInactive?: boolean;
};

export function useOpsLaunchHistory(filters: OpsLaunchHistoryFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return useQuery({
    queryKey: ["ops-launch-history", filters],
    queryFn: () => fetchJson<OpsLaunchHistoryResponse>(`/api/ops/launch-history?${params.toString()}`),
  });
}
