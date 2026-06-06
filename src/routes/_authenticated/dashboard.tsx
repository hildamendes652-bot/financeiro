import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency, formatDateBR, monthRange, previousMonth } from "@/lib/format";
import { consolidateBalances, convertAmount, type ExchangeRate } from "@/lib/money";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Meu Gestor" }] }),
  component: DashboardPage,
});

type Tx = {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  occurred_on: string;
  category_id: string | null;
  categories: { name: string; color: string } | null;
  accounts: { name: string; currency: string } | null;
};

type AccountBalance = {
  id: string;
  name: string;
  currency: string;
  balance: number;
};

type ConvertibleTx = Pick<Tx, "type" | "amount" | "accounts">;

type QueryResult = {
  label: string;
  error: { message: string } | null;
};

// Exported for unit coverage without requiring database access.
// eslint-disable-next-line react-refresh/only-export-components
export function assertDashboardQueriesSucceeded(results: QueryResult[]) {
  const failures = results.filter((result) => result.error);
  if (failures.length === 0) return;

  const details = failures
    .map((failure) => `${failure.label}: ${failure.error?.message}`)
    .join("; ");
  throw new Error(`Não foi possível carregar o dashboard. ${details}`);
}

// eslint-disable-next-line react-refresh/only-export-components
export function sumConvertedTransactions(
  rows: ConvertibleTx[],
  type: Tx["type"],
  reportingCurrency: string,
  rates: ExchangeRate[],
) {
  const missingCurrencies = new Set<string>();
  let total = 0;

  for (const row of rows) {
    if (row.type !== type) continue;
    const currency = row.accounts?.currency ?? "BRL";
    const converted = convertAmount(Number(row.amount), currency, reportingCurrency, rates);
    if (converted === null) {
      missingCurrencies.add(currency);
      continue;
    }
    total += converted;
  }

  return { total, missingCurrencies: Array.from(missingCurrencies).sort() };
}

function mergeMissingCurrencies(...groups: string[][]) {
  return Array.from(new Set(groups.flat())).sort();
}

function partialValueHint(missingCurrencies: string[]) {
  return missingCurrencies.length > 0
    ? `Valor parcial. Sem taxa para: ${missingCurrencies.join(", ")}`
    : undefined;
}

