export type PortalSnapshotPerson = {
  id?: string | null;
  nextiPersonId?: number | null;
  personExternalId?: string | null;
  fullName?: string | null;
  scheduleId?: number | null;
  scheduleExternalId?: string | null;
  rotationId?: number | null;
  rotationCode?: number | null;
  shiftId?: number | null;
  shiftExternalId?: string | null;
};

export type PortalSnapshotWorkplace = {
  id?: string | null;
  nextiWorkplaceId?: number | null;
  workplaceExternalId?: string | null;
  name?: string | null;
};

export type SwapTransferPreview = {
  personId: number;
  personExternalId: string;
  scheduleId: number;
  scheduleExternalId: string;
  rotationId?: number | null;
  rotationCode: number;
  transferDateTime: string;
  observation: string;
};

function requireNumber(value: number | null | undefined, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Campo obrigatorio ausente para a Nexti: ${field}`);
  }
  return value;
}

function requireString(value: string | null | undefined, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Campo obrigatorio ausente para a Nexti: ${field}`);
  }
  return normalized;
}

export function formatNextiDate(date: string, time = "000000") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ""));
  if (!match) {
    throw new Error(`Data invalida para a Nexti: ${date}`);
  }

  const [, year, month, day] = match;
  return `${day}${month}${year}${time}`;
}

export function getNextiDayRange(date: string) {
  return {
    start: formatNextiDate(date, "000000"),
    finish: formatNextiDate(date, "235959"),
  };
}

export function nextiDateTimeToIsoDate(value?: string | null) {
  const normalized = String(value || "").trim();
  const match = /^(\d{2})(\d{2})(\d{4})/.exec(normalized);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function isSameNextiDay(isoDate: string, nextiDateTime?: string | null) {
  return nextiDateTimeToIsoDate(nextiDateTime) === isoDate;
}

export function buildSwapTransferPreview(input: {
  requester: PortalSnapshotPerson;
  substitute: PortalSnapshotPerson;
  requestDate: string;
  coverageDate: string;
  reason: string;
}) {
  const requester = input.requester || {};
  const substitute = input.substitute || {};

  return [
    {
      personId: requireNumber(requester.nextiPersonId, "requester.nextiPersonId"),
      personExternalId: requireString(requester.personExternalId, "requester.personExternalId"),
      scheduleId: requireNumber(requester.scheduleId, "requester.scheduleId"),
      scheduleExternalId: requireString(requester.scheduleExternalId, "requester.scheduleExternalId"),
      rotationId: substitute.rotationId ?? null,
      rotationCode: requireNumber(substitute.rotationCode, "substitute.rotationCode"),
      transferDateTime: formatNextiDate(input.requestDate),
      observation: requireString(input.reason, "reason"),
    },
    {
      personId: requireNumber(substitute.nextiPersonId, "substitute.nextiPersonId"),
      personExternalId: requireString(substitute.personExternalId, "substitute.personExternalId"),
      scheduleId: requireNumber(substitute.scheduleId, "substitute.scheduleId"),
      scheduleExternalId: requireString(substitute.scheduleExternalId, "substitute.scheduleExternalId"),
      rotationId: requester.rotationId ?? null,
      rotationCode: requireNumber(requester.rotationCode, "requester.rotationCode"),
      transferDateTime: formatNextiDate(input.coverageDate),
      observation: requireString(input.reason, "reason"),
    },
  ] satisfies SwapTransferPreview[];
}
