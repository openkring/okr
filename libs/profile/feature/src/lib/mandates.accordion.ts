import { Component, Injector, computed, inject, input, signal } from '@angular/core';
import { AlertController, IonAccordion, IonButton, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote } from '@ionic/angular';

import type { MandateStore } from '@okr/relationship-mandate-feature';
import { MANDATE_I18N_KEYS, MandateI18n, isMandateActive, proxyRevokeAction } from '@okr/relationship-mandate-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, MandateModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { confirm } from '@okr/shared-util-angular';
import { DateFormat, convertDateFormatToString, fill, getFullName, getTodayStr } from '@okr/shared-util-core';

type MandateRow = {
  mandate: MandateModel;
  name: string; // the other person: the grantee in «Von mir erteilt», the grantor in «Mir erteilt»
  actions: string; // a family Vollmacht: what it allows; a proxy: «Vertretung: <meeting>»
  validity: string; // «bis 31.12.2026», «bis auf Widerruf», or why it no longer applies; '' for an unrevoked proxy
  recordedBy: string; // set when somebody else than the grantor recorded it
  isActive: boolean;
  canEnd: boolean; // revoke / give back is offered (a proxy only while its meeting is open)
  meetingName: string; // a proxy: the meeting's name, «Versammlung» if unknown; '' for a family Vollmacht
};

/**
 * «Vollmachten» (spec 1.180 §5.1): the Vollmachten I gave and the ones I received, in all states — the inactive ones
 * greyed out. I can give a new one, revoke one I gave, or give back one I received. Proxies for a meeting (§6) are
 * listed too, labelled with the meeting; they can be revoked or given back only while the meeting is still open
 * (draft / invited) and are read-only afterwards, or when the meeting cannot be read.
 *
 * `MandateStore` (and with it the edit modal and its form) lives in the mandate feature lib and is loaded on demand
 * (`await import()`), so the profile chunk does not pull them into the eager bundle. The `import type` above is
 * erased at compile time and is no binding edge.
 */
@Component({
  selector: 'okr-mandates-accordion',
  standalone: true,
  imports: [SvgIconPipe, IonAccordion, IonItem, IonLabel, IonNote, IonButton, IonIcon, IonList, IonListHeader],
  styles: [`.inactive { opacity: 0.5; }`],
  template: `
    <ion-accordion toggle-icon-slot="start" value="mandates">
      <ion-item slot="header" [color]="color()">
        <ion-label>{{ i18n.title() }}</ion-label>
      </ion-item>
      <div slot="content">
        <ion-item lines="none">
          <ion-note class="ion-text-wrap">{{ i18n.intro() }}</ion-note>
        </ion-item>

        <ion-list lines="inset">
          <ion-list-header>
            <ion-label>{{ i18n.given() }}</ion-label>
          </ion-list-header>
          @for (row of givenRows(); track row.mandate.okey) {
            <ion-item [class.inactive]="!row.isActive">
              <ion-label class="ion-text-wrap">
                <h3>{{ row.name }}</h3>
                <p>{{ row.actions }}</p>
                @if (row.validity) { <p>{{ row.validity }}</p> }
                @if (row.recordedBy) { <p>{{ row.recordedBy }}</p> }
              </ion-label>
              @if (row.canEnd) {
                <ion-button slot="end" fill="outline" color="danger" [disabled]="busy()" (click)="revoke(row)">{{ i18n.revoke() }}</ion-button>
              }
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n.given_empty() }}</ion-label></ion-item>
          }
          <ion-item lines="none">
            <ion-button fill="clear" [disabled]="busy()" (click)="create()">
              <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
              {{ i18n.create() }}
            </ion-button>
          </ion-item>
        </ion-list>

        <ion-list lines="inset">
          <ion-list-header>
            <ion-label>{{ i18n.received() }}</ion-label>
          </ion-list-header>
          @for (row of receivedRows(); track row.mandate.okey) {
            <ion-item [class.inactive]="!row.isActive">
              <ion-label class="ion-text-wrap">
                <h3>{{ row.name }}</h3>
                <p>{{ row.actions }}</p>
                @if (row.validity) { <p>{{ row.validity }}</p> }
                @if (row.recordedBy) { <p>{{ row.recordedBy }}</p> }
              </ion-label>
              @if (row.canEnd) {
                <ion-button slot="end" fill="outline" color="danger" [disabled]="busy()" (click)="giveBack(row)">{{ i18n.give_back() }}</ion-button>
              }
            </ion-item>
          } @empty {
            <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n.received_empty() }}</ion-label></ion-item>
          }
        </ion-list>
      </div>
    </ion-accordion>
  `,
})
export class MandatesAccordion {
  private readonly appStore = inject(AppStore);
  private readonly alertController = inject(AlertController);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(I18nService).translateAll(MANDATE_I18N_KEYS) as MandateI18n;

  public readonly color = input('primary');

  protected readonly busy = signal(false);
  /** set once the mandate feature lib has loaded */
  private readonly store = signal<InstanceType<typeof MandateStore> | undefined>(undefined);

