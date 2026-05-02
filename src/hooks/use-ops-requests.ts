"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/utils/fetcher";
import type { OpsRequestsResponse } from "@/lib/types";

type Filters = Record<string, string | number | undefined>;

export function useOpsRequests(filters: Filters) {
  const searchParams = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return useQuery({
    queryKey: ["ops-requests", searchParams.toString()],
    queryFn: () => fetchJson<OpsRequestsResponse>(`/api/ops/requests?${searchParams.toString()}`),
  });
}
