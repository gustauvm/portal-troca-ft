import Link from "next/link";
import { EmployeeLoginForm } from "@/components/employee/employee-login-form";
import { AuthHashRedirect } from "@/components/operators/auth-hash-redirect";

export default function HomePage() {
  return (
    <main className="page-shell min-h-screen">
      <AuthHashRedirect />
      <details className="group fixed left-3 top-3 z-30">
        <summary className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full bg-white/86 text-sm font-bold text-[color:var(--brand-700)] shadow-[0_12px_32px_rgba(10,20,30,0.12)] ring-1 ring-black/8">
          Op
        </summary>
        <div className="mt-2 rounded-3xl bg-white/92 p-2 shadow-[0_18px_45px_rgba(10,20,30,0.14)] ring-1 ring-black/8">
          <Link
            href="/operacao/entrar"
            className="block whitespace-nowrap rounded-2xl px-4 py-3 text-sm font-semibold text-[color:var(--ink-900)] hover:bg-[color:var(--surface-150)]"
          >
            Login da operação
          </Link>
        </div>
      </details>

      <div className="mx-auto grid min-h-screen w-full max-w-md place-items-center px-4 py-8">
        <EmployeeLoginForm />
      </div>
    </main>
  );
}
