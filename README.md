# Portal de Trocas de Folga

Projeto estatico para solicitacao de trocas de folga, com:

- validacao forte na origem para reduzir erros de RE, data, folha e escala
- leitura de dados vivos pela API da Nexti
- controle operacional e historico no Supabase
- deploy do frontend pelo GitHub Pages

## O que eu ja deixei pronto

- frontend estatico preservando o visual atual
- camada de leitura Nexti via Supabase Edge Functions
- tabela e funcoes para:
  - registrar solicitacoes
  - aprovar/rejeitar internamente
  - listar fila operacional
  - reconciliar lancamentos manuais feitos na Nexti
  - consultar historico por folha
- workflow de deploy para GitHub Pages em `.github/workflows/deploy-pages.yml`
- build estatico em `scripts/build-pages.mjs`
- scripts locais para instalar `gh` e `supabase` sem permissao de administrador

## Automacao local

Os executaveis podem ser instalados localmente na pasta `.tools/`:

```powershell
.\scripts\install-tools.ps1
```

Depois confira a autenticacao:

```powershell
.\scripts\check-auth.ps1
```

Se ainda nao estiver autenticado:

```powershell
.\.tools\gh\bin\gh.exe auth login
.\.tools\supabase\supabase.exe login
```

## O que eu consigo fazer por aqui apos a autenticacao

### 1. Criar o projeto no Supabase

O CLI do Supabase ja foi preparado para isso. Com autenticacao pronta, eu consigo:

- criar o projeto
- vincular o repo local
- aplicar `supabase/migrations/20260428_create_troca_requests.sql`
- subir as Edge Functions
- cadastrar os secrets do Nexti

Script:

```powershell
.\scripts\deploy-supabase.ps1 `
  -ProjectName "troca-de-folga-portal" `
  -OrgId "<ORG_ID>" `
  -Region "sa-east-1" `
  -DbPassword "<SENHA_DO_BANCO>" `
  -NextiClientId "<NEXTI_CLIENT_ID>" `
  -NextiClientSecret "<NEXTI_CLIENT_SECRET>"
```

Se voce ja tiver um projeto criado, tambem posso usar:

```powershell
.\scripts\deploy-supabase.ps1 `
  -ProjectRef "<PROJECT_REF>" `
  -DbPassword "<SENHA_DO_BANCO>" `
  -NextiClientId "<NEXTI_CLIENT_ID>" `
  -NextiClientSecret "<NEXTI_CLIENT_SECRET>"
```

Observacao:

- `NEXTI_GROUP_CONFIG_JSON` recebe um padrao inicial baseado nas 4 empresas atuais
- `troca-request` e `nexti-directory` sao publicados sem verificacao de JWT
- `troca-history`, `troca-queue`, `troca-review` e `troca-reconcile` ficam protegidos para nao expor operacao sem uma camada de autenticacao

### 2. Criar o repositorio no GitHub e configurar o Pages

Com autenticacao no `gh`, eu consigo:

- criar o repositorio remoto
- fazer o primeiro push
- cadastrar as variables usadas no build do Pages

Script:

```powershell
.\scripts\create-github-repo.ps1 `
  -RepoName "troca-de-folga-portal" `
  -Visibility public `
  -SupabaseProjectUrl "https://<PROJECT_REF>.supabase.co" `
  -SupabaseAnonKey "<ANON_KEY>"
```

## Como publicar no GitHub Pages

### Variaveis do repositorio

No repositorio do GitHub, o workflow usa estas `Repository variables`:

- `SUPABASE_PROJECT_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_FUNCTIONS_BASE_URL`

Se `SUPABASE_FUNCTIONS_BASE_URL` ficar vazio, o build usa:

`<SUPABASE_PROJECT_URL>/functions/v1`

### Publicacao

Se preferir fazer sem script:

```powershell
git add .
git commit -m "Initial commit"
git remote add origin <URL_DO_REPO>
git push -u origin main
```

O workflow `.github/workflows/deploy-pages.yml` fara o deploy automatico no push para `main`.

## Build local de teste

Se quiser testar o empacotamento do Pages localmente:

```powershell
$env:SUPABASE_PROJECT_URL="https://seu-projeto.supabase.co"
$env:SUPABASE_ANON_KEY="sua-anon-key"
npm run build:pages
```

O site pronto ficara em `dist/`.

## Observacao importante de produto

Este portal **nao faz lancamentos na Nexti**.

Fluxo correto:

1. colaborador solicita no portal
2. operacao aprova/rejeita no Supabase
3. operacao lanca manualmente na Nexti
4. o sistema reconcilia por leitura e marca como `launched`

## Documentacao complementar

- `docs/nexti-supabase-transition.md`
