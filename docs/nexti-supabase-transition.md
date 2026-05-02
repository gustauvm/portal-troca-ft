# Transicao inicial: Google -> Nexti + Supabase

## Objetivo desta etapa

Esta base remove o acoplamento do frontend com Google Sheets e Google Forms sem alterar o visual do portal.

O schema ja foi deixado preparado para `request_type`, com `day_off_swap` agora e espaco para `ft` na proxima etapa.

O fluxo passa a ser:

1. `gateway.html` continua escolhendo o grupo.
2. `index.html` continua com o mesmo layout.
3. O navegador chama `Supabase Edge Functions`.
4. As functions autenticam na Nexti com `OAuth2 client_credentials`.
5. A function `nexti-directory` devolve colaboradores e postos reais.
6. A function `troca-request` grava a solicitacao no Supabase e prepara apenas um modelo interno de conciliacao.
7. A function `troca-review` aprova/rejeita a solicitacao internamente.
8. A function `troca-queue` lista a fila de solicitacoes para a mesa operacional.
9. A function `troca-reconcile` consulta a Nexti em modo leitura e marca a solicitacao como lancada quando encontrar o registro manual.
10. A function `troca-history` lista o historico do colaborador por folha.

## Regra inviolavel

O portal nao pode criar, alterar ou excluir registros operacionais na Nexti.

Em outras palavras:

- o portal pode autenticar na Nexti
- o portal pode consultar a Nexti
- o portal pode reconciliar por leitura
- o portal nao pode lancar `schedule transfer`
- o portal nao pode lancar `replacement`
- o portal nao pode fazer `POST`, `PUT` ou `DELETE` de dados operacionais na Nexti

## O que ja ficou pronto

- `js/portal-app.js`
  - remove toda a dependencia de CSV e Google Forms
  - mantem a mesma interface e o mesmo fluxo visual
  - busca colaboradores/postos via Supabase Functions
  - salva a solicitacao via backend
  - bloqueia matriculas ambiguas em vez de sobrescrever silenciosamente

- `supabase/functions/nexti-directory`
  - autentica na Nexti
  - lista postos e colaboradores
  - filtra por grupo
  - devolve payload reduzido para o frontend

- `supabase/functions/troca-request`
  - recebe a solicitacao do portal
  - grava no Supabase
  - gera mensagem de WhatsApp
  - salva um `nexti_draft` apenas para reconciliacao

- `supabase/functions/troca-review`
  - aprova ou rejeita a solicitacao
  - registra auditoria basica (`approved_by`, `rejected_by`, `decision_note`)
  - nao escreve nada na Nexti

- `supabase/functions/troca-queue`
  - lista solicitacoes por status e grupo
  - entrega uma fila simples para operacao ou painel admin

- `supabase/functions/troca-reconcile`
  - consulta a Nexti somente por leitura
  - tenta encontrar o lancamento manual correspondente
  - marca a solicitacao como `launched` quando houver correspondencia

- `supabase/functions/troca-history`
  - lista solicitacoes do colaborador na folha atual
  - base para a futura pagina "minhas trocas / FTs"

- `supabase/migrations/20260428_create_troca_requests.sql`
  - cria a tabela de solicitacoes
  - habilita RLS
  - adiciona trigger de `updated_at`
  - inclui colunas de aprovacao, folha atual e reconciliacao Nexti

## Configuracao minima

### 1. Frontend

Edite `js/app-config.js`:

```js
window.APP_CONFIG = {
  dataProvider: "supabase",
  supabase: {
    projectUrl: "https://SEU-PROJETO.supabase.co",
    anonKey: "SUA_SUPABASE_ANON_KEY",
    functionsBaseUrl: "https://SEU-PROJETO.supabase.co/functions/v1"
  }
};
```

### 2. Secrets no Supabase

Defina estes secrets nas Edge Functions:

- `NEXTI_CLIENT_ID`
- `NEXTI_CLIENT_SECRET`
- `NEXTI_API_BASE_URL`
- `NEXTI_GROUP_CONFIG_JSON`
- `NEXTI_RECONCILIATION_SOURCE`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`NEXTI_API_BASE_URL` pode continuar como:

```txt
https://api.nexti.com
```

`NEXTI_RECONCILIATION_SOURCE`:

```txt
schedule_transfer
```

Use `schedule_transfer` apenas depois de validar com sua operacao que esse e o registro efetivamente lancado no ambiente Nexti. Se a operacao usar outro tipo de registro, a reconciliacao precisa ser ajustada.

### 3. Mapeamento de grupos

O backend aceita override por `NEXTI_GROUP_CONFIG_JSON`.

Exemplo:

```json
{
  "bombeiros": {
    "companyNameIncludes": ["DUNAMIS SERVICOS BOMBEIROS"],
    "whatsappNumber": "5511919125032"
  },
  "servicos": {
    "companyNameIncludes": ["DUNAMIS - SERVICOS EMPRESARIAIS TERCEIRIZADOS LTDA"],
    "whatsappNumber": "5511940315275"
  },
  "seguranca": {
    "companyNameIncludes": ["DUNAMIS SEGURANCA E VIGILANCIA LTDA"],
    "whatsappNumber": "5511940315275"
  },
  "rbfacilities": {
    "companyNameIncludes": ["RB FACILITIES LTDA"],
    "whatsappNumber": "5511940315275"
  }
}
```

## Deploy sugerido

1. Rodar a migration no banco do Supabase.
2. Subir as Edge Functions `nexti-directory`, `troca-request`, `troca-review`, `troca-queue`, `troca-reconcile` e `troca-history`.
3. Preencher `js/app-config.js`.
4. Testar os 4 grupos.

## Revisao da solicitacao

Exemplo de fila pendente:

```txt
GET /functions/v1/troca-queue?status=pending&group=bombeiros&limit=20
```

Exemplo de historico do colaborador na folha atual:

```txt
GET /functions/v1/troca-history?group=bombeiros&enrolment=4854&currentPayroll=true
```

Exemplo de aprovacao interna:

```json
POST /functions/v1/troca-review
{
  "requestId": "UUID_DA_SOLICITACAO",
  "decision": "approve",
  "reviewedBy": "operacoes@empresa.com",
  "note": "Aprovado pela mesa"
}
```

Exemplo de reconciliacao manual por leitura:

```json
POST /functions/v1/troca-reconcile
{
  "requestId": "UUID_DA_SOLICITACAO",
  "source": "schedule_transfer"
}
```

## Proximo passo recomendado

Esta etapa ja consulta a Nexti para dados vivos, aprova/rejeita no Supabase e consegue reconciliar a solicitacao com lancamentos manuais existentes na Nexti, sem fazer escrita na API.

O proximo incremento natural e:

1. criar painel administrativo no Supabase
2. validar com a operacao se `schedule transfer` e realmente o evento correto para reconciliacao
3. adicionar reconciliacao para `replacement` se o lancamento manual usar outro modelo
4. criar a pagina do colaborador com historico da folha atual
5. adicionar consulta de conflitos e limites por folha
