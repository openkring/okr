import { firstValueFrom } from 'rxjs';

import { AddressService } from '@okr/subject-address-data-access';
import { stringifyPostalAddress } from '@okr/subject-address-util';

/** The org's own postal address as one line, or '' when it has none / cannot be read. */
export async function loadOrgAddressLine(addressService: AddressService, orgKey: string): Promise<string> {
  try {
    const address = await firstValueFrom(addressService.getFavoritePostalAddress(`org.${orgKey}`));
    return address ? stringifyPostalAddress(address, 'de') : '';
  } catch {
    return '';   // the document is still valid without the street line
  }
}
