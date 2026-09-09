import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { LoadingController, ModalController } from '@ionic/angular/standalone';

import { AvatarService, UploadService } from '@okr/avatar-data-access';
import { newAvatarModel } from '@okr/avatar-util';
import { PersonalRelService } from '@okr/relationship-personal-rel-data-access';
import { WorkrelService } from '@okr/relationship-workrel-data-access';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import {
  AddressCollection,
  AddressDirectoryCollection,
  AddressDirectoryModel,
  AddressModel,
  CategoryCollection,
  CategoryListModel,
  OrgCollection,
  OrgModel,
  PersonalRelModel,
  PersonCollection,
  PersonModel,
  Roles,
  UserModel,
  WorkrelModel,
} from '@okr/shared-models';
import { convertDateFormatToString, DateFormat, getSystemQuery, getTodayStr } from '@okr/shared-util-core';
import { AlertService } from '@okr/shared-util-angular';
import { AddressService } from '@okr/subject-address-data-access';
import { OrgService } from '@okr/subject-org-data-access';
import { PersonService } from '@okr/subject-person-data-access';
import {
  ExistingOrg,
  ExistingPerson,
  ImportNotes,
  appendImportNotes,
  buildDecisions,
  isVcardFile,
  normalizeName,
  parseVcards,
  resolveVcardImportCapability,
  toImportDraft,
  VcardImportDecision,
  VcardImportDraft,
  VCARD_I18N_KEYS,
  VCARD_MIMETYPES,
  VcardI18n,
} from '@okr/vcard-util';

import { VcardImportReviewModal } from './vcard-import-review.modal';

/** The category whose items are the tenant's address usages (see addresses.store.getUsages). */
const ADDRESS_USAGE_CATEGORY = 'address_usage';

/** Upload-modal title reused from AvatarService.saveAvatarPhoto. */
const AVATAR_UPLOAD_TITLE = '@document.operation.upload.avatar.title';

/** What one commit run produced — the input of the closing summary. */
export interface VcardImportResult {
  imported: number;
  merged: number;
  skipped: number;
  failed: number;
  failures: string[];
}

/**
 * Mirrors the header `composeImportNotes` renders (vcard-import-notes.ts). It is
 * rebuilt here — and not carried on the draft — because `VcardImportDraft` keeps
 * only the composed `notes` TEXT, while `appendImportNotes` needs the header to
 * recognise a block it already appended on an earlier import run.
 */
function importNotesOf(draft: VcardImportDraft, importDateViewDate: string): ImportNotes {
  return {
    text: draft.notes,
    header: `--- vCard-Import ${importDateViewDate} · ${draft.sourceFileName} ---`,
    residualLineCount: 0,
    warnings: [],
  };
}

/** `{key}` substitution — `I18nService.translateAll` blanks `{{param}}`, so the keys use single braces. */
function fill(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

/** Identity of an address for the merge-dedupe: channel plus its normalized carrying value. */
function addressIdentity(a: AddressModel): string {
  const value = [a.email, a.phone, a.url, a.streetName, a.streetNumber, a.zipCode, a.city, a.countryCode]
    .filter(Boolean)
    .join(' ');
  return `${a.addressChannel}|${value.toLowerCase().replace(/\s+/g, '')}`;
}

/** Split a free-form related name into first/last name — the last token is the last name. */
function splitPersonName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: '', lastName: parts[0] };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

