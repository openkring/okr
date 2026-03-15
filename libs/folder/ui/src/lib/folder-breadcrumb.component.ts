import { Component, inject, input, output, signal, effect } from '@angular/core';
import { IonBreadcrumb, IonBreadcrumbs } from '@ionic/angular/standalone';

import { FolderModel } from '@bk2/shared-models';
import { FolderService } from '@bk2/folder-data-access';

@Component({
  selector: 'bk-folder-breadcrumb',
  standalone: true,
  imports: [IonBreadcrumbs, IonBreadcrumb],
  template: `
    @if(breadcrumbs().length > 0) {
      <ion-breadcrumbs>
        @for(folder of breadcrumbs(); track folder.bkey; let last = $last) {
          <ion-breadcrumb [active]="last" (click)="!last && folderSelected.emit(folder.bkey)">
            {{ folder.name }}
          </ion-breadcrumb>
        }
      </ion-breadcrumbs>
    }
  `
})
export class FolderBreadcrumbComponent {
  private readonly folderService = inject(FolderService);

  public readonly folderKey = input.required<string>();
  public readonly folderSelected = output<string>();

  protected readonly breadcrumbs = signal<FolderModel[]>([]);

  constructor() {
    effect(() => {
      const key = this.folderKey();
      if (key) {
        this.folderService.loadBreadcrumbTrail(key).then(trail => this.breadcrumbs.set(trail));
      } else {
        this.breadcrumbs.set([]);
      }
    });
  }
}
