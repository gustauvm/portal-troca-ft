export type PersonPayload = {
  id?: number | null;
  externalId?: string | null;
  enrolment?: string | null;
  name?: string | null;
  scheduleId?: number | null;
  scheduleExternalId?: string | null;
  rotationId?: number | null;
  rotationCode?: number | null;
  workplaceId?: number | null;
  workplaceExternalId?: string | null;
  workplaceName?: string | null;
};

export type WorkplacePayload = {
  id?: number | null;
  externalId?: string | null;
  name?: string | null;
};

export type TrocaRequestPayload = {
  group?: string;
  requestType?: "day_off_swap" | "ft";
  requester?: PersonPayload;
  substitute?: PersonPayload;
  workplace?: WorkplacePayload;
  workDate?: string;
  offDate?: string;
  reason?: string;
};

export type ScheduleTransferPayload = {
  id: number;
  personId: number;
  scheduleId: number;
  rotationId?: number | null;
  rotationCode: number;
  personExternalId: string;
  scheduleExternalId: string;
  transferDateTime: string;
  observation: string;
};

function requireNumber(value: number | null | undefined, field: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Campo obrigatorio ausente para conciliacao Nexti: ${field}`);
  }
  return value;
}

function requireString(value: string | null | undefined, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`Campo obrigatorio ausente para conciliacao Nexti: ${field}`);
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

export function buildScheduleTransferPreview(payload: TrocaRequestPayload): ScheduleTransferPayload[] {
  const requester = payload.requester || {};
  const substitute = payload.substitute || {};

  return [
    {
      id: 0,
      personId: requireNumber(requester.id, "requester.id"),
      scheduleId: requireNumber(requester.scheduleId, "requester.scheduleId"),
      rotationId: substitute.rotationId ?? null,
      rotationCode: requireNumber(substitute.rotationCode, "substitute.rotationCode"),
      personExternalId: requireString(requester.externalId, "requester.externalId"),
      scheduleExternalId: requireString(requester.scheduleExternalId, "requester.scheduleExternalId"),
      transferDateTime: formatNextiDate(requireString(payload.workDate, "workDate")),
      observation: requireString(payload.reason, "reason")
    },
    {
      id: 0,
      personId: requireNumber(substitute.id, "substitute.id"),
      scheduleId: requireNumber(substitute.scheduleId, "substitute.scheduleId"),
      rotationId: requester.rotationId ?? null,
      rotationCode: requireNumber(requester.rotationCode, "requester.rotationCode"),
      personExternalId: requireString(substitute.externalId, "substitute.externalId"),
      scheduleExternalId: requireString(substitute.scheduleExternalId, "substitute.scheduleExternalId"),
      transferDateTime: formatNextiDate(requireString(payload.offDate, "offDate")),
      observation: requireString(payload.reason, "reason")
    }
  ];
}

export function buildNextiDraft(payload: TrocaRequestPayload) {
  return {
    requestType: payload.requestType || "day_off_swap",
    model: "schedule_transfer_pair",
    pendingApproval: true,
    generatedAt: new Date().toISOString(),
    strategy: "schedule_transfer",
    scheduleTransfers: buildScheduleTransferPreview(payload)
  };
}

export function buildNextiDraftSafe(payload: TrocaRequestPayload) {
  try {
    return {
      ready: true,
      errors: [] as string[],
      draft: buildNextiDraft(payload)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao montar preview Nexti.";
    return {
      ready: false,
      errors: [message],
      draft: {
        requestType: payload.requestType || "day_off_swap",
        model: "schedule_transfer_pair",
        pendingApproval: true,
        generatedAt: new Date().toISOString(),
        strategy: "schedule_transfer",
        scheduleTransfers: [],
        errors: [message]
      }
    };
  }
}
