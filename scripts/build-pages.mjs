import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

const requiredEnv = ["SUPABASE_PROJECT_URL", "SUPABASE_ANON_KEY"];
const missing = requiredEnv.filter((name) => !process.env[name]);
const allowPlaceholder = process.env.ALLOW_PLACEHOLDER_CONFIG === "1";

if (missing.length && !allowPlaceholder) {
  console.error(`Missing required env vars for Pages build: ${missing.join(", ")}`);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const filesToCopy = ["index.html", "gateway.html"];
for (const file of filesToCopy) {
  cpSync(resolve(root, file), resolve(dist, file));
}

const directoriesToCopy = ["images", "js"];
for (const dir of directoriesToCopy) {
  if (existsSync(resolve(root, dir))) {
    cpSync(resolve(root, dir), resolve(dist, dir), { recursive: true });
  }
}

const projectUrl = process.env.SUPABASE_PROJECT_URL || "";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
const functionsBaseUrl =
  process.env.SUPABASE_FUNCTIONS_BASE_URL ||
  (projectUrl ? `${projectUrl.replace(/\/$/, "")}/functions/v1` : "");

const appConfig = `window.APP_CONFIG = {
  dataProvider: "supabase",
  supabase: {
    projectUrl: ${JSON.stringify(projectUrl)},
    anonKey: ${JSON.stringify(anonKey)},
    functionsBaseUrl: ${JSON.stringify(functionsBaseUrl)}
  },
  groups: {
    bombeiros: {
      label: "Dunamis Bombeiros",
      whatsappNumber: "5511919125032"
    },
    servicos: {
      label: "Dunamis Servicos",
      whatsappNumber: "5511940315275"
    },
    seguranca: {
      label: "Dunamis Seguranca",
      whatsappNumber: "5511940315275"
    },
    rbfacilities: {
      label: "RB Facilities",
      whatsappNumber: "5511940315275"
    }
  }
};
`;

writeFileSync(join(dist, "js", "app-config.js"), appConfig, "utf8");
writeFileSync(join(dist, ".nojekyll"), "", "utf8");

const readmeNote = `Build generated at ${new Date().toISOString()}\n`;
writeFileSync(join(dist, "build-info.txt"), readmeNote, "utf8");
