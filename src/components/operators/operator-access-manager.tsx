"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { fetchJson } from "@/lib/utils/fetcher";
import type { OperatorAccessRecord, OperatorFiltersResponse, OperatorRole } from "@/lib/types";

export function OperatorAccessManager({
  initialItems,
  filterOptions,
}: {
  initialItems: OperatorAccessRecord[];
  filterOptions: OperatorFiltersResponse;
}) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState<OperatorRole>("operator");
  const [canViewAll, setCanViewAll] = useState(true);
  const [canEditAll, setCanEditAll] = useState(true);
  const [viewGroupKeys, setViewGroupKeys] = useState<string[]>([]);
  const [editGroupKeys, setEditGroupKeys] = useState<string[]>([]);
  const [viewCompanyIds, setViewCompanyIds] = useState<number[]>([]);
  const [editCompanyIds, setEditCompanyIds] = useState<number[]>([]);
  const [pending, setPending] = useState(false);

  function toggleText(list: string[], value: string, setter: (next: string[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function toggleNumber(list: number[], value: number, setter: (next: number[]) => void) {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function refreshItems() {
    const result = await fetchJson<{ items: OperatorAccessRecord[] }>("/api/ops/admin/operators");
    setItems(result.items);
  }

  async function saveAccess(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");

    try {
      await fetchJson("/api/ops/admin/operators", {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          fullName: formData.get("fullName"),
          role,
          canViewAll,
          canEditAll,
          viewGroupKeys,
          editGroupKeys,
          viewCompanyIds,
          editCompanyIds,
        }),
      });
      await refreshItems();
      setMessage("Acesso salvo. O e-mail já pode criar ou recuperar senha.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o acesso.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(email: string) {
    setPending(true);
    setError("");
    setMessage("");

    try {
      await fetchJson(`/api/ops/admin/operators?email=${encodeURIComponent(email)}`, { method: "DELETE" });
      await refreshItems();
      setMessage("Acesso removido.");
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Não foi possível remover o acesso.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Adicionar ou alterar acesso</CardTitle>
          <CardDescription>
            Por padrão, operadores podem ver e alterar tudo. Desmarque para limitar por grupo ou empresa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-5"
            onSubmit={async (event) => {
              event.preventDefault();
              await saveAccess(new FormData(event.currentTarget));
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div>
                <Label htmlFor="fullName">Nome</Label>
                <Input id="fullName" name="fullName" placeholder="Opcional" />
              </div>
            </div>

            <div>
              <Label htmlFor="role">Papel</Label>
              <Select id="role" value={role} onChange={(event) => setRole(event.target.value as OperatorRole)}>
                <option value="operator">Operador</option>
                <option value="admin">Admin</option>
              </Select>
            </div>

            {role === "operator" ? (
              <>
                <div className="grid gap-3 rounded-3xl bg-[color:var(--surface-150)] p-4 sm:grid-cols-2">
                  <label className="flex items-center gap-3 text-sm font-semibold text-[color:var(--ink-900)]">
                    <input type="checkbox" checked={canViewAll} onChange={(event) => setCanViewAll(event.target.checked)} />
                    Pode visualizar todos os grupos/empresas
                  </label>
                  <label className="flex items-center gap-3 text-sm font-semibold text-[color:var(--ink-900)]">
                    <input type="checkbox" checked={canEditAll} onChange={(event) => setCanEditAll(event.target.checked)} />
                    Pode alterar todos os grupos/empresas
                  </label>
                </div>

                {!canViewAll || !canEditAll ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="bg-white/70">
                      <CardHeader>
                        <CardTitle className="text-base">Limites por grupo</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3">
                        {filterOptions.groups.map((group) => (
                          <div key={group} className="grid gap-2 rounded-2xl bg-[color:var(--surface-150)] p-3">
                            <p className="text-sm font-semibold text-[color:var(--ink-950)]">{group}</p>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={viewGroupKeys.includes(group)}
                                disabled={canViewAll}
                                onChange={() => toggleText(viewGroupKeys, group, setViewGroupKeys)}
                              />
                              Visualizar
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editGroupKeys.includes(group)}
                                disabled={canEditAll}
                                onChange={() => toggleText(editGroupKeys, group, setEditGroupKeys)}
                              />
                              Alterar
                            </label>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="bg-white/70">
                      <CardHeader>
                        <CardTitle className="text-base">Limites por empresa</CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3">
                        {filterOptions.companies.map((company) => (
                          <div key={company.id} className="grid gap-2 rounded-2xl bg-[color:var(--surface-150)] p-3">
                            <p className="text-sm font-semibold text-[color:var(--ink-950)]">{company.name}</p>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={viewCompanyIds.includes(company.id)}
                                disabled={canViewAll}
                                onChange={() => toggleNumber(viewCompanyIds, company.id, setViewCompanyIds)}
                              />
                              Visualizar
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editCompanyIds.includes(company.id)}
                                disabled={canEditAll}
                                onChange={() => toggleNumber(editCompanyIds, company.id, setEditCompanyIds)}
                              />
                              Alterar
                            </label>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                ) : null}
              </>
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
              {pending ? "Salvando..." : "Salvar acesso"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acessos atuais</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {items.map((item) => (
            <div key={item.email} className="grid gap-3 rounded-3xl bg-white/76 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="font-semibold text-[color:var(--ink-950)]">{item.email}</p>
                <p className="text-sm text-[color:var(--ink-600)]">
                  {item.role} • {item.status} • {item.canViewAll ? "visualiza tudo" : "visualização limitada"} •{" "}
                  {item.canEditAll ? "altera tudo" : "alteração limitada"}
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => revoke(item.email)} disabled={pending || item.status === "revoked"}>
                Remover
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
