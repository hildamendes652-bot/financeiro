import assert from "node:assert/strict";
import test from "node:test";
import {
  consolidateBalances,
  convertAmount,
  normalizeCurrency,
  roundMoney,
} from "../src/lib/money.ts";

test("normalizes ISO-style currency codes", () => {
  assert.equal(normalizeCurrency(" usd "), "USD");
});

test("rounds monetary totals to two decimal places", () => {
  assert.equal(roundMoney(10.005), 10.01);
});

test("consolidates direct and inverse manual exchange rates", () => {
  const result = consolidateBalances(
    [
      { currency: "BRL", balance: 100 },
      { currency: "USD", balance: 10 },
      { currency: "EUR", balance: 10 },
    ],
    "BRL",
    [
      { from_currency: "USD", to_currency: "BRL", rate: 5 },
      { from_currency: "BRL", to_currency: "EUR", rate: 0.2 },
    ],
  );

  assert.deepEqual(result, { total: 200, missingCurrencies: [] });
});

test("reports currencies without a conversion rate", () => {
  const result = consolidateBalances(
    [
      { currency: "BRL", balance: 100 },
      { currency: "JPY", balance: 1000 },
    ],
    "BRL",
    [],
  );

  assert.deepEqual(result, { total: 100, missingCurrencies: ["JPY"] });
});

test("returns null when an amount cannot be converted", () => {
  assert.equal(convertAmount(10, "USD", "BRL", []), null);
});
