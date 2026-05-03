import Link from "next/link";
import { ScrollText, Shuffle, SquareChartGantt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeSignOutButton } from "@/components/app-shell/signout-buttons";

export function EmployeeShell({
  employee,
  children,
}: {
  employee: {
    fullName: string;
    companyName: string;
    careerName: string | null;
  };
  children: React.ReactNode;
}) {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 rounded-[28px] border border-white/60 bg-white/78 px-4 py-4 shadow-[0_10px_34px_rgba(10,20,30,0.07)] backdrop-blur-xl sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--brand-700)]">
                Portal do colaborador
              </p>
              <h1 className="truncate text-xl font-semibold tracking-[-0.04em] text-[color:var(--ink-950)]">
                {employee.fullName}
              </h1>
              <p className="truncate text-sm text-[color:var(--ink-600)]">
                {employee.companyName}
                {employee.careerName ? ` • ${employee.careerName}` : ""}
              </p>
            </div>
            <EmployeeSignOutButton />
          </div>
        </header>

        <nav className="mb-5 flex flex-wrap justify-start gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/solicitar/permuta">
              <Shuffle className="h-4 w-4" />
              <span className="hidden xs:inline">Permuta (Troca de Folga)</span>
              <span className="inline xs:hidden">Permuta</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/solicitar/ft">
              <SquareChartGantt className="h-4 w-4" />
              FT
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link href="/minhas-solicitacoes">
              <ScrollText className="h-4 w-4" />
              <span className="hidden xs:inline">Minhas solicitações</span>
              <span className="inline xs:hidden">Minhas</span>
            </Link>
          </Button>
        </nav>

        <section className="flex-1 pb-24 sm:pb-0">{children}</section>
      </div>
    </main>
  );
}
