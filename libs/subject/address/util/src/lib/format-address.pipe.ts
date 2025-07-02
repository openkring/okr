import { Pipe, PipeTransform } from '@angular/core';
import { AddressChannel } from '@bk2/shared/models';
import { formatIban, IbanFormat } from '@bk2/shared/util-angular';

@Pipe({
  name: 'formatAddress',
})
export class FormatAddressPipe implements PipeTransform {

  transform(value: string, address2: string, zipCode: string, city: string, channelType: number): string {
      let _address = value.trim();
      if (channelType === AddressChannel.BankAccount) {
        _address = formatIban(value, IbanFormat.Friendly);
      } else if (channelType === AddressChannel.Postal) {
        _address = this.safelyAppendAddressPart(_address, address2);
        _address = this.safelyAppendAddressPart(_address, zipCode + ' ' + city);
      }
      return _address;
  }

  private safelyAppendAddressPart(address: string, addressPart: string): string {
    if (!addressPart || addressPart.trim().length === 0) {
      return address;
    }
    if (address && address.length > 0) {
      return address + ', ' + addressPart;
    }
    return addressPart;
  }
}

