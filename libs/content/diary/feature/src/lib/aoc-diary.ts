import { Component, computed, inject } from '@angular/core';
import {
  IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent,
  IonNote, IonSpinner,
} from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';

import { AocDiaryStore } from './aoc-diary.store';

/**
 * The diary admin screen — `/aoc/diary`, `isAdminGuard`.
 *
 * It is the home the diary import's two diagnostics were waiting for: the Drive health check and
 * the dry run lived on `/security/privacy-audit` only because that was the app's sole admin-only
 * diagnostics surface while the diary domain had no page. Their own doc comments said to move
 * them here.
 *
 * The other half of the screen is the repair work the dry run's report can only COUNT: the
 * places and people the import could not match. `unresolvedLocations`/`unresolvedPeople` on the
 * report are slug→count pairs with no way back to the entries, so the two lists below are built
 * from the imported `diaries` instead — which is also what makes a fix writable.
 */
@Component({
  selector: 'okr-aoc-diary',
  standalone: true,
  imports: [
    Header,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton, IonNote,
    IonSpinner, IonBadge,
  ],
  providers: [AocDiaryStore],
  styles: [`
    .samples { font-size: 12px; opacity: .8; word-break: break-all; }
  `],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" />
    <ion-content>

      <!-- Import prerequisites (spec 1.34). Both callables are read-only or write only their own
           report row, so either button is safe to press twice. -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ store.i18n.import_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-note>{{ store.i18n.subtitle() }}</ion-note>
          <div class="ion-margin-top">
            <ion-button fill="outline" (click)="store.checkDrive()"
                        [disabled]="store.isCheckingDrive() || store.isDryRunning()">
              @if (store.isCheckingDrive()) {
                <ion-spinner name="dots" slot="start" /> {{ store.i18n.drive_running() }}
              } @else {
                {{ store.i18n.drive_action() }}
              }
            </ion-button>
            <ion-button fill="outline" (click)="store.dryRun()"
                        [disabled]="store.isCheckingDrive() || store.isDryRunning()">
              @if (store.isDryRunning()) {
                <ion-spinner name="dots" slot="start" /> {{ store.i18n.dryrun_running() }}
              } @else {
                {{ store.i18n.dryrun_action() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>

      <!-- The raw counter lines below stay untranslated on purpose: they are the one part that
           still says something on the kind of day when the i18n scope itself fails to load. -->
      @if (store.driveResult(); as drive) {
        <ion-card>
          <ion-card-content>
            <p>{{ store.i18n.drive_ok() }}</p>
            <ion-note class="samples">
              account {{ drive.account }} · firstPageFiles {{ drive.firstPageFiles }} ·
              hasMorePages {{ drive.hasMorePages }} ·
              quota {{ drive.quotaUsage }}/{{ drive.quotaLimit }}
            </ion-note>
          </ion-card-content>
        </ion-card>
      }

      @if (store.dryRunError(); as failure) {
        <ion-card>
          <ion-card-content>
            <p>{{ store.i18n.dryrun_failed() }}</p>
            <ion-note class="samples">{{ failure }}</ion-note>
          </ion-card-content>
        </ion-card>
      }

      @if (store.dryRunResult(); as run) {
        <ion-card>
          <ion-card-content>
            <p>{{ store.i18n.dryrun_ok() }}</p>
            <ion-note class="samples">
              total {{ run.total }} · parsed {{ run.parsed }} · written {{ run.written }} ·
              phase {{ run.phase }}<br>
              unresolvedPeople {{ unresolvedPeopleCount() }} ·
              unresolvedLocations {{ unresolvedLocationsCount() }} ·
              dateCollisions {{ run.dateCollisions.length }} ·
              withoutDate {{ run.withoutDate.length }} ·
              weatherDeviations {{ weatherDeviationCount() }} ·
              errors {{ run.errors.length }}
              @if (topUnresolved(); as top) { <br>{{ store.i18n.dryrun_top_unresolved() }} {{ top }} }
              @if (run.errors.length) { <br>{{ store.i18n.dryrun_first_error() }} {{ run.errors[0].name }} — {{ run.errors[0].reason }} }
            </ion-note>
          </ion-card-content>
        </ion-card>
      }

      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ store.i18n.locations_title() }}
            <ion-badge color="warning">{{ store.unresolvedLocationCount() }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-note>{{ store.i18n.locations_hint() }}</ion-note>
          <div class="ion-margin-top">
            <ion-button fill="outline" (click)="store.showReferences('location')" [disabled]="store.isLoading()">
              @if (store.isLoading()) {
                <ion-spinner name="dots" slot="start" /> {{ store.i18n.loading() }}
              } @else {
                {{ store.i18n.locations_action() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ store.i18n.persons_title() }}
            <ion-badge color="warning">{{ store.unresolvedPersonCount() }}</ion-badge>
          </ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-note>{{ store.i18n.persons_hint() }}</ion-note>
          <div class="ion-margin-top">
            <ion-button fill="outline" (click)="store.showReferences('person')" [disabled]="store.isLoading()">
              @if (store.isLoading()) {
                <ion-spinner name="dots" slot="start" /> {{ store.i18n.loading() }}
              } @else {
                {{ store.i18n.persons_action() }}
              }
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
})
export class AocDiary {
  protected readonly store = inject(AocDiaryStore);

  protected readonly unresolvedPeopleCount = computed(
    () => Object.keys(this.store.dryRunResult()?.unresolvedPeople ?? {}).length);
  protected readonly unresolvedLocationsCount = computed(
    () => Object.keys(this.store.dryRunResult()?.unresolvedLocations ?? {}).length);
  protected readonly weatherDeviationCount = computed(
    () => Object.keys(this.store.dryRunResult()?.weatherDeviations ?? {}).length);

  /**
   * The five most frequent unresolved slugs of the run, as one line. The full maps are
   * capped server-side but can still hold hundreds of entries — the head of the list is what
   * tells an admin whether the misses are one systematic pattern or a long tail.
   */
  protected readonly topUnresolved = computed(() => {
    const run = this.store.dryRunResult();
    if (!run) return '';
    const merged = { ...run.unresolvedPeople, ...run.unresolvedLocations };
    return Object.entries(merged)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([slug, count]) => `${slug} (${count})`)
      .join(', ');
  });
}
