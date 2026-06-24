import { DEFAULT_KEY, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel } from './base.model';

// Defined here to avoid a dependency on @bk2/shared-util-angular (which would create a circular risk).
// Keep in sync with BrowserName in platform.util.ts.
export type BrowserName = 'safari' | 'chrome' | 'firefox' | 'opera' | 'other';
export type OsName = 'ios' | 'android' | 'macos' | 'windows' | 'other';

export class SessionModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public startedAt = '';        // StoreDateTime: yyyyMMddHHmmss
  public endedAt = '';          // StoreDateTime, empty while active
  public lastSeenAt = '';       // StoreDateTime, updated by heartbeat every 5 min
  public durationSeconds = 0;   // set on session end
  public isActive = true;

  public userKey = '';          // UserModel.bkey, empty for anonymous sessions
  public userEmail = '';        // Firebase Auth email, empty for anonymous sessions

  public browser: BrowserName = 'other';
  public os: OsName = 'other';

  public index = '';            // search index: lowercased "userEmail browser os"

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const SessionCollection = 'sessions';
export const SessionModelName = 'session';
