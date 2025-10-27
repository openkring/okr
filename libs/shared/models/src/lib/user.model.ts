import { BkModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarUsage } from './enums/avatar-usage.enum';
import { DeliveryType } from './enums/delivery-type.enum';
import { DefaultLanguage } from './enums/language.enum';
import { NameDisplay } from './enums/name-display.enum';
import { PersonSortCriteria } from './enums/person-sort-criteria.enum';
import { PrivacyUsage } from './enums/privacy-usage.enum';
import { Roles } from './roles';

export class UserModel implements BkModel, TaggedModel, SearchableModel {
  public bkey = '';
  public loginEmail = ''; // Firebase Auth Login Email
  public personKey = ''; // PersonModel.bkey
  public firstName = '';
  public lastName = '';
  public tenants: string[] = []; // user has always exactly one tenant
  public isArchived = false;
  public notes = '';
  public index = '';
  public tags = '';

  // authorization
  public roles: Roles = {};

  // settings
  public useTouchId = false;
  public useFaceId = false;
  public userLanguage = DefaultLanguage;
  public avatarUsage = AvatarUsage.PhotoFirst; // PhotoFirst
  public gravatarEmail = '';
  public nameDisplay = NameDisplay.FirstLast; // FirstLast
  public useDisplayName = false;
  public personSortCriteria = PersonSortCriteria.Lastname; // Lastname
  public newsDelivery = DeliveryType.EmailAttachment; // EmailAttachment
  public invoiceDelivery = DeliveryType.EmailAttachment; // EmailAttachment
  public showArchivedData = false;
  public showDebugInfo = false;
  public showHelpers = true;

  // privacy restrictions
  public usageImages = PrivacyUsage.Public;
  public usageDateOfBirth = PrivacyUsage.Restricted;
  public usagePostalAddress = PrivacyUsage.Restricted;
  public usageEmail = PrivacyUsage.Restricted;
  public usagePhone = PrivacyUsage.Restricted;
  public usageName = PrivacyUsage.Restricted;
  public srvEmail = true;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const UserCollection = 'users3';
