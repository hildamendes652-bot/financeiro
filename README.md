# Clear Insight Money

Aplicacao financeira em TanStack Start + Supabase, com deploy na Vercel.

## Requisitos

- Node.js 22+
- Git
- Conta no Supabase
- Conta no GitHub
- Conta na Vercel

## Setup local

1. Instale as dependencias.
2. Copie `.env.example` para `.env`.
3. Preencha as variaveis do Supabase.
4. Rode `npm run dev`.

```bash
npm install
cp .env.example .env
npm run dev
```

## Variaveis de ambiente

O app usa estas variaveis:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Opcionalmente, o projeto tambem usa variaveis do ecossistema AIOX e outras
integrações descritas em `.env.example`.

## Supabase

Crie um projeto novo no Supabase e copie os valores em `Project Settings > API`:

- `Project URL` -> `SUPABASE_URL` e `VITE_SUPABASE_URL`
- `anon/public` -> `SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- `service_role` -> `SUPABASE_SERVICE_ROLE_KEY`

## Banco de dados via MCP

O fluxo oficial do projeto para schema, tabelas, funcoes, RLS e migrations e:

1. Pedir a alteracao ao `$aiox-data-engineer`.
2. O agente cria uma migration em `supabase/migrations/`.
3. O agente aplica a migration no Supabase usando MCP.
4. O agente valida tabelas, policies, advisors e erros.
5. A migration e versionada no GitHub.

Exemplo de pedido:

```text
$aiox-data-engineer crie a tabela budgets com RLS por usuario e aplique via MCP
```

Para uma maquina nova, o operador deve configurar o Supabase MCP no Codex com
acesso ao projeto Supabase desejado. Depois disso, nao rode SQL manualmente:
peca ao `$aiox-data-engineer` para aplicar ou validar o schema via MCP.

As migrations continuam no GitHub porque elas sao o historico oficial do banco.
O MCP executa a mudanca no Supabase, mas o codigo da mudanca precisa ficar salvo
em `supabase/migrations/`.

Use SQL Editor ou Supabase CLI apenas como fallback de emergencia.

No auth do Supabase, configure:

- `Site URL`: `https://seu-projeto.vercel.app`
- `Redirect URLs`: `https://seu-projeto.vercel.app/dashboard`

Para desenvolvimento local, adicione tambem:

- `http://localhost:3000/dashboard`

## Vercel via GitHub

1. Suba o repositorio para o GitHub.
2. Na Vercel, clique em `Add New > Project`.
3. Importe o repositorio do GitHub.
4. Use `TanStack Start` como preset.
5. Defina `Root Directory` como `./`.
6. Adicione as variaveis de ambiente da aplicacao.
7. Faça o deploy.

Depois do primeiro deploy, a Vercel vai gerar a URL publica do projeto.

## Fluxo sugerido para quem for clonar

1. Fork ou clone do repositório.
2. Criação de um projeto Supabase proprio.
3. Configuração do Supabase MCP no Codex para esse projeto.
4. Criação do projeto na Vercel via GitHub.
5. Configuração das variáveis de ambiente.
6. Ajuste do `Site URL` e `Redirect URLs`.
7. Deploy.

## Notas

- Nunca commit `.env` com segredos.
- `SUPABASE_SERVICE_ROLE_KEY` deve existir apenas no servidor/Vercel.
- Se o login redirecionar para `localhost`, o Supabase ainda está com URL de
  callback local configurada.
