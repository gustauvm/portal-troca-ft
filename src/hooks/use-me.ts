"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/utils/fetcher";
import type { EmployeePortalContext } from "@/lib/types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => fetchJson<EmployeePortalContext>("/api/me"),
  });
}
