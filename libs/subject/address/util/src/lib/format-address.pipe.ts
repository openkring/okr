import { Pipe, PipeTransform } from '@angular/core';
import { AddressModel } from '@bk2/shared-models';
import { stringifyAddress } from './address.util';

@Pipe({
  name: 'formatAddress',
  standalone: true
})
export class FormatAddressPipe implements PipeTransform {

  transform(address: AddressModel): string {
    return stringifyAddress(address);
  }
}
