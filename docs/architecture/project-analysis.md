# Analise Estrutural do Projeto

## Contexto

- Funcionalidade solicitada: adicionar contas e saldos.
- Integracao com API externa: nao.
- Alteracoes no banco: sim, confirmadas pela analise.
- Modo de execucao: interativo.
- Data da analise: 2026-06-06.

## Resumo Executivo

O projeto e um aplicativo financeiro pessoal em TypeScript, construido com
TanStack Start, React 19, TanStack Router, TanStack Query e Supabase. O dominio
atual possui usuarios, perfis, categorias e transacoes. O "saldo atual" exibido
no dashboard e calculado globalmente como receitas menos despesas, sem separar
o dinheiro por conta.

Adicionar contas exige persistencia: cada conta precisa pertencer a um usuario,
e cada transacao precisa indicar a conta afetada. O saldo nao deve ser mantido
como um campo mutavel independente. A fonte de verdade recomendada e:

`saldo da conta = saldo inicial + receitas - despesas`

Essa abordagem evita divergencia entre um saldo armazenado e o historico de
transacoes.

## Estrutura AIOX

| Local | Estado | Observacao |
| --- | --- | --- |
| `.aiox-core/` | Presente | Framework AIOX instalado |
| `.aiox-core/infrastructure/services/` | Ausente | Nao ha servicos AIOX separados |
| `.aiox-core/squads/` | Ausente | Nao ha squads locais |
| `.aiox-core/development/agents/` | Presente | Agentes padrao disponiveis |
| `.aiox-core/development/tasks/` | Presente | Tasks de desenvolvimento e banco disponiveis |
| `.aiox-core/data/` | Presente | Configuracoes e presets do framework |
| `docs/stories/` | Ausente | Nao existe story ativa para implementacao |

O diretorio nao e um repositorio Git. O estado AIOX tambem registra
`isGitRepo: false`.

## Inventario da Aplicacao

| Modulo | Tecnologia | Testes | Entrada ou responsabilidade |
| --- | --- | --- | --- |
| Aplicacao web | TypeScript/TSX | Nao encontrados | `src/start.ts`, `src/server.ts` |
| Roteamento | TanStack Router | Nao encontrados | `src/routes/` |
| Estado remoto | TanStack Query | Nao encontrados | Queries e mutations nas rotas |
| Autenticacao | Supabase Auth | Nao encontrados | `src/routes/auth.tsx` e middleware |
| Persistencia | Supabase/PostgreSQL | Nao encontrados | `supabase/migrations/` |
| UI | React, Tailwind CSS, shadcn/Radix | Nao encontrados | `src/components/` |

Arquivos da aplicacao analisados: 57 TSX, 15 TS, 2 SQL, 1 CSS, 1 TOML e 1
Markdown em `src/` e `supabase/`.

## Modelo de Dados Atual

### `profiles`

Perfil individual vinculado a `auth.users`. Possui RLS por usuario.

### `categories`

Categorias de receita ou despesa por usuario. Possui RLS por `user_id`.

### `transactions`

Movimentacoes com tipo, valor, categoria, descricao e data. Possui RLS por
`user_id`, mas nao possui `account_id`.

### Saldo atual

O dashboard busca todas as transacoes do usuario e calcula:

`total de receitas - total de despesas`

Consequencias:

- nao existe separacao por banco, carteira ou outra conta;
- nao existe saldo inicial;
- o dashboard carrega todas as transacoes para calcular o total no cliente;
- uma futura conta nao pode ser reconciliada com as transacoes atuais.

## Padroes Identificados

### Linguagem e organizacao

- TypeScript estrito e linguagem principal da aplicacao.
- Imports usam o alias `@/`.
- Rotas seguem file-based routing do TanStack Router.
- `src/routeTree.gen.ts` e gerado e nao deve ser editado manualmente.
- Componentes de UI reutilizam primitives em `src/components/ui/`.

### Acesso a dados

- O cliente autenticado consulta o Supabase diretamente.
- RLS e a fronteira principal de autorizacao.
- Queries e mutations usam TanStack Query.
- Mutations invalidam chaves relacionadas, como `transactions` e `dashboard`.
- Tipos do schema ficam em `src/integrations/supabase/types.ts`.

### Seguranca

- Tabelas de dominio usam RLS por usuario.
- Funcoes de trigger tiveram execucao publica revogada.
- O cliente de service role esta separado em arquivo server-only.
- Uma tabela de contas deve seguir o mesmo isolamento por `user_id`.
- A integridade entre transacao, conta e usuario precisa ser garantida no banco,
  nao apenas pela interface.

### Qualidade

- Existe script `lint`.
- Existe script `build`.
- Nao existem scripts `typecheck` ou `test`.
- Nao foram encontrados arquivos de teste.
- O TypeScript esta configurado com `strict: true` e `noEmit: true`.

## Impacto da Funcionalidade

### Banco de dados

Impacto obrigatorio:

- criar tabela `accounts`;
- adicionar `account_id` a `transactions`;
- definir migracao para transacoes existentes;
- criar indices e politicas RLS;
- atualizar os tipos Supabase.

O desenho detalhado do schema e responsabilidade de `@data-engineer`. A
arquitetura recomenda que a relacao impeça uma transacao de apontar para uma
conta de outro usuario.

### Frontend

Impacto esperado:

- nova rota autenticada de contas;
- item de navegacao em `AppShell`;
- CRUD de contas seguindo o padrao da tela de transacoes;
- selecao de conta no formulario de transacao;
- filtro ou identificacao da conta na lista de transacoes;
- dashboard agregado por conta e saldo total consolidado.

### Consultas

O calculo atual no cliente nao escala bem porque busca todas as transacoes. A
primeira entrega pode manter calculo derivado via queries filtradas, mas deve
evitar introduzir um campo `current_balance` atualizado em paralelo. Se o volume
exigir, uma view ou funcao SQL agregada pode ser adicionada posteriormente.

## Lacunas de Requisito

Os artefatos atuais nao definem:

- tipos permitidos de conta;
- moeda unica ou multiplas moedas;
- possibilidade de arquivar conta;
- tratamento de cartao de credito;
- transferencias entre contas;
- permissao para excluir conta com transacoes;
- regra para migrar transacoes existentes;
- data de referencia do saldo inicial.

Esses pontos devem ser resolvidos em uma story antes da implementacao. Cartoes,
transferencias e multiplas moedas nao devem ser incluidos implicitamente.

## Riscos

1. Associar `account_id` somente no frontend permitiria inconsistencias ou
   referencias cruzadas entre usuarios.
2. Tornar `account_id` obrigatorio sem migrar dados existentes quebraria as
   transacoes atuais.
3. Armazenar `current_balance` e tambem derivar por transacoes criaria duas
   fontes de verdade.
4. Excluir uma conta sem regra explicita pode apagar, bloquear ou deixar
   transacoes orfas.
5. A ausencia de testes aumenta o risco em migracoes, RLS e calculos monetarios.

