import { computed, inject, Injectable, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { AppStore } from '@bk2/shared-feature';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { AlertService } from '@bk2/shared-util-angular';
import { AddressCollection, AddressModel, OrgModelName, PersonModelName } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import {
  adaptForClient,
  ClientPlan,
  composeOrgAddressLine,
  CopyFormat,
  EmailClient,
  escapeSignatureHtml,
  PROFILE_I18N_KEYS,
  ProfileI18n,
  renderSignature,
  SignatureModel,
} from '@bk2/profile-util';

const IMGIX_BASE = 'https://bkaiser.imgix.net';

/**
 * Client-side assembly + render pipeline + clipboard for the email signature (spec §6.4/§7).
 *
 * Stateless and side-effect-free apart from the clipboard write: the form state lives here
 * as three ephemeral signals, the `SignatureModel` is derived from the current user + default
 * org + the org's postal/web address, and the `ClientPlan` is the same pure pipeline the
 * preview renders. Kept transport-agnostic so it could later be lifted into a Cloud Function.
 */
@Injectable()
export class SignatureService {
  private readonly appStore = inject(AppStore);
  private readonly firestoreService = inject(FirestoreService);
  private readonly alertService = inject(AlertService);
  private readonly i18n = inject(I18nService).translateAll(PROFILE_I18N_KEYS) as ProfileI18n;

  // ephemeral form state (spec §3.2) — nothing is persisted
  public readonly functionLabel = signal('');
  public readonly client = signal<EmailClient>('gmail');
  public readonly format = signal<CopyFormat>('html');

  private readonly defaultOrg = computed(() => this.appStore.defaultOrg());
  private readonly currentPerson = computed(() => this.appStore.currentPerson());
  private readonly tenantId = computed(() => this.appStore.env.tenantId);

  // Resource params key off these stable primitive strings, not the org/person objects:
  // appStore re-emits new person/org object references on every Firestore tick, which would
  // otherwise repeatedly reset the address resources (and flicker the resolved phone/address).
  private readonly orgKey = computed(() => this.defaultOrg()?.bkey ?? '');
  private readonly personKey = computed(() => this.currentPerson()?.bkey ?? '');

  /** The default org's addresses, used to compose the postal address line + logo website link. */
  private readonly orgAddressResource = rxResource({
    params: () => {
      const orgKey = this.orgKey();
      if (!orgKey) return undefined;
      return { orgKey, tenantId: this.tenantId() };
    },
    stream: ({ params }) =>
      this.firestoreService.searchData<AddressModel>(
        AddressCollection,
        [...getSystemQuery(params.tenantId), { key: 'parentKey', operator: '==', value: `${OrgModelName}.${params.orgKey}` }],
        'none',
      ),
  });

  /** The current person's own addresses, used to resolve the live favorite phone number. */
  private readonly personAddressResource = rxResource({
    params: () => {
      const personKey = this.personKey();
      if (!personKey) return undefined;
      return { personKey, tenantId: this.tenantId() };
    },
    stream: ({ params }) =>
      this.firestoreService.searchData<AddressModel>(
        AddressCollection,
        [...getSystemQuery(params.tenantId), { key: 'parentKey', operator: '==', value: `${PersonModelName}.${params.personKey}` }],
        'none',
      ),
  });

  /** Presentation-ready signature inputs, or `null` when no default org/person is available. */
  public readonly model = computed<SignatureModel | null>(() => {
    const person = this.appStore.currentPerson();
    const org = this.defaultOrg();
    if (!person || !org) return null;

    const addresses = this.orgAddressResource.value() ?? [];
    const postal = pickAddress(addresses, 'postal');
    const web = pickAddress(addresses, 'web');
    const addressLine = composeOrgAddressLine(postal?.zipCode || org.favZipCode || '', postal?.city ?? '', postal?.countryCode ?? '');

    // Prefer the live favorite phone address record; the denormalized person.favPhone is a
    // fallback (it can be stale relative to the user's current address records). While the
    // resource is still loading (value === undefined) omit the phone rather than flashing the
    // stale favPhone, so the preview doesn't visibly switch numbers on first load.
    const personAddresses = this.personAddressResource.value();
    const phone =
      personAddresses === undefined
        ? undefined
        : pickAddress(personAddresses, 'phone')?.phone || person.favPhone || undefined;

    return {
      person: {
        displayName: `${person.firstName} ${person.lastName}`.trim(),
        functionLabel: this.functionLabel().trim() || undefined,
        phoneE164: phone,
        email: person.favEmail || undefined,
      },
      org: {
        name: org.name,
        addressLine,
        websiteUrl: web?.url || undefined,
        logoUrl: `${IMGIX_BASE}/tenant/${this.tenantId()}/logo/google-touch-icon.png?w=50&h=50&fit=clip&dpr=2`,
      },
    };
  });

  /** The client-adapted plan (hardened HTML + text + recommended format + install guide). */
  public readonly plan = computed<ClientPlan | null>(() => {
    const m = this.model();
    return m ? adaptForClient(renderSignature(m), this.client(), this.i18n) : null;
  });

  /** Sandboxed-iframe document: the signature on a neutral light background (spec §6 step 4). */
  public readonly previewHtml = computed(() => {
    const p = this.plan();
    if (!p) return '';
    const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>`;
    // 'text-only' previews the plain-text signature exactly as it will be copied,
    // rendered in a <pre> so its line breaks/spacing are preserved verbatim.
    const body =
      this.format() === 'text-only'
        ? `<pre style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#1a1a1a;white-space:pre-wrap;">${escapeSignatureHtml(p.text)}</pre>`
        : p.html;
    return `${head}<body style="margin:12px;background:#ffffff;">${body}</body></html>`;
  });

  /** Copy in the selected format, adapted for the selected client (spec §6.3). */
  public async copy(): Promise<void> {
    const p = this.plan();
    if (!p) return;
    try {
      if (this.format() === 'raw') {
        // source text → for HTML/source fields and the file-based methods
        await navigator.clipboard.writeText(p.html);
      } else if (this.format() === 'text-only') {
        // the plain-text signature (RFC 3676 `-- ` block), no markup
        await navigator.clipboard.writeText(p.text);
      } else {
        // 'html' → formatted paste; the explicit text/html flavour drives a formatted paste
        // and sidesteps Safari's webarchive-bundle problem.
        const item = new ClipboardItem({
          'text/html': new Blob([p.html], { type: 'text/html' }),
          'text/plain': new Blob([p.text], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      }
      await this.alertService.showToast(this.i18n.sig_copy_success());
    } catch (e) {
      // fallback for engines without ClipboardItem support
      if (this.format() === 'html' && copyHtmlViaExecCommand(p.html)) {
        await this.alertService.showToast(this.i18n.sig_copy_success());
        return;
      }
      console.error('SignatureService.copy failed', e);
      this.alertService.error(this.i18n.sig_copy_error());
    }
  }
}

/** Prefer a favorite address of the given channel, else the first of that channel. */
function pickAddress(addresses: AddressModel[], channel: 'postal' | 'web' | 'phone'): AddressModel | undefined {
  const ofChannel = addresses.filter((a) => a.addressChannel === channel && !a.isArchived);
  return ofChannel.find((a) => a.isFavorite) ?? ofChannel[0];
}

/** Legacy clipboard fallback: paste rendered HTML via a hidden contenteditable + execCommand. */
function copyHtmlViaExecCommand(html: string): boolean {
  try {
    const holder = document.createElement('div');
    holder.contentEditable = 'true';
    holder.style.position = 'fixed';
    holder.style.left = '-9999px';
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const ok = document.execCommand('copy');
    selection?.removeAllRanges();
    document.body.removeChild(holder);
    return ok;
  } catch {
    return false;
  }
}
