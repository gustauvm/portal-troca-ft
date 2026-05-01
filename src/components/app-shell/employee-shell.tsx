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
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-20 mb-6 rounded-[28px] border border-white/60 bg-white/78 px-4 py-4 shadow-[0_10px_40px_rgba(10,20,30,0.08)] backdrop-blur-xl sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--brand-700)]">
                Portal do colaborador
              </p>
              <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[color:var(--ink-950)]">
                {employee.fullName}
              </h1>
              <p className="text-sm text-[color:var(--ink-600)]">
                {employee.companyName}
                {employee.careerName ? ` • ${employee.careerName}` : ""}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild variant="ghost" size="sm">
                <Link href="/solicitar/permuta">
                  <Shuffle className="h-4 w-4" />
                  Permuta
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
              <EmployeeSignOutButton />
            </div>
          </div>
        </header>

        <section className="flex-1">{children}</section>
      </div>
    </main>
  );
}
