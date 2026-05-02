"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchJson } from "@/lib/utils/fetcher";

export function OperatorPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    let active = true;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : accessToken && refreshToken
          ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          : await supabase.auth.getSession();

      if (!active) return;
      if ("error" in result && result.error) setError(result.error.message);
      if ("data" in result && !result.data.session) setError("Link inválido ou expirado. Solicite a troca de senha novamente.");
      setReady(true);
    })();

    return () => {
      active = false;
    };
  }, [searchParams]);

  async function handleSubmit(formData: FormData) {
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");
    setError("");

    if (password !== confirmation) {
      setError("As senhas não conferem.");
      return;
    }

    setPending(true);
    try {
      await fetchJson("/api/ops/auth/update-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      router.push("/operacao");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar a senha.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Criar ou recuperar senha</CardTitle>
        <CardDescription>Defina uma nova senha para acessar a operação.</CardDescription>
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
            <Label htmlFor="password">Nova senha</Label>
            <Input id="password" name="password" type="password" minLength={8} required disabled={!ready} />
          </div>
          <div>
            <Label htmlFor="confirmation">Confirmar senha</Label>
            <Input id="confirmation" name="confirmation" type="password" minLength={8} required disabled={!ready} />
          </div>

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={!ready || pending}>
            {pending ? "Salvando..." : "Salvar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
