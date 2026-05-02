"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/utils/fetcher";
import type { PortalRequestRecord, ShiftDirectoryRecord, WorkplaceDirectoryRecord } from "@/lib/types";

type FtReasonOption = {
  id: string;
  label: string;
  requiresCoveredEmployee: boolean;
};

export function ManualRequestForm({
  workplaces,
  shifts,
  ftReasons,
}: {
  workplaces: WorkplaceDirectoryRecord[];
  shifts: ShiftDirectoryRecord[];
  ftReasons: FtReasonOption[];
}) {
  const router = useRouter();
  const [requestType, setRequestType] = useState<"swap" | "ft">("swap");
  const [ftReasonId, setFtReasonId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedReason = ftReasons.find((reason) => reason.id === ftReasonId);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError("");

    try {
      const payload =
        requestType === "swap"
          ? {
              requestType,
              requesterEnrolment: formData.get("requesterEnrolment"),
              substituteEnrolment: formData.get("substituteEnrolment"),
              requestDate: formData.get("requestDate"),
              coverageDate: formData.get("coverageDate"),
              manualAuthorizationNote: formData.get("manualAuthorizationNote"),
              operationNote: formData.get("operationNote"),
            }
          : {
              requestType,
              requesterEnrolment: formData.get("requesterEnrolment"),
              workplaceId: formData.get("workplaceId"),
              requestDate: formData.get("requestDate"),
              shiftId: formData.get("shiftId"),
              ftReasonId: formData.get("ftReasonId"),
              coveredEnrolment: formData.get("coveredEnrolment"),
              manualAuthorizationNote: formData.get("manualAuthorizationNote"),
              operationNote: formData.get("operationNote"),
            };

      const result = await fetchJson<PortalRequestRecord>("/api/ops/manual-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.push(`/operacao/solicitacoes/${result.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível criar o lançamento manual.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo lançamento manual</CardTitle>
        <CardDescription>
          Use apenas quando a coordenação autorizou uma exceção. A nota de autorização é obrigatória.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            await handleSubmit(new FormData(event.currentTarget));
          }}
        >
          <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:var(--surface-150)] p-1">
            <Button
              type="button"
              variant={requestType === "swap" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setRequestType("swap")}
            >
              Permuta (Troca de Folga)
            </Button>
            <Button
              type="button"
              variant={requestType === "ft" ? "primary" : "ghost"}
              size="sm"
              onClick={() => setRequestType("ft")}
            >
              FT
            </Button>
          </div>

          <div>
            <Label htmlFor="requesterEnrolment">RE do colaborador</Label>
            <Input id="requesterEnrolment" name="requesterEnrolment" placeholder="123-4567 ou 4567" required />
          </div>

          {requestType === "swap" ? (
            <div>
              <Label htmlFor="substituteEnrolment">RE do colega</Label>
              <Input id="substituteEnrolment" name="substituteEnrolment" placeholder="123-4567 ou 4567" required />
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="workplaceId">Unidade da FT</Label>
                <Select id="workplaceId" name="workplaceId" required>
                  <option value="">Selecione</option>
                  {workplaces.map((workplace) => (
                    <option key={workplace.id} value={workplace.id}>
                      {workplace.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="shiftId">Horário</Label>
                <Select id="shiftId" name="shiftId" required>
                  <option value="">Selecione</option>
                  {shifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>
                      {shift.name} • {shift.turn}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ftReasonId">Motivo operacional da FT</Label>
                <Select
                  id="ftReasonId"
                  name="ftReasonId"
                  value={ftReasonId}
                  onChange={(event) => setFtReasonId(event.target.value)}
                  required
                >
                  <option value="">Selecione</option>
                  {ftReasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="coveredEnrolment">
                  RE de quem foi coberto {selectedReason?.requiresCoveredEmployee ? "" : "(se aplicável)"}
                </Label>
                <Input
                  id="coveredEnrolment"
                  name="coveredEnrolment"
                  placeholder="123-4567 ou 4567"
                  required={Boolean(selectedReason?.requiresCoveredEmployee)}
                />
              </div>
            </>
          )}

          <div className={`grid gap-5 ${requestType === "swap" ? "sm:grid-cols-2" : ""}`}>
            <div>
              <Label htmlFor="requestDate">{requestType === "swap" ? "Data da folga" : "Data da FT"}</Label>
              <Input id="requestDate" name="requestDate" type="date" required />
            </div>
            {requestType === "swap" ? (
              <div>
                <Label htmlFor="coverageDate">Data de pagamento</Label>
                <Input id="coverageDate" name="coverageDate" type="date" required />
              </div>
            ) : null}
          </div>

          <div>
            <Label htmlFor="manualAuthorizationNote">Nota obrigatória da autorização</Label>
            <Textarea
              id="manualAuthorizationNote"
              name="manualAuthorizationNote"
              required
              placeholder="Quem autorizou e por qual motivo a exceção será lançada."
            />
          </div>

          <div>
            <Label htmlFor="operationNote">Observação operacional</Label>
            <Textarea id="operationNote" name="operationNote" placeholder="Complemento opcional para a timeline." />
          </div>

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Salvando..." : "Salvar lançamento manual"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
