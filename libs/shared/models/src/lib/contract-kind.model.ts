import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@okr/shared-constants';
import { ContractType } from './contract.model';

/**
 * One kind of contract a member can request from a button (spec 1.87 §4.1).
 * okey = the kind, e.g. 'skiffPlatz'. Seeded by hand; no admin UI in v1.
 */
export const ContractKindCollection = 'contract-kinds';
export const ContractKindModelName = 'contractKind';

export interface ContractSigner {
  role: 'applicant' | 'responsibility';
  responsibilityKey: string;   // '' for the applicant
  signOrder: number;           // 0-based; equal numbers sign in parallel
  label: string;               // printed under the signature line, e.g. 'Präsident SCS'
}

/** What the member sees under a request button (spec 1.88 §5.3). Derived, never stored. */
export type ContractRequestState = 'none' | 'pending' | 'approved' | 'owned' | 'notActive';
export const CONTRACT_REQUEST_STATES: ContractRequestState[] = ['none', 'pending', 'approved', 'owned', 'notActive'];

export class ContractKindModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public name = DEFAULT_NAME;             // 'Skiff-Lagerplatz'
  public templateKey = '';                // templates/<key>
  public contractType: ContractType = 'lease';
  public contractName = '';               // '{kindName} {name}' placeholders: {name} = applicant
  public askGroupKey = '';                // groups/<key> with chatMode 'ask'
  public orgKey = '';                     // membership org and the internal contract party
  public eligibility: string[] = [];      // 'activeMember' | 'noOpenRequest' | 'noActiveOwnership'
  public signers: ContractSigner[] = [];
  public terms: Record<string, string> = {};
  public resourceType = '';               // 'locker' | 'key' — for the 'noActiveOwnership' check; '' = none (spec 1.88)
  public requiresAddress = true;          // false: no postal-address check and no confirmation preview
  public statusMessages: Partial<Record<ContractRequestState, string>> = {}; // i18n keys; empty = no status line

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}
