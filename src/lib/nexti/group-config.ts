import "server-only";

export type NextiGroupConfig = {
  businessUnitIds?: number[];
  companyIds?: number[];
  careerIds?: number[];
  careerNameIncludes?: string[];
  serviceIncludes?: string[];
  serviceExcludes?: string[];
  workplaceExternalIds?: string[];
  workplaceNameIncludes?: string[];
  companyNumbers?: string[];
  companyNameIncludes?: string[];
};

export const NEXTI_GROUP_CONFIGS = {
  bombeiros: {
    companyIds: [11933],
  },
  servicos: {
    companyIds: [6098],
  },
  seguranca: {
    companyIds: [6097],
  },
  rbfacilities: {
    companyIds: [8028],
  },
} satisfies Record<string, NextiGroupConfig>;

export type NextiGroupKey = keyof typeof NEXTI_GROUP_CONFIGS;

export function getRequestedGroups(group?: string | null) {
  if (group) {
    const config = NEXTI_GROUP_CONFIGS[group as NextiGroupKey];
    if (!config) {
      throw new Error(`Grupo Nexti nao configurado: ${group}`);
    }
    return [[group, config]] as const;
  }

  return Object.entries(NEXTI_GROUP_CONFIGS);
}

export function findGroupKeyByCompanyId(companyId: number | null | undefined) {
  const numericCompanyId = Number(companyId);
  if (!Number.isFinite(numericCompanyId)) {
    return null;
  }

  for (const [groupKey, config] of Object.entries(NEXTI_GROUP_CONFIGS)) {
    if (config.companyIds?.includes(numericCompanyId)) {
      return groupKey;
    }
  }

  return null;
}
