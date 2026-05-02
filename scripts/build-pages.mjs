import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://portal-troca-ft.vercel.app";

const redirectHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=${appUrl}" />
    <link rel="canonical" href="${appUrl}" />
    <title>Portal de Permutas e FT</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #f2efe8;
        color: #0f2533;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      main {
        width: min(92vw, 520px);
        padding: 32px;
        border-radius: 28px;
        background: #fffaf0;
        box-shadow: 0 24px 70px rgb(15 37 51 / 16%);
        text-align: center;
      }
      a {
        color: #0f5f7c;
        font-weight: 700;
      }
    </style>
    <script>
      window.location.replace(${JSON.stringify(appUrl)});
    </script>
  </head>
  <body>
    <main>
      <h1>Portal migrado para o Vercel</h1>
      <p>Se o redirecionamento nao acontecer automaticamente, acesse:</p>
      <p><a href="${appUrl}">${appUrl}</a></p>
    </main>
  </body>
</html>
`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const file of ["index.html", "gateway.html", "404.html"]) {
  writeFileSync(join(dist, file), redirectHtml, "utf8");
}

writeFileSync(join(dist, ".nojekyll"), "", "utf8");
writeFileSync(join(dist, "build-info.txt"), `Redirect generated at ${new Date().toISOString()}\n`, "utf8");
