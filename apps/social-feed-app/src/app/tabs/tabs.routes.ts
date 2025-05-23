import { Routes } from '@angular/router';
import { TabsPageComponent } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPageComponent,
    children: [
      {
        path: '',
        loadChildren: () => import('@bk2/social-feed/feature').then((m) => m.routes)
      }
    ]
  }
];
