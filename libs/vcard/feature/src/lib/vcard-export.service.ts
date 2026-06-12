import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ModalController } from '@ionic/angular/standalone';

import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
import {
  AddressCollection,
  AddressModel,
  AvatarCollection,
  AvatarModel,
  PersonalRelCollection,
  Roles,
  WorkrelCollection,
} from '@bk2/shared-models';
import {
  ExportScope,
  resolveVcardCapability,
  ScopeAvailability,
  VcardChannelType,
  VcardExportRequest,
  VcardExportResponse,
  VcardI18n,
  VCARD_I18N_KEYS,
  VcardTargetKind,
} from '@bk2/vcard-util';

import { downloadVcfResponse } from './download.util';
import { VcardExportScopeModal } from './vcard-export-scope.modal';

const REGION = 'europe-west6';
const CHANNEL_ORDER: VcardChannelType[] = ['phone', 'email', 'postal', 'web'];

/** Minimal info a caller passes about the export target. */
export interface VcardExportTarget {
  bkey: string;
  displayName: string;
  /** person only — StoreDate (yyyyMMdd); used to decide the birthday toggle */
  dateOfBirth?: string;
}

function mapChannel(addressChannel: string | undefined): VcardChannelType | undefined {
  switch (addressChannel) {
    case 'email':
    case 'phone':
    case 'postal':
    case 'web':
      return addressChannel;
    default:
      return undefined;
  }
}

function channelHasValue(a: AddressModel, channel: VcardChannelType): boolean {
  switch (channel) {
    case 'email':
      return !!a.email;
    case 'phone':
      return !!a.phone;
    case 'web':
      return !!a.url;
    case 'postal':
      return !!(a.streetName || a.city || a.zipCode);
  }
}

/**
 * Client orchestration for the vCard export (spec §6/§8). The single method
 * person/org stores call: resolves the caller's capability, (tier 2) gathers data
 * availability and opens the scope modal, invokes the `vcardExport` callable and
 * triggers the `.vcf` download. Scope is re-enforced server-side regardless.
 */
@Injectable({ providedIn: 'root' })
export class VcardExportService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly modalController = inject(ModalController);
  private readonly alertService = inject(AlertService);
  private readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;
  private readonly functions = getFunctions(getApp(), REGION);

  public async exportSingle(target: VcardExportTarget, kind: VcardTargetKind, roles: Roles | undefined, tenantId: string): Promise<void> {
    const cap = resolveVcardCapability(roles, 1);
    if (!cap.allowed) {
      this.alertService.error(this.i18n.not_allowed());
      return;
    }

    let scope: ExportScope;
    if (cap.promptForScope) {
      const availability = await this.gatherAvailability(target, kind);
      const chosen = await this.openScopeModal(availability, kind);
      if (!chosen) return; // cancelled
      scope = chosen;
    } else {
      // tier 1: favorites of every channel — the callable forces favorites-only anyway
      scope = { identity: true, addresses: [...CHANNEL_ORDER], birthday: false, photo: false, workRels: false, personalRels: false, orgLinks: false };
    }

    try {
      const fn = httpsCallable<VcardExportRequest, VcardExportResponse>(this.functions, 'vcardExport');
      const res = await fn({ tenantId, targetIds: [target.bkey], targetKind: kind, scope });
      downloadVcfResponse(res.data);
      await this.alertService.showToast(this.i18n.export_conf());
    } catch (e) {
      console.error('VcardExportService.exportSingle failed', e);
      this.alertService.error(this.i18n.export_error());
    }
  }

  private async gatherAvailability(target: VcardExportTarget, kind: VcardTargetKind): Promise<ScopeAvailability> {
    const subjectKey = `${kind}.${target.bkey}`;
    const [addresses, avatar] = await Promise.all([
      firstValueFrom(this.firestoreService.searchData<AddressModel>(AddressCollection, [{ key: 'parentKey', operator: '==', value: subjectKey }], 'none')),
      firstValueFrom(this.firestoreService.readModel<AvatarModel>(AvatarCollection, subjectKey)),
    ]);

    const channelSet = new Set<VcardChannelType>();
    for (const a of addresses ?? []) {
      const c = mapChannel(a.addressChannel);
      if (c && channelHasValue(a, c)) channelSet.add(c);
    }

    let workRels = false;
    let personalRels = false;
    if (kind === 'person') {
      const [work, relsAsSubject, relsAsObject] = await Promise.all([
        firstValueFrom(this.firestoreService.searchData<unknown>(WorkrelCollection, [{ key: 'subjectKey', operator: '==', value: target.bkey }], 'none')),
        firstValueFrom(this.firestoreService.searchData<unknown>(PersonalRelCollection, [{ key: 'subjectKey', operator: '==', value: target.bkey }], 'none')),
        firstValueFrom(this.firestoreService.searchData<unknown>(PersonalRelCollection, [{ key: 'objectKey', operator: '==', value: target.bkey }], 'none')),
      ]);
      workRels = (work ?? []).length > 0;
      personalRels = (relsAsSubject ?? []).length + (relsAsObject ?? []).length > 0;
    } else {
      const work = await firstValueFrom(this.firestoreService.searchData<unknown>(WorkrelCollection, [{ key: 'objectKey', operator: '==', value: target.bkey }], 'none'));
      workRels = (work ?? []).length > 0;
    }

    return {
      addresses: CHANNEL_ORDER.filter((c) => channelSet.has(c)),
      birthday: kind === 'person' && !!target.dateOfBirth && target.dateOfBirth.length > 0,
      photo: !!avatar?.storagePath,
      workRels,
      personalRels,
      orgLinks: false,
    };
  }

  private async openScopeModal(availability: ScopeAvailability, kind: VcardTargetKind): Promise<ExportScope | undefined> {
    const modal = await this.modalController.create({
      component: VcardExportScopeModal,
      componentProps: { availability, kind },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<ExportScope>();
    return role === 'confirm' ? data : undefined;
  }
}
