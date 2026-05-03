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

        <section className="flex-1">{children}</section>

        <nav className="fixed inset-x-3 bottom-3 z-30 mx-auto grid max-w-md grid-cols-3 gap-1 rounded-full border border-white/70 bg-white/92 p-1 shadow-[0_18px_50px_rgba(10,20,30,0.16)] backdrop-blur-xl sm:hidden">
          <Link className="grid min-h-14 place-items-center rounded-full text-[11px] font-semibold text-[color:var(--ink-800)]" href="/solicitar/permuta">
            <Shuffle className="h-4 w-4" />
            Permuta
          </Link>
          <Link className="grid min-h-14 place-items-center rounded-full text-[11px] font-semibold text-[color:var(--ink-800)]" href="/solicitar/ft">
            <SquareChartGantt className="h-4 w-4" />
            FT
          </Link>
          <Link className="grid min-h-14 place-items-center rounded-full text-[11px] font-semibold text-[color:var(--ink-800)]" href="/minhas-solicitacoes">
            <ScrollText className="h-4 w-4" />
            Minhas
          </Link>
        </nav>

        <nav className="mt-6 hidden flex-wrap justify-center gap-2 sm:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/solicitar/permuta">
              <Shuffle className="h-4 w-4" />
              Permuta (Troca de Folga)
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/solicitar/ft">
              <SquareChartGantt className="h-4 w-4" />
              FT
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/minhas-solicitacoes">
              <ScrollText className="h-4 w-4" />
              Minhas solicitações
            </Link>
          </Button>
        </nav>
      </div>
    </main>
  );
}
