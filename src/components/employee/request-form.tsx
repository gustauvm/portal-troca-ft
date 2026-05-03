"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEmployeeOptions } from "@/hooks/use-employee-options";
import { fetchJson } from "@/lib/utils/fetcher";
import { getTodayISO } from "@/lib/utils/index";

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
    description:
      "Informe o RE do colega. O portal confere nome, unidade, cargo, escala, folha e duplicidade antes de registrar.",
    success: "Permuta registrada. Ela já entrou na fila operacional.",
  },
  ft: {
    title: "FT",
    description:
      "Informe unidade, data da folga trabalhada e horário. O motivo da FT será preenchido somente pela operação.",
    success: "Solicitação de FT registrada. Ela já entrou na fila operacional.",
  },
};

export function EmployeeRequestForm({
  requestType,
  context,
}: {
  requestType: "swap" | "ft";
  context: EmployeeContext;
}) {
  const router = useRouter();
  const pathname = usePathname();
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
    <div className="grid gap-5 pb-24 sm:pb-0">
      <div className="grid grid-cols-2 gap-2 rounded-full bg-white/72 p-1 shadow-[0_14px_32px_rgba(10,20,30,0.08)]">
        <Button
          asChild
          variant={pathname.includes("/permuta") ? "primary" : "ghost"}
          size="sm"
          className="min-h-11 rounded-full text-xs sm:text-sm"
        >
          <Link href="/solicitar/permuta">Permuta (Troca de Folga)</Link>
        </Button>
        <Button
          asChild
          variant={pathname.includes("/ft") ? "primary" : "ghost"}
          size="sm"
          className="min-h-11 rounded-full text-xs sm:text-sm"
        >
          <Link href="/solicitar/ft">FT</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{config.title}</CardTitle>
          <CardDescription>{config.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-3 rounded-[24px] bg-[color:var(--surface-150)] p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--brand-700)]">
                Colaborador
              </p>
              <p className="text-sm font-semibold text-[color:var(--ink-950)]">{context.employee.fullName}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <p className="text-sm text-[color:var(--ink-700)]">{context.employee.companyName}</p>
              <p className="text-sm text-[color:var(--ink-700)]">
                {context.employee.careerName || "Cargo não informado"}
              </p>
              <p className="text-sm text-[color:var(--ink-700)]">
                {context.employee.workplaceName || "Unidade não informada"}
              </p>
            </div>
            <p className="text-xs font-semibold text-[color:var(--ink-600)]">
              Folha atual: {context.payroll.periodStart} até {context.payroll.periodEnd}
            </p>
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
                    if (requestType === "swap" && !colleague?.id) {
                      throw new Error(resolveError || "Informe um RE válido para a permuta.");
                    }
                    const requestDate = formData.get("requestDate") as string;
                    const today = getTodayISO();
                    if (requestDate < today) {
                      throw new Error("A data não pode ser no passado.");
                    }

                    const reason = formData.get("reason") as string;
                    if (requestType === "swap" && reason.trim().length < 8) {
                      throw new Error("O motivo deve ter pelo menos 8 caracteres.");
                    }
                    const payload =
                      requestType === "swap"
                        ? {
                            requestType,
                            substituteEmployeeId: colleague?.id,
                            requestDate: formData.get("requestDate"),
                            coverageDate: formData.get("coverageDate"),
                            reason: formData.get("reason"),
                          }
                        : {
                            requestType,
                            workplaceId: formData.get("workplaceId"),
                            requestDate: formData.get("requestDate"),
                            shiftId: formData.get("shiftId"),
                            turn: selectedShift?.turn || "indefinido",
                          };

                    await fetchJson("/api/requests", {
                      method: "POST",
                      body: JSON.stringify(payload),
                    });

                    setSuccess(config.success);
                    (event.currentTarget as HTMLFormElement).reset();
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
                    placeholder="Digite a matrícula (123-4567 ou 4567)"
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
                <Input id="requestDate" name="requestDate" type="date" min={getTodayISO()} required />
              </div>

              {requestType === "swap" ? (
                <div>
                  <Label htmlFor="coverageDate">Data de pagamento ao colega</Label>
                  <Input id="coverageDate" name="coverageDate" type="date" min={getTodayISO()} required />
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
