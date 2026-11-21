import { computed, inject, Injectable, Injector } from '@angular/core';
import { ActionSheetController, ActionSheetOptions } from '@ionic/angular';

import { PersonModel, RoleName } from '@okr/shared-models';
import { createActionSheetButton, createActionSheetDivider, createActionSheetOptions } from '@okr/shared-util-angular';
import { hasRole } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { resolveVcardCapability, VCARD_I18N_KEYS, VcardI18n } from '@okr/vcard-util';
import { HOUSEHOLD_I18N_KEYS } from '@okr/relationship-household-util';

import { PersonStore } from './person.store';

/**
 * Which actions a list offers on a person:
 * - `full` — the person list: view/edit/delete, chat, open/close the account, contact, map, vCard;
 * - `contact` — a list that only looks people up (birthday list): view/edit, contact, map, vCard.
 */
export type PersonActionSet = 'full' | 'contact';

/**
 * The ActionSheet on a person, shared by the person list and the birthday list.
 * Provide it next to `PersonStore` (`providers: [PersonStore, PersonActionsService]`).
 *
 * Contact data comes from the address-directory projection (spec 1.19 Phase 4): favEmail/favPhone
 * are no longer on the person. `showOnMap` picks vault or projection by the caller's role itself.
 */
@Injectable()
export class PersonActionsService {
  private readonly store = inject(PersonStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly injector = inject(Injector);
  private readonly vcardI18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;
  private readonly householdI18n = inject(I18nService).translateAll({ action_edit: HOUSEHOLD_I18N_KEYS.action_edit });
  private readonly imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;
  private readonly currentUser = computed(() => this.store.appStore.currentUser());
  /** only a memberAdmin edits; everybody else views */
  private readonly readOnly = computed(() => !this.hasRole('memberAdmin'));

  public favEmail(person: PersonModel): string {
    return this.store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favEmail ?? '';
  }

  public favPhone(person: PersonModel): string {
    return this.store.appStore.getDirectoryEntry(`person.${person.okey}`)?.favPhone ?? '';
  }

  /** Shows the ActionSheet with the actions the user may run on the person, and runs the chosen one. */
  public async show(person: PersonModel, actionSet: PersonActionSet = 'full'): Promise<void> {
    const options = createActionSheetOptions(this.store.i18n.as_title());
    await this.addButtons(options, person, actionSet);
    await this.execute(options, person);
  }

  private async addButtons(options: ActionSheetOptions, person: PersonModel, actionSet: PersonActionSet): Promise<void> {
    const full = actionSet === 'full';
    if (!this.readOnly()) {
      options.buttons.push(createActionSheetButton('person.edit', this.store.i18n.update(), this.imgixBaseUrl, 'edit'));
      if (full && this.hasRole('admin')) {
        options.buttons.push(createActionSheetButton('person.delete', this.store.i18n.delete(), this.imgixBaseUrl, 'trash'));
      }
    } else {  // registered user
      options.buttons.push(createActionSheetButton('person.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    }
    options.buttons.push(createActionSheetDivider());

    if (full) {
      const isUser = await this.store.isPersonUser(person.okey);
      // no direct chat to oneself
      if (person.okey !== this.currentUser()?.personKey && isUser) {
        options.buttons.push(createActionSheetButton('person.chat', this.store.i18n.send_message(), this.imgixBaseUrl, 'chatbubbles'));
      }
      // open/close the user account — normally automatic on membership changes in the
      // default org, this is the manual override (spec 2026-08-12-membership-account-sync)
      if (this.hasRole('memberAdmin')) {
        options.buttons.push(isUser
          ? createActionSheetButton('person.closeAccount', this.store.i18n.close_account(), this.imgixBaseUrl, 'lock-closed')
          : createActionSheetButton('person.openAccount', this.store.i18n.open_account(), this.imgixBaseUrl, 'person-add'));
      }
      // Haushalte (spec 1.168 §7): create or edit the person's household
      if (this.hasRole('memberAdmin') || this.hasRole('privileged')) {
        options.buttons.push(createActionSheetButton('person.household', this.householdI18n.action_edit(), this.imgixBaseUrl, 'people'));
      }
    }
    if (this.favEmail(person)) {
      options.buttons.push(createActionSheetButton('person.copyemail', this.store.i18n.copy_email(), this.imgixBaseUrl, 'copy'));
      options.buttons.push(createActionSheetButton('person.sendemail', this.store.i18n.send_email(), this.imgixBaseUrl, 'email'));
    }
    if (this.favPhone(person)) {
      options.buttons.push(createActionSheetButton('person.copyphone', this.store.i18n.copy_phone(), this.imgixBaseUrl, 'copy'));
      options.buttons.push(createActionSheetButton('person.call', this.store.i18n.call_phone(), this.imgixBaseUrl, 'tel'));
    }
    if (person.favZipCode) {
      options.buttons.push(createActionSheetButton('person.show', this.store.i18n.show_postal(), this.imgixBaseUrl, 'location'));
    }
    if (resolveVcardCapability(this.currentUser()?.roles, 1).allowed) {
      options.buttons.push(createActionSheetButton('person.vcard', this.vcardI18n.action_label(), this.imgixBaseUrl, 'download'));
    }
    options.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (options.buttons.length === 1) { // only cancel button
      options.buttons = [];
    }
  }

  private async execute(options: ActionSheetOptions, person: PersonModel): Promise<void> {
    if (options.buttons.length === 0) return;
    const actionSheet = await this.actionSheetController.create(options);
    await actionSheet.present();
    const { data } = await actionSheet.onDidDismiss();
    if (!data) return;
    switch (data.action) {
      case 'person.view':
        await this.store.edit(person, true);
        break;
      case 'person.edit':
        await this.store.edit(person, this.readOnly());
        break;
      case 'person.delete':
        await this.store.delete(person, this.readOnly());
        break;
      case 'person.chat':
        await this.store.chat(person);
        break;
      case 'person.copyemail':
        await this.store.copy(this.favEmail(person), this.store.i18n.copy_email_conf());
        break;
      case 'person.sendemail':
        await this.store.sendEmail(this.favEmail(person));
        break;
      case 'person.copyphone':
        await this.store.copy(this.favPhone(person), this.store.i18n.copy_phone_conf());
        break;
      case 'person.call':
        await this.store.call(this.favPhone(person));
        break;
      case 'person.show':
        await this.store.showOnMap(person);
        break;
      case 'person.vcard':
        await this.store.exportVcard(person);
        break;
      case 'person.openAccount':
        await this.store.openUserAccount(person);
        break;
      case 'person.closeAccount':
        await this.store.closeUserAccount(person);
        break;
      case 'person.household':
        await this.editHousehold(person);
        break;
    }
  }

  /** The household store is loaded on demand: a static import would pull the household modal into the person chunk. */
  private async editHousehold(person: PersonModel): Promise<void> {
    const { HouseholdStore } = await import('@okr/relationship-household-feature');
    await this.injector.get(HouseholdStore).edit(person.okey, 'admin');
  }

  private hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
