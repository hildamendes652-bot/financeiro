import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDateBR } from "@/lib/format";
import { consolidateBalances, normalizeCurrency } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({ meta: [{ title: "Contas — Meu Gestor" }] }),
  component: AccountsPage,
});

type AccountType = "checking" | "savings" | "wallet" | "investment";

type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  initial_balance: number;
  balance: number;
};

type Rate = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
};

type Transfer = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  from_amount: number;
  to_amount: number;
  description: string | null;
  occurred_on: string;
};

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "wallet", label: "Carteira" },
  { value: "investment", label: "Investimento" },
];

const COMMON_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"];

const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["checking", "savings", "wallet", "investment"]),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  initial_balance: z.number().min(-999999999999).max(999999999999),
});

const rateSchema = z
  .object({
    from_currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    to_currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/),
    rate: z.number().positive(),
  })
  .refine((value) => value.from_currency !== value.to_currency, {
    message: "As moedas devem ser diferentes",
  });

// Exported for unit coverage without requiring database access.
// eslint-disable-next-line react-refresh/only-export-components
export function assertAccountCurrencyUnchanged(currentCurrency: string, nextCurrency: string) {
  if (normalizeCurrency(currentCurrency) !== normalizeCurrency(nextCurrency)) {
    throw new Error(
      "A moeda de uma conta com histórico não pode ser alterada. Crie uma nova conta para usar outra moeda.",
    );
  }
}

