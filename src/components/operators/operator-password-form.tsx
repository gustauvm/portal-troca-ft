"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OperatorPasswordForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Troca de senha desativada</CardTitle>
        <CardDescription>O acesso operacional agora usa matrícula/RE e CPF, igual ao colaborador.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-[color:var(--ink-700)]">
          Links antigos enviados por e-mail não são mais necessários e não alteram senha de ninguém.
        </p>
        <Button asChild size="lg">
          <Link href="/operacao/entrar">Entrar na operação</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