function DashboardPage() {
  const now = new Date();
  const curr = monthRange(now);
  const prev = monthRange(previousMonth(now));

  const { data, error, isError, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["dashboard", curr.start, prev.start],
    queryFn: async () => {
      const [
        currTxResult,
        prevTxResult,
        recentResult,
        accountsResult,
        settingsResult,
        ratesResult,
      ] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id,type,amount,description,occurred_on,category_id,categories(name,color),accounts(name,currency)",
          )
          .gte("occurred_on", curr.start)
          .lte("occurred_on", curr.end),
        supabase
          .from("transactions")
          .select("type,amount,accounts(currency)")
          .gte("occurred_on", prev.start)
          .lte("occurred_on", prev.end),
        supabase
          .from("transactions")
          .select(
            "id,type,amount,description,occurred_on,category_id,categories(name,color),accounts(name,currency)",
          )
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("account_balances").select("id,name,currency,balance").order("created_at"),
        supabase.from("financial_settings").select("reporting_currency").maybeSingle(),
        supabase.from("exchange_rates").select("from_currency,to_currency,rate"),
      ]);

      assertDashboardQueriesSucceeded([
        { label: "movimentações do mês", error: currTxResult.error },
        { label: "movimentações do mês anterior", error: prevTxResult.error },
        { label: "movimentações recentes", error: recentResult.error },
        { label: "saldos das contas", error: accountsResult.error },
        { label: "configurações financeiras", error: settingsResult.error },
        { label: "taxas de câmbio", error: ratesResult.error },
      ]);

      const currTx = currTxResult.data;
      const prevTx = prevTxResult.data;
      const recent = recentResult.data;
      const accounts = accountsResult.data;
      const settings = settingsResult.data;
      const rates = ratesResult.data;

      return {
        currTx: (currTx ?? []) as unknown as Tx[],
        prevTx: (prevTx ?? []) as unknown as Pick<Tx, "type" | "amount" | "accounts">[],
        recent: (recent ?? []) as unknown as Tx[],
        accounts: (accounts ?? []).map((account) => ({
          ...account,
          id: String(account.id),
          name: String(account.name),
          currency: String(account.currency),
          balance: Number(account.balance),
        })) as AccountBalance[],
        reportingCurrency: settings?.reporting_currency ?? "BRL",
        rates: (rates ?? []).map((rate) => ({
          ...rate,
          rate: Number(rate.rate),
        })) as ExchangeRate[],
      };
    },
  });

  const reportingCurrency = data?.reportingCurrency ?? "BRL";
  const rates = data?.rates ?? [];
  const currIncomeSummary = sumConvertedTransactions(
    data?.currTx ?? [],
    "income",
    reportingCurrency,
    rates,
  );
  const currExpenseSummary = sumConvertedTransactions(
    data?.currTx ?? [],
    "expense",
    reportingCurrency,
    rates,
  );
  const prevIncomeSummary = sumConvertedTransactions(
    data?.prevTx ?? [],
    "income",
    reportingCurrency,
    rates,
  );
  const prevExpenseSummary = sumConvertedTransactions(
    data?.prevTx ?? [],
    "expense",
    reportingCurrency,
    rates,
  );
  const currIncome = currIncomeSummary.total;
  const currExpense = currExpenseSummary.total;
  const prevIncome = prevIncomeSummary.total;
  const prevExpense = prevExpenseSummary.total;
  const currentMissingCurrencies = mergeMissingCurrencies(
    currIncomeSummary.missingCurrencies,
    currExpenseSummary.missingCurrencies,
  );
  const comparisonMissingCurrencies = mergeMissingCurrencies(
    currentMissingCurrencies,
    prevIncomeSummary.missingCurrencies,
    prevExpenseSummary.missingCurrencies,
  );
  const consolidated = consolidateBalances(data?.accounts ?? [], reportingCurrency, rates);
  const totalBalance = consolidated.total;
  const currResult = currIncome - currExpense;
  const prevResult = prevIncome - prevExpense;
  const variation =
    prevResult === 0 || comparisonMissingCurrencies.length > 0
      ? null
      : ((currResult - prevResult) / Math.abs(prevResult)) * 100;

  const byCategory = (() => {
    const map = new Map<string, { name: string; color: string; total: number }>();
    for (const tx of data?.currTx ?? []) {
      if (tx.type !== "expense") continue;
      const key = tx.categories?.name ?? "Sem categoria";
      const color = tx.categories?.color ?? "#6b7280";
      const converted = convertAmount(
        Number(tx.amount),
        tx.accounts?.currency ?? "BRL",
        reportingCurrency,
        rates,
      );
      if (converted === null) continue;
      const cur = map.get(key) ?? { name: key, color, total: 0 };
      cur.total += converted;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

  const compareData = [
    { name: "Mês anterior", Entradas: prevIncome, Saídas: prevExpense },
    { name: "Mês atual", Entradas: currIncome, Saídas: currExpense },
  ];

  const header = (
    <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Visão geral</p>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
      </p>
    </header>
  );

  if (isError) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        {header}
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar o dashboard</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{error instanceof Error ? error.message : "Ocorreu um erro inesperado."}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? "Tentando novamente..." : "Tentar novamente"}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {header}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={`Saldo atual (${reportingCurrency})`}
          value={formatCurrency(totalBalance, reportingCurrency)}
          icon={<Wallet className="h-4 w-4" />}
          accent="primary"
          hint={
            consolidated.missingCurrencies.length
              ? `Sem taxa: ${consolidated.missingCurrencies.join(", ")}`
              : undefined
          }
          loading={isLoading}
        />
        <KpiCard
          label="Entradas do mês"
          value={formatCurrency(currIncome, reportingCurrency)}
          icon={<ArrowUpRight className="h-4 w-4" />}
          accent="success"
          hint={partialValueHint(currIncomeSummary.missingCurrencies)}
          loading={isLoading}
        />
        <KpiCard
          label="Saídas do mês"
          value={formatCurrency(currExpense, reportingCurrency)}
          icon={<ArrowDownRight className="h-4 w-4" />}
          accent="destructive"
          hint={partialValueHint(currExpenseSummary.missingCurrencies)}
          loading={isLoading}
        />
        <KpiCard
          label="Resultado do mês"
          value={formatCurrency(currResult, reportingCurrency)}
          icon={
            currResult >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )
          }
          accent={currResult >= 0 ? "success" : "destructive"}
          hint={
            comparisonMissingCurrencies.length > 0
              ? partialValueHint(comparisonMissingCurrencies)
              : variation === null
                ? "Sem comparação"
                : `${variation >= 0 ? "+" : ""}${variation.toFixed(1)}% vs mês anterior`
          }
          loading={isLoading}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Entradas vs Saídas</CardTitle>
            {comparisonMissingCurrencies.length > 0 && (
              <p className="text-xs text-destructive">
                {partialValueHint(comparisonMissingCurrencies)}. O gráfico não representa todas as
                movimentações.
              </p>
            )}
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickFormatter={(value) => formatCurrency(Number(value), reportingCurrency)}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => formatCurrency(v, reportingCurrency)}
                />
                <Legend />
                <Bar dataKey="Entradas" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Saídas" fill="var(--color-destructive)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas por categoria</CardTitle>
            {currExpenseSummary.missingCurrencies.length > 0 && (
              <p className="text-xs text-destructive">
                {partialValueHint(currExpenseSummary.missingCurrencies)}. O gráfico não representa
                todas as despesas.
              </p>
            )}
          </CardHeader>
          <CardContent className="h-72">
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center pt-16">
                Sem despesas neste mês.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="total"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {byCategory.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => formatCurrency(v, reportingCurrency)}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas movimentações</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {(data?.recent ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Nenhuma transação ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data!.recent.map((tx) => (
                  <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={
                        "h-9 w-9 rounded-full inline-flex items-center justify-center " +
                        (tx.type === "income"
                          ? "bg-success/15 text-success"
                          : "bg-destructive/15 text-destructive")
                      }
                    >
                      {tx.type === "income" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tx.description || tx.categories?.name || "Sem descrição"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateBR(tx.occurred_on)} · {tx.categories?.name ?? "Sem categoria"} ·{" "}
                        {tx.accounts?.name ?? "Sem conta"}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        tx.type === "income"
                          ? "text-success border-success/30"
                          : "text-destructive border-destructive/30"
                      }
                    >
                      {tx.type === "income" ? "+" : "-"}
                      {formatCurrency(Number(tx.amount), tx.accounts?.currency ?? "BRL")}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saldos por conta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.accounts ?? []).map((account) => (
              <div key={account.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{account.name}</p>
                <p className="text-lg font-bold">
                  {formatCurrency(account.balance, account.currency)}
                </p>
              </div>
            ))}
            {(data?.accounts ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  hint,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "primary" | "success" | "destructive";
  hint?: string;
  loading?: boolean;
}) {
  const tone =
    accent === "success"
      ? "bg-success/15 text-success"
      : accent === "destructive"
        ? "bg-destructive/15 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <span className={"h-8 w-8 rounded-lg inline-flex items-center justify-center " + tone}>
            {icon}
          </span>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{loading ? "—" : value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
