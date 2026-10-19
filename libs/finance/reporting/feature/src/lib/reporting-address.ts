import { firstValueFrom } from 'rxjs';

import { AddressService } from '@okr/subject-address-data-access';
import { stringifyPostalAddress } from '@okr/subject-address-util';

/**
 * The favourite postal address of an org or a person as one line, or '' when it has none / cannot
 * be read. `parentKey` is the prefixed key ('org.<okey>' | 'person.<okey>'), as the books' ownerKey
 * stores it (spec 1.105).
 */
export async function loadOwnerAddressLine(addressService: AddressService, parentKey: string): Promise<string> {
  try {
    const address = await firstValueFrom(addressService.getFavoritePostalAddress(parentKey));
    return address ? stringifyPostalAddress(address, 'de') : '';
  } catch {
    return '';   // the document is still valid without the street line
  }
}
