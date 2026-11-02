import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  ActionSheetController,
  IonButton, IonButtons, IonChip, IonContent, IonHeader,
  IonIcon, IonItem, IonLabel, IonList, IonMenuButton, IonTitle, IonToolbar
} from '@ionic/angular';

import { ApplicationModel } from '@okr/shared-models';
import { ApplicationForFilter, isMembershipApplication } from '@okr/application-util';
import { hasRole } from '@okr/shared-util-core';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter } from '@okr/shared-ui';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';

import { ApplicationStore } from './application.store';

@Component({
  selector: 'okr-application-list',
  standalone: true,
  imports: [
    DatePipe, SvgIconPipe,
    EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonTitle, IonMenuButton,
    IonIcon, IonContent, IonItem, IonLabel, IonList, IonChip
  ],
  providers: [ApplicationStore],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ store.filteredApplications().length }} {{ store.i18n.list_title() }}</ion-title>
    </ion-toolbar>
    <okr-list-filter
      (searchTermChanged)="store.setSearchTerm($event)"
      [strings]="forLabels()"
      [stringsName]="'applicationFor'"
      [stringsLabel]="store.i18n.list_filter_label()"
      [selectedString]="forLabel()"
      (stringsChanged)="onForFilterChange($event)"
    />
  </ion-header>

  <ion-content>
    @if(store.filteredApplications().length === 0) {
      <okr-empty-list [message]="store.i18n.list_empty()" />
    } @else {
      <ion-list lines="inset">
        @for(app of store.filteredApplications(); track app.okey) {
          <ion-item button (click)="store.editApplication(app)">
            <ion-label>
              <h2>{{ app.lastName }}, {{ app.firstName }}</h2>
              <p>{{ app.zipCode }} {{ app.city }}</p>
              @if(store.courseName(app); as courseName) {
                <p>{{ courseName }}</p>
              }
              <p>{{ app.submittedAt | date:'dd.MM.yyyy HH:mm' }}</p>
            </ion-label>
            <ion-chip slot="end" [color]="store.stateColor(app.state)">
              {{ stateLabel(app) }}
            </ion-chip>
            @if(isAdmin()) {
              <ion-button fill="clear" slot="end" (click)="showActions($event, app)">
                <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
              </ion-button>
            }
          </ion-item>
        }
      </ion-list>
    }
  </ion-content>
  `
})
export class ApplicationList {
  protected readonly store = inject(ApplicationStore);
  private readonly actionSheetController = inject(ActionSheetController);

  protected isAdmin = computed(() => hasRole('admin', this.store.currentUser()));

  // the strings filter lists plain strings: the translated labels are the options, mapped back to the filter value
  private readonly forOptions = computed<{ value: ApplicationForFilter; label: string }[]>(() => [
    { value: 'all',        label: this.store.i18n.list_filter_all() },
    { value: 'membership', label: this.store.i18n.list_filter_membership() },
    { value: 'course',     label: this.store.i18n.list_filter_course() },
  ]);
  protected readonly forLabels = computed(() => this.forOptions().map(o => o.label));
  protected readonly forLabel = computed(() => this.forOptions().find(o => o.value === this.store.forFilter())?.label ?? '');

  protected onForFilterChange(label: string): void {
    this.store.setForFilter(this.forOptions().find(o => o.label === label)?.value ?? 'all');
  }

  protected stateLabel(app: ApplicationModel): string {
    const key = ('state_' + app.state.replace('.', '_')) as keyof typeof this.store.i18n;
    const sig = this.store.i18n[key];
    return sig ? (sig as () => string)() : app.state;
  }

  protected async showActions(event: Event, app: ApplicationModel): Promise<void> {
    event.stopPropagation();
    const imgix = this.store.imgixBaseUrl();
    const opts = createActionSheetOptions(this.store.i18n.list_title());
    const isOpen = app.state === 'applied' || app.state === 'reviewing';

    opts.buttons.push(createActionSheetDivider());
    // a course registration creates no member: «Annehmen» and «Mitgliedschaft hinzufügen» are for memberships only
    const isMembership = isMembershipApplication(app);
    if (isOpen) {
      if (isMembership) opts.buttons.push(createActionSheetButton('accept', this.store.i18n.accept(), imgix, 'check'));
      opts.buttons.push(createActionSheetButton('deny',       this.store.i18n.deny(),   imgix, 'trash'));
    }
    if (isMembership && app.personKey) {
      opts.buttons.push(createActionSheetButton('membership', this.store.i18n.add_membership(), imgix, 'person-add'));
    }
    opts.buttons.push(createActionSheetDivider());
    opts.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), imgix, 'cancel-circle'));

    const sheet = await this.actionSheetController.create(opts);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data?.action) return;
    switch (data.action) {
      case 'accept':     await this.store.acceptApplication(app); break;
      case 'deny':       await this.store.denyApplication(app); break;
      case 'membership': await this.store.addMembership(app); break;
    }
  }
}
