import { Component, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ProjectModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';
import { PROJECT_I18N_KEYS } from '@okr/project-project-util';

/**
 * Picks a project (or none). The value is the project's `okey`; '' = «Kein Projekt». Only
 * non-archived projects are offered, newest start first. A key that is already selected is still
 * displayed when it names an archived or unknown project (its name, or the raw key).
 */
@Component({
  selector: 'okr-project-select',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonItem, IonInput, IonIcon, IonModal, IonToolbar,
    IonTitle, IonButtons, IonButton, IonSearchbar, IonList, IonLabel
  ],
  styles: [`
    ion-modal.project {
      --width: 92%;
      --max-width: 520px;
      --height: 80%;
      --border-radius: 8px;
      --border-width: 1px;
      --border-style: solid;
      --border-color: var(--ion-color-medium, #92949c);
      --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      --background: var(--ion-background-color, #fff);
    }
    /* own flex layout instead of ion-header/ion-content: an inline modal nested in
       another modal does not reliably get Ionic's .ion-page sizing (see okr-cost-center-select) */
    .project-picker {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ion-background-color, #fff);
    }
    .project-results { flex: 1 1 auto; overflow-y: auto; }
  `],
  template: `
    <ion-item lines="none" [button]="!isReadOnly()" [detail]="false" (click)="open()">
      <ion-input
        name="projectKey"
        type="text"
        label="{{ label() }}"
        labelPlacement="floating"
        [value]="displayValue()"
        [readonly]="true"
        [clearInput]="false"
      />
      @if (!isReadOnly()) {
        <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" aria-hidden="true" />
      }
    </ion-item>

    <ion-modal class="project" [isOpen]="isOpen()" (ionModalDidDismiss)="close()" (ionModalDidPresent)="focusSearch()">
      <ng-template>
        <div class="project-picker">
          <ion-toolbar color="primary">
            <ion-title>{{ label() }}</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">
                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-searchbar #projectSearch
            type="search" inputmode="search" show-clear-button="always"
            [debounce]="0" [placeholder]="ownI18n.search()"
            (ionInput)="onSearchtermChange($event)"
            (keyup.enter)="selectFirstMatch()"
          />
          <div class="project-results">
            <ion-list>
              <ion-item button="true" detail="false" (click)="select('')">
                <ion-label>{{ ownI18n.noProject() }}</ion-label>
              </ion-item>
              @for (project of filteredProjects(); track project.okey) {
                <ion-item button="true" detail="false" (click)="select(project.okey)">
                  <ion-label>{{ project.name }}</ion-label>
                </ion-item>
              } @empty {
                <ion-item lines="none"><ion-label>{{ ownI18n.notFound() }}</ion-label></ion-item>
              }
            </ion-list>
          </div>
        </div>
      </ng-template>
    </ion-modal>
  `
})
export class ProjectSelect {
  private readonly i18nService = inject(I18nService);

  /** the full list (archived included); only the non-archived are offered */
  public readonly projects = input<ProjectModel[]>([]);
  public readonly selectedKey = model('');
  public readonly label = input.required<string>();
  public readonly readOnly = input(false);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isOpen = signal(false);
  protected readonly searchTerm = signal('');
  protected readonly projectSearch = viewChild<IonSearchbar>('projectSearch');

  protected readonly ownI18n = this.i18nService.translateAll({
    search: PROJECT_I18N_KEYS.select_search,
    notFound: PROJECT_I18N_KEYS.select_notFound,
    noProject: PROJECT_I18N_KEYS.noProject,
    archived: PROJECT_I18N_KEYS.archived,
  });

  /** non-archived projects, newest start first */
  protected readonly selectableProjects = computed(() =>
    this.projects()
      .filter(p => !p.isArchived)
      .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '')));

  /** looked up in the FULL list: an archived project that is already selected keeps its name */
  protected readonly selectedProject = computed(() => this.projects().find(p => p.okey === this.selectedKey()));

  /** an empty selection shows «Kein Projekt» instead of a blank field (which reads like a floating label only) */
  protected readonly displayValue = computed(() => {
    const key = this.selectedKey();
    if (!key) return this.ownI18n.noProject();
    const project = this.selectedProject();
    if (!project) return key;
    return project.isArchived ? `${project.name} (${this.ownI18n.archived()})` : project.name;
  });

  protected readonly filteredProjects = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (term.length === 0) return this.selectableProjects();
    return this.selectableProjects().filter(p => p.name.toLowerCase().includes(term));
  });

  protected open(): void {
    if (this.isReadOnly()) return;
    this.searchTerm.set('');
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected focusSearch(): void {
    setTimeout(() => this.projectSearch()?.setFocus(), 100);
  }

  protected onSearchtermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value ?? '');
  }

  /** Enter on the searchbar takes the first remaining match */
  protected selectFirstMatch(): void {
    const matches = this.filteredProjects();
    if (matches.length > 0) this.select(matches[0].okey);
  }

  protected select(key: string): void {
    this.selectedKey.set(key);
    this.close();
  }
}
