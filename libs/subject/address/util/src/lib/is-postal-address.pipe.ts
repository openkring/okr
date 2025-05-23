import { Pipe, PipeTransform } from '@angular/core';
import { AddressChannel } from '@bk2/shared/models';

@Pipe({
  name: 'isPostal',
})
export class IsPostalAddressPipe implements PipeTransform {

  transform(addressCategory: number): boolean {
      return (addressCategory === AddressChannel.Postal);
  }
}
