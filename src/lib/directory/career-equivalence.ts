import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CareerRuleRow = {
  rule_key: string;
  label: string;
  group_key: string | null;
  match_mode: "exact" | "prefix" | "contains";
  match_pattern: string;
};

let cachedRules: CareerRuleRow[] | null = null;
let cachedAt = 0;

function normalizeCareer(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

async function getCareerRules() {
  if (cachedRules && Date.now() - cachedAt < 60_000) {
    return cachedRules;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("career_equivalence_rules")
    .select("rule_key, label, group_key, match_mode, match_pattern")
    .eq("is_active", true);

  if (error) {
    throw new Error("Falha ao consultar equivalência de cargos.");
  }

  cachedRules = (data || []) as CareerRuleRow[];
  cachedAt = Date.now();
  return cachedRules;
}

function ruleMatches(rule: CareerRuleRow, careerName: string, groupKey?: string | null) {
  if (rule.group_key && groupKey && rule.group_key !== groupKey) return false;
  if (rule.group_key && !groupKey) return false;

  const pattern = normalizeCareer(rule.match_pattern);
  if (!pattern) return false;
  if (rule.match_mode === "exact") return careerName === pattern;
  if (rule.match_mode === "prefix") return careerName.startsWith(pattern);
  return careerName.includes(pattern);
}

export async function getCareerEquivalenceKey(input: {
  groupKey?: string | null;
  careerId?: number | null;
  careerName?: string | null;
}) {
  const normalizedCareer = normalizeCareer(input.careerName);
  if (!normalizedCareer && input.careerId === null) return "career:unknown";

  const rules = await getCareerRules();
  const groupRule = rules.find((rule) => ruleMatches(rule, normalizedCareer, input.groupKey));
  if (groupRule) return `rule:${input.groupKey || "all"}:${groupRule.rule_key}`;

  const globalRule = rules.find((rule) => !rule.group_key && ruleMatches(rule, normalizedCareer, input.groupKey));
  if (globalRule) return `rule:all:${globalRule.rule_key}`;

  if (input.careerId !== null && input.careerId !== undefined) {
    return `career-id:${input.careerId}`;
  }

  return `career-name:${normalizedCareer}`;
}

export async function areCareersEquivalent(
  left: { groupKey?: string | null; careerId?: number | null; careerName?: string | null },
  right: { groupKey?: string | null; careerId?: number | null; careerName?: string | null },
) {
  const [leftKey, rightKey] = await Promise.all([
    getCareerEquivalenceKey(left),
    getCareerEquivalenceKey(right),
  ]);

  return leftKey === rightKey;
}
