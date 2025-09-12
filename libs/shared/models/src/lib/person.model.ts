import { AddressableModel, BkModel, SearchableModel, TaggedModel } from './base.model';
import { GenderType } from './enums/gender-type.enum';

export class PersonModel implements BkModel, AddressableModel, SearchableModel, TaggedModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public notes = '';
  public firstName = '';
  public lastName = '';
  public gender = GenderType.Male;
  public ssnId = ''; // social security number, in Switzerland: AHV Number
  public dateOfBirth = '';
  public dateOfDeath = '';
  public fav_email = '';
  public fav_phone = '';
  public fav_street = '';
  public fav_zip = '';
  public fav_city = '';
  public fav_country = '';
  public bexioId = '';

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const PersonCollection = 'persons';