function AccountsPage() {
  const qc = useQueryClient();
  const [accountOpen, setAccountOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("id,name,type,currency,initial_balance,balance")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        id: String(row.id),
        name: String(row.name),
        type: row.type as AccountType,
        currency: String(row.currency),
        initial_balance: Number(row.initial_balance),
        balance: Number(row.balance),
      })) as Account[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["financial-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_settings")
        .select("reporting_currency")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("id,from_currency,to_currency,rate")
        .order("from_currency");
      if (error) throw error;
      return (data ?? []).map((rate) => ({ ...rate, rate: Number(rate.rate) })) as Rate[];
    },
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id,from_account_id,to_account_id,from_amount,to_amount,description,occurred_on")
        .order("occurred_on", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((transfer) => ({
        ...transfer,
        from_amount: Number(transfer.from_amount),
        to_amount: Number(transfer.to_amount),
      })) as Transfer[];
    },
  });

  const currencies = useMemo(
    () => Array.from(new Set([...COMMON_CURRENCIES, ...accounts.map((a) => a.currency)])).sort(),
    [accounts],
  );
  const reportingCurrency = settings?.reporting_currency ?? "BRL";
  const consolidated = consolidateBalances(accounts, reportingCurrency, rates);
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  function invalidateFinance() {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveAccount = useMutation({
    mutationFn: async (input: z.infer<typeof accountSchema> & { id?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const existingAccount = input.id
        ? accounts.find((account) => account.id === input.id)
        : undefined;
      if (input.id && !existingAccount) {
        throw new Error("Conta não encontrada. Atualize a página e tente novamente.");
      }
      if (existingAccount) {
        assertAccountCurrencyUnchanged(existingAccount.currency, input.currency);
      }
      const payload = {
        user_id: auth.user.id,
        name: input.name,
        type: input.type,
        currency: existingAccount?.currency ?? input.currency,
        initial_balance: input.initial_balance,
      };
      const result = input.id
        ? await supabase.from("accounts").update(payload).eq("id", input.id)
        : await supabase.from("accounts").insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      invalidateFinance();
      setAccountOpen(false);
      setEditing(null);
      toast.success("Conta salva");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveSettings = useMutation({
    mutationFn: async (currency: string) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase.from("financial_settings").upsert({
        user_id: auth.user.id,
        reporting_currency: normalizeCurrency(currency),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial-settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Moeda de consolidação atualizada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveRate = useMutation({
    mutationFn: async (input: z.infer<typeof rateSchema>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sessão expirada");
      const { error } = await supabase
        .from("exchange_rates")
        .upsert(
          { ...input, user_id: auth.user.id },
          { onConflict: "user_id,from_currency,to_currency" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Taxa salva");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeRate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exchange_rates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exchange-rates"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveTransfer = useMutation({
    mutationFn: async (input: {
      id?: string;
      from: string;
      to: string;
      fromAmount: number;
      toAmount?: number;
      description?: string;
      occurredOn: string;
    }) => {
      const { error } = input.id
        ? await supabase.rpc("update_transfer", {
            p_transfer_id: input.id,
            p_from_account_id: input.from,
            p_to_account_id: input.to,
            p_from_amount: input.fromAmount,
            p_to_amount: input.toAmount,
            p_description: input.description,
            p_occurred_on: input.occurredOn,
          })
        : await supabase.rpc("create_transfer", {
            p_from_account_id: input.from,
            p_to_account_id: input.to,
            p_from_amount: input.fromAmount,
            p_to_amount: input.toAmount,
            p_description: input.description,
            p_occurred_on: input.occurredOn,
          });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance();
      setTransferOpen(false);
      setEditingTransfer(null);
      toast.success("Transferência salva");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeTransfer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_transfer", { p_transfer_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance();
      toast.success("Transferência excluída");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteWithReassignment = useMutation({
    mutationFn: async ({ source, destination }: { source: string; destination: string }) => {
      const { error } = await supabase.rpc("delete_account_reassign", {
        p_account_id: source,
        p_destination_account_id: destination,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinance();
      setDeleteAccount(null);
      toast.success("Conta excluída e histórico preservado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Patrimônio</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Contas e saldos</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog
            open={transferOpen}
            onOpenChange={(open) => {
              setTransferOpen(open);
              if (!open) setEditingTransfer(null);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" disabled={accounts.length < 2}>
                <RefreshCw className="h-4 w-4 mr-1" /> Transferir
              </Button>
            </DialogTrigger>
            <TransferDialog
              accounts={accounts}
              editing={editingTransfer}
              submitting={saveTransfer.isPending}
              onSubmit={(input) => saveTransfer.mutate({ ...input, id: editingTransfer?.id })}
            />
          </Dialog>
          <Dialog
            open={accountOpen}
            onOpenChange={(open) => {
              setAccountOpen(open);
              if (!open) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" /> Nova conta
              </Button>
            </DialogTrigger>
            <AccountDialog
              editing={editing}
              submitting={saveAccount.isPending}
              onSubmit={(input) => saveAccount.mutate({ ...input, id: editing?.id })}
            />
          </Dialog>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                Carregando contas...
              </CardContent>
            </Card>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                Nenhuma conta cadastrada.
              </CardContent>
            </Card>
          ) : (
            accounts.map((account) => (
              <Card key={account.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{account.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPES.find((type) => type.value === account.type)?.label} ·{" "}
                        {account.currency}
                      </p>
                    </div>
                    <Badge variant="outline">{account.currency}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {formatCurrency(account.balance, account.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Inicial: {formatCurrency(account.initial_balance, account.currency)}
                  </p>
                  <div className="flex gap-1 mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(account);
                        setAccountOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteAccount(account)}>
                      <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total consolidado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Moeda de consolidação</Label>
              <Select
                value={reportingCurrency}
                onValueChange={(value) => saveSettings.mutate(value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-3xl font-bold">
              {formatCurrency(consolidated.total, reportingCurrency)}
            </p>
            {consolidated.missingCurrencies.length > 0 && (
              <p className="text-sm text-destructive">
                Sem taxa para: {consolidated.missingCurrencies.join(", ")}. Esses saldos não estão
                no total.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxas manuais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RateForm
              currencies={currencies}
              submitting={saveRate.isPending}
              onSubmit={(rate) => saveRate.mutate(rate)}
            />
            <ul className="divide-y divide-border">
              {rates.map((rate) => (
                <li key={rate.id} className="flex items-center gap-2 py-3 text-sm">
                  <span className="font-medium">{rate.from_currency}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{rate.to_currency}</span>
                  <span className="ml-auto tabular-nums">{rate.rate}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRate.mutate(rate.id)}
                    aria-label="Excluir taxa"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
              {rates.length === 0 && (
                <li className="py-4 text-sm text-muted-foreground">Nenhuma taxa cadastrada.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transferências recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {transfers.map((transfer) => {
                const from = accountById.get(transfer.from_account_id);
                const to = accountById.get(transfer.to_account_id);
                return (
                  <li key={transfer.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {from?.name ?? "Conta removida"} <ArrowRight className="inline h-3 w-3" />{" "}
                        {to?.name ?? "Conta removida"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateBR(transfer.occurred_on)} ·{" "}
                        {transfer.description || "Sem descrição"}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p>{formatCurrency(transfer.from_amount, from?.currency ?? "BRL")}</p>
                      {from?.currency !== to?.currency && (
                        <p className="text-muted-foreground">
                          {formatCurrency(transfer.to_amount, to?.currency ?? "BRL")}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingTransfer(transfer);
                        setTransferOpen(true);
                      }}
                      aria-label="Editar transferência"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTransfer.mutate(transfer.id)}
                      aria-label="Excluir transferência"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                );
              })}
              {transfers.length === 0 && (
                <li className="py-4 text-sm text-muted-foreground">Nenhuma transferência.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      <DeleteAccountDialog
        account={deleteAccount}
        accounts={accounts}
        submitting={deleteWithReassignment.isPending}
        onClose={() => setDeleteAccount(null)}
        onConfirm={(destination) => {
          if (deleteAccount) {
            deleteWithReassignment.mutate({ source: deleteAccount.id, destination });
          }
        }}
      />
    </div>
  );
}

function AccountDialog({
  editing,
  submitting,
  onSubmit,
}: {
  editing: Account | null;
  submitting: boolean;
  onSubmit: (input: z.infer<typeof accountSchema>) => void;
}) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = accountSchema.safeParse({
      name: form.get("name"),
      type: form.get("type"),
      currency: form.get("currency"),
      initial_balance: Number(form.get("initial_balance")),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
    onSubmit(parsed.data);
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar conta" : "Nova conta"}</DialogTitle>
        <DialogDescription>Informe os dados usados para calcular o saldo.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="account-name">Nome</Label>
          <Input
            id="account-name"
            name="name"
            defaultValue={editing?.name}
            required
            maxLength={100}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select name="type" defaultValue={editing?.type ?? "checking"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="account-currency">Moeda</Label>
            <Input
              id="account-currency"
              name="currency"
              defaultValue={editing?.currency ?? "BRL"}
              maxLength={3}
              readOnly={Boolean(editing)}
              aria-readonly={Boolean(editing)}
              required
            />
            {editing && (
              <p className="text-xs text-muted-foreground">
                A moeda não pode ser alterada porque isso invalidaria o histórico da conta.
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="initial-balance">Saldo inicial</Label>
          <Input
            id="initial-balance"
            name="initial_balance"
            type="number"
            step="0.01"
            defaultValue={editing?.initial_balance ?? 0}
            required
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RateForm({
  currencies,
  submitting,
  onSubmit,
}: {
  currencies: string[];
  submitting: boolean;
  onSubmit: (input: z.infer<typeof rateSchema>) => void;
}) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = rateSchema.safeParse({
      from_currency: form.get("from_currency"),
      to_currency: form.get("to_currency"),
      rate: Number(form.get("rate")),
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Taxa inválida");
    onSubmit(parsed.data);
    event.currentTarget.reset();
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
      <div className="space-y-1">
        <Label htmlFor="rate-from">De</Label>
        <Input id="rate-from" name="from_currency" list="currencies" maxLength={3} required />
      </div>
      <ArrowRight className="h-4 w-4 mb-3 text-muted-foreground" />
      <div className="space-y-1">
        <Label htmlFor="rate-to">Para</Label>
        <Input id="rate-to" name="to_currency" list="currencies" maxLength={3} required />
      </div>
      <div className="space-y-1 col-span-2">
        <Label htmlFor="rate-value">Taxa</Label>
        <Input id="rate-value" name="rate" type="number" min="0.000000000001" step="any" required />
      </div>
      <Button type="submit" disabled={submitting}>
        Salvar
      </Button>
      <datalist id="currencies">
        {currencies.map((currency) => (
          <option key={currency} value={currency} />
        ))}
      </datalist>
    </form>
  );
}

function TransferDialog({
  accounts,
  editing,
  submitting,
  onSubmit,
}: {
  accounts: Account[];
  editing: Transfer | null;
  submitting: boolean;
  onSubmit: (input: {
    from: string;
    to: string;
    fromAmount: number;
    toAmount?: number;
    description?: string;
    occurredOn: string;
  }) => void;
}) {
  const [from, setFrom] = useState(editing?.from_account_id ?? accounts[0]?.id ?? "");
  const [to, setTo] = useState(editing?.to_account_id ?? accounts[1]?.id ?? "");
  const source = accounts.find((account) => account.id === from);
  const destination = accounts.find((account) => account.id === to);
  const crossCurrency = source?.currency !== destination?.currency;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fromAmount = Number(form.get("from_amount"));
    const toAmount = crossCurrency ? Number(form.get("to_amount")) : undefined;
    if (!from || !to || from === to) return toast.error("Selecione contas diferentes");
    if (fromAmount <= 0 || (crossCurrency && (!toAmount || toAmount <= 0))) {
      return toast.error("Informe valores positivos");
    }
    onSubmit({
      from,
      to,
      fromAmount,
      toAmount,
      description: String(form.get("description") || "") || undefined,
      occurredOn: String(form.get("occurred_on")),
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar transferência" : "Nova transferência"}</DialogTitle>
        <DialogDescription>Transferências entre moedas exigem os dois valores.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Origem</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Destino</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="transfer-from-amount">Valor de origem ({source?.currency})</Label>
            <Input
              id="transfer-from-amount"
              name="from_amount"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={editing?.from_amount}
              required
            />
          </div>
          {crossCurrency && (
            <div className="space-y-1">
              <Label htmlFor="transfer-to-amount">Valor de destino ({destination?.currency})</Label>
              <Input
                id="transfer-to-amount"
                name="to_amount"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={editing?.to_amount}
                required
              />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="transfer-date">Data</Label>
          <Input
            id="transfer-date"
            name="occurred_on"
            type="date"
            defaultValue={editing?.occurred_on ?? new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="transfer-description">Descrição</Label>
          <Input
            id="transfer-description"
            name="description"
            maxLength={200}
            defaultValue={editing?.description ?? ""}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Salvar transferência"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DeleteAccountDialog({
  account,
  accounts,
  submitting,
  onClose,
  onConfirm,
}: {
  account: Account | null;
  accounts: Account[];
  submitting: boolean;
  onClose: () => void;
  onConfirm: (destination: string) => void;
}) {
  const options = accounts.filter(
    (candidate) => candidate.id !== account?.id && candidate.currency === account?.currency,
  );
  const [destination, setDestination] = useState("");

  return (
    <Dialog
      open={Boolean(account)}
      onOpenChange={(open) => {
        if (!open) {
          setDestination("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir {account?.name}?</DialogTitle>
          <DialogDescription>
            O saldo inicial e todas as transações serão transferidos para outra conta da mesma
            moeda.
          </DialogDescription>
        </DialogHeader>
        {options.length > 0 ? (
          <div className="space-y-1">
            <Label>Conta de destino</Label>
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="text-sm text-destructive">
            Crie outra conta em {account?.currency} antes de excluir esta conta.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!destination || submitting}
            onClick={() => onConfirm(destination)}
          >
            {submitting ? "Excluindo..." : "Excluir e transferir histórico"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
