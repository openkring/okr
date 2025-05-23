import { getCategoryStringField } from './category.util';
import { AccountCollection, AddressCollection, AvatarCollection, BillCollection, CalEventCollection, CategoryCollection, CategoryModel, CommentCollection, CompetitionLevelCollection, DocumentCollection, ExpenseCollection, GroupCollection, InvoiceCollection, InvoicePositionCollection, LocationCollection, MembershipCollection, MenuItemCollection, ModelType, OrgCollection, OwnershipCollection, PageCollection, PersonalRelCollection, PersonCollection, ReservationCollection, ResourceCollection, SectionCollection, TaskCollection, TransferCollection, TripCollection, UserCollection, WorkingRelCollection } from '@bk2/shared/models';

export interface ModelTypeCategory extends CategoryModel {
    // use name instead of slug, i.e. for the detail route
    collectionName: string; // name of the database collection
}


// the name of the model, it is also used as the route to the detail page
export function getModelSlug(modelType: ModelType): string {
  return getCategoryStringField(ModelTypes, modelType, 'name');
}

// the name of the database collection
export function getCollectionNameFromModelType(modelType: ModelType): string {
  return getCategoryStringField(ModelTypes, modelType, 'collectionName');
}

export const ModelTypes: ModelTypeCategory[] = [
  {
    id: ModelType.Account,
    abbreviation: 'ACCT',
    name: 'account',
    i18nBase: 'categories.modelType.account',
    icon: 'bank_account',
    collectionName: AccountCollection,
  },
  {
    id: ModelType.Address,
    abbreviation: 'ADDR',
    name: 'address',
    i18nBase: 'categories.modelType.address',
    collectionName: AddressCollection,
    icon: 'address'
  },
  {
    id: ModelType.Avatar,
    abbreviation: 'AVTR',
    name: 'avatar',
    i18nBase: 'categories.modelType.avatar',
    collectionName: AvatarCollection,
    icon: 'person-circle_avatar'
  },
  {
    id: ModelType.Bill,
    abbreviation: 'BILL',
    name: 'bill',
    i18nBase: 'categories.modelType.bill',
    collectionName: BillCollection,
    icon: 'finance_document_invoice_bill'
  },
  {
    id: ModelType.Comment,
    abbreviation: 'CMT',
    name: 'comment',
    i18nBase: 'categories.modelType.comment',
    collectionName: CommentCollection,
    icon: 'chatbox'
  },
  {
    id: ModelType.CompetitionLevel,
    abbreviation: 'CLEVEL',
    name: 'competitionLevel',
    i18nBase: 'categories.modelType.competitionLevel',
    collectionName: CompetitionLevelCollection,
    icon: 'podium'
  },
  {
    id: ModelType.Document,
    abbreviation: 'DOC',
    name: 'document',
    i18nBase: 'categories.modelType.document',
    collectionName: DocumentCollection,
    icon: 'document'
  },
  {
    id: ModelType.CalEvent,
    abbreviation: 'CAEV',
    name: 'calevent',
    i18nBase: 'categories.modelType.calEvent',
    collectionName: CalEventCollection,
    icon: 'calendar-number'
  },
  {
    id: ModelType.Expense,
    abbreviation: 'EXPS',
    name: 'expense',
    i18nBase: 'categories.modelType.expense',
    collectionName: ExpenseCollection,
    icon: 'finance_cash_note'
  },
  {
    id: ModelType.Invoice,
    abbreviation: 'INVC',
    name: 'invoice',
    i18nBase: 'categories.modelType.invoice',
    collectionName: InvoiceCollection,
    icon: 'finance_document_invoice_bill'
  },
  {
    id: ModelType.InvoicePosition,
    abbreviation: 'INVP',
    name: 'invoicePosition',
    i18nBase: 'categories.modelType.invoicePosition',
    collectionName: InvoicePositionCollection,
    icon: 'finance_invoice-position_check'
  },
  {
    id: ModelType.Location,
    abbreviation: 'LOC',
    name: 'location',
    i18nBase: 'categories.modelType.location',
    collectionName: LocationCollection,
    icon: 'location'
  },
  {
    id: ModelType.Membership,
    abbreviation: 'MBRS',
    name: 'membership',
    i18nBase: 'categories.modelType.membership',
    collectionName: MembershipCollection,
    icon: 'membership'
  },
  {
    id: ModelType.MenuItem,
    abbreviation: 'MENU',
    name: 'menuitem',
    i18nBase: 'categories.modelType.menuItem',
    collectionName: MenuItemCollection,
    icon: 'menu'
  },
  {
    id: ModelType.Org,
    abbreviation: 'ORG',
    name: 'org',
    i18nBase: 'categories.modelType.org',
    collectionName: OrgCollection,
    icon: 'org'
  },
  {
    id: ModelType.Ownership,
    abbreviation: 'OWNS',
    name: 'ownership',
    i18nBase: 'categories.modelType.ownership',
    collectionName: OwnershipCollection,
    icon: 'ownership'
  },
  {
    id: ModelType.Page,
    abbreviation: 'PAGE',
    name: 'page',
    i18nBase: 'categories.modelType.page',
    collectionName: PageCollection,
    icon: 'newspager_page'
  },
  {
    id: ModelType.Person,
    abbreviation: 'PERS',
    name: 'person',
    i18nBase: 'categories.modelType.person',
    collectionName: PersonCollection,
    icon: 'person',
  },
  {
    id: ModelType.PersonalRel,
    abbreviation: 'PREL',
    name: 'personalrel',
    i18nBase: 'categories.modelType.personalRel',
    collectionName: PersonalRelCollection,
    icon: 'personal-rel',
  },
  {
    id: ModelType.Reservation,
    abbreviation: 'RESV',
    name: 'reservation',
    i18nBase: 'categories.modelType.reservation',
    collectionName: ReservationCollection,
    icon: 'reservation',
  },
  {
    id: ModelType.Resource,
    abbreviation: 'RESO',
    name: 'resource',
    i18nBase: 'categories.modelType.resource',
    collectionName: ResourceCollection,
    icon: 'resource'
  },
  {
    id: ModelType.Section,
    abbreviation: 'SECT',
    name: 'section',
    i18nBase: 'categories.modelType.section',
    collectionName: SectionCollection,
    icon: 'section'
  },
  {
    id: ModelType.Task,
    abbreviation: 'TASK',
    name: 'task',
    i18nBase: 'categories.modelType.task',
    collectionName: TaskCollection,
    icon: 'todo'
  },
  {
    id: ModelType.Transfer,
    abbreviation: 'TRSF',
    name: 'transfer',
    i18nBase: 'categories.modelType.transfer',
    collectionName: TransferCollection,
    icon: 'finance_money-transfer'
  },
  {
    id: ModelType.Trip,
    abbreviation: 'TRIP',
    name: 'trip',
    i18nBase: 'categories.modelType.trip',
    collectionName:  TripCollection,
    icon: 'airplane'
  },
  {
    id: ModelType.User,
    abbreviation: 'USER',
    name: 'user',
    i18nBase: 'categories.modelType.user',
    collectionName: UserCollection,
    icon: 'person-circle_avatar'
  },
  {
    id: ModelType.WorkingRel,
    abbreviation: 'WREL',
    name: 'workingrel',
    i18nBase: 'categories.modelType.workingRel',
    collectionName:  WorkingRelCollection,
    icon: 'working-rel'
  },
  {
    id: ModelType.Category,
    abbreviation: 'CAT',
    name: 'category',
    i18nBase: 'categories.modelType.category',
    collectionName:  CategoryCollection,
    icon: 'grid'
  },
  {
    id: ModelType.Group,
    abbreviation: 'GRP',
    name: 'group',
    i18nBase: 'categories.modelType.group',
    collectionName:  GroupCollection,
    icon: 'people'
  }
];



