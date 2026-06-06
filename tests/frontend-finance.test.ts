import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const serverPromise = createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true },
});

test.after(async () => {
  const server = await serverPromise;
  await server.close();
});

test("blocks changing the currency of an existing account", async () => {
  const server = await serverPromise;
  const { assertAccountCurrencyUnchanged } = await server.ssrLoadModule(
    "/src/routes/_authenticated/accounts.tsx",
  );

  assert.doesNotThrow(() => assertAccountCurrencyUnchanged("brl", "BRL"));
  assert.throws(
    () => assertAccountCurrencyUnchanged("USD", "BRL"),
    /moeda de uma conta com histórico não pode ser alterada/,
  );
});

test("reports dashboard query failures instead of treating them as empty data", async () => {
  const server = await serverPromise;
  const { assertDashboardQueriesSucceeded } = await server.ssrLoadModule(
    "/src/routes/_authenticated/dashboard.tsx",
  );

  assert.doesNotThrow(() => assertDashboardQueriesSucceeded([{ label: "saldos", error: null }]));
  assert.throws(
    () =>
      assertDashboardQueriesSucceeded([
        { label: "saldos", error: { message: "permission denied" } },
        { label: "taxas", error: null },
      ]),
    /saldos: permission denied/,
  );
});

test("keeps missing currencies visible when calculating dashboard totals", async () => {
  const server = await serverPromise;
  const { sumConvertedTransactions } = await server.ssrLoadModule(
    "/src/routes/_authenticated/dashboard.tsx",
  );

  const result = sumConvertedTransactions(
    [
      { type: "income", amount: 100, accounts: { name: "Principal", currency: "BRL" } },
      { type: "income", amount: 10, accounts: { name: "Exterior", currency: "USD" } },
      { type: "income", amount: 20, accounts: { name: "Japão", currency: "JPY" } },
      { type: "expense", amount: 50, accounts: { name: "Principal", currency: "BRL" } },
    ],
    "income",
    "BRL",
    [{ from_currency: "USD", to_currency: "BRL", rate: 5 }],
  );

  assert.deepEqual(result, { total: 150, missingCurrencies: ["JPY"] });
});
