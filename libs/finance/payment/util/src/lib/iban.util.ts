export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

export function validateIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (iban.length < 5) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);

  const numericStr = rearranged.split('').map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return String(code - 55);
    if (code >= 48 && code <= 57) return ch;
    return '?';
  }).join('');

  if (numericStr.includes('?')) return false;

  let remainder = 0;
  for (const ch of numericStr) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}
