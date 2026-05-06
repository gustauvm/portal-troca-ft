"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/utils/fetcher";

export function OperatorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const emailAuthDisabled = searchParams.get("auth") === "email-disabled";

  async function handleLogin(formData: FormData) {
    setPending(true);
    setError("");

    try {
      await fetchJson("/api/ops/auth/session", {
        method: "POST",
        body: JSON.stringify({
          enrolment: formData.get("enrolment"),
          cpf: formData.get("cpf"),
        }),
      });
      router.push("/operacao");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Matrícula/RE ou CPF inválidos.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Acesso da operação</CardTitle>
        <CardDescription>Entre com sua matrícula/RE e CPF.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            await handleLogin(new FormData(event.currentTarget));
          }}
        >
          <div>
            <Label htmlFor="operatorEnrolment">Matrícula/RE</Label>
            <Input id="operatorEnrolment" name="enrolment" placeholder="Digite sua Matrícula/RE" required />
          </div>

          <div>
            <Label htmlFor="operatorCpf">CPF</Label>
            <Input id="operatorCpf" name="cpf" inputMode="numeric" autoComplete="off" placeholder="Digite seu CPF" required />
          </div>

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
              {error}
            </p>
          ) : null}

          {emailAuthDisabled && !error ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Acesso por e-mail foi desativado. Entre com matrícula/RE e CPF.
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
