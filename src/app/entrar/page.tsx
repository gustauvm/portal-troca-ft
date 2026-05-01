import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmployeeLoginForm } from "@/components/employee/employee-login-form";
import { getEmployeeSession } from "@/lib/auth/employee-session";

export default async function EmployeeEntryPage() {
  const session = await getEmployeeSession();
  if (session) {
    redirect("/solicitar/permuta");
  }

  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:px-8">
        <section className="space-y-6">
          <Badge variant="brand">Autosserviço do colaborador</Badge>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-[color:var(--ink-950)] sm:text-5xl">
              Solicite do jeito certo antes da escala virar problema.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[color:var(--ink-700)] sm:text-lg">
              O portal valida matrícula, CPF, período de folha, compatibilidade de troca e contexto
              de cargo/empresa antes de liberar a solicitação.
            </p>
          </div>
        </section>

        <EmployeeLoginForm />
      </div>
    </main>
  );
}
