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
