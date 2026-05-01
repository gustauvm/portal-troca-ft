"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmployeeOptions } from "@/hooks/use-employee-options";
import { fetchJson } from "@/lib/utils/fetcher";

type EmployeeContext = {
  employee: {
    fullName: string;
    companyName: string;
    careerName: string | null;
  };
  payroll: {
    reference: string;
    periodStart: string;
    periodEnd: string;
  };
};

export function EmployeeRequestForm({
  requestType,
  context,
}: {
  requestType: "swap" | "ft";
  context: EmployeeContext;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const options = useEmployeeOptions(requestType, search);

  const title = requestType === "swap" ? "Solicitar permuta" : "Solicitar FT";
  const description =
    requestType === "swap"
      ? "Escolha um colega do mesmo cargo e empresa. O portal vai validar conflito de escala, folha e consistência da troca antes de registrar."
      : "Registre a folga trabalhada com a unidade correta. A validação bloqueia datas fora da folha e inconsistências de escala.";

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 rounded-[24px] bg-[color:var(--surface-150)] p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                Colaborador
              </p>
              <p className="text-sm font-semibold text-[color:var(--ink-950)]">{context.employee.fullName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                Empresa
              </p>
              <p className="text-sm font-semibold text-[color:var(--ink-950)]">{context.employee.companyName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                Folha atual
              </p>
              <p className="text-sm font-semibold text-[color:var(--ink-950)]">
                {context.payroll.periodStart} até {context.payroll.periodEnd}
              </p>
            </div>
          </div>

          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              setPending(true);
              setError("");
              setSuccess("");

              startTransition(() => {
                void (async () => {
                try {
                  const payload =
                    requestType === "swap"
                      ? {
                          requestType,
                          substituteEmployeeId: formData.get("substituteEmployeeId"),
                          workplaceId: formData.get("workplaceId") || null,
                          requestDate: formData.get("requestDate"),
                          coverageDate: formData.get("coverageDate"),
                          reason: formData.get("reason"),
                        }
                      : {
                          requestType,
                          workplaceId: formData.get("workplaceId"),
                          requestDate: formData.get("requestDate"),
                          reason: formData.get("reason"),
                        };

                  await fetchJson("/api/requests", {
                    method: "POST",
                    body: JSON.stringify(payload),
                  });

                  setSuccess(
                    requestType === "swap"
                      ? "Permuta registrada. Ela já entrou na fila operacional."
                      : "Solicitação de FT registrada. Ela já entrou na fila operacional.",
                  );
                  (event.currentTarget as HTMLFormElement).reset();
                  router.refresh();
                } catch (submitError) {
                  setError(
                    submitError instanceof Error
                      ? submitError.message
                      : "Não foi possível registrar a solicitação.",
                  );
                } finally {
                  setPending(false);
                }
                })();
              });
            }}
          >
            {requestType === "swap" ? (
              <>
                <div>
                  <Label htmlFor="candidateSearch">Buscar colega</Label>
                  <Input
                    id="candidateSearch"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Digite nome ou matrícula"
                  />
                </div>

                <div>
                  <Label htmlFor="substituteEmployeeId">Colaborador da permuta</Label>
                  <Select id="substituteEmployeeId" name="substituteEmployeeId" required>
                    <option value="">Selecione um colega</option>
                    {options.data?.candidates?.map(
                      (candidate: {
                        id: string;
                        fullName: string;
                        enrolment: string;
                      }) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.fullName} • RE {candidate.enrolment}
                        </option>
                      ),
                    )}
                  </Select>
                </div>
              </>
            ) : null}

            <div>
              <Label htmlFor="workplaceId">Unidade</Label>
              <Select id="workplaceId" name="workplaceId" required={requestType === "ft"}>
                <option value="">Selecione a unidade</option>
                {options.data?.workplaces?.map(
                  (workplace: {
                    id: string;
                    name: string;
                    groupKey: string;
                  }) => (
                    <option key={workplace.id} value={workplace.id}>
                      {workplace.name}
                    </option>
                  ),
                )}
              </Select>
            </div>

            <div className={`grid gap-5 ${requestType === "swap" ? "sm:grid-cols-2" : ""}`}>
              <div>
                <Label htmlFor="requestDate">
                  {requestType === "swap" ? "Data principal da troca" : "Data da folga trabalhada"}
                </Label>
                <Input id="requestDate" name="requestDate" type="date" required />
              </div>

              {requestType === "swap" ? (
                <div>
                  <Label htmlFor="coverageDate">Data de compensação</Label>
                  <Input id="coverageDate" name="coverageDate" type="date" required />
                </div>
              ) : null}
            </div>

            <div>
              <Label htmlFor="reason">Motivo</Label>
              <Textarea
                id="reason"
                name="reason"
                required
                placeholder={
                  requestType === "swap"
                    ? "Explique o motivo da permuta para a operação."
                    : "Explique o motivo da FT para a operação."
                }
              />
            </div>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
                {error}
              </p>
            ) : null}

            {success ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-[color:var(--success-700)]">
                {success}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={pending || options.isLoading}>
              {pending ? "Registrando..." : "Registrar solicitação"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
