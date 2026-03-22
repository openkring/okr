import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonInput, IonIcon, IonItem, IonList, IonSearchbar, IonSelect, IonSelectOption, IonTitle, IonToolbar, ModalController, IonLabel } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AvatarComponent } from '@bk2/avatar-ui';
import { MembershipService } from '@bk2/relationship-membership-data-access';
import { DeliveryTypes } from '@bk2/shared-categories';

const EMAIL_PROVIDERS = ['mailgun_smtp', 'mailtrap_api', 'netzone_smtp', 'mailtrap_test'] as const;
import { AppStore } from '@bk2/shared-feature';
import { DeliveryType, UserModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { UserService } from '@bk2/user-data-access';
import { AsyncPipe } from '@angular/common';
import { TranslatePipe } from '@bk2/shared-i18n';

@Component({
  selector: 'bk-message-center-modal',
  standalone: true,
  imports: [
    SvgIconPipe, AsyncPipe, TranslatePipe,
    AvatarComponent,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonItem,
    IonCheckbox, IonIcon, IonSearchbar, IonSelect, IonSelectOption, IonInput, IonLabel
  ],
  template: `
    <ion-header>
      <!-- Title bar -->
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">Abbrechen</ion-button>
        </ion-buttons>
        <ion-title>Empfänger auswählen</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="showInputFields.set(!showInputFields())">
            <ion-icon src="{{ (showInputFields() ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
          </ion-button>
          <ion-button (click)="ok()"><strong>OK</strong></ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- Collapsible input fields -->
      @if (showInputFields()) {
        <ion-toolbar color="secondary">
          <ion-item lines="none" color="secondary">
            <ion-input label="Betreff: " [value]="subject()"
              (ionInput)="subject.set($any($event).detail.value ?? '')"
              [clearInput]="true" />
          </ion-item>
        </ion-toolbar>

        <ion-toolbar color="secondary">
          <ion-item lines="none" color="secondary">
            <ion-input label="Von: " [value]="from()"
              (ionInput)="from.set($any($event).detail.value ?? '')"
              placeholder="email@domain.com" [clearInput]="true" />
          </ion-item>
        </ion-toolbar>

        <ion-toolbar color="secondary">
          <ion-item lines="none" color="secondary">
            <ion-input label="CC: " [value]="cc()"
              (ionInput)="cc.set($any($event).detail.value ?? '')"
              placeholder="email1@domain.com, email2@domain.com" [clearInput]="true" />
          </ion-item>
        </ion-toolbar>

        <ion-toolbar color="secondary">
          <ion-item lines="none" color="secondary">
            <ion-input label="BCC: " [value]="bcc()"
              (ionInput)="bcc.set($any($event).detail.value ?? '')"
              placeholder="email1@domain.com, email2@domain.com" [clearInput]="true" />
          </ion-item>
        </ion-toolbar>

        <ion-toolbar color="secondary">
          <ion-item lines="none" color="secondary">
            <ion-checkbox slot="start" style="margin-right: 12px;"
              [checked]="hideReceiverAddresses()"
              (ionChange)="hideReceiverAddresses.set($any($event).detail.checked)" />
            <ion-label>Empfängeradressen verbergen</ion-label>
          </ion-item>
        </ion-toolbar>

        @if (isPrivileged()) {
          <ion-toolbar color="secondary">
            <ion-item lines="none" color="secondary">
              <ion-label>Provider</ion-label>
              <ion-select [value]="provider()"
                (ionChange)="provider.set($any($event).detail.value)">
                @for (p of emailProviders; track p) {
                  <ion-select-option [value]="p">{{ p }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-toolbar>

          <ion-toolbar color="secondary">
            <ion-item lines="none" color="secondary">
              <ion-input label="Template: " [value]="template()"
                (ionInput)="template.set($any($event).detail.value ?? '')"
                placeholder="z.B. scs_password_reset" [clearInput]="true" />
            </ion-item>
          </ion-toolbar>
        }
      }

      <!-- Group selector (always visible) -->
      <ion-toolbar color="secondary">
        <ion-item lines="none" color="secondary">
          <ion-label>{{ '@subject.group.singular' | translate | async }}</ion-label>
          <ion-select [value]="selectedGroupKey()"
            (ionChange)="selectedGroupKey.set($any($event).detail.value)"
            placeholder="Alle Gruppen">
            <ion-select-option value="all">Alle Gruppen</ion-select-option>
            @for(group of groups(); track group.bkey) {
              <ion-select-option [value]="group.bkey">{{ group.name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-toolbar>

      <!-- Select-all + Searchbar (always visible) -->
      <ion-toolbar color="secondary">
        <ion-checkbox slot="start" style="margin: 0 8px 0 16px;"
          [checked]="isAllSelected()"
          [indeterminate]="isIndeterminate()"
          (ionChange)="toggleAll($any($event).detail.checked)" />
        <ion-searchbar [value]="searchTerm()"
          (ionInput)="searchTerm.set($any($event).detail.value ?? '')"
          placeholder="Suchen..." />
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        @for(user of filteredUsers(); track user.bkey) {
          <ion-item>
            <ion-checkbox slot="start"
              [checked]="checkedKeys().has(user.bkey) && (user.newsDelivery === DT.EmailAttachment || user.newsDelivery === DT.EmailNotification)"
              (ionChange)="toggle(user.bkey, $any($event).detail.checked)" />
            @if(currentUser(); as cu) {
              <bk-avatar [avatarInfo]="toAvatarInfo(user)" [currentUser]="cu" layout="horizontal" />
            }
            <ion-icon slot="end" src="{{ deliveryIcon(user.newsDelivery) | svgIcon }}" />
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `
})
export class MessageCenterModal {
  private readonly modalController = inject(ModalController);
  private readonly userService = inject(UserService);
  private readonly membershipService = inject(MembershipService);
  private readonly appStore = inject(AppStore);

  // inputs
  public initialSubject = input<string>('');
  public initialFrom = input<string>('');
  public isPrivileged = input<boolean>(false);

  // state
  protected subject = linkedSignal(() => this.initialSubject());
  protected from = linkedSignal(() => this.initialFrom());
  protected provider = signal('mailtrap_api');
  protected template = signal('');
  protected readonly emailProviders = EMAIL_PROVIDERS;
  protected cc = signal('');
  protected bcc = signal('');
  protected showInputFields = signal(true);
  protected hideReceiverAddresses = signal(true);
  protected searchTerm = signal('');
  protected selectedGroupKey = signal('all');
  protected groups = computed(() => this.appStore.allGroups() ?? []);
  protected currentUser = computed(() => this.appStore.currentUser());

  protected usersResource = rxResource({
    stream: () => this.userService.list()
  });

  protected membershipsResource = rxResource({
    params: () => ({ groupKey: this.selectedGroupKey() }),
    stream: ({ params }) => {
      if (params.groupKey === 'all') return of([]);
      return this.membershipService.listMembersOfOrg(params.groupKey);
    }
  });

  protected checkedKeys = linkedSignal(() =>
    new Set(this.usersResource.value()?.map(u => u.bkey) ?? [])
  );

  protected DT = DeliveryType;

  protected filteredUsers = computed(() => {
    const users = (this.usersResource.value() ?? []).filter(u => !u.isArchived);
    const term = this.searchTerm().toLowerCase();
    const groupKey = this.selectedGroupKey();
    const memberships = this.membershipsResource.value() ?? [];

    let result = users;

    if (groupKey !== 'all') {
      const memberPersonKeys = new Set(memberships.map(m => m.memberKey));
      result = result.filter(u => memberPersonKeys.has(u.personKey));
    }

    if (term.length > 0) {
      result = result.filter(u =>
        u.firstName.toLowerCase().includes(term) ||
        u.lastName.toLowerCase().includes(term) ||
        u.loginEmail.toLowerCase().includes(term)
      );
    }

    return result;
  });

  protected isAllSelected = computed(() => {
    const filtered = this.filteredUsers();
    return filtered.length > 0 && filtered.every(u => this.checkedKeys().has(u.bkey));
  });

  protected isIndeterminate = computed(() => {
    const filtered = this.filteredUsers();
    const keys = this.checkedKeys();
    const checkedCount = filtered.filter(u => keys.has(u.bkey)).length;
    return checkedCount > 0 && checkedCount < filtered.length;
  });

  protected toggleAll(checked: boolean): void {
    this.checkedKeys.update(keys => {
      const updated = new Set(keys);
      for (const user of this.filteredUsers()) {
        checked ? updated.add(user.bkey) : updated.delete(user.bkey);
      }
      return updated;
    });
  }

  protected toggle(userKey: string, checked: boolean): void {
    this.checkedKeys.update(keys => {
      const updated = new Set(keys);
      checked ? updated.add(userKey) : updated.delete(userKey);
      return updated;
    });
  }

  protected toAvatarInfo(user: UserModel) {
    return {
      key: user.personKey || user.bkey,
      name1: user.firstName,
      name2: user.lastName,
      modelType: 'person' as const,
      type: '',
      subType: '',
      label: '',
    };
  }

  protected deliveryIcon(deliveryType: number): string {
    return DeliveryTypes.find(d => d.id === deliveryType)?.icon ?? 'email';
  }

  private parseEmails(raw: string): string[] {
    return raw.split(',').map(e => e.trim()).filter(Boolean);
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(null, 'cancel');
  }

  public async ok(): Promise<void> {
    const allUsers = this.usersResource.value() ?? [];
    const checkedKeys = this.checkedKeys();
    const selectedEmails = allUsers
      .filter(u => checkedKeys.has(u.bkey))
      .map(u => u.loginEmail)
      .filter(Boolean);

    const from = this.from();
    const cc = this.parseEmails(this.cc());
    const bcc = this.parseEmails(this.bcc());

    let to: string[];
    let finalBcc: string[];

    if (this.hideReceiverAddresses()) {
      to = [from];
      finalBcc = [...selectedEmails, ...bcc];
    } else {
      to = selectedEmails;
      finalBcc = bcc;
    }

    const template = this.template().trim() || undefined;
    await this.modalController.dismiss(
      { to, cc, bcc: finalBcc, subject: this.subject(), from, provider: this.provider(), template },
      'confirm'
    );
  }
}
