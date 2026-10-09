import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { getProjectParentKey } from '@okr/project-project-util';
import { TaskList } from '@okr/project-task-feature';

import { ProjectResult } from './project-result';
import { ProjectStore } from './project.store';

type ProjectSegment = 'tasks' | 'result';

/**
 * The detail page of one project (`/projects/:projectKey`): header with name and edit button,
 * and the «Aufgaben» segment — the project's tasks as list or board. The «Ergebnis» segment shows the
 * project result (Einnahmen/Ausgaben from the booking lines, PDF).
 */
@Component({
  selector: 'okr-project-page',
  standalone: true,
  imports: [
    SvgIconPipe, Spinner, EmptyList, TaskList, ProjectResult,
    IonBackButton, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonSegment, IonSegmentButton, IonLabel
  ],
  providers: [ProjectStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/projects/all/c-projects" />
        </ion-buttons>
        <ion-title>{{ store.project()?.name ?? store.i18n.title() }}</ion-title>
        @if (store.project(); as project) {
          <ion-buttons slot="end">
            <ion-button (click)="store.edit(project)">
              <ion-icon slot="icon-only" src="{{ 'edit' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment color="secondary" [value]="segment()" (ionChange)="onSegmentChanged($event)">
          <ion-segment-button value="tasks">
            <ion-label>{{ store.i18n.tasks() }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="result">
            <ion-label>{{ store.i18n.result() }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (store.projectResource.isLoading()) {
        <okr-spinner />
      } @else if (!store.project()) {
        <okr-empty-list [message]="store.i18n.notFound()" />
      } @else {
        @if (segment() === 'tasks') {
          <okr-task-list [listId]="parentKey()" contextMenuName="c-tasks" color="light" [showMenuButton]="false" />
        } @else {
          <okr-project-result [projectKey]="projectKey()" [projectName]="store.project()?.name ?? ''"
            [startDate]="store.project()?.startDate ?? ''" [endDate]="store.project()?.endDate ?? ''" />
        }
      }
    </ion-content>
  `
})
export class ProjectPage {
  protected readonly store = inject(ProjectStore);

  public readonly projectKey = input.required<string>();   // route param

  protected readonly segment = signal<ProjectSegment>('tasks');
  protected readonly parentKey = computed(() => getProjectParentKey(this.projectKey()));

  constructor() {
    effect(() => this.store.setProjectKey(this.projectKey()));
  }

  protected onSegmentChanged(event: CustomEvent): void {
    const value = event.detail.value as ProjectSegment | undefined;
    if (value) this.segment.set(value);
  }
}
