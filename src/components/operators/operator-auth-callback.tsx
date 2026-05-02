"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function OperatorAuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Validando link...");

  useEffect(() => {
    let active = true;

    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const code = searchParams.get("code");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const authType = searchParams.get("type") || hashParams.get("type");

      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : { error: new Error("Link inválido ou expirado.") };

      if (!active) return;
      if (result.error) {
        setMessage(result.error.message);
        return;
      }

      router.replace(authType === "signup" || authType === "invite" ? "/operacao" : "/operacao/nova-senha");
    })();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Validação de acesso</CardTitle>
        <CardDescription>Estamos preparando a tela de senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-[color:var(--ink-700)]">{message}</p>
      </CardContent>
    </Card>
  );
}
