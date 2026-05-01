export type GroupConfig = {
  label: string;
  whatsappNumber: string;
  businessUnitIds?: number[];
  companyIds?: number[];
  companyNameIncludes?: string[];
  companyNumbers?: string[];
  externalCompanyIds?: string[];
  serviceIncludes?: string[];
  serviceExcludes?: string[];
  careerIds?: number[];
  careerNameIncludes?: string[];
  workplaceNameIncludes?: string[];
  workplaceExternalIds?: string[];
  personFilter?: string;
  workplaceFilter?: string;
};

const DEFAULT_GROUPS: Record<string, GroupConfig> = {
  bombeiros: {
    label: "Dunamis Bombeiros",
    whatsappNumber: "5511919125032",
    companyIds: [11933]
  },
  servicos: {
    label: "Dunamis Servicos",
    whatsappNumber: "5511940315275",
    companyIds: [6098]
  },
  seguranca: {
    label: "Dunamis Seguranca",
    whatsappNumber: "5511940315275",
    companyIds: [6097]
  },
  rbfacilities: {
    label: "RB Facilities",
    whatsappNumber: "5511940315275",
    companyIds: [8028]
  }
};

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return result.length ? result : undefined;
}

function toNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result = value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  return result.length ? result : undefined;
}

function mergeConfig(base: GroupConfig, override: Partial<GroupConfig>): GroupConfig {
  return {
    label: String(override.label || base.label),
    whatsappNumber: String(override.whatsappNumber || base.whatsappNumber),
    businessUnitIds: toNumberArray(override.businessUnitIds) || base.businessUnitIds,
    companyIds: toNumberArray(override.companyIds) || base.companyIds,
    companyNameIncludes: toStringArray(override.companyNameIncludes) || base.companyNameIncludes,
    companyNumbers: toStringArray(override.companyNumbers) || base.companyNumbers,
    externalCompanyIds: toStringArray(override.externalCompanyIds) || base.externalCompanyIds,
    serviceIncludes: toStringArray(override.serviceIncludes) || base.serviceIncludes,
    serviceExcludes: toStringArray(override.serviceExcludes) || base.serviceExcludes,
    careerIds: toNumberArray(override.careerIds) || base.careerIds,
    careerNameIncludes: toStringArray(override.careerNameIncludes) || base.careerNameIncludes,
    workplaceNameIncludes: toStringArray(override.workplaceNameIncludes) || base.workplaceNameIncludes,
    workplaceExternalIds: toStringArray(override.workplaceExternalIds) || base.workplaceExternalIds,
    personFilter: override.personFilter || base.personFilter,
    workplaceFilter: override.workplaceFilter || base.workplaceFilter
  };
}

export function getGroupConfigs(): Record<string, GroupConfig> {
  const raw = Deno.env.get("NEXTI_GROUP_CONFIG_JSON");
  if (!raw) return DEFAULT_GROUPS;

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<GroupConfig>>;
    const merged: Record<string, GroupConfig> = { ...DEFAULT_GROUPS };

    Object.entries(parsed).forEach(([key, value]) => {
      merged[key] = mergeConfig(DEFAULT_GROUPS[key] || {
        label: key,
        whatsappNumber: ""
      }, value || {});
    });

    return merged;
  } catch (error) {
    console.error("NEXTI_GROUP_CONFIG_JSON invalido", error);
    return DEFAULT_GROUPS;
  }
}

export function requireGroupConfig(groupKey: string): GroupConfig {
  const groups = getGroupConfigs();
  const config = groups[groupKey];

  if (!config) {
    throw new Error(`Grupo nao configurado: ${groupKey}`);
  }

  return config;
}
