import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonMenuButton, IonRow, IonSpinner, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ListFilterComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat, getAge as getAgeFn } from '@bk2/shared-util-core';
import { ColorIonic } from '@bk2/shared-models';

import { AvatarLabelComponent } from '@bk2/avatar-ui';

import { AocSrvStore, getMismatches, SrvIndex } from './aoc-srv.store';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@bk2/shared-util-angular';

@Component({
  selector: 'bk-aoc-srv',
  standalone: true,
  imports: [
    TranslatePipe, SvgIconPipe, AsyncPipe,
    AvatarLabelComponent, ListFilterComponent,
    IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent,
    IonGrid, IonRow, IonCol, IonItem, IonLabel, IonButton, IonIcon, IonSpinner, IonHeader,
    IonButtons, IonMenuButton, IonTitle, IonToolbar
  ],
  providers: [AocSrvStore],
  styles: [`bk-list-filter { width: 100%; }`],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
        <ion-title>{{ '@aoc.srv.title' | translate | async }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>

      <!-- ── Index card ─────────────────────────────────────────────────── -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.srv.index.title' | translate | async }}</ion-card-title>
          <ion-card-subtitle>{{ '@aoc.srv.index.subtitle' | translate | async }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(isLoading()) {
                  Wird geladen...
                } @else if(isBusy()) {
                  <ion-spinner name="crescent" /> Index wird aufgebaut...
                } @else if(index().length === 0) {
                  Noch kein Index. Index aufbauen.
                } @else {
                  {{ filteredIndex().length }} von {{ index().length }} Einträgen: 
                  {{ mainMembers() }} SCS, {{ parentMembers() }} SRV, {{ regasoftItems() }} Regasoft
                }
              </ion-col>
              <ion-col size="3">
                <ion-button fill="clear" [disabled]="index().length === 0" (click)="showIndex.set(!showIndex())">
                  <ion-icon src="{{ (showIndex() ? 'eye-off' : 'eye-on') | svgIcon }}" slot="start" />
                  {{ showIndex() ? 'Ausblenden' : 'Einblenden' }}
                </ion-button>
                @if(index().length > 0) {
                  <ion-button color="medium" (click)="store.resetIndex()">
                    <ion-icon src="{{ 'trash' | svgIcon }}" slot="start" />
                    {{ '@aoc.srv.index.reset' | translate | async }}
                  </ion-button>
                } @else {
                  <ion-button (click)="buildIndex()" [disabled]="isLoading() || isBusy()">
                    @if(isBusy()) {
                      <ion-spinner name="crescent" slot="start" />
                    } @else {
                      <ion-icon src="{{ 'sync' | svgIcon }}" slot="start" />
                    }
                    {{ '@aoc.srv.index.button' | translate | async }}
                  </ion-button>
                }
              </ion-col>
            </ion-row>

            @if(showIndex() && filteredIndex().length > 0) {
              <ion-row>
                <bk-list-filter
                  (searchTermChanged)="store.setSearchTerm($event)"
                  stringsName="srvFilter" [strings]="filters" [selectedString]="filter()" (stringsChanged)="filter.set($event)"
                />
              </ion-row>
              <ion-row>
                <ion-col size="6"><strong>Name</strong></ion-col>
                <ion-col size="1"><strong>Alter</strong></ion-col>
                <ion-col size="1"><strong>Kat</strong></ion-col>
                <ion-col size="2"><strong>BK memberId</strong></ion-col>
                <ion-col size="2"><strong>SRV serviceId</strong></ion-col>
              </ion-row>
              @for(item of filteredIndex(); track $index) {
                <ion-row [style.color]="getMismatches(item).length > 0 ? 'var(--ion-color-danger)' : ''"
                         [style.font-weight]="getMismatches(item).length > 0 ? 'bold' : ''"
                         (click)="showIndexActions(item)">
                  <ion-col size="6">
                    @if(item.personKey) {
                      <bk-avatar-label
                        [key]="getAvatarKey(item)"
                        [label]="displayName(item)"
                        [color]="color"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label color="medium">{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="1">
                    <ion-item lines="none">
                      <ion-label>{{ getAge(item.dateOfBirth) }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="1">
                    <ion-item lines="none">
                      <ion-label>{{ item.mCategory }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="2">
                    <ion-item lines="none">
                      <ion-label [color]="item.memberId ? '' : 'medium'">{{ item.memberId || '—' }}</ion-label>
                    </ion-item>
                  </ion-col>
                  <ion-col size="2">
                    <ion-item lines="none">
                      <ion-label [color]="item.rServiceId ? '' : 'medium'">{{ item.rServiceId || '—' }}</ion-label>
                    </ion-item>
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- ── Foreign nations card ───────────────────────────────────────── -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Ausländische Mitglieder</ion-card-title>
          <ion-card-subtitle>nationIOC ≠ SUI</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(store.foreignNationMembers().length === 0) {
                  Keine ausländischen Mitglieder im Index.
                } @else {
                  {{ store.foreignNationMembers().length }} Mitglieder mit ausländischer Nationalität
                }
              </ion-col>
              <ion-col size="3">
                <ion-button fill="clear" [disabled]="index().length === 0" (click)="showForeigners.set(!showForeigners())">
                  <ion-icon src="{{ (showForeigners() ? 'eye-off' : 'eye-on') | svgIcon }}" slot="start" />
                  {{ showForeigners() ? 'Ausblenden' : 'Einblenden' }}
                </ion-button>
              </ion-col>
            </ion-row>
            @if(showForeigners()) {
              <ion-row>
                <ion-col size="5"><strong>Name</strong></ion-col>
                <ion-col size="2"><strong>SRV ID</strong></ion-col>
                <ion-col size="2"><strong>Nation</strong></ion-col>
                <ion-col size="3"><strong>Mitgliedschaftstyp</strong></ion-col>
              </ion-row>
              @for(item of store.foreignNationMembers(); track item.rid) {
                <ion-row (click)="showForeignerActions(item)">
                  <ion-col size="5">
                    @if(item.personKey) {
                      <bk-avatar-label
                        [key]="getAvatarKey(item)"
                        [label]="displayName(item)"
                        [color]="color"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label color="medium">{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="2">
                    <ion-item lines="none">{{ item.rid }}</ion-item>
                  </ion-col>
                  <ion-col size="2">
                    <ion-item lines="none">{{ item.nationIOC }}</ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">{{ item.rCategory }}</ion-item>
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- ── Lizenzen card ──────────────────────────────────────────────── -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Lizenzen</ion-card-title>
          <ion-card-subtitle>{{ licensedFromIndex().length }} Mitglieder mit aktiver Lizenz</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(licensedFromIndex().length === 0) {
                  Keine lizenzierten Mitglieder im Index.
                } @else {
                  {{ licensedFromIndex().length }} Mitglieder mit aktiver Lizenz
                }
              </ion-col>
              <ion-col size="3">
                <ion-button fill="clear" [disabled]="index().length === 0" (click)="showLicenses.set(!showLicenses())">
                  <ion-icon src="{{ (showLicenses() ? 'eye-off' : 'eye-on') | svgIcon }}" slot="start" />
                  {{ showLicenses() ? 'Ausblenden' : 'Einblenden' }}
                </ion-button>
              </ion-col>
            </ion-row>
            @if(showLicenses() && licensedFromIndex().length > 0) {
              <ion-row>
                <ion-col size="6"><strong>Name</strong></ion-col>
                <ion-col size="3"><strong>Lizenz</strong></ion-col>
                <ion-col size="3"><strong>Lizenz gültig bis</strong></ion-col>
              </ion-row>
              @for(item of licensedFromIndex(); track item.rid) {
                <ion-row (click)="showLicenseActions(item)">
                  <ion-col size="6">
                    @if(item.personKey) {
                      <bk-avatar-label
                        [key]="getAvatarKey(item)"
                        [label]="displayName(item)"
                        [color]="color"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label color="medium">{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">{{ formatStoreDate(item.licenseDate) }}</ion-item>
                  </ion-col>
                  <ion-col size="3">
                    <ion-item lines="none">{{ formatStoreDate(item.licenseValidUntil) }}</ion-item>
                  </ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- ── Andere Vereine card ───────────────────────────────────────── -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Mitglieder in anderen Vereinen</ion-card-title>
          <ion-card-subtitle>{{ store.clubMembers().length }} Mitglieder auch in anderen SRV-Vereinen</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col size="9">
                @if(store.clubMembers().length === 0) {
                  Keine Mitglieder in anderen Vereinen im Index.
                } @else {
                  {{ store.clubMembers().length }} Mitglieder in anderen Vereinen
                }
              </ion-col>
              <ion-col size="3">
                <ion-button fill="clear" [disabled]="index().length === 0" (click)="showClubs.set(!showClubs())">
                  <ion-icon src="{{ (showClubs() ? 'eye-off' : 'eye-on') | svgIcon }}" slot="start" />
                  {{ showClubs() ? 'Ausblenden' : 'Einblenden' }}
                </ion-button>
              </ion-col>
            </ion-row>
            @if(showClubs() && store.clubMembers().length > 0) {
              <ion-row>
                <ion-col size="6"><strong>Name</strong></ion-col>
                <ion-col size="6"><strong>Andere Vereine</strong></ion-col>
              </ion-row>
              @for(item of store.clubMembers(); track item.rid) {
                <ion-row (click)="showClubActions(item)">
                  <ion-col size="6">
                    @if(item.personKey) {
                      <bk-avatar-label
                        [key]="getAvatarKey(item)"
                        [label]="displayName(item)"
                        [color]="color"
                        [alt]="displayName(item)"
                      />
                    } @else {
                      <ion-item lines="none">
                        <ion-label color="medium">{{ displayName(item) }}</ion-label>
                      </ion-item>
                    }
                  </ion-col>
                  <ion-col size="6">{{ item.otherClubs }}</ion-col>
                </ion-row>
              }
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

    </ion-content>
  `,
})
export class AocSrv implements OnInit {
  protected readonly store = inject(AocSrvStore);
  private actionSheetController = inject(ActionSheetController);

  // computed
  protected readonly isLoading = computed(() => this.store.isLoading());
  protected readonly index     = computed(() => this.store.index());
  protected mainMembers   = computed(() => this.store.mainMemberships().length);
  protected parentMembers = computed(() => this.store.parentMemberships().length);
  protected regasoftItems = computed(() => this.store.regasoftItems());

  // filters
  protected filters       = ['Alle', 'Nur in BK', 'Nur in SRV', 'Beide'];
  protected filter        = signal<string>(this.filters[0]);
  protected isBusy        = signal(false);
  protected showIndex     = signal(false);
  protected showLicenses   = signal(false);
  protected showForeigners = signal(false);
  protected showClubs      = signal(false);

  // constants
  protected readonly color     = ColorIonic.Light;
  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  protected readonly licensedFromIndex = computed(() =>
    this.index().filter(i => !!i.licenseDate)
  );

  protected readonly filteredIndex = computed(() => {
    const term = this.store.searchTerm().toLowerCase().trim();
    let items = this.index();
    switch (this.filter()) {
      case 'Nur in BK':  items = items.filter(i => !!i.mKey && !i.rid); break;
      case 'Nur in SRV': items = items.filter(i => !i.mKey && !!i.rid); break;
      case 'Beide':      items = items.filter(i => !!i.mKey && !!i.rid); break;
    }
    return term ? items.filter(i => i.indexField?.includes(term)) : items;
  });

  ngOnInit(): void {
    this.store.loadIndexFromStorage();
  }

  protected readonly getMismatches = getMismatches;

  protected getAge(dateOfBirth: string): string {
    return getAgeFn(dateOfBirth) + '';
  }

  protected displayName(item: SrvIndex): string {
    return item.firstName || item.lastName
      ? `${item.firstName} ${item.lastName}`.trim()
      : `${item.rFirstName} ${item.rLastName}`.trim();
  }

  protected getAvatarKey(item: SrvIndex): string {
    return `person.${item.personKey}`;
  }

  protected formatStoreDate(storeDate: string): string {
    if (!storeDate || storeDate.length < 8) return '—';
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  }

protected async buildIndex(): Promise<void> {
    this.isBusy.set(true);
    try {
      await this.store.buildIndex();
    } finally {
      this.isBusy.set(false);
    }
  }

  /**
   * Displays an ActionSheet with all possible actions on a SrvIndex. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param menuItem 
   */
  protected async showIndexActions(item: SrvIndex): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('parentMembership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('regasoft.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('regasoft.add', this.imgixBaseUrl, 'add'));
      actionSheetOptions.buttons.push(createActionSheetButton('regasoft.update', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
      await this.executeActions(actionSheetOptions, item);
  }

  /**
   * Displays an ActionSheet with all possible actions on a SrvIndex. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param menuItem 
   */
  protected async showLicenseActions(item: SrvIndex): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('parentMembership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('regasoft.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('license.create', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('license.download', this.imgixBaseUrl, 'download'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
      await this.executeActions(actionSheetOptions, item);
  }

  /**
   * Displays an ActionSheet with all possible actions on a SrvIndex. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param menuItem 
   */
  protected async showForeignerActions(item: SrvIndex): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('parentMembership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('regasoft.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
      await this.executeActions(actionSheetOptions, item);
  }

  /**
   * Displays an ActionSheet with all possible actions on a SrvIndex. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param menuItem 
   */
  protected async showClubActions(item: SrvIndex): Promise<void> {
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
      actionSheetOptions.buttons.push(createActionSheetButton('person.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('membership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetButton('parentMembership.edit', this.imgixBaseUrl, 'edit'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('regasoft.view', this.imgixBaseUrl, 'eye-on'));
      actionSheetOptions.buttons.push(createActionSheetDivider());
      actionSheetOptions.buttons.push(createActionSheetButton('membership.create', this.imgixBaseUrl, 'add'));
      actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
      await this.executeActions(actionSheetOptions, item);
  }

  /**
   * Displays the ActionSheet, waits for the user to select an action and executes the selected action.
   * @param actionSheetOptions 
   * @param item 
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions, item: SrvIndex): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (data) {
        switch (data.action) {
          case 'person.edit':
            await this.store.editPerson(item);
            break;
          case 'membership.edit':
            await this.store.editScsMember(item.mKey);
            break;
          case 'parentMembership.edit':
            await this.store.editSrvMember(item.mKey);
            break;
          case 'regasoft.add':
            await this.store.addToRegasoft(item);
            break;
          case 'regasoft.view':
            await this.store.showRegasoftDetail(item);
            break;
          case 'regasoft.update':
            await this.store.updateRegasoft(item);
            break;
          case 'license.create':
            await this.store.createLicense(item);
            break;
          case 'license.download':
            await this.store.downloadLicense(item);
            break;
          case 'membership.create':
            await this.store.addClubMembership(item);
            break;
        }
      }
    }
  }
}
