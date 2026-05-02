import { Suspense } from "react";
import { OperatorAuthCallback } from "@/components/operators/operator-auth-callback";

export default function OperatorAuthCallbackPage() {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-md place-items-center px-4 py-8">
        <Suspense fallback={null}>
          <OperatorAuthCallback />
        </Suspense>
      </div>
    </main>
  );
}
