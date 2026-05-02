"use client";

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmployeeOptions } from "@/hooks/use-employee-options";
import { formatDateRange } from "@/lib/utils";
import { fetchJson } from "@/lib/utils/fetcher";

type EmployeeContext = {
  employee: {
    fullName: string;
    companyName: string;
    careerName: string | null;
    workplaceName: string | null;
  };
  payroll: {
    reference: string;
    periodStart: string;
    periodEnd: string;
  };
};

type ResolvedColleague = {
  id: string;
  fullName: string;
  enrolment: string;
  companyName: string;
  careerName: string | null;
  workplaceName: string | null;
};

type ResolveColleagueResponse = {
  ok: boolean;
  error: string | null;
  candidate: ResolvedColleague | null;
};

const requestTypeConfig = {
  swap: {
    title: "Permuta (Troca de Folga)",
    success: "Permuta registrada. Ela já entrou na fila operacional.",
  },
  ft: {
    title: "FT",
    success: "Solicitação de FT registrada. Ela já entrou na fila operacional.",
  },
};

function getTodayIsoDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function assertDateIsAllowed(value: string, label: string) {
  if (!value) {
    throw new Error(`Informe ${label}.`);
  }

  if (value < getTodayIsoDate()) {
    throw new Error(`${label} já passou. Escolha uma data de hoje em diante.`);
  }
}

export function EmployeeRequestForm({
  requestType,
  context,
}: {
  requestType: "swap" | "ft";
  context: EmployeeContext;
}) {
  const router = useRouter();
  const [colleagueRe, setColleagueRe] = useState("");
  const deferredColleagueRe = useDeferredValue(colleagueRe);
  const [colleague, setColleague] = useState<ResolvedColleague | null>(null);
  const [resolveError, setResolveError] = useState("");
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const options = useEmployeeOptions(requestType, "");
  const selectedShift = options.data?.shifts?.find((shift) => shift.id === selectedShiftId);
  const config = requestTypeConfig[requestType];
  const todayIso = getTodayIsoDate();

  useEffect(() => {
    if (requestType !== "swap") return;

    const enrolment = deferredColleagueRe.trim();
    if (enrolment.length < 3) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await fetchJson<ResolveColleagueResponse>(
            `/api/employee/resolve-colleague?enrolment=${encodeURIComponent(enrolment)}`,
          );
          if (!active) return;
          setColleague(result.ok ? result.candidate : null);
          setResolveError(result.ok ? "" : result.error || "RE não liberado para permuta.");
        } catch (resolveError) {
          if (!active) return;
          setColleague(null);
          setResolveError(
            resolveError instanceof Error ? resolveError.message : "Não foi possível validar o RE informado.",
          );
        }
      })();
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [deferredColleagueRe, requestType]);

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{config.title}</CardTitle>
          <p className="text-sm font-semibold text-[color:var(--ink-600)]">
            Folha atual: {formatDateRange(context.payroll.periodStart, context.payroll.periodEnd)}
          </p>
        </CardHeader>
        <CardContent className="grid gap-6">
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              setPending(true);
              setError("");
              setSuccess("");

              startTransition(() => {
                void (async () => {
                  try {
                    const requestDate = String(formData.get("requestDate") || "");
                    const coverageDate = String(formData.get("coverageDate") || "");
                    const reason = String(formData.get("reason") || "").trim();

                    if (requestType === "swap" && !colleague?.id) {
                      throw new Error(resolveError || "Informe um RE válido para a permuta.");
                    }

                    assertDateIsAllowed(
                      requestDate,
                      requestType === "swap" ? "a data em que você vai trabalhar" : "a data da FT",
                    );

                    if (requestType === "swap") {
                      assertDateIsAllowed(coverageDate, "a data em que você vai folgar");
                      if (requestDate === coverageDate) {
                        throw new Error("As duas datas da permuta não podem ser iguais.");
                      }
                      if (reason.length < 8) {
                        throw new Error("Informe uma justificativa com pelo menos 8 caracteres.");
                      }
                    }

                    const payload =
                      requestType === "swap"
                        ? {
                            requestType,
                            substituteEmployeeId: colleague?.id,
                            requestDate,
                            coverageDate,
                            reason,
                          }
                        : {
                            requestType,
                            workplaceId: formData.get("workplaceId"),
                            requestDate,
                            shiftId: formData.get("shiftId"),
                            turn: selectedShift?.turn || "indefinido",
                          };

                    await fetchJson("/api/requests", {
                      method: "POST",
                      body: JSON.stringify(payload),
                    });

                    setSuccess(config.success);
                    form.reset();
                    setColleagueRe("");
                    setColleague(null);
                    setSelectedShiftId("");
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
                  <Label htmlFor="colleagueRe">RE do colega</Label>
                  <Input
                    id="colleagueRe"
                    value={colleagueRe}
                    onChange={(event) => {
                      setColleagueRe(event.target.value);
                      setColleague(null);
                      setResolveError("");
                    }}
                    placeholder="Digite a Matrícula/RE do colega"
                    inputMode="numeric"
                    required
                  />
                </div>

                {colleague ? (
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                    <p className="font-semibold">{colleague.fullName}</p>
                    <p>
                      RE {colleague.enrolment} • {colleague.careerName || "Cargo não informado"} •{" "}
                      {colleague.workplaceName || "Unidade não informada"}
                    </p>
                  </div>
                ) : null}

                {resolveError ? (
                  <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
                    {resolveError}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="workplaceId">Unidade da FT</Label>
                  <Select id="workplaceId" name="workplaceId" required>
                    <option value="">Selecione a unidade</option>
                    {options.data?.workplaces?.map((workplace) => (
                      <option key={workplace.id} value={workplace.id}>
                        {workplace.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="shiftId">Horário da FT</Label>
                  <Select
                    id="shiftId"
                    name="shiftId"
                    value={selectedShiftId}
                    onChange={(event) => setSelectedShiftId(event.target.value)}
                    required
                  >
                    <option value="">Selecione o horário</option>
                    {options.data?.shifts?.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.name}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-sm text-[color:var(--ink-600)]">
                    Turno: {selectedShift?.turn || "selecione um horário"}
                  </p>
                </div>
              </>
            )}

            <div className={`grid gap-5 ${requestType === "swap" ? "sm:grid-cols-2" : ""}`}>
              <div>
                <Label htmlFor="requestDate">
                  {requestType === "swap" ? "Data da sua folga" : "Data da FT"}
                </Label>
                <Input id="requestDate" name="requestDate" type="date" min={todayIso} required />
              </div>

              {requestType === "swap" ? (
                <div>
                  <Label htmlFor="coverageDate">Data de pagamento ao colega</Label>
                  <Input id="coverageDate" name="coverageDate" type="date" min={todayIso} required />
                </div>
              ) : null}
            </div>

            {requestType === "swap" ? (
              <div>
                <Label htmlFor="reason">Justificativa</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  required
                  minLength={8}
                  placeholder="Explique o motivo da permuta para a operação."
                />
              </div>
            ) : null}

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
