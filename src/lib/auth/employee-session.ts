import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAppConfig } from "@/lib/env";

export const EMPLOYEE_SESSION_COOKIE = "portal_employee_session";
const EMPLOYEE_SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export type EmployeeSession = {
  employeeId: string;
  personExternalId: string;
  groupKey: string;
  companyId: number | null;
  careerId: number | null;
  fullName: string;
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

function packSession(payload: EmployeeSession) {
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

function unpackSession(cookieValue: string): EmployeeSession | null {
  const [body, signature] = String(cookieValue || "").split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(body)) as EmployeeSession;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createEmployeeSessionCookie(payload: Omit<EmployeeSession, "exp">) {
  return packSession({
    ...payload,
    exp: Date.now() + EMPLOYEE_SESSION_TTL_MS,
  });
}

export async function getEmployeeSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(EMPLOYEE_SESSION_COOKIE)?.value;
  return token ? unpackSession(token) : null;
}

export async function clearEmployeeSession() {
  const cookieStore = await cookies();
  cookieStore.delete(EMPLOYEE_SESSION_COOKIE);
}

export function getEmployeeSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: EMPLOYEE_SESSION_TTL_MS / 1000,
  };
}
