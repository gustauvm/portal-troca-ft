"use client";

import Link from "next/link";
import type { Route } from "next";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { LaunchStatusPill, WorkflowStatusPill } from "@/components/ui/status-pill";
import { useOpsRequests } from "@/hooks/use-ops-requests";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { OperatorFiltersResponse, PortalRequestRecord } from "@/lib/types";
import { formatBrazilianDate } from "@/lib/utils";

export function OperationsBoard({
  filterOptions,
  defaultPayrollReference,
  isAdmin,
}: {
  filterOptions: OperatorFiltersResponse;
  defaultPayrollReference: string;
  isAdmin?: boolean;
}) {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    page: 1,
    limit: 25,
    groupKey: "",
    requestType: "",
    workflowStatus: "",
    launchStatus: "",
    payrollReference: defaultPayrollReference,
    companyId: "",
    careerId: "",
    scheduleId: "",
    shiftId: "",
    workplaceId: "",
    search: "",
  });

  const deferredSearch = useDeferredValue(filters.search);
  const query = useOpsRequests({
    ...filters,
    search: deferredSearch,
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("portal-requests-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "portal_requests" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["ops-requests"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const items = useMemo<PortalRequestRecord[]>(() => query.data?.items ?? [], [query.data?.items]);
  const csvRows = useMemo(() => {
    return items.map((item) => [
        item.requestType,
        item.workflowStatus,
        item.launchStatus,
        item.requesterName,
        item.requesterEnrolment,
        item.substituteName || "",
        item.workplaceName || "",
        item.requestDate,
        item.coverageDate || "",
      ]);
  }, [items]);

  function exportCsv() {
    const header = [
      "tipo",
      "workflow_status",
      "launch_status",
      "solicitante",
      "matricula_solicitante",
      "colega",
      "unidade",
      "data_principal",
      "data_compensacao",
    ];

    const csv = [header, ...csvRows]
      .map((row) => row.map((value: string | null) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `fila-operacional-${filters.payrollReference}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-2xl">Fila operacional</CardTitle>
              <CardDescription>
                Filtre por grupo, empresa, cargo, unidade, tipo, status e folha. A lista atualiza
                automaticamente com mudanças relevantes.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link href={"/operacao/lancamento-manual" as Route}>Novo lançamento manual</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={"/operacao/historico-nexti" as Route}>Histórico Nexti</Link>
              </Button>
              {isAdmin ? (
                <>
                  <Button asChild variant="secondary">
                    <Link href={"/operacao/admin/operadores" as Route}>Acessos</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href={"/operacao/admin/whatsapp" as Route}>WhatsApp</Link>
                  </Button>
                </>
              ) : null}
              <Button variant="secondary" onClick={exportCsv}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label htmlFor="search">Busca livre</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ink-500)]" />
              <Input
                id="search"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Nome ou matrícula"
                className="pl-10"
              />
            </div>
          </div>

          {[
            {
              id: "groupKey",
              label: "Grupo",
              options: filterOptions.groups.map((group) => ({ value: group, label: group })),
            },
            {
              id: "requestType",
              label: "Tipo",
              options: [
                { value: "swap", label: "Permuta (Troca de Folga)" },
                { value: "ft", label: "FT" },
              ],
            },
            {
              id: "workflowStatus",
              label: "Workflow",
              options: [
                { value: "submitted", label: "Pendente" },
                { value: "approved", label: "Aprovada" },
                { value: "rejected", label: "Rejeitada" },
                { value: "cancelled", label: "Cancelada" },
              ],
            },
            {
              id: "launchStatus",
              label: "Lançamento",
              options: [
                { value: "waiting", label: "Aguardando" },
                { value: "matched", label: "Lançada" },
                { value: "not_found", label: "Não localizada" },
                { value: "error", label: "Erro" },
              ],
            },
            {
              id: "companyId",
              label: "Empresa",
              options: filterOptions.companies.map((company) => ({
                value: String(company.id),
                label: company.name,
              })),
            },
            {
              id: "careerId",
              label: "Cargo",
              options: filterOptions.careers.map((career) => ({
                value: String(career.id),
                label: career.name,
              })),
            },
            {
              id: "scheduleId",
              label: "Escala",
              options: (filterOptions.schedules || []).map((schedule) => ({
                value: String(schedule.id),
                label: schedule.name,
              })),
            },
            {
              id: "shiftId",
              label: "Horário",
              options: (filterOptions.shifts || []).map((shift) => ({
                value: String(shift.id),
                label: shift.name,
              })),
            },
            {
              id: "workplaceId",
              label: "Unidade",
              options: filterOptions.workplaces.map((workplace) => ({
                value: String(workplace.id),
                label: workplace.name,
              })),
            },
          ].map((filter) => (
            <div key={filter.id}>
              <Label htmlFor={filter.id}>{filter.label}</Label>
              <Select
                id={filter.id}
                value={String(filters[filter.id as keyof typeof filters] || "")}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    [filter.id]: event.target.value,
                    page: 1,
                  }))
                }
              >
                <option value="">Todos</option>
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}

          <div>
            <Label htmlFor="payrollReference">Folha</Label>
            <Input
              id="payrollReference"
              value={filters.payrollReference}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  payrollReference: event.target.value,
                  page: 1,
                }))
              }
              placeholder="2026-05"
            />
          </div>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-[color:var(--ink-600)]">Carregando fila operacional...</CardContent>
        </Card>
      ) : null}

      {!query.isLoading && items.length === 0 ? (
        <EmptyState
          title="Nenhuma solicitação encontrada"
          description="Ajuste os filtros ou aguarde novas entradas na fila operacional."
        />
      ) : null}

      <div className="grid gap-4">
        {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="grid gap-4 px-5 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-[color:var(--ink-950)]">
                      {item.requesterName} • RE {item.requesterEnrolment}
                    </p>
                    <p className="text-sm text-[color:var(--ink-600)]">
                      {item.requestType === "swap" ? "Permuta (Troca de Folga)" : "FT"}
                      {item.substituteName ? ` • com ${item.substituteName}` : ""}
                      {item.workplaceName ? ` • ${item.workplaceName}` : ""}
                    </p>
                    <p className="text-sm text-[color:var(--ink-600)]">
                      {formatBrazilianDate(item.requestDate)}
                      {item.coverageDate ? ` • ${formatBrazilianDate(item.coverageDate)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WorkflowStatusPill status={item.workflowStatus} />
                    <LaunchStatusPill status={item.launchStatus} />
                  </div>
                </div>

                <p className="text-sm leading-6 text-[color:var(--ink-700)]">
                  {item.requestType === "ft"
                    ? [
                        item.selectedShiftName ? `Horário: ${item.selectedShiftName}` : null,
                        item.selectedShiftTurn ? `Turno: ${item.selectedShiftTurn}` : null,
                        item.ftReasonLabel ? `Motivo: ${item.ftReasonLabel}` : null,
                        item.coveredName ? `Coberto: ${item.coveredName}` : null,
                        item.launchSource === "manual" ? "Lançado manualmente" : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "FT pendente de dados operacionais."
                    : item.reason}
                </p>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--ink-500)]">
                    Responsável: {item.assignedOperatorName || "não atribuído"}
                  </p>
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/operacao/solicitacoes/${item.id}`}>Abrir detalhe</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
