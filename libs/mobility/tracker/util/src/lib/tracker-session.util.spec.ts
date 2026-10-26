import { describe, expect, it } from 'vitest';
import { initialDetectState } from './track-detection.util';
import type { LocalTrack } from './track-local.model';
import {
  accumulateDistance, alignSections, allThumbsUploaded, hasNoPoints, needsThumbUpload, needsUpload, nextSections, nextSectionStartPoint, pendingUploadOwner, resumeDecision, sectionsAfterPause,
  sessionDetectStep, startWarning, toTrackPoint, withThumbPaths,
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

describe('pendingUploadOwner', () => {
  it('undefined without a person', () => expect(pendingUploadOwner(undefined, 'u1')).toBeUndefined());
  it('undefined without an auth uid', () => expect(pendingUploadOwner('p1', undefined)).toBeUndefined());
  it('undefined for empty strings', () => expect(pendingUploadOwner('', '')).toBeUndefined());
  it('one id per owner', () => expect(pendingUploadOwner('p1', 'u1')).toBe('u1|p1'));
  it('a different owner gives a different id', () => expect(pendingUploadOwner('p2', 'u2')).not.toBe(pendingUploadOwner('p1', 'u1')));
});

describe('sectionsAfterPause', () => {
  it('a section with points: a new one in the same mode, detected copied', () => {
    expect(sectionsAfterPause([{ mode: 'car', detected: true }, { mode: 'bike', detected: false }], true)).toEqual({
      sections: [{ mode: 'car', detected: true }, { mode: 'bike', detected: false }, { mode: 'bike', detected: false }], newSection: true,
    });
  });
  it('a section without points stays as it is', () => {
    const sections = [{ mode: 'foot' as const, detected: true }];
    expect(sectionsAfterPause(sections, false)).toEqual({ sections, newSection: false });
  });
  it('no section at all: a foot section (detected)', () => {
    expect(sectionsAfterPause([], true)).toEqual({ sections: [{ mode: 'foot', detected: true }], newSection: true });
  });
  it('does not change the input', () => {
    const sections = [{ mode: 'ski' as const, detected: false }];
    sectionsAfterPause(sections, true);
    expect(sections).toHaveLength(1);
  });
});

describe('hasNoPoints', () => {
  it('no groups', () => expect(hasNoPoints([])).toBe(true));
  it('only empty groups', () => expect(hasNoPoints([[], []])).toBe(true));
  it('one point somewhere', () => expect(hasNoPoints([[], [{ lat: 1, lng: 2, t: 3 }]])).toBe(false));
});

function photo(assetId: string, extra: Partial<NonNullable<LocalTrack['photos']>[number]> = {}): NonNullable<LocalTrack['photos']>[number] {
  return { assetId, takenAt: '2026-10-26T10:00:00.000Z', lat: 47, lng: 8, ownGps: true, hidden: false, path400: `/cache/${assetId}.jpg`, ...extra };
}

describe('needsThumbUpload', () => {
  const up = (photos: LocalTrack['photos'], photosUploaded?: boolean): LocalTrack => ({ ...track('a', 'done', true), photos, photosUploaded });
  it('uploaded trip with a visible photo without thumb', () => expect(needsThumbUpload(up([photo('x')]))).toBe(true));
  it('trip not uploaded yet', () => expect(needsThumbUpload({ ...up([photo('x')]), uploaded: false })).toBe(false));
  it('photos already uploaded', () => expect(needsThumbUpload(up([photo('x')], true))).toBe(false));
  it('no photos', () => expect(needsThumbUpload(up(undefined))).toBe(false));
  it('only hidden photos', () => expect(needsThumbUpload(up([photo('x', { hidden: true })]))).toBe(false));
  it('every visible photo has its thumb', () => expect(needsThumbUpload(up([photo('x', { thumbPath: 't/x.jpg' }), photo('y', { hidden: true })]))).toBe(false));
  it('one visible photo still missing', () => expect(needsThumbUpload(up([photo('x', { thumbPath: 't/x.jpg' }), photo('y')]))).toBe(true));
});

describe('withThumbPaths', () => {
  it('copies thumb paths by assetId and leaves others alone', () => {
    const out = withThumbPaths([photo('x'), photo('y'), photo('z', { thumbPath: 'old' })], [{ assetId: 'y', thumbPath: 't/1.jpg' }]);
    expect(out.map((p) => p.thumbPath)).toEqual([undefined, 't/1.jpg', 'old']);
  });
  it('ignores an uploaded asset that is no longer in the list', () => {
    const out = withThumbPaths([photo('x')], [{ assetId: 'gone', thumbPath: 't/0.jpg' }]);
    expect(out).toEqual([photo('x')]);
  });
  it('does not mutate the input', () => {
    const input = [photo('x')];
    withThumbPaths(input, [{ assetId: 'x', thumbPath: 't/0.jpg' }]);
    expect(input[0].thumbPath).toBeUndefined();
  });
});

describe('allThumbsUploaded', () => {
  it('no photos', () => expect(allThumbsUploaded(undefined)).toBe(true));
  it('hidden photos need no thumb', () => expect(allThumbsUploaded([photo('x', { hidden: true }), photo('y', { thumbPath: 't' })])).toBe(true));
  it('a visible photo without thumb', () => expect(allThumbsUploaded([photo('x')])).toBe(false));
});
