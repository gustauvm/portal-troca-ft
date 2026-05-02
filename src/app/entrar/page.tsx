import { redirect } from "next/navigation";
import { EmployeeLoginForm } from "@/components/employee/employee-login-form";
import { getEmployeeSession } from "@/lib/auth/employee-session";

export default async function EmployeeEntryPage() {
  const session = await getEmployeeSession();
  if (session) {
    redirect("/solicitar/permuta");
  }

  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-md place-items-center px-4 py-8">
        <EmployeeLoginForm />
      </div>
    </main>
  );
}
