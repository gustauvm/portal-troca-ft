import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAppConfig } from "@/lib/env";
import type { OperatorRole } from "@/lib/types";

export const OPERATOR_SESSION_COOKIE = "portal_operator_session";
const OPERATOR_SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export type OperatorCookieSession = {
  employeeId: string;
  accessId: string;
  authUserId: string;
  fullName: string;
  enrolment: string;
  role: OperatorRole;
  exp: number;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function sign(value: string) {
  return createHmac("sha256", getAppConfig().employeeSessionSecret).update(value).digest("base64url");
}

function packSession(payload: OperatorCookieSession) {
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function unpackSession(cookieValue: string): OperatorCookieSession | null {
  const [body, signature] = String(cookieValue || "").split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body)) as OperatorCookieSession;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createOperatorSessionCookie(payload: Omit<OperatorCookieSession, "exp">) {
  return packSession({
    ...payload,
    exp: Date.now() + OPERATOR_SESSION_TTL_MS,
  });
}

export async function getOperatorCookieSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OPERATOR_SESSION_COOKIE)?.value;
  return token ? unpackSession(token) : null;
}

export async function clearOperatorSession() {
  const cookieStore = await cookies();
  cookieStore.delete(OPERATOR_SESSION_COOKIE);
}

export function getOperatorSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OPERATOR_SESSION_TTL_MS / 1000,
  };
}
