import { Component, inject, input, output, signal, effect } from '@angular/core';
import { IonBreadcrumb, IonBreadcrumbs } from '@ionic/angular/standalone';

import { FolderModel } from '@okr/shared-models';
import { FolderService } from '@okr/content-folder-data-access';

@Component({
  selector: 'okr-folder-breadcrumb',
  standalone: true,
  imports: [IonBreadcrumbs, IonBreadcrumb],
  template: `
    @if(breadcrumbs().length > 0) {
      <ion-breadcrumbs>
        @for(folder of breadcrumbs(); track folder.okey; let last = $last) {
          <ion-breadcrumb [active]="last" (click)="!last && folderSelected.emit(folder.okey)">
            {{ folder.name }}
          </ion-breadcrumb>
        }
      </ion-breadcrumbs>
    }
  `
})
export class FolderBreadcrumb {
  private readonly folderService = inject(FolderService);

  public readonly folderKey = input.required<string>();
  public readonly folderSelected = output<string>();

  protected readonly breadcrumbs = signal<FolderModel[]>([]);

  constructor() {
    effect(() => {
      const key = this.folderKey();
      if (key) {
        this.folderService.loadBreadcrumbTrail(key)
          .then(trail => this.breadcrumbs.set(trail))
          // A transient permission denial (auth-restore / reconnect window) must not
          // surface as an uncaught promise rejection; drop to an empty trail instead.
          .catch(() => this.breadcrumbs.set([]));
      } else {
        this.breadcrumbs.set([]);
      }
    });
  }
}
