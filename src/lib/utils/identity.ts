export function normalizeDigits(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeCpf(value: string | null | undefined) {
  return normalizeDigits(value).slice(0, 11);
}

export function normalizeEnrolment(value: string | null | undefined) {
  return String(value || "").trim().toUpperCase();
}

export function getShortEnrolment(value: string | null | undefined) {
  const normalized = normalizeEnrolment(value);
  if (!normalized) return "";

  if (normalized.includes("-")) {
    return normalizeDigits(normalized.split("-").pop() || "");
  }

  return normalizeDigits(normalized);
}

export function buildEnrolmentAliases(value: string | null | undefined) {
  const aliases = new Set<string>();
  const normalized = normalizeEnrolment(value);
  const digits = normalizeDigits(value);
  const short = getShortEnrolment(value);

  if (normalized) aliases.add(normalized);
  if (digits) aliases.add(digits);
  if (short) aliases.add(short);

  return Array.from(aliases);
}

export function matchesEnrolmentAlias(
  input: string | null | undefined,
  candidates: string[] | null | undefined,
) {
  const aliases = buildEnrolmentAliases(input);
  const lookup = new Set((candidates || []).map((candidate) => normalizeEnrolment(candidate)));
  return aliases.some((alias) => lookup.has(normalizeEnrolment(alias)));
}
