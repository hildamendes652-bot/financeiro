export type CurrencyBalance = {
  currency: string;
  balance: number;
};

export type ExchangeRate = {
  from_currency: string;
  to_currency: string;
  rate: number;
};

export type ConsolidationResult = {
  total: number;
  missingCurrencies: string[];
};

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function consolidateBalances(
  balances: CurrencyBalance[],
  reportingCurrency: string,
  rates: ExchangeRate[],
): ConsolidationResult {
  const target = normalizeCurrency(reportingCurrency);
  const missing = new Set<string>();
  let total = 0;

  for (const item of balances) {
    const source = normalizeCurrency(item.currency);
    const converted = convertAmount(Number(item.balance), source, target, rates);
    if (converted === null) missing.add(source);
    else total += converted;
  }

  return {
    total: roundMoney(total),
    missingCurrencies: Array.from(missing).sort(),
  };
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRate[],
): number | null {
  const source = normalizeCurrency(fromCurrency);
  const target = normalizeCurrency(toCurrency);
  if (source === target) return amount;

  const direct = rates.find(
    (rate) =>
      normalizeCurrency(rate.from_currency) === source &&
      normalizeCurrency(rate.to_currency) === target,
  );
  if (direct && Number(direct.rate) > 0) return amount * Number(direct.rate);

  const inverse = rates.find(
    (rate) =>
      normalizeCurrency(rate.from_currency) === target &&
      normalizeCurrency(rate.to_currency) === source,
  );
  if (inverse && Number(inverse.rate) > 0) return amount / Number(inverse.rate);

  return null;
}
