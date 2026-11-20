import { inject, Injectable } from '@angular/core';

import { AppStore } from '@okr/shared-feature';
import { AvatarService } from '@okr/avatar-data-access';
import { getFullName } from '@okr/shared-util-core';
import { ContactDetails, ContactParty, getContactAddressLines } from '@okr/cms-section-util';

/** imgix crops: a portrait centred on the face, a logo kept whole. */
const PERSON_IMGIX = 'w=400&h=400&fit=crop&crop=faces';
const ORG_IMGIX = 'w=400&h=400&fit=max';

/**
 * Resolves the organization and contact person of a contact section into display-ready data.
 *
 * Contact data comes ONLY from the `address-directory` projection (privacy spec 1.19): the
 * section never stores an address, email or phone, and every viewer sees exactly what the
 * projection lets them see. Call it inside a `computed` — the store and the avatar cache are
 * signals, so the result follows live edits.
 */
@Injectable({ providedIn: 'root' })
export class ContactDetailsService {
  private readonly appStore = inject(AppStore);
  private readonly avatarService = inject(AvatarService);

  public resolve(orgKey: string | undefined, personKey: string | undefined): ContactDetails {
    return {
      org: orgKey ? this.resolveOrg(orgKey) : undefined,
      person: personKey ? this.resolvePerson(personKey) : undefined,
    };
  }

  private resolveOrg(key: string): ContactParty | undefined {
    const org = this.appStore.getOrg(key);
    if (!org) return undefined;
    return this.party(key, 'org', org.name ?? '', '', '', ORG_IMGIX);
  }

  private resolvePerson(key: string): ContactParty | undefined {
    const person = this.appStore.getPerson(key);
    if (!person) return undefined;
    const name = getFullName(person.firstName, person.lastName);
    return this.party(key, 'person', name, person.firstName ?? '', person.lastName ?? '', PERSON_IMGIX);
  }

  private party(key: string, modelType: 'org' | 'person', name: string, firstName: string, lastName: string, imgix: string): ContactParty {
    const avatarKey = `${modelType}.${key}`;
    const directory = this.appStore.getDirectoryEntry(avatarKey);
    // an empty url when there is no picture, so the layout can leave the block out
    const imageUrl = this.avatarService.getCachedStoragePath(avatarKey)
      ? this.avatarService.getAvatarUrlWithParams(avatarKey, modelType, imgix)
      : '';
    return {
      key, avatarKey, name, firstName, lastName, imageUrl,
      addressLines: getContactAddressLines(directory?.entries),
      email: directory?.favEmail ?? '',
      phone: directory?.favPhone ?? '',
    };
  }
}
