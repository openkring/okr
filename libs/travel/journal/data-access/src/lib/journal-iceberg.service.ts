import { Injectable } from '@angular/core';
import { IcebergsRes, IcebergSnapshot, parseStoredIcebergs } from '@okr/travel-journal-util';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const STORED_KEY = 'okr.journal.icebergs'; // the last snapshot received, for offline use (spec 2.122)
const ON_KEY = 'okr.journal.icebergsOn'; // the layer switch, per device like the base layer

/**
 * The «Eisberge» layer of the journal map (spec 2.122): `getIcebergs` returns BYU's current positions from the shared
 * 30-day cache. The device keeps the last answer (a few dozen points), so the ship's iPad shows it at sea.
 */
@Injectable({ providedIn: 'root' })
export class JournalIcebergService {
  /** Calls `getIcebergs` and stores the answer on the device; throws offline or when the function fails. */
  public async fetch(): Promise<IcebergsRes> {
    const res = await httpsCallable<unknown, IcebergsRes>(getFunctions(getApp(), 'europe-west6'), 'getIcebergs')({});
    this.store({ revisedAt: res.data.revisedAt, icebergs: res.data.icebergs });
    return res.data;
  }

  /** The last snapshot this device received, if any. */
  public stored(): IcebergSnapshot | undefined {
    try {
      return parseStoredIcebergs(localStorage.getItem(STORED_KEY));
    } catch {
      return undefined;
    }
  }

  public isOn(): boolean {
    try {
      return localStorage.getItem(ON_KEY) === '1';
    } catch {
      return false;
    }
  }

  public setOn(on: boolean): void {
    try {
      localStorage.setItem(ON_KEY, on ? '1' : '0');
    } catch {
      // storage unavailable (private mode): the switch lasts for this session
    }
  }

  private store(snapshot: IcebergSnapshot): void {
    try {
      localStorage.setItem(STORED_KEY, JSON.stringify(snapshot));
    } catch {
      // storage unavailable: the layer still shows this session's answer
    }
  }
}
