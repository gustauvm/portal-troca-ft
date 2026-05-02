export function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeBrazilWhatsappPhone(primary?: string | null, secondary?: string | null) {
  const candidates = [primary, secondary]
    .map(onlyDigits)
    .filter((value) => value.length >= 10);

  for (const candidate of candidates) {
    let digits = candidate;
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  }

  return null;
}

export function formatPhoneForDisplay(value?: string | null) {
  const digits = onlyDigits(value);
  if (digits.startsWith("55") && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith("55") && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return value || "";
}
