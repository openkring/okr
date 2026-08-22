// libs/session/data-access/src/lib/session.service.ts
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ensureAppCheckToken, ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { OsName, SessionCollection, SessionModel, UserModel } from '@okr/shared-models';
import { getBrowser, isBrowser, isIOS, isAndroid, isMacOS, isSafari } from '@okr/shared-util-angular';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { getSessionIndex } from '@okr/session-util';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly platformId = inject(PLATFORM_ID);

  private session: SessionModel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private startInFlight = false;
  private readonly HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // must stay < 30-min orphan cleanup threshold

  public get hasActiveSession(): boolean {
    return this.session !== null && !!this.session.okey;
  }

  public async startSession(): Promise<void> {
    if (!isBrowser(this.platformId)) return;
    if (this.hasActiveSession || this.startInFlight) return;
    this.startInFlight = true;

    try {
      const session = new SessionModel(this.env.tenantId);
      session.startedAt = getTodayStr(DateFormat.StoreDateTime);
      session.lastSeenAt = session.startedAt;
      session.isActive = true;
      session.browser = getBrowser();
      session.os = this.detectOs();

      session.index = getSessionIndex(session);
      // App Check is ENFORCED on Firestore and its token is refreshed by a timer that a
      // backgrounded tab does not get — Safari suspends timers in hidden tabs. startSession() is
      // the FIRST write fired on tab resume, so without this pre-flight it went out with an
      // expired token and the backend answered PERMISSION_DENIED, which Firestore does not retry.
      await ensureAppCheckToken();
      const key = await this.firestoreService.createModel<SessionModel>(
        SessionCollection, session, undefined, undefined, undefined, true);
      if (key) {
        session.okey = key;
        this.session = session;
        this.startHeartbeat();
      }
    } finally {
      this.startInFlight = false;
    }
  }

  public async upgradeSession(user: UserModel): Promise<void> {
    if (!this.session) return;
    if (this.session.userKey === user.okey) return;  // already upgraded, skip redundant write
    this.session.userKey = user.okey;
    this.session.userEmail = user.loginEmail;
    this.session.index = getSessionIndex(this.session);
    await ensureAppCheckToken();
    await this.firestoreService.updateModel<SessionModel>(
      SessionCollection, this.session, false, undefined, undefined, undefined, true);
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
    session.index = getSessionIndex(session);

    if (isSafari() || isIOS()) {
      this.sendBeacon(session);
    }
    await ensureAppCheckToken();
    await this.firestoreService.updateModel<SessionModel>(
      SessionCollection, session, false, undefined, undefined, undefined, true);
  }

  private async heartbeat(): Promise<void> {
    if (!this.session) return;
    this.session.lastSeenAt = getTodayStr(DateFormat.StoreDateTime);
    await ensureAppCheckToken();
    await this.firestoreService.updateModel<SessionModel>(
      SessionCollection, this.session, false, undefined, undefined, undefined, true);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.HEARTBEAT_INTERVAL_MS);
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
    if (!startedAt || !endedAt || startedAt.length < 14 || endedAt.length < 14) return 0;
    const parse = (sdt: string): number => {
      const y = +sdt.slice(0, 4), mo = +sdt.slice(4, 6) - 1;
      const d = +sdt.slice(6, 8), h = +sdt.slice(8, 10);
      const m = +sdt.slice(10, 12), s = +sdt.slice(12, 14);
      return new Date(y, mo, d, h, m, s).getTime();
    };
    return Math.max(0, Math.floor((parse(endedAt) - parse(startedAt)) / 1000));
  }

  private sendBeacon(session: SessionModel): void {
    if (typeof fetch === 'undefined') return;
    const region = 'europe-west6';
    const projectId = this.env.firebase.projectId;
    const url = `https://${region}-${projectId}.cloudfunctions.net/endSession`;
    const payload = JSON.stringify({ sessionKey: session.okey, tenantId: this.env.tenantId });
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => { /* best-effort on unload */ });
  }
}
