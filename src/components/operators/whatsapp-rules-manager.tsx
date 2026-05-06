"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchJson } from "@/lib/utils/fetcher";

type WhatsappRule = {
  id: string;
  scopeType: "global" | "group" | "company" | "workplace" | "employee" | "request_type";
  scopeKey: string;
  requestType: "swap" | "ft" | null;
  enabled: boolean;
  note: string | null;
};

export function WhatsappRulesManager() {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const query = useQuery({
    queryKey: ["whatsapp-rules"],
    queryFn: () => fetchJson<{ items: WhatsappRule[] }>("/api/ops/admin/whatsapp-rules"),
  });

  async function saveRule(formData: FormData) {
    setPending(true);
    setError("");
    try {
      await fetchJson("/api/ops/admin/whatsapp-rules", {
        method: "POST",
        body: JSON.stringify({
          scopeType: formData.get("scopeType"),
          scopeKey: formData.get("scopeKey"),
          requestType: formData.get("requestType") || null,
          enabled: formData.get("enabled") === "true",
          note: formData.get("note"),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-rules"] });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar regra.");
    } finally {
      setPending(false);
    }
  }

  async function removeRule(id: string) {
    setPending(true);
    setError("");
    try {
      await fetchJson(`/api/ops/admin/whatsapp-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-rules"] });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível remover regra.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Nova regra</CardTitle>
          <CardDescription>
            Use `*` para regra global. Para empresa, posto ou colaborador, informe o ID correspondente do cadastro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 lg:grid-cols-5"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              await saveRule(new FormData(form));
              form.reset();
            }}
          >
            <div>
              <Label htmlFor="scopeType">Escopo</Label>
              <Select id="scopeType" name="scopeType" defaultValue="global">
                <option value="global">Global</option>
                <option value="request_type">Tipo</option>
                <option value="group">Grupo</option>
                <option value="company">Empresa</option>
                <option value="workplace">Posto</option>
                <option value="employee">Colaborador</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="scopeKey">Chave</Label>
              <Input id="scopeKey" name="scopeKey" defaultValue="*" required />
            </div>
            <div>
              <Label htmlFor="requestType">Tipo específico</Label>
              <Select id="requestType" name="requestType" defaultValue="">
                <option value="">Todos</option>
                <option value="swap">Permuta (Troca de Folga)</option>
                <option value="ft">FT</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="enabled">Status</Label>
              <Select id="enabled" name="enabled" defaultValue="true">
                <option value="true">Ativo</option>
                <option value="false">Bloqueado</option>
              </Select>
            </div>
            <div className="lg:row-span-2">
              <Label htmlFor="note">Observação</Label>
              <Textarea id="note" name="note" placeholder="Ex.: bloquear posto sem telefone conferido." />
            </div>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-[color:var(--danger-700)] lg:col-span-5">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="lg:col-span-2">
              {pending ? "Salvando..." : "Salvar regra"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regras cadastradas</CardTitle>
          <CardDescription>A regra mais específica prevalece sobre a global.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {query.isLoading ? <p className="text-sm text-[color:var(--ink-600)]">Carregando regras...</p> : null}
          {(query.data?.items || []).map((rule) => (
            <div key={rule.id} className="grid gap-3 rounded-2xl border border-black/6 bg-white/76 p-4 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm font-semibold text-[color:var(--ink-950)]">
                  {rule.scopeType} • {rule.scopeKey} • {rule.requestType || "todos"}
                </p>
                <p className="text-sm text-[color:var(--ink-600)]">
                  {rule.enabled ? "WhatsApp ativo" : "WhatsApp bloqueado"}
                  {rule.note ? ` • ${rule.note}` : ""}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => removeRule(rule.id)} disabled={pending}>
                Remover
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
