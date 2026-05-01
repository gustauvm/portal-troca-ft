function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseConfig() {
  return {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getAppConfig() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    employeeSessionSecret: required("EMPLOYEE_SESSION_SECRET"),
    defaultTimeZone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
  };
}

export function getSupabaseFunctionsUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ||
    process.env.SUPABASE_FUNCTIONS_BASE_URL ||
    `${getSupabaseConfig().url}/functions/v1`
  );
}
