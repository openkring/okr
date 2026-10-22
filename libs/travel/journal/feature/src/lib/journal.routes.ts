import { Route } from '@angular/router';
import { isAuthenticatedGuard } from '@okr/auth-feature';

/**
 * The travel journal's routes (spec 1.113). They are mounted in the app's route table BEFORE the
 * isAppReadyGuard parent and outside the feature catalogue: that guard and the feature gate need
 * app-config, which an offline cold start does not have (spike S3). Only the Firebase sign-in is
 * required, and it is restored offline. Plan 3 replaces the workbench with the overview and story pages.
 */
const workbench = () => import('./journal-workbench.page').then((m) => m.JournalWorkbenchPage);

export const JOURNAL_ROUTES: Route[] = [
  {
    path: 'journal',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: '', loadComponent: workbench },
      { path: ':journalKey', loadComponent: workbench },
      { path: ':journalKey/:footprintKey', loadComponent: workbench },
    ],
  },
];
