import type { AppConfig } from '@okr/shared-models';

/** Who to ask about data protection; either part may be '', never both. */
export interface DataProtectionContact {
  name: string;
  email: string;
}

/** One address without spaces or mail parameters — the value becomes a `mailto:` link. */
const ADDRESS = /^[^\s@?&]+@[^\s@?&]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function address(value: unknown): string {
  const email = text(value);
  return ADDRESS.test(email) ? email : '';
}

/**
 * The tenant's data protection contact (`dpoName`, `dpoEmail`), or undefined when it names none. A contact with a
 * name but no e-mail is reached through the operator's address, as the erasure notice is (`eraseMyData`).
 */
export function dataProtectionContact(
  config: Pick<AppConfig, 'dpoName' | 'dpoEmail' | 'opEmail'> | undefined,
): DataProtectionContact | undefined {
  const name = text(config?.dpoName);
  const email = address(config?.dpoEmail);
  if (!name && !email) return undefined;
  return { name, email: email || address(config?.opEmail) };
}
