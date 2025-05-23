import { AccountType, AllCategories, CategoryModel, GenderType, MembershipModel, ModelType, OrgType, OwnershipModel, ResourceType } from '@bk2/shared/models';
import { die, getProperty } from '@bk2/shared/util';

/**
 * Return a Category based on its id.
 * BEWARE: categoryId can be explicit as defined in the enum or AllCategories (99)
 * @param categoryId the id of a category
 * @returns the category represented by the id
 */
export function readCategory(categories: CategoryModel[], categoryId: number): CategoryModel {
  if (categoryId === undefined || categoryId === AllCategories) return newCategoryAll();
  return categories.find(i => i.id === categoryId) || newCategoryAll();
}

export function newCategoryAll(): CategoryModel {
  return {
    id: AllCategories,
    abbreviation: 'ALL',
    name: 'all',
    i18nBase: 'general.category.all',
    icon: 'radio-button-on'
  }
}

export function addCategory(categories: CategoryModel[], category: CategoryModel): CategoryModel[] {
  return [...categories, category];   // clones the array
}

export function addAllCategory(categories: CategoryModel[]): CategoryModel[] {
  return addCategory(categories, newCategoryAll());
}

export function isSystemCategory(category: CategoryModel): boolean {
  return category.id >= AllCategories;
}

export function containsCategory(categories: CategoryModel[], categoryId: number): boolean {
  return categories.find(i => i.id === categoryId) !== undefined;
}

export function countCategories(categories: CategoryModel[]): number {
  return categories.length;
}

export function getCategoryField(categories: CategoryModel[], categoryId: number, fieldName: string): string | number {
  return getProperty(readCategory(categories, categoryId), fieldName as keyof CategoryModel);
}

export function getCategoryStringField(categories: CategoryModel[], categoryId: number, fieldName: string): string {
  const _field = getCategoryField(categories, categoryId, fieldName);
  if (typeof _field !== 'string') die(`category.util/getStringField(): type of field ${fieldName} must be string.`);
  return _field;
}

export function getCategoryNumberField(categories: CategoryModel[], categoryId: number, fieldName: string): number {
  const _field = getCategoryField(categories, categoryId, fieldName);
  if (typeof _field !== 'number') die(`category.util/getNumberField(): type of field ${fieldName} must be number.`);
  return _field;
}

export function getCategoryFullName(categories: CategoryModel[], categoryId: number): string {
  return getCategoryAbbreviation(categories, categoryId) + ': ' + getCategoryName(categories, categoryId);
}

export function getCategoryName(categories: CategoryModel[], categoryId: number): string {
  return getCategoryStringField(categories, categoryId, 'name');
}

export function getCategoryPlaceholder(categories: CategoryModel[], categoryId: number): string {
  return `@${getCategoryStringField(categories, categoryId, 'i18nBase')}.placeholder`;
}

export function getCategoryAbbreviation(categories: CategoryModel[], categoryId: number) {
  return `${getCategoryStringField(categories, categoryId, 'abbreviation')}`;
}

export function getCategoryDescription(categories: CategoryModel[], categoryId: number) {
  return `@${getCategoryStringField(categories, categoryId, 'i18nBase')}.description`;
}

export function getCategoryLabel(categories: CategoryModel[], categoryId: number) {
  return `@${getCategoryStringField(categories, categoryId, 'i18nBase')}.label`;
}

export function getCategoryIcon(categories: CategoryModel[], categoryId: number): string {
  return getCategoryStringField(categories, categoryId, 'icon');
}

export function checkCategoryValue(categoryId: number, categories: CategoryModel[]): string | null {
  if (containsCategory(categories, categoryId)) {
    return null;
  } else {
    return `category is invalid: ${categoryId}`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkNumericEnum(categoryId: number, enumObj: any): string | null {
  if (categoryId in enumObj) return null;
  return `category is invalid: ${categoryId}`;
}

export function getCategoryImage(folderName: string, categoryName: string): string {
  return `assets/${folderName}/${categoryName}.png`;
}

/**
 * Compare two Categories.
 * Return true if they are the same.
 */
export function compareCategories(cat1: CategoryModel, cat2: CategoryModel): boolean {
  return cat1 && cat2 ? cat1.id === cat2.id : cat1 === cat2;
}

/**
 * This method can be used as a compare method in filters.
 * It returns true if the filter criteria (catFilter) is either ALL or matches the given property (catProperty).
 * @param catProperty the category to test
 * @param catFilter the category filter (can be explicit or ALL)
 * @returns true if the categories match
 */
export function categoryMatches(catProperty: number | undefined, catFilter: number | null | undefined): boolean {
  if (catProperty === undefined) return true;
  if (catFilter === null || catFilter === undefined || catFilter === AllCategories) return true;
  return catProperty === catFilter;
}

// memberships
export function memberTypeMatches(membership: MembershipModel, memberType?: GenderType | OrgType | typeof AllCategories): boolean {
  if (!memberType || memberType === AllCategories) return true;
  if (membership.memberModelType === ModelType.Person) {
    return membership.memberType as GenderType === memberType;
  } else {    // org
    return membership.memberType as OrgType === memberType;
  }
}

// resources
export function resourceTypeMatches(ownership: OwnershipModel, resourceType?: ResourceType | AccountType | typeof AllCategories): boolean {
  if (!resourceType || resourceType === AllCategories) return true;
  if (ownership.resourceModelType === ModelType.Resource) {
    return ownership.resourceType as ResourceType === resourceType;
  } else {    // account
    return ownership.resourceType as AccountType === resourceType;
  }
}

// ownerships
export function ownerTypeMatches(ownership: OwnershipModel, selectedModelType: ModelType | typeof AllCategories, selectedGender: GenderType | typeof AllCategories, selectedOrgType: OrgType | typeof AllCategories): boolean {
  if (selectedModelType === AllCategories) return true;
  if (selectedModelType === ModelType.Person) {
    if (ownership.ownerModelType !== ModelType.Person) return false;
    if (selectedGender === AllCategories) return true;
    return ownership.ownerType === selectedGender;
  } else {    // org
    if (ownership.ownerModelType !== ModelType.Org) return false;
    if (selectedOrgType === AllCategories) return true;
    return ownership.ownerType === selectedOrgType;
  }
}

export function yearMatches(storeDate: string, givenYear?: string): boolean {
  if (!storeDate || storeDate.length <= 4) {
    return true;
  }
  if (!givenYear || givenYear.length !== 4) {
    return true;
  }
  return storeDate.startsWith(givenYear);
}

export function stringArrayMatches(strings: string[], givenString?: string): boolean {
  if (strings.length === 0) {
    return true;
  }
  if (!givenString || givenString.length === 0) {
    return true;
  }
  if (givenString === 'all') {
    return true;
  }
  return strings.includes(givenString);
}
