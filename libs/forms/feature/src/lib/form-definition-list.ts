import { Component, inject } from '@angular/core';
import {
  IonBadge, IonButton, IonButtons, IonChip, IonContent, IonFab, IonFabButton,
  IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyList, ListFilter } from '@bk2/shared-ui';
import { FormDefinitionStore } from './form-definition.store';

@Component({
  selector: 'bk-form-definition-list',
  standalone: true,
  imports: [
    SvgIconPipe, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton,
    IonContent, IonList, IonItem, IonLabel, IonChip, IonBadge,
    IonIcon, IonFab, IonFabButton,
  ],
  providers: [FormDefinitionStore],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.list_title() }}</ion-title>
        @if (store.canWrite()) {
          <ion-buttons slot="end">
            <ion-button (click)="store.openCreateModal()">
              <ion-icon src="{{ 'add' | svgIcon }}" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <bk-list-filter (searchTermChanged)="store.setSearchTerm($event)" />
    </ion-header>

    <ion-content>
      @if (store.isLoading()) {
        <!-- loading handled by Ionic skeleton -->
      } @else if (store.filteredForms().length === 0) {
        <bk-empty-list [message]="store.i18n.list_empty()" />
      } @else {
        <ion-list lines="inset">
          @for (form of store.filteredForms(); track form.bkey) {
            <ion-item>
              <ion-label>
                <h2>{{ form.name }}</h2>
                <p>{{ form.formKey }} · v{{ form.version }} · {{ form.fields.length }} Felder</p>
              </ion-label>
              <ion-chip slot="end" color="medium">{{ form.target.kind }}</ion-chip>
              @if (store.canWrite()) {
                <ion-button slot="end" fill="clear" (click)="store.openBuilder(form)">
                  <ion-icon src="{{ 'construct' | svgIcon }}" slot="icon-only" />
                </ion-button>
                <ion-button slot="end" fill="clear" (click)="store.openEditModal(form)">
                  <ion-icon src="{{ 'settings' | svgIcon }}" slot="icon-only" />
                </ion-button>
                <ion-button slot="end" fill="clear" color="medium" (click)="store.duplicateForm(form)">
                  <ion-icon src="{{ 'copy' | svgIcon }}" slot="icon-only" />
                </ion-button>
                <ion-button slot="end" fill="clear" color="warning" (click)="store.archiveForm(form)">
                  <ion-icon src="{{ 'archive' | svgIcon }}" slot="icon-only" />
                </ion-button>
              }
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class FormDefinitionList {
  protected readonly store = inject(FormDefinitionStore);
}
