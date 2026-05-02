export type PayrollWindow = {
  reference: string;
  periodStart: string;
  periodEnd: string;
};

function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseReference(reference: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(reference);
  if (!match) {
    throw new Error(`Referencia de folha invalida: ${reference}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
  };
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Data invalida: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function getPayrollWindowForDate(date: string): PayrollWindow {
  const { year, month, day } = parseIsoDate(date);
  let referenceYear = year;
  let referenceMonth = month;

  if (day >= 22) {
    referenceMonth += 1;
    if (referenceMonth > 12) {
      referenceMonth = 1;
      referenceYear += 1;
    }
  }

  let startYear = referenceYear;
  let startMonth = referenceMonth - 1;
  if (startMonth === 0) {
    startMonth = 12;
    startYear -= 1;
  }

  return {
    reference: `${referenceYear}-${String(referenceMonth).padStart(2, "0")}`,
    periodStart: toIsoDate(startYear, startMonth, 22),
    periodEnd: toIsoDate(referenceYear, referenceMonth, 21),
  };
}

export function getPayrollWindowFromReference(reference: string): PayrollWindow {
  const { year, month } = parseReference(reference);
  let startYear = year;
  let startMonth = month - 1;

  if (startMonth === 0) {
    startMonth = 12;
    startYear -= 1;
  }

  return {
    reference,
    periodStart: toIsoDate(startYear, startMonth, 22),
    periodEnd: toIsoDate(year, month, 21),
  };
}

export function getCurrentPayrollWindow(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return getPayrollWindowForDate(`${lookup.year}-${lookup.month}-${lookup.day}`);
}

export function isDateInsidePayroll(date: string, payroll: PayrollWindow) {
  return date >= payroll.periodStart && date <= payroll.periodEnd;
}

export function buildPayrollReferences(startDate: string, endDate = new Date()) {
  const references: PayrollWindow[] = [];
  const start = parseIsoDate(startDate);
  const endReference = getPayrollWindowForDate(
    `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
  ).reference;

  let current = getPayrollWindowForDate(toIsoDate(start.year, start.month, start.day)).reference;

  while (current <= endReference) {
    references.push(getPayrollWindowFromReference(current));
    const { year, month } = parseReference(current);
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
      nextYear += 1;
      nextMonth = 1;
    }
    current = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  }

  return references.reverse();
}
