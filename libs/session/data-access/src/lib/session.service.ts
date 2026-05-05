// libs/session/data-access/src/lib/session.service.ts
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { OsName, SessionCollection, SessionModel, UserModel } from '@bk2/shared-models';
import { getBrowser, isBrowser, isIOS, isAndroid, isMacOS, isSafari } from '@bk2/shared-util-angular';
import { DateFormat, getTodayStr } from '@bk2/shared-util-core';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);

  private session: SessionModel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  public get hasActiveSession(): boolean {
    return this.session !== null && this.session.bkey !== '' && this.session.bkey !== undefined;
  }

  public async startSession(): Promise<void> {
    if (!isBrowser(this.platformId)) return;
    if (this.hasActiveSession) return;

    const session = new SessionModel(this.env.tenantId);
    session.startedAt = getTodayStr(DateFormat.StoreDateTime);
    session.lastSeenAt = session.startedAt;
    session.isActive = true;
    session.browser = getBrowser();
    session.os = this.detectOs();

    const key = await this.firestoreService.createModel<SessionModel>(SessionCollection, session, undefined, undefined);
    if (key) {
      session.bkey = key;
      this.session = session;
      this.startHeartbeat();
    }
  }

  public async upgradeSession(user: UserModel): Promise<void> {
    if (!this.session) return;
    this.session.userKey = user.bkey;
    this.session.userEmail = user.loginEmail;
    await this.firestoreService.updateModel<SessionModel>(SessionCollection, this.session, undefined);
  }

  public async endSession(): Promise<void> {
    if (!this.session) return;
    const session = this.session;
    this.session = null;
    this.stopHeartbeat();

    const endedAt = getTodayStr(DateFormat.StoreDateTime);
    session.isActive = false;
    session.endedAt = endedAt;
    session.durationSeconds = this.calcDurationSeconds(session.startedAt, endedAt);

    if (isSafari() || isIOS()) {
      this.sendBeacon(session);
    }
    await this.firestoreService.updateModel<SessionModel>(SessionCollection, session, undefined);
  }

  private async heartbeat(): Promise<void> {
    if (!this.session) return;
    this.session.lastSeenAt = getTodayStr(DateFormat.StoreDateTime);
    await this.firestoreService.updateModel<SessionModel>(SessionCollection, this.session, undefined);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 5 * 60 * 1000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private detectOs(): OsName {
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    if (isMacOS()) return 'macos';
    if (typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)) return 'windows';
    return 'other';
  }

  private calcDurationSeconds(startedAt: string, endedAt: string): number {
    const parse = (sdt: string): number => {
      const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
      const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
      const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
      return new Date(y, mo, d, h, m, s).getTime();
    };
    return Math.max(0, Math.floor((parse(endedAt) - parse(startedAt)) / 1000));
  }

  private sendBeacon(session: SessionModel): void {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
    const region = 'europe-west6';
    const projectId = this.env.firebase.projectId;
    const url = `https://${region}-${projectId}.cloudfunctions.net/endSession`;
    const payload = JSON.stringify({ sessionKey: session.bkey, tenantId: this.env.tenantId });
    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
  }
}
