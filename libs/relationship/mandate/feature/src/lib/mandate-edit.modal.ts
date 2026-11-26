import { Component, computed, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { AvatarInfo, MandateModel, MeetingCollection, MeetingModel, MeetingModelName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, lazyService, showToast } from '@okr/shared-util-angular';
import { DateFormat, fill, getAvatarInfoForCurrentUser, getFullName, getTodayStr, safeStructuredClone, warn } from '@okr/shared-util-core';
import { MandateService, notifyGrantor } from '@okr/relationship-mandate-data-access';
import { MandateForm } from '@okr/relationship-mandate-ui';
import { isMeetingOpenForProxies, MANDATE_I18N_KEYS, MandateI18n, mayReceiveProxy, newProxyMandate, proxyReplaces } from '@okr/relationship-mandate-util';

/**
 * Gives a new family Vollmacht (spec 1.180 §5.1), or records a proxy for a meeting (`mandate.kind === 'proxy'`,
 * spec §6). Saves it itself through `MandateService.create` and dismisses with the new okey and role 'confirm'; a
 * failed write keeps the modal open. Lives in the feature lib because it injects the data-access service. No store is
 * injected here — `MandateStore` opens this modal, importing it back would be circular.
 *
 * Proxy mode: the grantee is picked among `suggestions` (the meeting's attendees who may still receive one). On save
 * the meeting is re-read from the server (still draft / invited?), the proxies of the meeting are re-read (cap), the
 * grantor's previous proxy is revoked and then the new one is created. A proxy recorded by somebody else than the
 * grantor tells the grantor with a task (§5.3).
 */
@Component({
  selector: 'okr-mandate-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, MandateForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-mandate-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [existing]="existing()"
          [suggestions]="suggestions()"
          [readOnly]="isSaving()"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class MandateEditModal {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);
  private readonly mandateService = inject(MandateService);
  protected readonly i18n = inject(I18nService).translateAll(MANDATE_I18N_KEYS) as MandateI18n;
  // Lazy: only a proxy recorded for somebody else needs it, for the notice.
  private readonly taskService = lazyService(inject(Injector), () =>
    import('@okr/project-task-data-access').then(m => m.TaskService));

  // inputs
  public readonly mandate = input.required<MandateModel>();
  /** the grantor's stored Vollmachten, for the duplicate check */
  public readonly existing = input<MandateModel[]>([]);
  /** household members and related persons, offered first in the form */
  public readonly suggestions = input<AvatarInfo[]>([]);
  /** proxy mode: the meeting the proxy is for */
  public readonly meeting = input<MeetingModel | undefined>(undefined);
  /** proxy mode: the tenant's maxProxiesPerHolder */
  public readonly proxyCap = input(0);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected formData = linkedSignal(() => safeStructuredClone(this.mandate()));
  protected showForm = signal(true);
  protected isSaving = signal(false);

  // derived
  protected readonly isProxy = computed(() => this.mandate().kind === 'proxy');
  protected readonly title = computed(() => this.isProxy() ? this.i18n.record_proxy() : this.i18n.create());
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.isSaving());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.title() } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const currentUser = this.appStore.currentUser();
    const mandate = this.formData();
    if (!currentUser || !mandate || this.isSaving()) return;
    this.isSaving.set(true);
    try {
      const okey = mandate.kind === 'proxy'
        ? await this.saveProxy(mandate, currentUser)
        : await this.mandateService.create(mandate, currentUser);
      if (okey === '') return;   // refused; the reason was shown
      if (!okey) {
        await showToast(this.toastController, MANDATE_I18N_KEYS.save_error);
        return;
      }
      await showToast(this.toastController, MANDATE_I18N_KEYS.save_conf);
      await dismissOverlay(this.modalController, okey, 'confirm');
    } catch (error) {
      console.error('MandateEditModal.save:', error);
      await showToast(this.toastController, MANDATE_I18N_KEYS.save_error);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Records the proxy: re-checks the meeting state and the cap on the server's current data, revokes the grantor's
   * previous proxy for the meeting (one per grantor and meeting), then creates the new one, built from the meeting and
   * the two avatars only. Refusals show their own toast and return '' (no second error toast); a failed write returns
   * undefined.
   * @returns the new okey, '' after a refusal, undefined when a write failed
   */
  private async saveProxy(draft: MandateModel, currentUser: UserModel): Promise<string | undefined> {
    const meeting = this.meeting();
    const actor = getAvatarInfoForCurrentUser(currentUser);
    const tenantId = this.appStore.tenantId();
    if (!meeting?.okey || !actor?.key || !draft.grantor?.key || !draft.grantee?.key) return undefined;

    // the draft / invited lock is app-only (the rules do not check it): read the meeting from the server
    const stored = await this.appStore.firestoreService.readObjectStrict<MeetingModel>(`${MeetingCollection}/${meeting.okey}`);
    if (!stored || !isMeetingOpenForProxies(stored)) {
      await showToast(this.toastController, MANDATE_I18N_KEYS.proxy_closed);
      return '';
    }

    const today = getTodayStr(DateFormat.StoreDate);
    const proxies = await firstValueFrom(this.mandateService.listProxiesForMeeting(tenantId, meeting.okey));
    const replaced = proxyReplaces(proxies, meeting.okey, draft.grantorKey, today);
    // the proxy being replaced does not count against its holder's cap
    const counted = proxies.filter(p => p.okey !== replaced?.okey);
    if (!mayReceiveProxy(counted, meeting.okey, draft.granteeKey, this.proxyCap(), today)) {
      await showToast(this.toastController, fill(this.i18n.proxy_cap_reached(), { name: getFullName(draft.grantee.name1, draft.grantee.name2) }));
      return '';
    }

    if (replaced && !await this.mandateService.revoke(replaced, actor.key)) return undefined;
    const proxy = newProxyMandate(tenantId, draft.grantor, draft.grantee, meeting.okey, actor.key);
    const okey = await this.mandateService.create(proxy, currentUser);
    if (okey && actor.key !== proxy.grantorKey) {
      try {
        await notifyGrantor(await this.taskService(), { ...proxy, okey }, actor, draft.grantor,
          fill(this.i18n.notice_created(), { actor: actor.name1 }), { modelType: MeetingModelName, key: meeting.okey });
      } catch (ex) {
        warn(`MandateEditModal.saveProxy(notice): ${(ex as Error).message}`);
      }
    }
    return okey;
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.mandate()));
    // re-mount the form so its field state (touched, error notes) starts fresh
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MandateModel): void {
    this.formData.set(formData);
  }
}
