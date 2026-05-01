"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/utils/fetcher";
import type { EmployeeOptionsResponse } from "@/lib/types";

export function useEmployeeOptions(type: "swap" | "ft", search = "") {
  return useQuery({
    queryKey: ["employee-options", type, search],
    queryFn: () =>
      fetchJson<EmployeeOptionsResponse>(
        `/api/employee/options?type=${encodeURIComponent(type)}&search=${encodeURIComponent(search)}`,
      ),
  });
}
