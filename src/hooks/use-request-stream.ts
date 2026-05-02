"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useRequestStream(payrollReference: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/stream/requests");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { payrollReference: string; items: unknown[] };
      queryClient.invalidateQueries({ queryKey: ["history", payload.payrollReference] });
    };

    source.onerror = () => {
      source.close();
      queryClient.invalidateQueries({ queryKey: ["history", payrollReference] });
    };

    return () => source.close();
  }, [payrollReference, queryClient]);
}
