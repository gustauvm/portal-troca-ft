"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useRequestStream(payrollReference: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/stream/requests");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { payrollReference: string; items: unknown[] };
      queryClient.setQueryData(["history", payload.payrollReference], (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        return {
          ...(current as Record<string, unknown>),
          items: payload.items,
        };
      });
    };

    source.onerror = () => {
      source.close();
      queryClient.invalidateQueries({ queryKey: ["history", payrollReference] });
    };

    return () => source.close();
  }, [payrollReference, queryClient]);
}
