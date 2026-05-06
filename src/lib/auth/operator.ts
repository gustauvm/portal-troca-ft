import { redirect } from "next/navigation";
import { getOperatorSessionByAccessId } from "@/lib/auth/operator-access";
import { getOperatorCookieSession } from "@/lib/auth/operator-session";

export async function getOperatorSession() {
  const cookieSession = await getOperatorCookieSession();
  if (!cookieSession) return null;

  return getOperatorSessionByAccessId(cookieSession.accessId);
}

export async function requireOperatorSession() {
  const session = await getOperatorSession();
  if (!session) {
    redirect("/operacao/entrar");
  }
  return session;
}
