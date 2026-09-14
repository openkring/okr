import { BankImportRowModel, BankRuleModel } from '@okr/shared-models';

/**
 * NFD, strip combining marks, lower case, collapse whitespace, trim. Punctuation is KEPT
 * (`firefoo.app`, `paypal *ionos`) — bank rules are more precise with the raw tokens, unlike
 * `normalizeParty` in finance-ocr-rule-util which also drops legal suffixes.
 * The rule editor stores contains/startsWith/endsWith terms through this same function.
 */
export function normalizeText(raw: string): string {
  return (raw ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface MatchResult {
  ruleKey: string;
  title: string;
  accountKey: string;
  vatCodeKey: string;
}

export interface MatchOutcome {
  result?: MatchResult;
  /** rules whose regex failed to compile — reported once per run by the caller */
  invalidRuleKeys: string[];
}

interface Candidate { rule: BankRuleModel; match: RegExpExecArray | null }

function test(rule: BankRuleModel, normalized: string, invalid: string[]): Candidate | undefined {
  const term = rule.term ?? '';
  if (term.length === 0) return undefined;
  switch (rule.condition) {
    case 'contains':   return normalized.includes(term) ? { rule, match: null } : undefined;
    case 'startsWith': return normalized.startsWith(term) ? { rule, match: null } : undefined;
    case 'endsWith':   return normalized.endsWith(term) ? { rule, match: null } : undefined;
    case 'regex': {
      let re: RegExp;
      try { re = new RegExp(term, 'i'); } catch { invalid.push(rule.okey); return undefined; }
      const m = re.exec(normalized);
      return m ? { rule, match: m } : undefined;
    }
    default: return undefined;
  }
}

function substitute(title: string, match: RegExpExecArray | null): string {
  if (!match) return title;
  return title.replace(/\$([1-9])/g, (_, i) => match[Number(i)] ?? '');
}

/** Highest priority wins; tie → longer term; tie → smaller okey (deterministic). */
export function matchRule(rawText: string, rules: BankRuleModel[]): MatchOutcome {
  const normalized = normalizeText(rawText);
  const invalidRuleKeys: string[] = [];
  const candidates = rules
    .filter(r => r.active !== false)
    .map(r => test(r, normalized, invalidRuleKeys))
    .filter((c): c is Candidate => c !== undefined)
    .sort((a, b) =>
      (b.rule.priority ?? 0) - (a.rule.priority ?? 0)
      || (b.rule.term?.length ?? 0) - (a.rule.term?.length ?? 0)
      || (a.rule.okey < b.rule.okey ? -1 : a.rule.okey > b.rule.okey ? 1 : 0));
  const winner = candidates[0];
  if (!winner) return { invalidRuleKeys };
  return {
    result: {
      ruleKey: winner.rule.okey,
      title: substitute(winner.rule.title ?? '', winner.match),
      accountKey: winner.rule.accountKey ?? '',
      vatCodeKey: winner.rule.vatCodeKey ?? '',
    },
    invalidRuleKeys,
  };
}

function isOneOff(row: BankImportRowModel): boolean {
  return (row.ruleKey ?? '') === '' && (row.accountKey ?? '') !== '';
}

/**
 * Re-maps every row that is still open. Never touches: posted/error rows, and one-off
 * assignments (ruleKey '' but accountKey set). Returns new row objects; inputs are not mutated.
 */
export function applyRules(rows: BankImportRowModel[], rules: BankRuleModel[]): { rows: BankImportRowModel[]; invalidRuleKeys: string[] } {
  const invalid = new Set<string>();
  const out = rows.map(row => {
    if (row.status === 'posted' || row.status === 'error' || isOneOff(row)) return row;
    const { result, invalidRuleKeys } = matchRule(row.rawText, rules);
    invalidRuleKeys.forEach(k => invalid.add(k));
    if (!result) return { ...row, status: 'unmapped' as const, ruleKey: '', accountKey: '', title: '', vatCodeKey: '' };
    return { ...row, status: 'mapped' as const, ruleKey: result.ruleKey, accountKey: result.accountKey, title: result.title, vatCodeKey: result.vatCodeKey };
  });
  return { rows: out, invalidRuleKeys: [...invalid] };
}
