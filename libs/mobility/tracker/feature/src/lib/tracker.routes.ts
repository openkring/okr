import { Route } from '@angular/router';
import { isAuthenticatedGuard } from '@okr/auth-feature';

/** The pages under /tracker; the feature catalogue lazy-loads these (loadChildren, `trip` block), the app mounts TRACKER_ROUTES. */
export const TRACKER_CHILD_ROUTES: Route[] = [
  { path: '', loadComponent: () => import('./tracker.page').then((m) => m.TrackerPage) },
  { path: ':key', loadComponent: () => import('./track-detail.page').then((m) => m.TrackDetailPage) },
];

/**
 * The tracker's pages (spec 1.121). Mounted by the app BEFORE the feature catalogue's routes and outside the
 * isAppReadyGuard parent: recording must open on an offline cold start (only the Firebase sign-in is required).
 */
export const TRACKER_ROUTES: Route[] = [
  { path: 'tracker', canActivate: [isAuthenticatedGuard], children: TRACKER_CHILD_ROUTES },
];
