"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/utils/fetcher";
import type { HistoryResponse } from "@/lib/types";

export function useHistory(payrollReference: string) {
  return useQuery({
    queryKey: ["history", payrollReference],
    queryFn: () =>
      fetchJson<HistoryResponse>(`/api/history?payrollReference=${encodeURIComponent(payrollReference)}`),
  });
}
