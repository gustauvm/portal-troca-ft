import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { OperatorLoginForm } from "@/components/operators/operator-login-form";
import { getOperatorSession } from "@/lib/auth/operator";

export default async function OperatorEntryPage() {
  const operator = await getOperatorSession();
  if (operator) {
    redirect("/operacao");
  }

  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:px-8">
        <section className="space-y-6">
          <Badge variant="brand">Mesa operacional</Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-[color:var(--ink-950)] sm:text-5xl">
              Fila viva, rastreabilidade real e menos retrabalho no lançamento.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[color:var(--ink-700)] sm:text-lg">
              Entre com sua conta operacional para acompanhar solicitações, assumir a fila,
              aprovar, rejeitar e reconciliar o lançamento manual na Nexti.
            </p>
          </div>
        </section>

        <OperatorLoginForm />
      </div>
    </main>
  );
}
