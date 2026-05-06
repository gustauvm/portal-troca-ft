"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OperatorAuthCallback() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/operacao/entrar?auth=email-disabled");
  }, [router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Acesso por e-mail desativado</CardTitle>
        <CardDescription>Use matrícula/RE e CPF para entrar na operação.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[color:var(--ink-700)]">Redirecionando...</p>
      </CardContent>
    </Card>
  );
}
