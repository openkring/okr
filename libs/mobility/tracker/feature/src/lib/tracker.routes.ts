import { Route } from '@angular/router';
import { isAuthenticatedGuard } from '@okr/auth-feature';

/** The tracker's pages (spec 1.121). Mounted by the app BEFORE the feature catalogue's routes. */
export const TRACKER_ROUTES: Route[] = [
  { path: 'tracker', canActivate: [isAuthenticatedGuard], loadComponent: () => import('./tracker.page').then((m) => m.TrackerPage) },
  { path: 'tracker/:key', canActivate: [isAuthenticatedGuard], loadComponent: () => import('./track-detail.page').then((m) => m.TrackDetailPage) },
];
