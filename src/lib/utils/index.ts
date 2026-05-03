import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBrazilianDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function formatDateRange(start: string, end: string) {
  return `${formatBrazilianDate(start)} a ${formatBrazilianDate(end)}`;
}

export function titleCase(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getTodayISO() {
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function friendlyZodError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Erro na validação. Tente novamente.";
  }

  const message = error.message;
  
  // Check for common Zod validation errors
  if (message.includes("too_small")) {
    if (message.includes("reason")) {
      return "O motivo deve ter pelo menos 8 caracteres.";
    }
    return "Valor informado é muito pequeno.";
  }

  if (message.includes("too_large")) {
    return "Valor informado é muito grande.";
  }

  if (message.includes("Discriminator")) {
    return "Tipo de solicitação inválido.";
  }

  if (message.includes("String")) {
    return "Valor informado é inválido.";
  }

  // If it's a custom error message from our validation, return as-is
  return message;
}
