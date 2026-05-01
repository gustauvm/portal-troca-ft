# Portal de Permutas e FT

Portal mobile-first para:

- solicitar `permutas` e `FT`
- bloquear erro na origem com validacao de folha, empresa, cargo e escala
- mostrar historico da folha atual e anteriores
- dar visao operacional com filtros e trilha de eventos
- reconciliar automaticamente os lancamentos manuais feitos na Nexti

## Stack atual

- `Next.js 16`
- `React 19`
- `TypeScript`
- `Tailwind CSS v4`
- `Supabase` para banco, auth de operadores, realtime e jobs
- `Nexti` somente leitura

## Estado do rebuild

Ja existe uma base funcional do portal novo com:

- login do colaborador por `matricula + CPF`
- rotas reais:
  - `/entrar`
  - `/solicitar/permuta`
  - `/solicitar/ft`
  - `/minhas-solicitacoes`
  - `/operacao`
  - `/operacao/solicitacoes/[id]`
- sessao segura do colaborador via cookie assinado
- autenticacao operacional via `Supabase Auth`
- dominio novo no banco:
  - `employee_directory`
  - `workplace_directory`
  - `portal_requests`
  - `request_events`
  - `operator_assignments`
  - `nexti_sync_state`
- regras de validacao para `permuta` e `FT`
- Edge Functions novas para:
  - `nexti_directory_sync`
  - `nexti_conflict_check`
  - `nexti_request_reconcile`

## Regras de produto

Este portal **nao faz lancamentos na Nexti**.

Isso vale para:

- `permuta`
- `FT`
- aprovacao operacional
- reconciliacao automatica

Toda escrita no Nexti continua fora do portal e deve ser feita manualmente pela operacao.

Fluxo previsto:

1. colaborador solicita no portal
2. operacao aprova ou rejeita
3. operacao lanca manualmente na Nexti
4. a reconciliacao em modo leitura marca a solicitacao como localizada

## Variaveis locais do app

Crie um `.env.local` baseado neste formato:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL=
SUPABASE_SERVICE_ROLE_KEY=
EMPLOYEE_SESSION_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_TIMEZONE=America/Sao_Paulo
```

Observacoes:

- `NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL` pode apontar para `https://<project-ref>.supabase.co/functions/v1`
- `EMPLOYEE_SESSION_SECRET` deve ser uma chave longa e privada
- credenciais da Nexti ficam como `secrets` nas Edge Functions do Supabase, nao no frontend

## Rodando localmente

```powershell
npm install
npm run dev
```

## Validacoes

Checagens do app `Next.js`:

```powershell
npm run typecheck
npm run lint
```

Build de producao:

```powershell
npm run build
```

Observacao importante no Windows:

- o caminho atual desta pasta contem `#`
- isso dispara um bug do toolchain CSS/Tailwind em builds locais do `Next` quando executados diretamente daqui
- o app foi validado com build de producao em uma copia temporaria com caminho limpo
- em CI/Vercel esse problema nao deve ocorrer

## Supabase

Migration principal do rebuild:

- `supabase/migrations/20260430_rebuild_portal_v2.sql`

Functions novas:

- `supabase/functions/nexti_directory_sync`
- `supabase/functions/nexti_conflict_check`
- `supabase/functions/nexti_request_reconcile`

Functions legadas de transicao ainda existem no repo, mas o produto novo deve convergir para o fluxo `Next.js + portal_requests`.

## Deploy recomendado

Hosting principal:

- `Vercel` para o app `Next.js`
- `Supabase` para banco e Edge Functions

Superficie legada:

- `GitHub Pages` pode continuar como camada de transicao ate o cutover final

## Documentacao complementar

- `docs/nexti-supabase-transition.md`
