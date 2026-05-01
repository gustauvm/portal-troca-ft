"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/utils/fetcher";

export function ReviewActions({
  requestId,
  canReview,
}: {
  requestId: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"" | "assign" | "approve" | "reject">("");

  async function run(action: "assign" | "approve" | "reject") {
    setPending(action);
    setError("");

    try {
      if (action === "assign") {
        await fetchJson(`/api/ops/requests/${requestId}/assign`, {
          method: "POST",
          body: JSON.stringify({ note }),
        });
      } else {
        await fetchJson(`/api/ops/requests/${requestId}/review`, {
          method: "POST",
          body: JSON.stringify({
            decision: action === "approve" ? "approve" : "reject",
            note,
          }),
        });
      }

      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Falha na operação.");
    } finally {
      setPending("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ações operacionais</CardTitle>
        <CardDescription>
          Assuma a solicitação, registre observação e decida se ela segue ou não para lançamento manual.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <Label htmlFor="decisionNote">Observação operacional</Label>
          <Textarea
            id="decisionNote"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex.: validado com posto, lançamento previsto para o próximo turno."
          />
        </div>

        {error ? (
          <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Button variant="secondary" onClick={() => run("assign")} disabled={pending !== ""}>
            {pending === "assign" ? "Assumindo..." : "Assumir"}
          </Button>
          <Button onClick={() => run("approve")} disabled={!canReview || pending !== ""}>
            {pending === "approve" ? "Aprovando..." : "Aprovar"}
          </Button>
          <Button variant="danger" onClick={() => run("reject")} disabled={!canReview || pending !== ""}>
            {pending === "reject" ? "Rejeitando..." : "Rejeitar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
