import type { FileTransferRecipient } from '@okr/shared-models';

export function buildRecipients(input: { persons: { personKey: string; name: string; email: string; viaGroupKey?: string }[]; emails: string[] }): Omit<FileTransferRecipient, 'tokenHash' | 'aliasUrl'>[] {
  const byId = new Map<string, Omit<FileTransferRecipient, 'tokenHash' | 'aliasUrl'>>();
  const personEmails = new Set<string>();

  for (const p of input.persons) {
    const id = `p:${p.personKey}`;
    let r = byId.get(id);
    if (!r) {
      r = { id, kind: 'person', personKey: p.personKey, email: p.email, name: p.name, viaGroupKeys: [] };
      byId.set(id, r);
    }
    if (p.viaGroupKey && !r.viaGroupKeys.includes(p.viaGroupKey)) r.viaGroupKeys.push(p.viaGroupKey);
    if (p.email) personEmails.add(p.email.trim().toLowerCase());
  }

  for (const raw of input.emails) {
    const email = raw.trim().toLowerCase();
    if (!email || personEmails.has(email)) continue;
    const id = `e:${email}`;
    if (!byId.has(id)) byId.set(id, { id, kind: 'email', personKey: '', email, name: email, viaGroupKeys: [] });
  }
  return [...byId.values()];
}
