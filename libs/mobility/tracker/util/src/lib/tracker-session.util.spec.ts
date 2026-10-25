import { describe, expect, it } from 'vitest';
import { initialDetectState } from './track-detection.util';
import type { LocalTrack } from './track-local.model';
import {
  accumulateDistance, alignSections, needsUpload, nextSections, nextSectionStartPoint, resumeDecision, sessionDetectStep, startWarning, toTrackPoint,
} from './tracker-session.util';

function track(key: string, state: LocalTrack['state'], uploaded = false): LocalTrack {
  return { key, state, uploaded, name: key, startedAt: 0, sections: [{ mode: 'foot', detected: true }] };
}

describe('startWarning', () => {
  it('whenInUse only', () => expect(startWarning({ location: 'whenInUse', motion: 'granted' })).toBe('whenInUseOnly'));
  it('location denied', () => expect(startWarning({ location: 'denied', motion: 'granted' })).toBe('locationDenied'));
  it('motion denied', () => expect(startWarning({ location: 'always', motion: 'denied' })).toBe('motionDenied'));
  it('location denied wins over motion denied', () => expect(startWarning({ location: 'denied', motion: 'denied' })).toBe('locationDenied'));
  it('all granted', () => expect(startWarning({ location: 'always', motion: 'granted' })).toBe('none'));
  it('not determined yet is no warning', () => expect(startWarning({ location: 'notDetermined', motion: 'notDetermined' })).toBe('none'));
  it('no plugin answer → notNative', () => expect(startWarning(undefined)).toBe('notNative'));
});

describe('resumeDecision', () => {
  it('picks the recording track over done ones', () => {
    expect(resumeDecision([track('a', 'done'), track('b', 'recording'), track('c', 'done', true)])?.key).toBe('b');
  });
  it('picks a paused track', () => expect(resumeDecision([track('a', 'done'), track('p', 'paused')])?.key).toBe('p'));
  it('undefined when all are done', () => expect(resumeDecision([track('a', 'done')])).toBeUndefined());
});

describe('needsUpload', () => {
  it('done and not uploaded', () => expect(needsUpload(track('a', 'done'))).toBe(true));
  it('done and uploaded', () => expect(needsUpload(track('a', 'done', true))).toBe(false));
  it('still recording', () => expect(needsUpload(track('a', 'recording'))).toBe(false));
  it('paused', () => expect(needsUpload(track('a', 'paused'))).toBe(false));
});

describe('nextSectionStartPoint', () => {
  it('the last point of the old section', () => {
    expect(nextSectionStartPoint({ lat: 1, lng: 2, t: 3 })).toEqual({ lat: 1, lng: 2, t: 3 });
  });
  it('undefined before the first fix', () => expect(nextSectionStartPoint(undefined)).toBeUndefined());
});

describe('accumulateDistance', () => {
  it('first point adds nothing', () => expect(accumulateDistance(0, undefined, { lat: 47, lng: 8, t: 0 })).toBe(0));
  it('adds the leg', () => {
    const d = accumulateDistance(100, { lat: 47, lng: 8, t: 0 }, { lat: 47.001, lng: 8, t: 1 });
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(212);
  });
});

describe('toTrackPoint', () => {
  it('maps a native fix', () => {
    const fix = { lat: 1, lng: 2, accuracy: 5, altitude: null, speed: null, time: 9 }; // a NativeLocation
    expect(toTrackPoint(fix)).toEqual({ lat: 1, lng: 2, t: 9, acc: 5 });
  });
});

describe('sessionDetectStep', () => {
  const car = (at: number) => ({ activity: 'automotive' as const, confidence: 'high' as const, speedMps: 20, altitudeM: null, at });
  it('unlocked: switches after the stable time', () => {
    let s = initialDetectState('foot');
    let r = sessionDetectStep(s, car(0));
    s = r.state;
    r = sessionDetectStep(s, car(60_000));
    s = r.state;
    r = sessionDetectStep(s, car(120_000));
    expect(r.switchTo).toBe('car');
    expect(r.proposal).toBeUndefined();
  });
  it('locked (ski): proposes instead of switching, stays locked', () => {
    let s = initialDetectState('ski');
    let r = sessionDetectStep(s, car(0));
    s = r.state;
    r = sessionDetectStep(s, car(60_000));
    s = r.state;
    r = sessionDetectStep(s, car(120_000));
    expect(r.switchTo).toBeUndefined();
    expect(r.proposal).toBe('car');
    expect(r.state).toEqual({ mode: 'ski', locked: true });
  });
  it('locked: no proposal without a stable change', () => {
    const r = sessionDetectStep(initialDetectState('row'), car(0));
    expect(r.proposal).toBeUndefined();
    expect(r.state.locked).toBe(true);
    expect(r.state.mode).toBe('row');
  });
});

describe('nextSections', () => {
  const foot = [{ mode: 'foot' as const, detected: true }];
  it('starts a new section when the current one has points', () => {
    expect(nextSections(foot, 'car', true, true)).toEqual({ sections: [...foot, { mode: 'car', detected: true }], newSection: true });
  });
  it('replaces the mode of a section without points', () => {
    expect(nextSections(foot, 'bike', false, false)).toEqual({ sections: [{ mode: 'bike', detected: false }], newSection: false });
  });
  it('same mode by hand: no new section, no longer detected', () => {
    expect(nextSections(foot, 'foot', false, true)).toEqual({ sections: [{ mode: 'foot', detected: false }], newSection: false });
  });
  it('no section yet', () => {
    expect(nextSections([], 'row', false, false)).toEqual({ sections: [{ mode: 'row', detected: false }], newSection: true });
  });
});

describe('alignSections', () => {
  const p = { lat: 1, lng: 1, t: 1 };
  it('pads missing trailing sections with []', () => expect(alignSections([[p]], 3)).toEqual([[p], [], []]));
  it('fills holes', () => expect(alignSections([[p], undefined as unknown as never, [p]], 3)).toEqual([[p], [], [p]]));
  it('drops points beyond the known sections', () => expect(alignSections([[p], [p]], 1)).toEqual([[p]]));
});
