import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { distinctUntilChanged, filter } from 'rxjs';

import { TransportMode } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { DateFormat, generateRandomString, getCurrentTime, getTodayStr } from '@okr/shared-util-core';
import { NativeLocation, PhotoAccess, queryPedometerSteps, ThumbSourceMissingError, TrackDb, TrackerLocation, TrackerPhotos, TrackService } from '@okr/mobility-tracker-data-access';
import {
  accumulateDistance, allThumbsUploaded, alignSections, correctedTrack, DetectionInput, hasNoPoints, LocalSection, sameTrackContent, DetectState, initialDetectState, LocalTrack,
  mergePhotos, MotionActivity, needsThumbUpload, needsUpload, nextThumbNumber, photoWindowEnd, placePhotos, nextSectionStartPoint, nextSections, pendingUploadOwner, resumeDecision, sectionsAfterPause, sessionDetectStep, StartWarning, localStoreDate, trackTenants,
  startWarning, summarize, toTrackPoint, TRACK_PROFILES, TRACKER_I18N_KEYS, TrackerI18n, TrackPoint, withPhotoHidden, withThumbPaths,
  LIVE_SPLIT_WINDOW_MS, liveSplitS, sectionMeta, toLocalSections, withQueriedSteps,
} from '@okr/mobility-tracker-util';

/**
 * Recording orchestration of the tracker (spec 1.121, plan 2 task 6). Every GPS fix goes straight into TrackDb;
 * detection runs on every fix and every activity event (Core Motion only reports changes, so the last activity is
 * kept). The decisions live in tracker-session.util; this store only wires plugin, database and upload.
 * On the web the plugin rejects every call: the store then shows the `notNative` warning instead of failing.
 * Every state change of the active track (start, pause, resume, stop, section switch, each fix) runs through ONE
 * promise queue, so a write never works on a stale copy of the track.
 */
export interface TrackerStoreState {
  active: LocalTrack | undefined;
  currentMode: TransportMode | undefined;
  points: number;
  distanceM: number;
  warning: StartWarning;
  proposal: TransportMode | undefined; // a change detected while detection is locked; applied only by acceptProposal()
  resumable: LocalTrack | undefined; // a track left recording/paused when the app went away
  uploadError: string | undefined;
  initialized: boolean; // init() completed: the database is open
  photoAccess: PhotoAccess | undefined; // last known photo-library access (native only; undefined until asked)
  liveSteps: number | undefined; // foot: pedometer steps of the current section so far (spec 1.122)
  liveSplitS: number | undefined; // row: current split, s per 500 m, from the GPS speed of the last 10 s
  calibrating: boolean; // admin option: record raw rowing motion while a row section records (spec 1.122 §5.2)
}

const initialState: TrackerStoreState = {
  active: undefined, currentMode: undefined, points: 0, distanceM: 0, warning: 'none', proposal: undefined, resumable: undefined, uploadError: undefined, initialized: false, photoAccess: undefined,
  liveSteps: undefined, liveSplitS: undefined, calibrating: false,
};

/** Mutable per-session bookkeeping that never renders. */
export interface TrackerSession {
  detect: DetectState;
  lastPoint: TrackPoint | undefined;
  sectionHasPoints: boolean;
  lastActivity: MotionActivity | undefined;
  lastFix: NativeLocation | undefined;
  handles: PluginListenerHandle[];
  queue: Promise<void>; // every change of the active track runs strictly in order
  stopping: boolean; // set by stop(): late fixes, mode changes and proposals are ignored
  init: Promise<void> | undefined; // a failed open is retried on the next init()
  ownerWatch: boolean; // the pending-upload loop is subscribed to the signed-in owner
  thumbsInFlight: Set<string>; // track keys whose thumbnail step is running (no overlapping runs per track)
  sectionStartMs: number | undefined; // time of the current section's first fix (live steps)
  lastStepsQueryMs: number; // live steps are polled at most every LIVE_STEPS_INTERVAL_MS
  recentFixes: { speed: number | null; time: number }[]; // fixes of the last 10 s (live split)
  calibrationOpen: boolean; // a native calibration recording is running
}

const LIVE_STEPS_INTERVAL_MS = 15_000;

