"use client";

import { useDeferredValue, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useOpsLaunchHistory } from "@/hooks/use-ops-launch-history";
import { fetchJson } from "@/lib/utils/fetcher";
import type { NextiLaunchHistoryRecord, OperatorFiltersResponse } from "@/lib/types";
import { formatBrazilianDate } from "@/lib/utils";

export function LaunchHistoryBoard({
  filterOptions,
  defaultPayrollReference,
}: {
  filterOptions: OperatorFiltersResponse;
  defaultPayrollReference: string;
}) {
  const [error, setError] = useState("");
  const [pendingWhatsapp, setPendingWhatsapp] = useState("");
  const [filters, setFilters] = useState({
    page: 1,
    limit: 25,
    groupKey: "",
    requestType: "",
    payrollReference: defaultPayrollReference,
    companyId: "",
    careerId: "",
    scheduleId: "",
    shiftId: "",
    workplaceId: "",
    search: "",
    includeInactive: false,
  });
  const deferredSearch = useDeferredValue(filters.search);
  const query = useOpsLaunchHistory({ ...filters, search: deferredSearch });
  const items = query.data?.items || [];

  async function openWhatsapp(item: NextiLaunchHistoryRecord) {
    setPendingWhatsapp(item.id);
    setError("");

    try {
      const result = await fetchJson<{ url: string }>("/api/ops/whatsapp/manual-link", {
        method: "POST",
        body: JSON.stringify({ targetType: "nexti_history", targetId: item.id }),
      });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível abrir WhatsApp.");
    } finally {
      setPendingWhatsapp("");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Histórico Nexti</CardTitle>
          <CardDescription>
            Lançamentos já existentes na Nexti. Desligados ficam ocultos por padrão.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label htmlFor="historySearch">Busca livre</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ink-500)]" />
              <Input
                id="historySearch"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
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
              id: "companyId",
              label: "Empresa",
              options: filterOptions.companies.map((company) => ({ value: String(company.id), label: company.name })),
            },
            {
              id: "careerId",
              label: "Cargo",
              options: filterOptions.careers.map((career) => ({ value: String(career.id), label: career.name })),
            },
            {
              id: "scheduleId",
              label: "Escala",
              options: (filterOptions.schedules || []).map((schedule) => ({ value: String(schedule.id), label: schedule.name })),
            },
            {
              id: "shiftId",
              label: "Horário",
              options: (filterOptions.shifts || []).map((shift) => ({ value: String(shift.id), label: shift.name })),
            },
            {
              id: "workplaceId",
              label: "Unidade",
              options: filterOptions.workplaces.map((workplace) => ({ value: String(workplace.id), label: workplace.name })),
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
            <Label htmlFor="historyPayrollReference">Folha</Label>
            <Input
              id="historyPayrollReference"
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

          <label className="flex items-center gap-3 rounded-2xl bg-[color:var(--surface-150)] px-4 py-3 text-sm font-semibold text-[color:var(--ink-800)]">
            <input
              type="checkbox"
              checked={filters.includeInactive}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  includeInactive: event.target.checked,
                  page: 1,
                }))
              }
            />
            Incluir desligados/inativos
          </label>
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">{error}</p>
      ) : null}

      {query.isLoading ? (
        <Card>
          <CardContent className="py-8 text-sm text-[color:var(--ink-600)]">Carregando histórico Nexti...</CardContent>
        </Card>
      ) : null}

      {!query.isLoading && items.length === 0 ? (
        <EmptyState title="Nenhum lançamento encontrado" description="Ajuste os filtros ou execute o backfill histórico." />
      ) : null}

      <div className="grid gap-4">
        {items.map((item) => (
          <Card key={item.id}>
            <CardContent className="grid gap-4 px-5 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[color:var(--ink-950)]">
                    {item.requesterName} {item.requesterEnrolment ? `• RE ${item.requesterEnrolment}` : ""}
                  </p>
                  <p className="text-sm text-[color:var(--ink-600)]">
                    {item.requestType === "swap" ? "Permuta (Troca de Folga)" : "FT"}
                    {item.substituteName ? ` • cobriu ${item.substituteName}` : ""}
                    {item.workplaceName ? ` • ${item.workplaceName}` : ""}
                  </p>
                  <p className="text-sm text-[color:var(--ink-600)]">
                    {formatBrazilianDate(item.requestDate)}
                    {item.coverageDate ? ` • até ${formatBrazilianDate(item.coverageDate)}` : ""}
                  </p>
                  {!item.requesterIsActive ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--danger-700)]">
                      Inativo/desligado
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openWhatsapp(item)}
                  disabled={pendingWhatsapp !== "" || !item.requesterIsActive}
                >
                  <MessageCircle className="h-4 w-4" />
                  {pendingWhatsapp === item.id ? "Abrindo..." : "Enviar WhatsApp"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
