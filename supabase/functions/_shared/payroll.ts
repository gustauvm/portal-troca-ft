export type PayrollWindow = {
  reference: string;
  periodStart: string;
  periodEnd: string;
};

function toIsoDate(year: number, month: number, day: number) {
  const paddedMonth = String(month).padStart(2, "0");
  const paddedDay = String(day).padStart(2, "0");
  return `${year}-${paddedMonth}-${paddedDay}`;
}

function getLastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) {
    throw new Error(`Data invalida: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

export function getPayrollWindowForDate(value: string): PayrollWindow {
  const { year, month, day } = parseIsoDate(value);
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
    periodEnd: toIsoDate(referenceYear, referenceMonth, 21)
  };
}

export function getCurrentPayrollWindow(timeZone = "America/Sao_Paulo"): PayrollWindow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${lookup.year}-${lookup.month}-${lookup.day}`;
  return getPayrollWindowForDate(today);
}

export function isDateInsideWindow(date: string, window: PayrollWindow) {
  return date >= window.periodStart && date <= window.periodEnd;
}

export function getPreviousPayrollReference(reference: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(reference || ""));
  if (!match) {
    throw new Error(`Referencia de folha invalida: ${reference}`);
  }

  let year = Number(match[1]);
  let month = Number(match[2]) - 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

export function getPayrollWindowFromReference(reference: string): PayrollWindow {
  const match = /^(\d{4})-(\d{2})$/.exec(String(reference || ""));
  if (!match) {
    throw new Error(`Referencia de folha invalida: ${reference}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  let startYear = year;
  let startMonth = month - 1;

  if (startMonth === 0) {
    startMonth = 12;
    startYear -= 1;
  }

  return {
    reference,
    periodStart: toIsoDate(startYear, startMonth, 22),
    periodEnd: toIsoDate(year, month, 21)
  };
}