/** Guess the image mime type from the leading base64 characters; vCard PHOTO carries no TYPE we can trust. */
function photoMime(base64: string): { mime: string; ext: string } {
  if (base64.startsWith('iVBOR')) return { mime: 'image/png', ext: 'png' };
  if (base64.startsWith('R0lGOD')) return { mime: 'image/gif', ext: 'gif' };
  if (base64.startsWith('UklGR')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Client orchestration of the vCard import (spec §7/§8): pick the files, parse them,
 * match them against the tenant, let the operator review, then write through the
 * existing domain services.
 *
 * It lives in `vcard-feature` and not in `person.store` on purpose: one card writes a
 * person, an org, addresses, an avatar, a workrel and a personal-rel, and `scope:person`
 * may not reach `scope:org` under the Nx module boundaries — `scope:vcard` has no
 * `depConstraints` entry and may.
 *
 * The commit is deliberately NOT atomic. Every decision runs in its own try/catch, a
 * failing card is named in the closing summary and the loop continues; a half-written
 * card is left in place rather than rolled back (a rollback would need the very
 * transactionality the batch does not have).
 */
@Injectable({ providedIn: 'root' })
export class VcardImportService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly modalController = inject(ModalController);
  private readonly loadingController = inject(LoadingController);
  private readonly alertService = inject(AlertService);
  private readonly uploadService = inject(UploadService);
  private readonly avatarService = inject(AvatarService);
  private readonly personService = inject(PersonService);
  private readonly orgService = inject(OrgService);
  private readonly addressService = inject(AddressService);
  private readonly workrelService = inject(WorkrelService);
  private readonly personalRelService = inject(PersonalRelService);
  private readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;

  /** The import date rendered into the notes header, as ViewDate. */
  private readonly importDateViewDate = convertDateFormatToString(getTodayStr(DateFormat.StoreDate), DateFormat.StoreDate, DateFormat.ViewDate);

  /**
   * The one entry point a menu action calls: file dialog → parse → match → review → commit.
   * Resolves once the summary alert was acknowledged; every error is reported to the user.
   */
  public async importVcards(roles: Roles | undefined, tenantId: string, currentUser: UserModel | undefined): Promise<void> {
    if (!resolveVcardImportCapability(roles).allowed) {
      this.alertService.error(this.i18n.import_notAllowed());
      return;
    }

    // No await before this call: Safari's transient user activation does not survive a
    // microtask boundary, and the dialog would silently not open (see UploadService.pickFile).
    const picked = await this.uploadService.pickMultipleFiles(VCARD_MIMETYPES);
    const files = picked.filter((f) => isVcardFile(f));
    if (files.length === 0) return; // cancelled, or nothing that looks like a vCard

    const texts = await Promise.all(files.map((f) => f.text()));
    const parsed = texts.flatMap((text, i) => parseVcards(text, files[i].name));
    if (parsed.length === 0) {
      this.alertService.error(this.i18n.import_noCards());
      return;
    }

    const { persons, orgs, usages } = await this.gatherTenantData(tenantId);
    const drafts = parsed.map((p) => toImportDraft(p, tenantId, usages, this.importDateViewDate));
    const decisions = buildDecisions(drafts, persons, orgs);

    const confirmed = await this.openReviewModal(decisions);
    if (!confirmed) return;

    const loading = await this.loadingController.create({ message: this.i18n.import_running() });
    await loading.present();
    let result: VcardImportResult;
    try {
      result = await this.commit(confirmed, tenantId, currentUser);
    } finally {
      await loading.dismiss();
    }

    const { imported, merged, skipped, failed } = result;
    const summary = fill(this.i18n.import_summary(), { imported, merged, skipped, failed });
    const message = result.failures.length > 0 ? `${summary}\n\n${result.failures.join('\n')}` : summary;
    await this.alertService.confirm(message);
  }

  /**
   * The tenant's persons, orgs and address usages. Every list query carries
   * `getSystemQuery(tenantId)`: the rules gate list reads on `tenants.hasAny(callerTenants())`,
   * so an unscoped query is rejected with "Missing or insufficient permissions".
   * `orderBy: 'none'` throughout — none of these collections is indexed on the default
   * `name` field for this filter combination, and the order is irrelevant here.
   *
   * Emails come from the `address-directory` projection, not from `addresses`: the
   * directory is the registered-visible read path and one document per parent, so a
   * tenant with n persons costs one query instead of n (privacy 1.19 §A4).
   */
  private async gatherTenantData(tenantId: string): Promise<{ persons: ExistingPerson[]; orgs: ExistingOrg[]; usages: string[] }> {
    const [personModels, orgModels, directory, categories] = await Promise.all([
      this.firestoreService.getDataOnce<PersonModel>(PersonCollection, getSystemQuery(tenantId), 'none'),
      this.firestoreService.getDataOnce<OrgModel>(OrgCollection, getSystemQuery(tenantId), 'none'),
      this.firestoreService.getDataOnce<AddressDirectoryModel>(AddressDirectoryCollection, getSystemQuery(tenantId), 'none'),
      this.firestoreService.getDataOnce<CategoryListModel>(CategoryCollection, getSystemQuery(tenantId), 'none'),
    ]);

    const emailsByParent = new Map<string, string[]>();
    for (const entry of directory ?? []) {
      const emails = [entry.favEmail, ...(entry.entries ?? []).filter((e) => e.addressChannel === 'email').map((e) => e.email)];
      emailsByParent.set(entry.parentKey, [...new Set(emails.filter(Boolean))]);
    }

    const persons: ExistingPerson[] = (personModels ?? []).map((p) => ({
      okey: p.okey,
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      emails: emailsByParent.get(`person.${p.okey}`) ?? [],
    }));
    const orgs: ExistingOrg[] = (orgModels ?? []).map((o) => ({ okey: o.okey, name: o.name ?? '' }));
    const usageCategory = (categories ?? []).find((c) => c.name === ADDRESS_USAGE_CATEGORY);
    const usages = (usageCategory?.items ?? []).map((item) => item.name);

    return { persons, orgs, usages };
  }

  private async openReviewModal(decisions: VcardImportDecision[]): Promise<VcardImportDecision[] | undefined> {
    const modal = await this.modalController.create({
      component: VcardImportReviewModal,
      componentProps: { decisions },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<VcardImportDecision[]>();
    return role === 'confirm' ? data : undefined;
  }

  /**
   * Write the reviewed decisions, one card at a time. Sequential on purpose: a later card
   * may reference a person an earlier card created (`batchPersonKeys`), and the Firestore
   * writes are cheap enough that the parallelism is not worth the ordering loss.
   */
  private async commit(decisions: VcardImportDecision[], tenantId: string, currentUser: UserModel | undefined): Promise<VcardImportResult> {
    const result: VcardImportResult = { imported: 0, merged: 0, skipped: 0, failed: 0, failures: [] };
    // normalized display name -> okey of the person/org this run created (or merged into).
    // buildDecisions leaves `relations[].personKey` empty for a name that only exists
    // later in the same file — this map is what closes that gap at commit time (§5.4).
    const batchPersonKeys = new Map<string, string>();
    const batchOrgKeys = new Map<string, string>();

    for (const decision of decisions) {
      const draft = decision.draft;
      try {
        if (decision.action === 'skip') {
          result.skipped++;
          continue;
        }
        if (decision.action === 'merge') {
          const key = await this.mergeInto(decision, tenantId, currentUser);
          if (key) batchPersonKeys.set(normalizeName(draft.displayName), key);
          result.merged++;
          continue;
        }

        const key = await this.createSubject(draft, currentUser);
        if (!key) throw new Error('create returned no key');
        // register immediately: the very next card may relate to this one by name
        if (draft.kind === 'org') batchOrgKeys.set(normalizeName(draft.org?.name ?? draft.displayName), key);
        else batchPersonKeys.set(normalizeName(draft.displayName), key);

        await this.writeAddresses(draft.addresses, `${draft.kind}.${key}`, currentUser);
        const warning = await this.writeAvatar(draft, key, tenantId);
        if (warning) result.failures.push(warning);

        if (draft.kind === 'person') {
          await this.writeEmployment(decision, key, tenantId, batchOrgKeys, currentUser);
          await this.writeRelations(decision, key, tenantId, batchPersonKeys, currentUser);
        }
        result.imported++;
      } catch (e) {
        console.error('VcardImportService.commit failed for', draft.displayName, e);
        result.failed++;
        result.failures.push(`${draft.displayName} (${draft.sourceFileName}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return result;
  }

  /** Create the person (dob/dod go into the vault through PersonService) or the org. Returns the new okey. */
  private async createSubject(draft: VcardImportDraft, currentUser: UserModel | undefined): Promise<string | undefined> {
    if (draft.kind === 'org') {
      if (!draft.org) return undefined;
      return this.orgService.create(draft.org, currentUser);
    }
    if (!draft.person) return undefined;
    draft.person.notes = draft.notes;
    // dob/dod are NEVER written as a hand-rolled address: PersonService puts them into the
    // addresses vault itself (privacy 1.19 Phase 4). ssn is never imported at all.
    return this.personService.create(draft.person, currentUser, { dob: draft.dob || undefined, dod: draft.dod || undefined });
  }

  private async writeAddresses(addresses: AddressModel[], parentKey: string, currentUser: UserModel | undefined): Promise<void> {
    for (const address of addresses) {
      address.parentKey = parentKey; // the PREFIXED form, 'person.<okey>' / 'org.<okey>'
      await this.addressService.create(address, currentUser);
    }
  }

  /**
   * Merge a duplicate: add only the addresses the existing person does not already carry,
   * fill an empty dob, set an avatar only when there is none, and append the import notes.
   * Never overwrites what is already there — an import is additive by definition.
   */
  private async mergeInto(decision: VcardImportDecision, tenantId: string, currentUser: UserModel | undefined): Promise<string | undefined> {
    const draft = decision.draft;
    const existing = decision.duplicates[0];
    if (!existing) throw new Error('merge without a duplicate');
    const parentKey = `person.${existing.okey}`;

    const current = await this.firestoreService.getDataOnce<AddressModel>(
      AddressCollection,
      [...getSystemQuery(tenantId), { key: 'parentKey', operator: '==', value: parentKey }],
      'none',
    );
    const known = new Set((current ?? []).map((a) => addressIdentity(a)));
    for (const address of draft.addresses) {
      if (known.has(addressIdentity(address))) continue;
      address.parentKey = parentKey;
      address.isFavorite = false; // never displace the existing favorite of a channel
      await this.addressService.create(address, currentUser);
      known.add(addressIdentity(address));
    }

    // only fill an EMPTY dob — the vault value already there was entered deliberately
    if (draft.dob && !(current ?? []).some((a) => a.addressChannel === 'dob' && !!a.dob)) {
      await this.personService.syncSensitiveChannels(existing.okey, { dob: draft.dob }, currentUser);
    }

    const person = await firstValueFrom(this.personService.read(existing.okey));
    if (person) {
      person.notes = appendImportNotes(person.notes ?? '', importNotesOf(draft, this.importDateViewDate));
      await this.personService.update(person, currentUser);
    }

    const avatar = await firstValueFrom(this.avatarService.read(parentKey));
    if (!avatar?.storagePath) await this.writeAvatar(draft, existing.okey, tenantId);

    return existing.okey;
  }

  /**
   * Upload the inline PHOTO/LOGO and point the avatar doc at it. Has its own try/catch:
   * a photo that fails to decode or upload degrades the card to a warning, it never fails it.
   * Returns the warning text, or undefined on success/no photo.
   */
  private async writeAvatar(draft: VcardImportDraft, key: string, tenantId: string): Promise<string | undefined> {
    if (!draft.photoBase64) return undefined;
    try {
      const { mime, ext } = photoMime(draft.photoBase64);
      const blob = base64ToBlob(draft.photoBase64, mime);
      const avatar = newAvatarModel([tenantId], draft.kind, key, `vcard-import.${ext}`);
      const file = new File([blob], `vcard-import.${ext}`, { type: mime });
      const url = await this.uploadService.uploadFile(file, avatar.storagePath, AVATAR_UPLOAD_TITLE);
      if (!url) return `${draft.displayName}: Bild konnte nicht hochgeladen werden.`;
      await this.avatarService.updateOrCreate(avatar);
      return undefined;
    } catch (e) {
      console.error('VcardImportService.writeAvatar failed for', draft.displayName, e);
      return `${draft.displayName}: Bild konnte nicht importiert werden.`;
    }
  }

  /**
   * Link the person to their employer. The org key is the operator's pick, else an org this
   * same batch created under that name, else a newly created org when the operator asked for
   * one — and otherwise the edge is skipped rather than guessed.
   */
  private async writeEmployment(
    decision: VcardImportDecision,
    personKey: string,
    tenantId: string,
    batchOrgKeys: Map<string, string>,
    currentUser: UserModel | undefined,
  ): Promise<void> {
    const employment = decision.draft.employment;
    if (!employment) return;

    let orgKey = decision.employerKey || batchOrgKeys.get(normalizeName(employment.orgName)) || '';
    if (!orgKey && decision.createEmployer) {
      const org = new OrgModel(tenantId);
      org.name = employment.orgName;
      orgKey = (await this.orgService.create(org, currentUser)) ?? '';
      if (orgKey) batchOrgKeys.set(normalizeName(employment.orgName), orgKey);
    }
    if (!orgKey) return;

    const workrel = new WorkrelModel(tenantId);
    workrel.subjectKey = personKey;
    workrel.subjectModelType = 'person';
    workrel.subjectName1 = decision.draft.person?.lastName ?? '';
    workrel.subjectName2 = decision.draft.person?.firstName ?? '';
    workrel.objectKey = orgKey;
    workrel.objectName = employment.orgName;
    workrel.label = employment.title || employment.role;
    workrel.name = workrel.label || employment.department;
    await this.workrelService.create(workrel, currentUser);
  }

  /**
   * Link the person to the RELATED-NAMES of their card: the operator's pick, else a person
   * this same batch already created, else a person created now when the operator ticked
   * "create" — and otherwise the edge is skipped.
   */
  private async writeRelations(
    decision: VcardImportDecision,
    personKey: string,
    tenantId: string,
    batchPersonKeys: Map<string, string>,
    currentUser: UserModel | undefined,
  ): Promise<void> {
    for (const relation of decision.relations) {
      const names = splitPersonName(relation.name);
      let objectKey = relation.personKey || batchPersonKeys.get(normalizeName(relation.name)) || '';
      if (!objectKey && relation.createPerson) {
        const person = new PersonModel(tenantId);
        person.firstName = names.firstName;
        person.lastName = names.lastName;
        objectKey = (await this.personService.create(person, currentUser)) ?? '';
        if (objectKey) batchPersonKeys.set(normalizeName(relation.name), objectKey);
      }
      if (!objectKey) continue;

      const rel = new PersonalRelModel(tenantId);
      rel.subjectKey = personKey;
      rel.subjectFirstName = decision.draft.person?.firstName ?? '';
      rel.subjectLastName = decision.draft.person?.lastName ?? '';
      rel.objectKey = objectKey;
      rel.objectFirstName = names.firstName;
      rel.objectLastName = names.lastName;
      rel.label = relation.label;
      await this.personalRelService.create(rel, currentUser);
    }
  }
}
