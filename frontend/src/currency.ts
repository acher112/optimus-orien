import { ALL_CURRENCIES } from './localeData';

export function getCurrencySymbol(curr?: string): string {
  if (!curr) return 'Rs';
  const c = curr.toUpperCase().trim();
  if (c === 'USD') return '$';
  if (c === 'PKR') return 'Rs';
  if (c === 'GBP') return '£';
  if (c === 'EUR') return '€';
  if (c === 'INR') return '₹';
  if (c === 'CAD') return 'C$';
  if (c === 'AUD') return 'A$';
  if (c === 'AED') return 'AED';
  if (c === 'SAR') return 'SAR';
  const found = ALL_CURRENCIES.find(x => x.code === c);
  return found?.symbol || c;
}

export function formatMoney(amount: number | string | null | undefined, curr?: string): string {
  if (amount === null || amount === undefined || amount === '') return `${getCurrencySymbol(curr)} 0`;
  const n = typeof amount === 'number' ? amount : (parseFloat(String(amount)) || 0);
  const sym = getCurrencySymbol(curr);
  return `${sym} ${Math.round(n).toLocaleString()}`;
}

export function formatMoneyPrecise(amount: number | string | null | undefined, curr?: string, decimals: number = 2): string {
  if (amount === null || amount === undefined || amount === '') return `${getCurrencySymbol(curr)} 0.00`;
  const n = typeof amount === 'number' ? amount : (parseFloat(String(amount)) || 0);
  const sym = getCurrencySymbol(curr);
  return `${sym} ${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}
