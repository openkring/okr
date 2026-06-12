// apps/functions/src/pdf/handlebars-helpers.ts
// handlebars is imported dynamically so it is not loaded at cold start (see browser-pool.ts).
import type { HelperOptions } from 'handlebars';

export async function registerHelpers(): Promise<void> {
  const { default: Handlebars } = await import('handlebars');

  Handlebars.registerHelper('formatMoney', (amount: unknown, currency = 'CHF') => {
    const num = typeof amount === 'number' ? amount / 100 : parseFloat(String(amount ?? 0)) / 100;
    return new Intl.NumberFormat('de-CH', { style: 'currency', currency: String(currency) }).format(num);
  });

  Handlebars.registerHelper('formatDate', (dateStr: unknown, locale = 'de-CH') => {
    if (!dateStr) return '';
    const date = new Date(String(dateStr));
    if (isNaN(date.getTime())) return String(dateStr);
    return date.toLocaleDateString(String(locale), { day: '2-digit', month: '2-digit', year: 'numeric' });
  });

  Handlebars.registerHelper('formatIban', (iban: unknown) => {
    if (!iban) return '';
    return String(iban).replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  });

  Handlebars.registerHelper('formatReference', (ref: unknown) => {
    if (!ref) return '';
    return String(ref).replace(/\s/g, '').replace(/(.{5})/g, '$1 ').trim();
  });

  Handlebars.registerHelper('ifEquals', function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: HelperOptions
  ) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('multiply', (a: unknown, b: unknown) =>
    (Number(a) * Number(b)).toFixed(2)
  );
  Handlebars.registerHelper('add', (a: unknown, b: unknown) => Number(a) + Number(b));
  Handlebars.registerHelper('subtract', (a: unknown, b: unknown) => Number(a) - Number(b));
}
