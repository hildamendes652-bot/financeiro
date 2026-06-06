import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { formatCurrency, formatDateBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transações — Meu Gestor" }] }),
  component: TransactionsPage,
});

type Tx = {
  id: string;
  account_id: string;
  transfer_id: string | null;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  occurred_on: string;
  category_id: string | null;
  categories: { name: string; color: string } | null;
  accounts: { name: string; currency: string } | null;
};

type Category = { id: string; name: string; type: "income" | "expense"; color: string };
type Account = { id: string; name: string; currency: string };

const txSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive().max(999999999),
  description: z.string().trim().max(200).optional(),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_id: z.string().uuid().nullable(),
  account_id: z.string().uuid(),
});

function TransactionsPage() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [editing, setEditing] = useState<Tx | null>(null);
  const [open, setOpen] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,type,color")
        .order("name");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,currency")
        .order("name");
      if (error) throw error;
      return data as Account[];
    },
  });

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["transactions", filterType, filterCategory, filterAccount, from, to],
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select(
          "id,account_id,transfer_id,type,amount,description,occurred_on,category_id,categories(name,color),accounts(name,currency)",
        )
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (filterType !== "all") q = q.eq("type", filterType);
      if (filterCategory !== "all") q = q.eq("category_id", filterCategory);
      if (filterAccount !== "all") q = q.eq("account_id", filterAccount);
      if (from) q = q.gte("occurred_on", from);
      if (to) q = q.lte("occurred_on", to);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Tx[];
    },
  });

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, { inc: number; exp: number }>();
    for (const tx of txs) {
      const currency = tx.accounts?.currency ?? "BRL";
      const current = totals.get(currency) ?? { inc: 0, exp: 0 };
      current[tx.type === "income" ? "inc" : "exp"] += Number(tx.amount);
      totals.set(currency, current);
    }
    return Array.from(totals, ([currency, values]) => ({
      currency,
      ...values,
      net: values.inc - values.exp,
    }));
  }, [txs]);

  const upsert = useMutation({
    mutationFn: async (input: z.infer<typeof txSchema> & { id?: string }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const user_id = userRes.user?.id;
      if (!user_id) throw new Error("Sessão expirada");
      const payload = {
        user_id,
        account_id: input.account_id,
        type: input.type,
        amount: input.amount,
        description: input.description,
        occurred_on: input.occurred_on,
        category_id: input.category_id,
      };
      if (input.id) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transactions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Transação salva");
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success("Transação excluída");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = txSchema.safeParse({
      type: fd.get("type") as "income" | "expense",
      amount: Number(fd.get("amount")),
      description: (fd.get("description") as string) || undefined,
      occurred_on: fd.get("occurred_on") as string,
      category_id: (fd.get("category_id") as string) || null,
      account_id: fd.get("account_id") as string,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    upsert.mutate({ ...parsed.data, id: editing?.id });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Movimentações</p>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Transações</h1>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button disabled={accounts.length === 0}>
              <Plus className="h-4 w-4 mr-1" /> Nova transação
            </Button>
          </DialogTrigger>
          <TxFormDialog
            categories={categories}
            accounts={accounts}
            editing={editing}
            onSubmit={handleSubmit}
            submitting={upsert.isPending}
          />
        </Dialog>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {totalsByCurrency.map((total) => (
          <Card key={total.currency}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {total.currency}
              </p>
              <p
                className={
                  "text-lg font-bold mt-1 " + (total.net >= 0 ? "text-success" : "text-destructive")
                }
              >
                {formatCurrency(total.net, total.currency)}
              </p>
              <p className="text-xs text-muted-foreground">
                +{formatCurrency(total.inc, total.currency)} · -
                {formatCurrency(total.exp, total.currency)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="income">Receitas</SelectItem>
                <SelectItem value="expense">Despesas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Conta</Label>
            <Select value={filterAccount} onValueChange={setFilterAccount}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
          ) : txs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhuma transação encontrada.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {txs.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={
                      "h-9 w-9 rounded-full inline-flex items-center justify-center shrink-0 " +
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
                  {tx.transfer_id ? (
                    <Badge variant="secondary">Transferência</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(tx);
                        setOpen(true);
                      }}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {!tx.transfer_id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir transação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => del.mutate(tx.id)}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TxFormDialog({
  categories,
  accounts,
  editing,
  onSubmit,
  submitting,
}: {
  categories: Category[];
  accounts: Account[];
  editing: Tx | null;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
}) {
  const [type, setType] = useState<"income" | "expense">(editing?.type ?? "expense");
  const filteredCats = categories.filter((c) => c.type === type);
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar transação" : "Nova transação"}</DialogTitle>
        <DialogDescription>Preencha os dados da movimentação.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={onSubmit}>
        <input type="hidden" name="type" value={type} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={type === "income" ? "default" : "outline"}
            onClick={() => setType("income")}
            className={
              type === "income" ? "bg-success hover:bg-success/90 text-success-foreground" : ""
            }
          >
            Receita
          </Button>
          <Button
            type="button"
            variant={type === "expense" ? "default" : "outline"}
            onClick={() => setType("expense")}
            className={
              type === "expense"
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : ""
            }
          >
            Despesa
          </Button>
        </div>

        <div className="space-y-1">
          <Label htmlFor="account_id">Conta</Label>
          <Select name="account_id" defaultValue={editing?.account_id ?? accounts[0]?.id}>
            <SelectTrigger id="account_id">
              <SelectValue placeholder="Selecione" />
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="amount">Valor</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={editing?.amount}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="occurred_on">Data</Label>
            <Input
              id="occurred_on"
              name="occurred_on"
              type="date"
              required
              defaultValue={editing?.occurred_on ?? new Date().toISOString().slice(0, 10)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="category_id">Categoria</Label>
          <Select name="category_id" defaultValue={editing?.category_id ?? filteredCats[0]?.id}>
            <SelectTrigger id="category_id">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {filteredCats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="description">Descrição</Label>
          <Input
            id="description"
            name="description"
            maxLength={200}
            defaultValue={editing?.description ?? ""}
            placeholder="Opcional"
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
