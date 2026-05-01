"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { LaunchStatusPill, WorkflowStatusPill } from "@/components/ui/status-pill";
import { useHistory } from "@/hooks/use-history";
import { useRequestStream } from "@/hooks/use-request-stream";
import { fetchJson } from "@/lib/utils/fetcher";
import { formatBrazilianDate } from "@/lib/utils";

export function HistoryPanel({ initialPayrollReference }: { initialPayrollReference: string }) {
  const queryClient = useQueryClient();
  const [payrollReference, setPayrollReference] = useState(initialPayrollReference);
  const history = useHistory(payrollReference);
  useRequestStream(payrollReference);

  async function cancelRequest(requestId: string) {
    await fetchJson(`/api/requests/${requestId}/cancel`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["history", payrollReference] });
  }

  const items = history.data?.items || [];
  const payrollOptions = history.data?.payrollOptions || [];

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Minhas solicitações</CardTitle>
          <CardDescription>
            Consulte o período de folha atual por padrão e navegue para qualquer período desde a admissão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Select value={payrollReference} onChange={(event) => setPayrollReference(event.target.value)}>
              {payrollOptions.map((option: { reference: string; periodStart: string; periodEnd: string }) => (
                <option key={option.reference} value={option.reference}>
                  {option.reference} • {formatBrazilianDate(option.periodStart)} a{" "}
                  {formatBrazilianDate(option.periodEnd)}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {history.isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-[color:var(--ink-600)]">Carregando histórico...</CardContent>
        </Card>
      ) : null}

      {!history.isLoading && items.length === 0 ? (
        <EmptyState
          title="Nada encontrado nesta folha"
          description="Quando houver solicitações no período selecionado, elas aparecerão aqui com o status operacional e de lançamento."
        />
      ) : null}

      <div className="grid gap-4">
        {items.map(
          (item: {
            id: string;
            requestType: "swap" | "ft";
            workflowStatus: "submitted" | "approved" | "rejected" | "cancelled";
            launchStatus: "waiting" | "matched" | "not_found" | "error";
            requesterName: string;
            substituteName: string | null;
            requestDate: string;
            coverageDate: string | null;
            workplaceName: string | null;
            reason: string;
            createdAt: string;
          }) => (
            <Card key={item.id}>
              <CardContent className="grid gap-4 px-5 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ink-950)]">
                      {item.requestType === "swap" ? "Permuta" : "FT"} •{" "}
                      {item.workplaceName || "Unidade não informada"}
                    </p>
                    <p className="text-sm text-[color:var(--ink-600)]">
                      {formatBrazilianDate(item.requestDate)}
                      {item.coverageDate ? ` • compensação ${formatBrazilianDate(item.coverageDate)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WorkflowStatusPill status={item.workflowStatus} />
                    <LaunchStatusPill status={item.launchStatus} />
                  </div>
                </div>

                <div className="grid gap-3 text-sm text-[color:var(--ink-700)] sm:grid-cols-2">
                  <p>
                    <span className="font-semibold text-[color:var(--ink-950)]">Solicitante:</span>{" "}
                    {item.requesterName}
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--ink-950)]">Colega:</span>{" "}
                    {item.substituteName || "Não se aplica"}
                  </p>
                </div>

                <p className="text-sm leading-6 text-[color:var(--ink-700)]">{item.reason}</p>

                {(item.workflowStatus === "submitted" || item.workflowStatus === "approved") &&
                item.launchStatus !== "matched" ? (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => cancelRequest(item.id)}
                    >
                      Cancelar solicitação
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
