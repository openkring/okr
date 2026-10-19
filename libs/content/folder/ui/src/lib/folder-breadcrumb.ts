import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, input, output, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { IonBreadcrumb, IonBreadcrumbs, IonContent, IonItem, IonLabel, IonList, IonPopover } from '@ionic/angular';

import { FolderModel } from '@okr/shared-models';
import { FolderService } from '@okr/content-folder-data-access';

/** From this width on the full trail is shown; below it collapses to `… › current folder`. */
const FULL_TRAIL_MEDIA_QUERY = '(min-width: 992px)';

/**
 * The folder trail. On small and medium screens it collapses to the current folder, preceded by
 * Ionic's `…` indicator; tapping `…` opens a popover with the hidden parent folders.
 */
@Component({
  selector: 'okr-folder-breadcrumb',
  standalone: true,
  imports: [IonBreadcrumbs, IonBreadcrumb, IonPopover, IonContent, IonList, IonItem, IonLabel],
  styles: [`
    ion-breadcrumbs { flex-wrap: nowrap; min-width: 0; }
    ion-breadcrumb { min-width: 0; }
    ion-breadcrumb::part(native) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
  template: `
    @if(breadcrumbs().length > 0) {
      <ion-breadcrumbs [maxItems]="maxItems()" [itemsBeforeCollapse]="0" [itemsAfterCollapse]="1"
        (ionCollapsedClick)="showCollapsed($event)">
        @for(folder of breadcrumbs(); track folder.okey; let last = $last) {
          <ion-breadcrumb [active]="last" (click)="onBreadcrumbClick($event, folder.okey, last)">
            {{ folder.title || folder.name }}
          </ion-breadcrumb>
        }
      </ion-breadcrumbs>
      <ion-popover [isOpen]="popoverEvent() !== undefined" [event]="popoverEvent()" (didDismiss)="popoverEvent.set(undefined)">
        <ng-template>
          <ion-content>
            <ion-list lines="none">
              @for(folder of collapsedFolders(); track folder.okey) {
                <ion-item button [detail]="false" (click)="selectCollapsed(folder.okey)">
                  <ion-label>{{ folder.title || folder.name }}</ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-content>
        </ng-template>
      </ion-popover>
    }
  `
})
export class FolderBreadcrumb {
  private readonly folderService = inject(FolderService);

  public readonly folderKey = input.required<string>();
  public readonly folderSelected = output<string>();

  protected readonly breadcrumbs = signal<FolderModel[]>([]);
  protected readonly popoverEvent = signal<Event | undefined>(undefined);
  private readonly showFullTrail = signal(true);

  // undefined = no collapsing; 2 = the collapse indicator plus the current folder
  protected readonly maxItems = computed(() => this.showFullTrail() ? undefined : 2);
  // the hidden folders, frozen when the popover opens
  protected readonly collapsedFolders = signal<FolderModel[]>([]);

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const media = window.matchMedia(FULL_TRAIL_MEDIA_QUERY);
      this.showFullTrail.set(media.matches);
      const onChange = (e: MediaQueryListEvent) => this.showFullTrail.set(e.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }

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

  /**
   * Ionic renders the `…` indicator inside the first collapsed breadcrumb, so a tap on `…` also
   * clicks that breadcrumb — which must open the popover, not navigate to that folder.
   */
  protected onBreadcrumbClick(event: Event, folderKey: string, last: boolean): void {
    if (last || (event.currentTarget as HTMLIonBreadcrumbElement).collapsed) return;
    this.folderSelected.emit(folderKey);
  }

  protected showCollapsed(event: Event): void {
    // with itemsBeforeCollapse=0 and itemsAfterCollapse=1, everything but the last folder collapses
    this.collapsedFolders.set(this.breadcrumbs().slice(0, -1));
    this.popoverEvent.set(event);
  }

  protected selectCollapsed(folderKey: string): void {
    this.popoverEvent.set(undefined);
    this.folderSelected.emit(folderKey);
  }
}