function profileOf(mode: TransportMode) {
  const { distanceFilter, accuracy, minIntervalMs } = TRACK_PROFILES[mode];
  return minIntervalMs === undefined ? { distanceFilter, accuracy } : { distanceFilter, accuracy, minIntervalMs };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const TrackerStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withProps(() => {
    const appStore = inject(AppStore);
    const i18nService = inject(I18nService);
    return {
      db: inject(TrackDb),
      trackService: inject(TrackService),
      appStore,
      i18nService,
      toastController: inject(ToastController),
      router: inject(Router),
      i18n: i18nService.translateAll(TRACKER_I18N_KEYS) as TrackerI18n,
      /** Emits an id whenever person and auth uid are both known (pendingUploadOwner); undefined while signed out. */
      owner$: toObservable(computed(() => pendingUploadOwner(appStore.currentUser()?.personKey, appStore.fbUser()?.uid))),
      session: {
        detect: initialDetectState('foot'), lastPoint: undefined, sectionHasPoints: false, lastActivity: undefined, lastFix: undefined,
        handles: [], queue: Promise.resolve(), stopping: false, init: undefined, ownerWatch: false, thumbsInFlight: new Set<string>(),
        sectionStartMs: undefined, lastStepsQueryMs: 0, recentFixes: [], calibrationOpen: false,
      } as TrackerSession,
    };
  }),
  withMethods((store) => {
    const s = store.session;

    /** Runs a task after all earlier ones; a failing task is logged, resolves to undefined and never blocks the next one. */
    function enqueue<T>(task: () => Promise<T>): Promise<T | undefined> {
      const run = s.queue.then(task);
      s.queue = run.then(() => undefined, (error: unknown) => console.error('TrackerStore', error));
      return run.catch(() => undefined);
    }

    async function refreshWarning(): Promise<Awaited<ReturnType<typeof TrackerLocation.permission>> | undefined> {
      let p: Awaited<ReturnType<typeof TrackerLocation.permission>> | undefined;
      if (Capacitor.isNativePlatform()) {
        try {
          p = await TrackerLocation.permission();
        } catch {
          p = undefined;
        }
      }
      patchState(store, { warning: startWarning(p) });
      return p;
    }

    /** false when the plugin refused: `startFailed` on a device, `notNative` on the web. */
    async function startPlugin(mode: TransportMode): Promise<boolean> {
      try {
        await ensureListeners();
        await TrackerLocation.start({ ...profileOf(mode), motion: true });
        return true;
      } catch (error) {
        console.error('TrackerStore.startPlugin', error);
        patchState(store, { warning: Capacitor.isNativePlatform() ? 'startFailed' : 'notNative' });
        return false;
      }
    }

    async function stopPlugin(): Promise<void> {
      try {
        await TrackerLocation.stop();
      } catch {
        // web / no plugin: nothing is running
      }
    }

    // Registered once for the app's lifetime (the store is a root singleton); the handles are never removed.
    async function ensureListeners(): Promise<void> {
      if (s.handles.length > 0) return;
      s.handles.push(await TrackerLocation.addListener('location', (l) => void enqueue(() => onLocation(l))));
      s.handles.push(await TrackerLocation.addListener('activity', (a) => void enqueue(() => onActivity(a))));
    }

    async function onLocation(l: NativeLocation): Promise<void> {
      const t = store.active();
      if (!t || t.state !== 'recording' || s.stopping) return;
      const p = toTrackPoint(l);
      const prev = s.lastPoint;
      s.lastPoint = p;
      s.lastFix = l;
      s.sectionHasPoints = true;
      patchState(store, { points: store.points() + 1, distanceM: accumulateDistance(store.distanceM(), prev, p) });
      await store.db.appendPoint(t.key, t.sections.length - 1, p);
      liveFigures(l);
      await detect({
        activity: s.lastActivity?.type ?? 'unknown', confidence: s.lastActivity?.confidence ?? 'low',
        speedMps: l.speed, altitudeM: l.altitude, at: l.time,
      });
    }

    async function onActivity(a: MotionActivity): Promise<void> {
      s.lastActivity = a;
      if (store.active()?.state !== 'recording' || s.stopping) return;
      await detect({
        activity: a.type, confidence: a.confidence, speedMps: s.lastFix?.speed ?? null, altitudeM: s.lastFix?.altitude ?? null, at: a.timestamp,
      });
    }

    async function detect(input: DetectionInput): Promise<void> {
      const r = sessionDetectStep(s.detect, input);
      s.detect = r.state;
      if (r.switchTo) await switchSection(r.switchTo, true);
      else if (r.proposal && r.proposal !== store.proposal()) patchState(store, { proposal: r.proposal });
    }

    /**
     * Ends the current section and starts one in `mode` (connected by the old section's last point); new profile
     * without a stop/start. Runs inside the queue only; does nothing once stop() began.
     */
    async function switchSection(mode: TransportMode, detected: boolean): Promise<void> {
      const t = store.active();
      if (!t || t.state === 'done' || s.stopping) return;
      const next = nextSections(t.sections, mode, detected, s.sectionHasPoints);
      const track: LocalTrack = { ...t, sections: next.sections };
      await store.db.updateTrack(track);
      if (next.newSection) {
        const first = nextSectionStartPoint(s.lastPoint);
        if (first) await store.db.appendPoint(t.key, track.sections.length - 1, first);
        s.sectionHasPoints = first !== undefined;
      }
      patchState(store, { active: track, currentMode: mode, proposal: undefined });
      if (next.newSection) resetLive();
      if (t.state === 'recording') {
        try {
          await TrackerLocation.setProfile(profileOf(mode));
        } catch (error) {
          console.error('TrackerStore.setProfile', error);
        }
      }
      await syncCalibration();
    }

    /** Live step count (foot, polled) and live split (row) from one fix; never blocks the queue. */
    function liveFigures(l: NativeLocation): void {
      s.sectionStartMs ??= l.time;
      const mode = store.currentMode();
      if (mode === 'foot' && l.time - s.lastStepsQueryMs >= LIVE_STEPS_INTERVAL_MS) {
        s.lastStepsQueryMs = l.time;
        const since = s.sectionStartMs;
        void queryPedometerSteps(since, l.time).then((steps) => {
          if (steps !== undefined && s.sectionStartMs === since) patchState(store, { liveSteps: steps });
        });
      } else if (mode === 'row') {
        s.recentFixes = [...s.recentFixes, { speed: l.speed, time: l.time }].filter((f) => f.time >= l.time - LIVE_SPLIT_WINDOW_MS);
        patchState(store, { liveSplitS: liveSplitS(s.recentFixes, l.time) });
      }
    }

    function resetLive(): void {
      s.sectionStartMs = undefined;
      s.lastStepsQueryMs = 0;
      s.recentFixes = [];
      patchState(store, { liveSteps: undefined, liveSplitS: undefined });
    }

    /** Runs the native calibration recording exactly while calibrating is on and a row section records. */
    async function syncCalibration(): Promise<void> {
      const want = store.calibrating() && store.active()?.state === 'recording' && store.currentMode() === 'row' && !s.stopping;
      if (want === s.calibrationOpen) return;
      try {
        if (want) await TrackerLocation.calibrationStart();
        else await TrackerLocation.calibrationStop();
        s.calibrationOpen = want;
      } catch (error) {
        console.error('TrackerStore.calibration', error);
        s.calibrationOpen = false;
      }
    }

    /** The finished track with the pedometer steps of its foot sections (the plugin answers nothing on the web). */
    async function withSteps(t: LocalTrack, groups: TrackPoint[][]): Promise<LocalTrack> {
      const sections = await withQueriedSteps(toLocalSections(t, alignSections(groups, t.sections.length)), queryPedometerSteps, Date.now());
      return { ...t, sections: sections.map(sectionMeta) };
    }

    /** A queued mode change for the track that is active now; skipped if stop() began or another track became active. */
    function changeFor(task: () => Promise<void>): Promise<void> {
      const key = store.active()?.key;
      return enqueue(async () => {
        if (!key || s.stopping || store.active()?.key !== key) return;
        await task();
      }).then(() => undefined);
    }

    async function findTrack(key: string): Promise<LocalTrack | undefined> {
      return (await store.db.list()).find((x) => x.key === key);
    }

    /**
     * Uploads one finished local track; on success it is marked uploaded. Silent: no uploadError (retries at init).
     * The track and its points are read inside the queue (never a stale copy next to corrected points), and the
     * `uploaded` mark is written only if name and sections still equal the uploaded snapshot — a correction made
     * meanwhile stays pending for its own upload. Leftover track-points docs of a shrunk track (extraPointsUpTo) are deleted in the same batch.
     */
    async function uploadTrack(t: LocalTrack, silent: boolean): Promise<boolean> {
      const personKey = store.appStore.currentUser()?.personKey;
      const uid = store.appStore.fbUser()?.uid;
      try {
        if (!personKey || !uid) throw new Error('not signed in');
        // read AND issue inside the queue: batches reach Firestore in queue order, so a later correction or an
        // archive of this track always lands after this upload (upload() has no await before its commit)
        const snap = await enqueue(async () => {
          const current = await findTrack(t.key);
          if (!current || !needsUpload(current)) return { track: current, commit: undefined };
          const points = alignSections(await store.db.points(current.key), current.sections.length);
          const commit = store.trackService.upload(current, points, { personKey, uid, tenants: trackTenants(store.appStore.tenantId(), store.appStore.currentUser()?.diaryTargets, localStoreDate(current.startedAt)) }, current.extraPointsUpTo);
          commit.catch(() => undefined); // awaited below, outside the queue (offline it resolves only on reconnect)
          return { track: current, commit };
        });
        if (!snap?.track) return false; // gone (deleted) meanwhile
        if (!snap.commit) return snap.track.uploaded;
        const uploaded = snap.track;
        await snap.commit;
        const marked = await enqueue(async () => {
          const now = await findTrack(uploaded.key);
          if (!now || now.uploaded || !sameTrackContent(now, uploaded)) return undefined;
          const next: LocalTrack = { ...now, uploaded: true };
          delete next.extraPointsUpTo;
          // this upload carried the local photo list: confirmed when every visible photo already had its thumb path
          if (now.photos) next.photosUploaded = allThumbsUploaded(now.photos);
          await store.db.updateTrack(next);
          return next;
        });
        // the trip exists on the server now: the storage rule for its thumbnails can read it
        if (marked && needsThumbUpload(marked)) void uploadThumbs(marked.key);
        return true;
      } catch (error) {
        console.error('TrackerStore.upload', error);
        // a late result must not touch the state of a newer track started meanwhile
        const active = store.active();
        if (!silent && (!active || active.key === t.key)) patchState(store, { uploadError: errorText(error) });
        return false;
      }
    }

    /**
     * Photos taken during a finished track (native only, spec §6): asks for library access if never asked (this waits
     * for the person's answer, so it runs detached and OUTSIDE the queue), reads the photos between start and end,
     * places them on the track and stores them in the local track (on the queue). Attaching is a content change:
     * rev + 1 and uploaded:false, so a trip upload still in flight is not marked uploaded and the photos go up with
     * the next upload; the thumbnails follow once that commit is acked.
     * `merge` = the search «again on demand» (spec §6, reattachPhotos): the photos found are merged into the ones
     * already there (mergePhotos: hidden flags and thumb paths stay); only new photos make it a content change.
     * @returns the number of photos added
     */
    async function searchPhotos(key: string, merge: boolean): Promise<number> {
      if (!Capacitor.isNativePlatform()) return 0;
      try {
        let { access } = await TrackerPhotos.access();
        if (access === 'notDetermined') ({ access } = await TrackerPhotos.requestAccess());
        patchState(store, { photoAccess: access });
        if (access !== 'full' && access !== 'limited') return 0;
        const t = await findTrack(key);
        if (!t || t.state !== 'done' || (!merge && t.photos)) return 0;
        // a resumed track may end long after its last fix: photos from that gap are not collected
        const to = photoWindowEnd(await store.db.points(key), t.endedAt ?? t.startedAt);
        const found = await TrackerPhotos.between({ from: t.startedAt, to, maxPx: 400 });
        patchState(store, { photoAccess: found.access });
        const searched = found.access === 'full' || found.access === 'limited' ? found.access : undefined;
        if (found.photos.length === 0 && !merge) return 0;
        const result = await enqueue(async () => {
          const now = await findTrack(key);
          if (!now || now.state !== 'done' || (!merge && now.photos)) return undefined; // gone, or attached meanwhile
          const points = alignSections(await store.db.points(key), now.sections.length);
          const placed = placePhotos(found.photos, points, now.startedAt, photoWindowEnd(points, now.endedAt ?? now.startedAt));
          const { photos, added } = mergePhotos(now.photos, placed);
          if (added === 0) {
            // nothing new: only the fresh local renditions and the access of this search are kept (local, no upload)
            if (now.photos) await store.db.updateTrack({ ...now, photos, photosAccess: searched ?? now.photosAccess });
            return { track: undefined, added };
          }
          const next: LocalTrack = {
            ...now, photos, photosAccess: searched ?? now.photosAccess, rev: (now.rev ?? 0) + 1, uploaded: false, photosUploaded: false,
          };
          await store.db.updateTrack(next);
          return { track: next, added };
        });
        if (result?.track) void uploadTrack(result.track, true);
        return result?.added ?? 0;
      } catch (error) {
        console.error(merge ? 'TrackerStore.reattachPhotos' : 'TrackerStore.attachPhotos', error);
        return 0;
      }
    }

    function attachPhotos(key: string): Promise<number> {
      return searchPhotos(key, false);
    }

    /**
     * Uploads the missing thumbnails of an uploaded trip (never blocks the UI). Runs only after the trip commit was
     * acked: the private-bucket rule reads the trip. The thumb paths are copied into the local photos (by assetId)
     * and the trip's photo list is written — also when nothing was left to upload but the list was never confirmed
     * (a lost setPhotos). `photosUploaded` is set only after that write's ack, only if the track's rev did not change
     * meanwhile and every visible photo has its thumb. A failed thumbnail stays missing: the pending loop retries it.
     * One run per track at a time (thumbsInFlight).
     * setPhotoHidden bumps rev and clears photosUploaded; the trip upload it starts runs this step after its ack
     * (a photo made visible again gets its thumbnail).
     */
    async function uploadThumbs(key: string): Promise<void> {
      if (s.thumbsInFlight.has(key)) return;
      s.thumbsInFlight.add(key);
      try {
        const snap = await findTrack(key);
        if (!snap || !needsThumbUpload(snap)) return;
        const tenantId = store.appStore.tenantId();
        const uploaded: { assetId: string; thumbPath: string; path400?: string }[] = [];
        const photos = snap.photos ?? [];
        // numbers only grow (thumbSeq): a merged-in photo never overwrites another photo's file
        let n = nextThumbNumber(photos, snap.thumbSeq);
        for (const p of photos) {
          if (p.hidden || p.thumbPath || !p.path400) continue;
          const done = await uploadOneThumb(tenantId, key, n++, p);
          if (done) uploaded.push(done);
        }
        if (uploaded.length === 0 && !allThumbsUploaded(photos)) return; // nothing new to write; retried later
        const issued = await enqueue(async () => {
          const now = await findTrack(key);
          if (!now?.photos) return undefined;
          // a photo hidden while its thumbnail was going up: that file is deleted, never referenced
          const hiddenNow = new Set(now.photos.filter((p) => p.hidden).map((p) => p.assetId));
          for (const u of uploaded.filter((x) => hiddenNow.has(x.assetId))) deleteThumbDetached(u.thumbPath);
          const visible = uploaded.filter((x) => !hiddenNow.has(x.assetId));
          const next: LocalTrack = { ...now, photos: withThumbPaths(now.photos, visible), thumbSeq: Math.max(now.thumbSeq ?? 0, n) };
          await store.db.updateTrack(next);
          // issued on the queue: lands in order with the trip uploads of this track
          const done = store.trackService.setPhotos(key, next.photos ?? []);
          done.catch(() => undefined); // awaited below, outside the queue
          return { done };
        });
        if (!issued) return;
        await issued.done;
        await enqueue(async () => {
          const now = await findTrack(key);
          if (!now || (now.rev ?? 0) !== (snap.rev ?? 0) || !allThumbsUploaded(now.photos)) return;
          await store.db.updateTrack({ ...now, photosUploaded: true });
        });
      } catch (error) {
        console.error('TrackerStore.uploadThumbs', error);
      } finally {
        s.thumbsInFlight.delete(key);
      }
    }

    /** Deletes a thumbnail of a hidden or removed photo from the bucket, detached (resolves only on the server's answer). */
    function deleteThumbDetached(thumbPath: string): void {
      void store.trackService.deleteThumb(thumbPath).catch((error: unknown) => console.error('TrackerStore.deleteThumb', error));
    }

    /**
     * One thumbnail. When its local rendition is gone (iOS purged the cache), the photo is rendered again from the
     * library (a ±1 s window around takenAt, matched by assetId) and the upload is retried once with the new path400.
     */
    async function uploadOneThumb(
      tenantId: string, key: string, n: number, p: NonNullable<LocalTrack['photos']>[number],
    ): Promise<{ assetId: string; thumbPath: string; path400?: string } | undefined> {
      try {
        return { assetId: p.assetId, thumbPath: await store.trackService.uploadThumb(tenantId, key, n, p.path400 ?? '') };
      } catch (error) {
        if (!(error instanceof ThumbSourceMissingError)) {
          console.error('TrackerStore.uploadThumb', error);
          return undefined;
        }
      }
      try {
        const at = Date.parse(p.takenAt);
        const { photos } = await TrackerPhotos.between({ from: at - 1000, to: at + 1000, maxPx: 400 });
        const again = photos.find((x) => x.assetId === p.assetId);
        if (!again) return undefined;
        return { assetId: p.assetId, thumbPath: await store.trackService.uploadThumb(tenantId, key, n, again.path400), path400: again.path400 };
      } catch (error) {
        console.error('TrackerStore.uploadThumb (re-rendered)', error);
        return undefined;
      }
    }

    /**
     * A short, non-blocking toast; the text is awaited (the lazy i18n scope may not be loaded yet at app start).
     * `unless` is checked right before it shows (e.g. the person is already on the page the action leads to).
     */
    async function toast(key: string, action?: { key: string; handler: () => void; unless?: () => boolean }): Promise<void> {
      try {
        const message = await store.i18nService.translateOnce(key);
        const buttons = action ? [{ text: await store.i18nService.translateOnce(action.key), handler: action.handler }] : undefined;
        if (action?.unless?.()) return;
        const t = await store.toastController.create({ message, duration: action ? 8000 : 4000, buttons });
        await t.present();
      } catch (error) {
        console.error('TrackerStore.toast', error);
      }
    }

    /**
     * Retries every finished, not yet uploaded track, silently. All uploads are issued on the queue in order;
     * their acks are awaited in parallel (offline each resolves only on reconnect). Uploaded trips that still miss
     * thumbnails get their thumbnail step again.
     */
    async function uploadPending(): Promise<void> {
      try {
        const tracks = await store.db.list();
        const pending = tracks.filter(needsUpload);
        for (const t of tracks.filter(needsThumbUpload)) void uploadThumbs(t.key);
        const results = await Promise.all(pending.map((t) => uploadTrack(t, true)));
        // an earlier failure (e.g. stopped before the user was loaded) is no longer true once everything went up
        if (results.every(Boolean)) patchState(store, { uploadError: undefined });
      } catch (error) {
        console.error('TrackerStore.uploadPending', error);
      }
    }

    /** Runs uploadPending once each time an owner (person + auth uid) appears — at start the user is not loaded yet. */
    function watchOwner(): void {
      if (s.ownerWatch) return;
      s.ownerWatch = true;
      store.owner$.pipe(distinctUntilChanged(), filter((id): id is string => id !== undefined)).subscribe(() => void uploadPending());
    }

    /**
     * Stops recording and marks the track done locally; resolves with its key right then. The upload runs
     * fire-and-forget: Firestore's batch.commit() resolves only on the server's ack, so offline it can hang for hours.
     * A failed upload keeps the track local (uploadError).
     */
    async function stop(): Promise<string | undefined> {
      if (!store.active()) return undefined;
      s.stopping = true;
      let done: LocalTrack | 'empty' | undefined;
      try {
        done = await enqueue(async () => {
          await stopPlugin(); // inside the queue: a queued resume cannot restart GPS afterwards
          const t = store.active();
          if (!t) return undefined;
          s.calibrationOpen = false; // stopPlugin() also closed a native calibration recording
          const groups = await store.db.points(t.key);
          if (hasNoPoints(groups)) {
            // nothing recorded: drop it locally, never upload an empty trip
            await store.db.remove(t.key);
            patchState(store, { active: undefined, currentMode: undefined, proposal: undefined, uploadError: undefined });
            return 'empty' as const;
          }
          const finished: LocalTrack = await withSteps({ ...t, state: 'done', endedAt: Date.now() }, groups);
          await store.db.updateTrack(finished);
          patchState(store, { active: undefined, currentMode: undefined, proposal: undefined, uploadError: undefined });
          return finished;
        });
      } finally {
        s.stopping = false; // before the upload: a new track may start at once
      }
      if (done === 'empty') {
        void toast(TRACKER_I18N_KEYS.stop_empty);
        return undefined;
      }
      if (!done) return undefined;
      void uploadTrack(done, false);
      void attachPhotos(done.key); // native only; waits for the photo permission detached from the stop
      return done.key;
    }

    function resetSession(mode: TransportMode): void {
      s.detect = initialDetectState(mode);
      s.lastPoint = undefined;
      s.lastFix = undefined;
      s.sectionHasPoints = false;
      resetLive();
    }

    return {
      /**
       * Opens the database and offers a resumable track: native GPS that may still run after a WebView reload (with
       * no JS listener left) is stopped first, and a toast «Öffnen» leads to /tracker. Pending uploads are retried
       * silently whenever the owner (person + auth uid) becomes known — not here: at app start nobody is signed in yet.
       */
      init(): Promise<void> {
        s.init ??= (async () => {
          await refreshWarning();
          await store.db.open();
          const tracks = await store.db.list();
          const resumable = resumeDecision(tracks);
          if (resumable && !store.active()) await stopPlugin();
          patchState(store, { resumable, initialized: true });
          watchOwner();
          if (resumable) {
            void toast(TRACKER_I18N_KEYS.resume_title, {
              key: TRACKER_I18N_KEYS.resume_open,
              handler: () => void store.router.navigate(['/tracker']),
              unless: () => store.router.url.startsWith('/tracker'),
            });
          }
        })().catch((error: unknown) => {
          console.error('TrackerStore.init', error);
          s.init = undefined; // a failed open is retried by the next init()
        });
        return s.init;
      },

      /**
       * mode undefined: detect, beginning with 'foot'. Only row, ski and ship lock detection (changes become proposals).
       * A track still waiting as `resumable` is finished first (done, uploaded silently).
       */
      async start(mode?: TransportMode): Promise<void> {
        const current = store.active();
        if (current && current.state !== 'done') return;
        const p = await refreshWarning();
        if (p && p.location !== 'always' && p.location !== 'denied') {
          try {
            await TrackerLocation.requestAlways();
          } catch {
            // the warning below still tells what is missing
          }
          await refreshWarning();
        }
        if (store.warning() === 'notNative' || store.warning() === 'locationDenied') return;
        await enqueue(async () => {
          const busy = store.active();
          if (busy && busy.state !== 'done') return;
          await store.db.open();
          const old = store.resumable();
          if (old) {
            const oldGroups = await store.db.points(old.key);
            if (hasNoPoints(oldGroups)) {
              await store.db.remove(old.key); // an empty leftover is discarded, like an empty stop
            } else {
              const finished: LocalTrack = await withSteps({ ...old, state: 'done', endedAt: old.endedAt ?? Date.now() }, oldGroups);
              await store.db.updateTrack(finished);
              void uploadTrack(finished, true);
              void attachPhotos(finished.key);
            }
            patchState(store, { resumable: undefined });
          }
          const chosenByHand = mode !== undefined;
          const m = mode ?? 'foot';
          resetSession(m);
          const label = chosenByHand ? store.i18n[`mode_${m}` as const]() : store.i18n.default_name();
          const track: LocalTrack = {
            key: generateRandomString(20),
            state: 'recording',
            uploaded: false,
            name: `${label} ${getTodayStr(DateFormat.ViewDate)} ${getCurrentTime()}`,
            startedAt: Date.now(),
            sections: [{ mode: m, detected: !chosenByHand }],
          };
          await store.db.createTrack(track);
          patchState(store, { active: track, currentMode: m, points: 0, distanceM: 0, proposal: undefined, uploadError: undefined });
          if (!(await startPlugin(m))) {
            // no GPS running: drop the empty track instead of leaving a ghost 'recording' one
            await store.db.remove(track.key);
            patchState(store, { active: undefined, currentMode: undefined });
          }
          await syncCalibration();
        });
      },

      async pause(): Promise<void> {
        if (store.active()?.state !== 'recording') return;
        await enqueue(async () => {
          const t = store.active(); // re-read: a section switch may have finished meanwhile
          if (!t || t.state !== 'recording') return;
          await stopPlugin(); // inside the queue, like the start in resume()
          s.calibrationOpen = false; // stopPlugin() also closed a native calibration recording
          const paused: LocalTrack = { ...t, state: 'paused' };
          await store.db.updateTrack(paused);
          patchState(store, { active: paused });
        });
      },

      async resume(): Promise<void> {
        await enqueue(async () => {
          const t = store.active();
          if (!t || t.state !== 'paused') return;
          // no line and no distance across the pause: a new section in the same mode, not seeded with the last point
          const next = sectionsAfterPause(t.sections, s.sectionHasPoints);
          const recording: LocalTrack = { ...t, state: 'recording', sections: next.sections };
          const before = { lastPoint: s.lastPoint, sectionHasPoints: s.sectionHasPoints };
          s.lastPoint = undefined;
          s.sectionHasPoints = false;
          resetLive();
          await store.db.updateTrack(recording);
          patchState(store, { active: recording });
          if (!(await startPlugin(recording.sections[recording.sections.length - 1]?.mode ?? 'foot'))) {
            await store.db.updateTrack(t);
            patchState(store, { active: t });
            s.lastPoint = before.lastPoint; // still paused on the old sections
            s.sectionHasPoints = before.sectionHasPoints;
          }
          await syncCalibration();
        });
      },

      stop,

      /** A mode chosen by hand: new section (detected=false). Detection keeps running unless the mode is row/ski/ship. */
      changeMode(mode: TransportMode): Promise<void> {
        return changeFor(async () => {
          s.detect = initialDetectState(mode);
          await switchSection(mode, false);
        });
      },

      /** Applies the change detection proposed while it was locked (row/ski/ship); the new mode decides the lock again. */
      acceptProposal(): Promise<void> {
        return changeFor(async () => {
          const mode = store.proposal();
          if (!mode) return;
          s.detect = initialDetectState(mode);
          await switchSection(mode, true);
        });
      },

      dismissProposal(): void {
        patchState(store, { proposal: undefined });
      },

      /** Admin option (spec 1.122 §5.2): raw rowing motion is recorded while on and a row section records; not persisted. */
      setCalibration(on: boolean): Promise<void> {
        patchState(store, { calibrating: on });
        return enqueue(() => syncCalibration()).then(() => undefined);
      },

      /** «Weiter aufnehmen»: continues the resumable track with its last section's profile. */
      async resumeRecording(): Promise<void> {
        await enqueue(async () => {
          const r = store.resumable();
          const busy = store.active();
          if (!r || (busy && busy.state !== 'done')) return;
          const groups = alignSections(await store.db.points(r.key), r.sections.length);
          const lastSection = r.sections[r.sections.length - 1] ?? { mode: 'foot' as TransportMode, detected: true };
          const lastGroup = groups[groups.length - 1] ?? [];
          resetSession(lastSection.mode); // lastPoint undefined: the time the app was away is a gap, like a pause
          const next = sectionsAfterPause(r.sections, lastGroup.length > 0);
          const recording: LocalTrack = { ...r, state: 'recording', sections: next.sections };
          await store.db.updateTrack(recording);
          patchState(store, {
            active: recording, currentMode: lastSection.mode, resumable: undefined, proposal: undefined,
            points: groups.reduce((n, g) => n + g.length, 0),
            distanceM: groups.reduce((m, g) => m + summarize(g).distanceM, 0),
          });
          if (!(await startPlugin(lastSection.mode))) {
            // keep it paused: the person can try again or finish it
            const paused: LocalTrack = { ...recording, state: 'paused' };
            await store.db.updateTrack(paused);
            patchState(store, { active: paused });
          }
        });
      },

      /** «Beenden»: finishes the resumable track without recording more, and uploads it. */
      async finishResumable(): Promise<string | undefined> {
        const r = store.resumable();
        if (!r || store.active()) return undefined;
        patchState(store, { active: r, resumable: undefined });
        return stop();
      },

      /**
       * Owner correction or rename of a finished local track, on the queue: points and track are rewritten
       * (`uploaded:false`), then the upload runs detached (offline it waits; init() retries it).
       * @returns false when the track is missing, not finished, or the write failed
       */
      async correct(key: string, sections: LocalSection[], name?: string): Promise<boolean> {
        const written = await enqueue(async () => {
          const current = await findTrack(key);
          if (!current || current.state !== 'done') return undefined;
          const corrected = correctedTrack(current, sections, name);
          await store.db.replacePoints(key, sections.map((x) => x.points));
          await store.db.updateTrack(corrected);
          return corrected;
        });
        if (!written) return false;
        void uploadTrack(written, true);
        return true;
      },

      /**
       * Archives the uploaded trip, issued on the queue so it lands after any upload of this track already queued
       * or issued (that upload would otherwise re-write the trip with isArchived:false). The returned promise
       * resolves only on the server's ack — callers keep it detached from the UI.
       */
      async archiveTrack(key: string, tenants?: string[]): Promise<void> {
        const issued = await enqueue(async () => {
          const done = store.trackService.archive(key, tenants);
          done.catch(() => undefined); // awaited below
          return { done };
        });
        if (!issued) throw new Error('archive not issued');
        await issued.done;
      },

      /**
       * Hides or shows one photo of a finished local track, on the queue: rev + 1, `uploaded` and `photosUploaded`
       * false, then the trip is uploaded again detached — its photo list leaves hidden photos out (spec §6). A hidden
       * photo's thumbnail is deleted from the bucket (detached) and its local thumbPath cleared; after the upload's ack
       * uploadThumbs gives a photo shown again a new thumbnail.
       * The photo is looked up by assetId inside the queue: a merge search may have re-sorted the list meanwhile.
       * @returns false when the track or photo is missing or the track is not finished
       */
      async setPhotoHidden(key: string, assetId: string, hidden: boolean): Promise<boolean> {
        const written = await enqueue(async () => {
          const current = await findTrack(key);
          const photo = current?.photos?.find((p) => p.assetId === assetId);
          if (!current?.photos || current.state !== 'done' || !photo) return undefined;
          const photos = withPhotoHidden(current.photos, assetId, hidden);
          if (photos === current.photos) return current; // already in that state
          const next: LocalTrack = { ...current, photos, rev: (current.rev ?? 0) + 1, uploaded: false, photosUploaded: false };
          await store.db.updateTrack(next);
          const dropped = hidden ? photo.thumbPath : undefined;
          if (dropped) deleteThumbDetached(dropped);
          return next;
        });
        if (!written) return false;
        if (needsUpload(written)) void uploadTrack(written, true);
        return true;
      },

      /** Refreshes the last known photo-library access without asking (native only); undefined on the web or on failure. */
      async checkPhotoAccess(): Promise<PhotoAccess | undefined> {
        if (!Capacitor.isNativePlatform()) return undefined;
        try {
          const { access } = await TrackerPhotos.access();
          patchState(store, { photoAccess: access });
          return access;
        } catch (error) {
          console.error('TrackerStore.checkPhotoAccess', error);
          return undefined;
        }
      },

      /**
       * Searches the library again for a finished local track (spec §6 «again on demand»): the photos found are merged
       * into the existing ones by assetId (hidden flags and thumb paths stay); new photos bump rev, clear
       * photosUploaded and go up with the usual upload chain (trip, then thumbnails). Native only.
       * @returns the number of photos added
       */
      reattachPhotos(key: string): Promise<number> {
        return searchPhotos(key, true);
      },

      /** Removes a local track (on the queue, so no upload snapshot reads it half-deleted). */
      async removeLocal(key: string): Promise<void> {
        await enqueue(() => store.db.remove(key));
      },

      /** «Erneut hochladen» for a finished local track. */
      async retryUpload(key: string): Promise<boolean> {
        patchState(store, { uploadError: undefined });
        const t = await findTrack(key);
        return t && needsUpload(t) ? uploadTrack(t, false) : false;
      },
    };
  }),
);
