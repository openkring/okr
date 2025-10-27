import { Roles } from './roles';
import { SectionProperties } from './section.model';

// use i18n literals with '@input.NAME.label|placeholder|helper|error'
export type BkFormModel = Partial<{
  abbreviation: string;
  addressChannel: number; // AddressChannel: address: category
  addressChannelIcon: string; // address: url
  addressChannelLabel: string;
  addressUsage: number; // AddressUsage
  addressUsageLabel: string;
  addressValue: string; // address: name
  addressValue2: string;
  amount: number; // invoicePosition: amount
  altText: string;
  area: string;
  assignee: string;
  authorName: string; // comment: name
  authorAvatar: string; // comment: url
  authorId: string;
  avatarUrl: string; // person/competitionLevel: url,
  avatarUsage: number; // AvatarUsage
  bexioId: string;
  boatName: string;
  boatType: number; // BoatType: resource: subType
  boatUsage: number; // BoatUsage
  bkey: string;
  calendarName: string;
  category: number;
  city: string;
  confirmed: boolean;
  content: string;
  count: string;
  countryCode: string;
  color: number; // ColorIonic
  competitionLevel: number; // CompetitionLevel
  creationDate: string;
  creditorName: string;
  creditorAddress: string;
  creditorZipCode: string;
  creditorCity: string;
  creditorCountryCode: string;
  currency: string;
  currentValue: number;
  dateOfBirth: string;
  dateOfDeath: string;
  dateOfDocCreation: string;
  dateOfDocLastUpdate: string;
  dateOfEntry: string;
  dateOfExit: string;
  dateOfFoundation: string;
  dateOfLiquidation: string;
  debtorName: string;
  debtorAddress: string;
  debtorZipCode: string;
  debtorCity: string;
  debtorCountryCode: string;
  description: string;
  dir: string;
  direction: number;
  dueDate: string;
  endDate: string;
  endTime: string;
  email: string;
  extension: string;
  fileName: string;
  firstName: string;
  function: string;
  gender: number; // GenderType: person/competitionLevel: category
  gravatarEmail: string;
  height: number;
  hexColor: string;
  iban: string;
  icon: string;
  imagePosition: number; // ViewPosition
  importance: number; // Importance
  index: string;
  invoiceDelivery: number; // DeliveryType
  isBillable: boolean;
  isCc: boolean;
  isArchived: boolean;
  isFavorite: boolean;
  isValidated: boolean;
  keyName: string;
  keyNr: number;
  label: string;
  lastName: string; // competitionModel: name
  latitude: number;
  load: string;
  loginEmail: string;
  longitude: number;
  locationKey: string;
  locations: string[];
  locationType: number;
  lockerNr: number;
  md5hash: string;
  membershipId: string;
  memberCategory: number;
  memberKey: string;
  memberState: number;
  memberUrl: string;
  menuAction: string;
  menuItems: string[];
  mimeType: string;
  modelType: number; // ModelType
  name: string;
  nameDisplay: number; // NameDisplay
  newsDelivery: number; // DeliveryType
  nickName: string;
  notes: string;
  objectCategory: number;
  objectKey: string;
  objectName: string;
  objectName2: string;
  objectType: number; // ModelType
  objectUrl: string;
  orgFunction: string;
  orgId: string;
  orgName: string;
  orgType: number; // OrgType
  orgUrl: string;
  participants: string;
  password: string;
  placeId: string;
  personKey: string;
  personFirstName: string;
  personLastName: string;
  persons: string[];
  personSortCriteria: number; // PersonSortCriteria
  periodicity: number; // Periodicity
  phone: string;
  priority: number; // Priority
  priorVersionKey: string;
  price: number;
  reference: string;
  relDate: string;
  repeatUntilDate: string;
  resourceKey: string;
  resourceType: number; // ResourceType
  roleNeeded: number; // RoleEnum
  roles: Roles;
  scsMembershipKey: string;
  scsMemberType: number; // ScsMemberType
  showDebugInfo: boolean;
  showTestData: boolean;
  showArchivedData: boolean;
  size: number;
  sectionProperties: SectionProperties;
  speed: number;
  srvMembershipKey: string;
  srvMemberId: string;
  srvMemberType: number; // MemberType
  srvLicenseOwnershipKey: string;
  srvLicenseValidUntil: string;
  srvEmail: boolean;
  ssn: string;
  startDate: string;
  startTime: string;
  state: number;
  street: string;
  subjectKey: string;
  subjectName: string;
  subjectName2: string;
  subjectType: number; // ModelType
  subjectCategory: number;
  subTitle: string;
  subType: number;
  tags: string;
  taskState: number;
  taxId: string;
  tenants: string[];
  title: string;
  thumbUrl: string;
  type: number;
  url: string;
  urgency: number;
  usageImages: number;
  usageDateOfBirth: number;
  usagePostalAddress: number;
  usageEmail: number;
  usagePhone: number;
  usageName: number;
  useDisplayName: boolean;
  useFaceId: boolean;
  useTouchId: boolean;
  userKey: string;
  userLanguage: number; // Language
  validFrom: string;
  validTo: string;
  version: string;
  watchers: string[];
  weight: number;
  what3words: string;
  youtubeId: string;
  zipCode: string;
}>;
