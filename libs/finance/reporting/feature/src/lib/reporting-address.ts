import { firstValueFrom, timeout } from 'rxjs';

import { AddressService } from '@okr/subject-address-data-access';
import { stringifyPostalAddress } from '@okr/subject-address-util';

/** A stalled Firestore never answers; the PDF must not wait for it forever. */
const ADDRESS_TIMEOUT_MS = 8_000;

/**
 * The favourite postal address of an org or a person as one line, or '' when it has none / cannot
 * be read. `parentKey` is the prefixed key ('org.<okey>' | 'person.<okey>'), as the books' ownerKey
 * stores it (spec 1.105).
 */
export async function loadOwnerAddressLine(addressService: AddressService, parentKey: string): Promise<string> {
  try {
    const address = await firstValueFrom(addressService.getFavoritePostalAddress(parentKey).pipe(timeout({ first: ADDRESS_TIMEOUT_MS })));
    return address ? stringifyPostalAddress(address, 'de') : '';
  } catch {
    return '';   // the document is still valid without the street line
  }
}
