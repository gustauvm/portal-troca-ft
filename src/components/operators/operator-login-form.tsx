"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { fetchJson } from "@/lib/utils/fetcher";

type AuthTab = "login" | "first-access" | "reset";

const tabs: Array<{ id: AuthTab; label: string }> = [
  { id: "login", label: "Entrar" },
  { id: "first-access", label: "Primeiro acesso" },
  { id: "reset", label: "Trocar senha" },
];

export function OperatorLoginForm() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AuthTab>("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  function resetFeedback(nextTab: AuthTab) {
    setActiveTab(nextTab);
    setError("");
    setMessage("");
  }

  async function handleLogin(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
    });

    if (signInError) {
      setError("E-mail ou senha inválidos.");
      setPending(false);
      return;
    }

    router.push("/operacao");
    router.refresh();
  }

  async function handleFirstAccess(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");

    try {
      const result = await fetchJson<{ requiresConfirmation?: boolean }>("/api/ops/auth/first-access", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
          confirmation: formData.get("confirmation"),
        }),
      });
      setMessage(
        result.requiresConfirmation
          ? "Conta criada. Confirme pelo link enviado ao e-mail e depois entre."
          : "Senha criada. Use a aba Entrar para acessar a operação.",
      );
      setActiveTab("login");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível criar o primeiro acesso.");
    } finally {
      setPending(false);
    }
  }

  async function handleReset(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");

    try {
      await fetchJson("/api/ops/auth/request-password", {
        method: "POST",
        body: JSON.stringify({ email: formData.get("email") }),
      });
      setMessage("Link enviado. Abra o e-mail e defina a nova senha.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível enviar o link.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Acesso da operação</CardTitle>
        <CardDescription>Entre, crie o primeiro acesso ou troque a senha.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[color:var(--surface-150)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => resetFeedback(tab.id)}
              className={`rounded-xl px-2 py-3 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-white text-[color:var(--ink-950)] shadow-sm"
                  : "text-[color:var(--ink-600)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (activeTab === "login") await handleLogin(formData);
            if (activeTab === "first-access") await handleFirstAccess(formData);
            if (activeTab === "reset") await handleReset(formData);
          }}
        >
          <div>
            <Label htmlFor="operatorEmail">Email</Label>
            <Input id="operatorEmail" name="email" type="email" autoComplete="email" required />
          </div>

          {activeTab !== "reset" ? (
            <div>
              <Label htmlFor="operatorPassword">Senha</Label>
              <Input
                id="operatorPassword"
                name="password"
                type="password"
                minLength={activeTab === "first-access" ? 8 : undefined}
                autoComplete={activeTab === "login" ? "current-password" : "new-password"}
                required
              />
            </div>
          ) : null}

          {activeTab === "first-access" ? (
            <div>
              <Label htmlFor="operatorConfirmation">Repetir senha</Label>
              <Input
                id="operatorConfirmation"
                name="confirmation"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
          ) : null}

          {error ? (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)]">
              {error}
            </p>
          ) : null}

          {message ? (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-[color:var(--success-700)]">
              {message}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending
              ? "Processando..."
              : activeTab === "login"
                ? "Entrar"
                : activeTab === "first-access"
                  ? "Criar conta"
                  : "Enviar link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