  protected readonly givenRows = computed(() => this.toRows(this.store()?.given() ?? [], 'grantee'));
  protected readonly receivedRows = computed(() => this.toRows(this.store()?.received() ?? [], 'grantor'));
  /** the meetings of my proxies, as far as they could be read */
  private readonly meetings = computed(() => this.store()?.proxyMeetings() ?? []);

  constructor() {
    void this.loadStore();
  }

  private async loadStore(): Promise<InstanceType<typeof MandateStore> | undefined> {
    const loaded = this.store();
    if (loaded) return loaded;
    try {
      const { MandateStore } = await import('@okr/relationship-mandate-feature');
      const store = this.injector.get(MandateStore);
      this.store.set(store);
      return store;
    } catch (error) {
      console.error('MandatesAccordion.loadStore:', error);
      return undefined;
    }
  }

  /** active ones first, then by name */
  private toRows(mandates: MandateModel[], other: 'grantor' | 'grantee'): MandateRow[] {
    const today = getTodayStr(DateFormat.StoreDate);
    const i18n = this.i18n;
    const meetings = this.meetings();
    const callerKey = this.appStore.currentUser()?.personKey ?? '';
    return mandates
      .filter((m) => m.kind === 'family' || m.kind === 'proxy')
      .map((m) => {
        const isActive = isMandateActive(m, today);
        const name = this.avatarName(m[other], other === 'grantor' ? m.grantorKey : m.granteeKey);
        const recordedBy = m.createdByKey && m.createdByKey !== m.grantorKey ? fill(i18n.recorded_by(), { name: this.personName(m.createdByKey) }) : '';
        if (m.kind === 'proxy') {
          const meeting = meetings.find((mt) => mt.okey === m.meetingKey);
          const meetingName = meeting?.name || i18n.meeting_unknown();
          return {
            mandate: m, name, recordedBy, isActive, meetingName,
            actions: fill(i18n.proxy_label(), { meeting: meetingName }),
            validity: (m.revokedAt ?? '') !== '' ? i18n.state_revoked() : '',
            // as grantor (given) I revoke, as holder (received) I give back — own rows need no admin role
            canEnd: !!meeting && proxyRevokeAction(meeting, m, callerKey, false, today) !== '',
          };
        }
        return {
          mandate: m, name, recordedBy, isActive, meetingName: '',
          actions: (m.actions ?? []).map((a) => a === 'calevent.attend' ? i18n.action_attend() : a === 'invitation.answer' ? i18n.action_answer() : '')
            .filter((a) => a !== '').join(', '),
          validity: this.validity(m, today),
          canEnd: isActive,
        };
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }

  /** the grantor and the holder of a proxy row, for its confirm text */
  private proxyNames(row: MandateRow): { grantor: string; holder: string; meeting: string } {
    const m = row.mandate;
    return {
      grantor: this.avatarName(m.grantor, m.grantorKey),
      holder: this.avatarName(m.grantee, m.granteeKey),
      meeting: row.meetingName,
    };
  }

  private validity(m: MandateModel, today: string): string {
    const i18n = this.i18n;
    if ((m.revokedAt ?? '') !== '') return i18n.state_revoked();
    const to = m.validTo ?? '';
    if (to !== '' && to < today) return i18n.state_expired();
    const from = m.validFrom ?? '';
    if (from !== '' && from > today) return fill(i18n.state_pending(), { date: viewDate(from) });
    return to === '' ? i18n.until_revoked() : fill(i18n.valid_until(), { date: viewDate(to) });
  }

  private avatarName(avatar: AvatarInfo | undefined, key: string): string {
    return avatar?.key ? getFullName(avatar.name1, avatar.name2) : this.personName(key);
  }

  private personName(key: string): string {
    const p = this.appStore.getPerson(key);
    return p ? getFullName(p.firstName, p.lastName) : this.i18n.person_unknown();
  }

  /******************************* actions *************************************** */

  protected async create(): Promise<void> {
    this.busy.set(true);
    try {
      await (await this.loadStore())?.createFamily();
    } finally {
      this.busy.set(false);
    }
  }

  protected async revoke(row: MandateRow): Promise<void> {
    const i18n = this.i18n;
    const message = row.mandate.kind === 'proxy'
      ? fill(i18n.proxy_revoke_confirm(), this.proxyNames(row))
      : fill(i18n.revoke_confirm(), { name: row.name });
    if (!await confirm(this.alertController, message, i18n.revoke(), i18n.cancel(), true)) return;
    this.busy.set(true);
    try {
      await (await this.loadStore())?.revoke(row.mandate);
    } finally {
      this.busy.set(false);
    }
  }

  protected async giveBack(row: MandateRow): Promise<void> {
    const i18n = this.i18n;
    const message = row.mandate.kind === 'proxy'
      ? fill(i18n.proxy_give_back_confirm(), this.proxyNames(row))
      : fill(i18n.give_back_confirm(), { name: row.name });
    if (!await confirm(this.alertController, message, i18n.give_back(), i18n.cancel(), true)) return;
    this.busy.set(true);
    try {
      await (await this.loadStore())?.giveBack(row.mandate);
    } finally {
      this.busy.set(false);
    }
  }
}

function viewDate(storeDate: string): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.ViewDate, false) ?? storeDate;
}
