# Abordagem Recomendada: Contas e Saldos

## Decisao Arquitetural

Implementar a funcionalidade como uma extensao do monolito atual, usando
Supabase para persistencia e RLS, TanStack Query para acesso a dados e uma nova
rota TanStack para a interface. Nao criar servico separado e nao integrar API
externa.

O saldo sera derivado:

`saldo = saldo inicial + soma(receitas) - soma(despesas)`

Nao adicionar um campo `current_balance` mutavel nesta fase.

## Modelo Conceitual Minimo

### Conta

Campos conceituais necessarios:

- identificador;
- usuario proprietario;
- nome;
- tipo;
- saldo inicial;
- data de referencia do saldo inicial;
- cor ou identificador visual, caso aprovado na story;
- estado ativo ou arquivado, caso aprovado na story;
- datas de criacao e atualizacao.

### Transacao

Adicionar referencia obrigatoria a uma conta apos a migracao dos dados
existentes.

O schema final, constraints, indices e politicas devem ser definidos e validados
por `@data-engineer`. A constraint deve assegurar que conta e transacao
pertençam ao mesmo usuario.

## Estrategia de Migracao

1. Criar `accounts` com RLS por `user_id`.
2. Criar uma conta padrao para cada usuario que possua transacoes existentes.
3. Adicionar `transactions.account_id` inicialmente aceitando nulo.
4. Associar transacoes existentes a conta padrao do respectivo usuario.
5. Validar que nao restaram transacoes sem conta.
6. Tornar `account_id` obrigatorio.
7. Criar indice para consultas por usuario, conta e data.
8. Atualizar ou regenerar `src/integrations/supabase/types.ts`.

Essa sequencia evita indisponibilidade e perda de dados.

## Fronteiras de Seguranca

- `accounts` deve ter RLS para leitura e escrita apenas do proprietario.
- `transactions.account_id` deve referenciar uma conta do mesmo usuario.
- Operacoes de CRUD devem continuar usando o cliente autenticado.
- O service role nao e necessario para o fluxo normal.
- Exclusao de conta deve ser bloqueada quando houver transacoes, salvo requisito
  explicito diferente.

## Alteracoes por Camada

### Persistencia

- Nova migration em `supabase/migrations/`.
- Tabela e politicas de contas.
- Relacao entre contas e transacoes.
- Estrategia de backfill para dados atuais.
- Consulta agregada apenas se a medicao mostrar necessidade.

### Tipos e validacao

- Atualizar tipos Supabase.
- Criar schema Zod para conta.
- Incluir `account_id` no schema de transacao.
- Manter valores monetarios no banco como `NUMERIC(14,2)`.

### Dados no cliente

Padronizar chaves:

- `["accounts"]` para lista de contas;
- `["account-balances"]` para saldos;
- `["transactions", ...filters]` incluindo conta quando aplicavel;
- `["dashboard", ...period]` para consolidado.

Mutations de conta e transacao devem invalidar as chaves afetadas.

### Interface

- Criar `src/routes/_authenticated/accounts.tsx`.
- Adicionar "Contas" em `src/components/app-shell.tsx`.
- Exibir lista de contas com saldo calculado.
- Permitir criar e editar os campos aprovados na story.
- Adicionar conta obrigatoria ao formulario de transacao.
- Mostrar conta na listagem de transacoes.
- Atualizar dashboard para saldo consolidado e detalhamento por conta.

## Sequencia de Entrega

### Fase 1: Definicao

1. Criar story com criterios de aceite.
2. Definir tipos de conta e regra de exclusao/arquivamento.
3. Definir como migrar transacoes existentes.
4. Confirmar se o produto opera apenas em BRL.

### Fase 2: Dados

1. Delegar desenho detalhado e migration a `@data-engineer`.
2. Implementar tabela, RLS, constraints e backfill.
3. Atualizar tipos Supabase.
4. Criar testes de isolamento entre usuarios e integridade da relacao.

### Fase 3: Fluxo principal

1. Implementar CRUD de contas.
2. Tornar conta obrigatoria no cadastro de transacao.
3. Atualizar filtros, listagens e invalidacoes de cache.
4. Implementar saldos derivados.

### Fase 4: Dashboard e verificacao

1. Atualizar o saldo total.
2. Adicionar visao por conta.
3. Verificar responsividade e estados vazios.
4. Executar lint, typecheck, testes e build.

## Testes Minimos Recomendados

- usuario nao acessa contas de outro usuario;
- usuario nao vincula transacao a conta de outro usuario;
- saldo inicial sem transacoes;
- saldo com receitas e despesas;
- edicao e exclusao de transacao recalculam saldo;
- backfill associa todas as transacoes existentes;
- conta com transacoes nao e excluida sem regra aprovada;
- formularios rejeitam valores e identificadores invalidos;
- dashboard consolidado equivale a soma dos saldos das contas.

## Dependencias e Responsabilidades

- `@sm` ou `@po`: criar/refinar a story e criterios de aceite.
- `@data-engineer`: detalhar schema, migration, RLS e testes de banco.
- `@dev`: implementar a story aprovada.
- `@qa`: validar comportamento, seguranca e criterios de aceite.
- `@devops`: operacoes remotas, CI/CD, PR e push.

## Recomendacao Final

A proxima etapa correta nao e iniciar codigo. O projeto nao possui story em
`docs/stories/`, e a Constitution exige desenvolvimento orientado por story.
Deve-se criar a story de "Contas e saldos", resolver as lacunas de requisito e
entao delegar o modelo de dados ao `@data-engineer`.
