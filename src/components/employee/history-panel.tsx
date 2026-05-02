"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { LaunchStatusPill, WorkflowStatusPill } from "@/components/ui/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { useHistory } from "@/hooks/use-history";
import { useRequestStream } from "@/hooks/use-request-stream";
import { fetchJson } from "@/lib/utils/fetcher";
import { formatBrazilianDate, formatPayrollReferenceLabel } from "@/lib/utils";
import type { EmployeeHistoryItem } from "@/lib/types";

type PayrollOption = { reference: string; periodStart: string; periodEnd: string };

function getReferenceYear(reference: string) {
  return String(reference || "").slice(0, 4);
}

function buildSwapDetailRows(item: EmployeeHistoryItem) {
  if (item.requestType !== "swap" || !item.coverageDate || !item.substituteName) return [];

  if (item.viewerRole === "substitute") {
    return [
      {
        date: item.requestDate,
        leftLabel: "Você trabalha",
        rightLabel: `${item.requesterName} folga`,
      },
      {
        date: item.coverageDate,
        leftLabel: "Você folga",
        rightLabel: `${item.requesterName} trabalha`,
      },
    ];
  }

  return [
    {
      date: item.requestDate,
      leftLabel: "Você folga",
      rightLabel: `${item.substituteName} trabalha`,
    },
    {
      date: item.coverageDate,
      leftLabel: "Você trabalha",
      rightLabel: `${item.substituteName} folga`,
    },
  ];
}

export function HistoryPanel({ initialPayrollReference }: { initialPayrollReference: string }) {
  const queryClient = useQueryClient();
  const [payrollReference, setPayrollReference] = useState(initialPayrollReference);
  const [selectedYear, setSelectedYear] = useState(getReferenceYear(initialPayrollReference));
  const [requestType, setRequestType] = useState<"all" | "swap" | "ft">("all");
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelPending, setCancelPending] = useState(false);
  const history = useHistory(payrollReference, requestType);
  useRequestStream(payrollReference);

  async function cancelRequest(requestId: string) {
    const reason = cancelReason.trim();
    if (reason.length < 8) {
      setCancelError("Informe o motivo do cancelamento com pelo menos 8 caracteres.");
      return;
    }

    setCancelPending(true);
    setCancelError("");
    try {
      await fetchJson(`/api/requests/${requestId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setCancelTarget(null);
      setCancelReason("");
      await queryClient.invalidateQueries({ queryKey: ["history", payrollReference, requestType] });
    } catch (error) {
      setCancelError(error instanceof Error ? error.message : "Não foi possível cancelar a solicitação.");
    } finally {
      setCancelPending(false);
    }
  }

  const items = history.data?.items || [];
  const payrollOptions = (history.data?.payrollOptions || []) as PayrollOption[];
  const yearOptions = Array.from(new Set(payrollOptions.map((option) => getReferenceYear(option.reference)))).sort(
    (left, right) => Number(right) - Number(left),
  );
  const monthOptions = payrollOptions.filter((option) => getReferenceYear(option.reference) === selectedYear);

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
          <div className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_16rem]">
            <Select
              value={selectedYear}
              onChange={(event) => {
                const nextYear = event.target.value;
                setSelectedYear(nextYear);
                const firstMonth = payrollOptions.find((option) => getReferenceYear(option.reference) === nextYear);
                if (firstMonth) setPayrollReference(firstMonth.reference);
              }}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
            <Select value={payrollReference} onChange={(event) => setPayrollReference(event.target.value)}>
              {monthOptions.map((option) => (
                <option key={option.reference} value={option.reference}>
                  {formatPayrollReferenceLabel(option)}
                </option>
              ))}
            </Select>
            <Select
              value={requestType}
              onChange={(event) => setRequestType(event.target.value as "all" | "swap" | "ft")}
            >
              <option value="all">Todas</option>
              <option value="swap">Permuta (Troca de Folga)</option>
              <option value="ft">FT</option>
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
          (item: EmployeeHistoryItem) => (
            <Card key={item.id}>
              <CardContent className="grid gap-4 px-5 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ink-950)]">
                      {item.requestType === "swap" ? "Permuta (Troca de Folga)" : "FT"} •{" "}
                      {item.workplaceName || "Unidade não informada"}
                    </p>
                    <p className="text-sm text-[color:var(--ink-600)]">
                      {formatBrazilianDate(item.requestDate)}
                      {item.coverageDate ? ` • compensação ${formatBrazilianDate(item.coverageDate)}` : ""}
                    </p>
                    {item.source === "nexti" ? (
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--brand-700)]">
                        Histórico importado da Nexti
                      </p>
                    ) : null}
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
                  {item.substituteName ? (
                    <p>
                      <span className="font-semibold text-[color:var(--ink-950)]">Colega:</span>{" "}
                      {item.substituteName}
                    </p>
                  ) : null}
                </div>

                {item.requestType === "swap" && buildSwapDetailRows(item).length > 0 ? (
                  <div className="grid gap-2 rounded-[22px] bg-[color:var(--surface-150)] p-3">
                    {buildSwapDetailRows(item).map((row) => (
                      <div
                        key={`${item.id}-${row.date}`}
                        className="grid gap-1 rounded-2xl bg-white/70 px-3 py-3 text-sm sm:grid-cols-[7rem_1fr_1fr]"
                      >
                        <span className="font-semibold text-[color:var(--ink-950)]">
                          {formatBrazilianDate(row.date)}
                        </span>
                        <span>{row.leftLabel}</span>
                        <span className="text-[color:var(--ink-600)]">{row.rightLabel}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <p className="text-sm leading-6 text-[color:var(--ink-700)]">
                  {item.requestType === "ft"
                    ? [
                        item.selectedShiftName ? `Horário: ${item.selectedShiftName}` : null,
                        item.selectedShiftTurn ? `Turno: ${item.selectedShiftTurn}` : null,
                        item.ftReasonLabel ? `Motivo operacional: ${item.ftReasonLabel}` : null,
                        item.launchSource === "manual" ? "Lançado manualmente" : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "FT registrada para operação."
                    : item.reason}
                </p>

                {item.canCancel ? (
                  cancelTarget === item.id ? (
                    <div className="grid gap-3 rounded-[22px] bg-white/70 p-4">
                      <Textarea
                        value={cancelReason}
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder="Informe o motivo do cancelamento."
                        minLength={8}
                      />
                      {cancelError ? (
                        <p className="text-sm text-[color:var(--danger-700)]">{cancelError}</p>
                      ) : null}
                      <div className="grid gap-2 sm:flex sm:justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCancelTarget(null);
                            setCancelReason("");
                            setCancelError("");
                          }}
                          disabled={cancelPending}
                        >
                          Voltar
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void cancelRequest(item.id)}
                          disabled={cancelPending}
                        >
                          {cancelPending ? "Cancelando..." : "Confirmar cancelamento"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCancelTarget(item.id);
                          setCancelReason("");
                          setCancelError("");
                        }}
                      >
                        Cancelar solicitação
                      </Button>
                    </div>
                  )
                ) : null}
              </CardContent>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
