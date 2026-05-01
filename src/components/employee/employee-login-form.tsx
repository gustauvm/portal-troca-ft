"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/utils/fetcher";

export function EmployeeLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError("");

    try {
      await fetchJson("/api/employee/session", {
        method: "POST",
        body: JSON.stringify({
          enrolment: formData.get("enrolment"),
          cpf: formData.get("cpf"),
        }),
      });

      router.push("/solicitar/permuta");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao entrar.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="text-2xl">Entrar como colaborador</CardTitle>
        <CardDescription>
          Use matrícula e CPF para abrir suas solicitações, pedir permuta ou FT e acompanhar o
          status de lançamento.
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
          <div>
            <Label htmlFor="enrolment">Matrícula</Label>
            <Input id="enrolment" name="enrolment" placeholder="123-4567 ou 4567" required />
          </div>

          <div>
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" name="cpf" placeholder="000.000.000-00" required />
          </div>

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Validando..." : "Entrar no portal"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
