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
  return `${formatBrazilianDate(start)} À ${formatBrazilianDate(end)}`;
}

const BR_MONTHS = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

export function formatPayrollReferenceLabel(input: {
  reference: string;
  periodStart: string;
  periodEnd: string;
}) {
  const month = Number(String(input.reference).slice(5, 7));
  const monthLabel = BR_MONTHS[month - 1] || input.reference;
  return `${monthLabel} - ${formatDateRange(input.periodStart, input.periodEnd)}`;
}

export function titleCase(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
