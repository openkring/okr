import { NameDisplay, PersonSortCriteria } from "@okr/shared-models";
import { getFullName } from "./convert.util";
import { compareNumbers, compareWords } from "./type.util";

export enum SortDirection {
  Ascending = -1,
  Undefined = 0,
  Descending = 1
}

// a sort field must be a field in a model
export enum SortField {
  // base
  Undefined = 'undefined',
  Name = 'name',
  Category = 'category',    // number; i.e. gender

  // subject
  DateOfBirth = 'dateOfBirth',
  DateOfDeath = 'dateOfDeath',
  ZipCode = 'zipCode',
  FirstName = 'firstName',

  // user
  LoginEmail = 'loginEmail',

  // resource
  SubType = 'subType',        // number
  Load = 'load',
  Weight = 'weight',    // number         
  CurrentValue = 'currentValue',      // number

  // relationship
  // subType as in Resource
  SubjectCategory = 'subjectCategory',    // number
  SubjectKey = 'subjectKey',
  SubjectName = 'subjectName',
  SubjectName2 = 'subjectName2',
  SubjectType = 'subjectType',    // number
  State = 'state',          // number
  ValidFrom = 'validFrom',    // dateOfEntry, dateOfFoundation
  ValidTo = 'validTo',      // dateOfExit, dateOfLiquidation
  Priority  = 'priority',   // number
  Count = 'count',          // string!
  ObjectCategory = 'objectCategory',    // number
  ObjectKey = 'objectKey',
  ObjectName = 'objectName',
  ObjectName2 = 'objectName2',
  ObjectType = 'objectType',      // number
  Price = 'price',              // number

  // document
  Extension = 'extension',
  DateOfDocCreation = 'dateOfDocCreation',
  DateOfDocLastUpdate = 'dateOfDocLastUpdate',

  // invoicePosition
  Amount = 'amount',      // number
  Year = 'year',          // number
}

// tbd: derived fields such as age can not yet be sorted.


export interface SortCriteria {
  field: SortField;
  direction: SortDirection;
  typeIsString: boolean;
}

export function isSortFieldString(sortField: SortField): boolean {
  switch (sortField) {
    case SortField.Category:
    case SortField.SubType:
    case SortField.Weight:
    case SortField.CurrentValue:
    case SortField.SubjectCategory:
    case SortField.SubjectType:
    case SortField.State:
    case SortField.Priority:
    case SortField.ObjectCategory:
    case SortField.ObjectType:
    case SortField.Price:
    case SortField.Amount:
    case SortField.Year:
      return false;
    default:
      return true;
  }
}

export function resetSortCriteria(): SortCriteria {
  return {field: SortField.Undefined, direction: SortDirection.Undefined, typeIsString: true};
} 

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sortAscending(items: any[], column: string, typeIsString = true) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...items.sort(function(a:any,b:any){
      if (typeIsString) {
          return compareWords(a[column], b[column]);
      }
      else{
          return compareNumbers(a[column], b[column]);
      }
  })];
}

/** The subset of PersonModel that sortPersons needs; keeps the util usable for any person-like row. */
export interface SortablePerson {
  firstName?: string;
  lastName?: string;
  okey?: string;
}

/**
 * Orders persons by the signed-in user's UserModel.personSortCriteria preference.
 *
 * Sorting is client-side on purpose: the AppStore already streams the full person set, and the
 * Fullname criterion (which follows the user's nameDisplay) has no Firestore-indexable equivalent.
 * Comparison is locale-aware and case-insensitive so German umlauts collate as expected
 * (Äbi before Bay) — compareWords() uppercases instead, which would sort Ä after Z.
 *
 * PersonSortCriteria.DateOfBirth falls through to Lastname: person.dateOfBirth was stripped in
 * privacy 1.19 Phase 4, so a stored legacy preference must still yield a sensible order.
 */
export function sortPersons<T extends SortablePerson>(
  persons: T[],
  criteria: PersonSortCriteria = PersonSortCriteria.Lastname,
  nameDisplay: NameDisplay = NameDisplay.FirstLast,
): T[] {
  const compare = (a?: string, b?: string) => (a ?? '').localeCompare(b ?? '', 'de', { sensitivity: 'base' });
  return [...persons].sort((a, b) => {
    switch (criteria) {
      case PersonSortCriteria.Firstname:
        return compare(a.firstName, b.firstName) || compare(a.lastName, b.lastName);
      case PersonSortCriteria.Fullname:
        return compare(getFullName(a.firstName, a.lastName, nameDisplay), getFullName(b.firstName, b.lastName, nameDisplay))
          || compare(a.okey, b.okey);
      case PersonSortCriteria.Key:
        return compare(a.okey, b.okey);
      case PersonSortCriteria.Lastname:
      default:
        return compare(a.lastName, b.lastName) || compare(a.firstName, b.firstName);
    }
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sortDescending(items: any[], column: string, typeIsString = true) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...items.sort(function(a:any,b:any){
      if (typeIsString) {
          return compareWords(b[column], a[column]);
      }
      else{
          return compareNumbers(b[column], a[column]);
      }
  })];
}
