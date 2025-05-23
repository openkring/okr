import { Route } from '@angular/router';
import { isAuthenticatedGuard, isPrivilegedGuard, LoginPageComponent, PasswordResetPageComponent } from '@bk2/auth/feature';
import { MenuListComponent } from '@bk2/cms/menu/feature';
import { SectionAllListComponent, SectionPageComponent } from '@bk2/cms/section/feature';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'public/welcome' },
  {
    path: 'public',
    children: [
      { path: 'welcome', loadComponent: () => import('@bk2/cms/page/feature').then((m) => m.BkWelcomePageComponent)},
      { path: 'notfound', loadComponent: () => import('@bk2/cms/page/feature').then((m) => m.PageNotFoundComponent)},
      { path: ':id', loadComponent: () => import('@bk2/cms/page/feature').then((m) => m.ContentPageComponent)}
    ],
  },
  {
    path: 'auth',
    children: [
      { path: 'login', component: LoginPageComponent },
      { path: 'pwdreset', component: PasswordResetPageComponent },
    ],
  },
  {
    path: 'page',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], loadComponent: () => import('@bk2/cms/page/feature').then((m) => m.PageAllListComponent)}
    ],
  },
  {
    path: 'section',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], component: SectionAllListComponent },
      { path: ':id', canActivate: [isPrivilegedGuard], component: SectionPageComponent }
    ],
  },
  {
    path: 'menu',
    canActivate: [isAuthenticatedGuard],
    children: [
      { path: 'all', canActivate: [isPrivilegedGuard], component: MenuListComponent }
    ],
  },
  { path: '**', loadComponent: () => import('@bk2/cms/page/feature').then((m) => m.PageNotFoundComponent)},
];
