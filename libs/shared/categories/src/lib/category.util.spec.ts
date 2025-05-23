import { AllCategories } from '@bk2/shared/models';
import { addAllCategory, checkCategoryValue, checkNumericEnum, containsCategory, countCategories, getCategoryAbbreviation, getCategoryDescription, getCategoryField, getCategoryFullName, getCategoryIcon, getCategoryName, getCategoryNumberField, getCategoryStringField, isSystemCategory, newCategoryAll, readCategory } from './category.util';

/* ------------------------ read category ------------------------ */
describe('readCategory', () => {
  const categories = [
    { id: 1, name: 'Category 1', abbreviation: 'C1', i18nBase: 'Category 1', icon: 'icon1' },
    { id: 2, name: 'Category 2', abbreviation: 'C2', i18nBase: 'Category 2', icon: 'icon2' },
    { id: 3, name: 'Category 3', abbreviation: 'C3', i18nBase: 'Category 3', icon: 'icon3' }
  ];

  it('should return the "All" category for AllCategories', () => {
    const result = readCategory(categories, AllCategories);
    expect(result.name).toEqual('general.category.all.label');
  });

  it('should return the category with the specified ID', () => {
    const result = readCategory(categories, 2);
    expect(result.name).toEqual('Category 2');
  });

  it('should return the "All" category for unknown IDs', () => {
    const result = readCategory(categories, 999);
    expect(result.name).toEqual('general.category.all.label');
  });
});

  /* ------------------------ createCategory() ------------------------ */

  /* ------------------------ newCategoryAll ------------------------ */
describe('newCategoryAll', () => {
  it('should return a new Category object for "All"', () => {
    const result = newCategoryAll();
    expect(result.id).toEqual(AllCategories);
    expect(result.abbreviation).toEqual('ALL');
    expect(result.name).toEqual('all');
    expect(result.i18nBase).toEqual('general.category.all');
    expect(result.icon).toEqual('radio-button-on');
  });
});

  /* ------------------------ addAllCategory ------------------------ */
describe('addAllCategory', () => {
  const categories = [
    { id: 1, name: 'Category 1', abbreviation: 'C1', i18nBase: 'Category 1', icon: 'icon1' },
    { id: 2, name: 'Category 2', abbreviation: 'C2', i18nBase: 'Category 2', icon: 'icon2' },
  ];

  it('should add a new "All" category to the array', () => {
    const result = addAllCategory(categories);
    expect(result).toContainEqual(expect.objectContaining({ id: expect.any(Number), name: 'All' }));
    expect(result.length).toEqual(3);
  });
});

  /* ------------------------ isSystemCategory ------------------------ */
  describe('isSystemCategory', () => {
    it('should return true for system categories (id < 0 or id >= AllCategories)', () => {
        expect(isSystemCategory(newCategoryAll())).toEqual(true);
    });
  });
  
  /* ------------------------ containsCategory ------------------------ */
  describe('containsCategory', () => {
    const categories = [
      { id: AllCategories, name: 'Undefined', abbreviation: 'C1', i18nBase: 'Category 1', icon: 'icon1' },
    ];
  
    it('should return true if the array contains a category with the specified ID', () => {
      expect(containsCategory(categories, AllCategories)).toBeTruthy();
    });
  });
  
  /* ------------------------ countCategories ------------------------ */
  describe('countCategories', () => {
    it('should return the number of items in the array', () => {
      const categories = [
        { id: 4, name: 'Cat4', abbreviation: 'C4', i18nBase: 'Category 4', icon: 'icon4' },
        { id: 3, name: 'Category 3', abbreviation: 'C3', i18nBase: 'Category 3', icon: 'icon3' }
      ];
  
      expect(countCategories(categories)).toEqual(2);
    });
  });
    
/* ------------------------ getCategoryFieldf ------------------------ */
  describe('getCategoryField', () => {
    const categories = [
      { id: 4, name: 'cat4', abbreviation: 'cat4', i18nBase: '', icon: 'help-circle' },
    ];
  
    it('should return the value of the specified field for the specified category', () => {
      expect(getCategoryField(categories, 4, 'name')).toEqual('cat4');
    });
  });
  
/* ------------------------ getCategoryStringField ------------------------ */
  describe('getCategoryStringField', () => {
    const categories = [
      { id: 4, name: 'cat4', abbreviation: 'cat4', i18nBase: '', icon: 'help-circle' },
    ];
  
    it('should return the value of the specified string field for the specified category', () => {
      expect(getCategoryStringField(categories, 4, 'name')).toEqual('cat4');
    });
  });
  
/* ------------------------ getCategoryNumberField ------------------------ */
  describe('getCategoryNumberField', () => {
    const categories = [
      { id: 4, name: 'cat4', abbreviation: 'cat4', i18nBase: '', icon: 'help-circle' }
    ];
  
    it('should return the value of the specified number field for the specified category', () => {
      expect(getCategoryNumberField(categories, 4, 'id')).toEqual(4);
    });
  });
  
/* ------------------------ getCategoryFullName ------------------------ */
  describe('getCategoryFullName', () => {
    const categories = [
      { id: 4, name: 'cat4name', abbreviation: 'cat4abbr', i18nBase: '', icon: 'help-circle' },
    ];
  
    it('should return the abbreviation and name of the specified category', () => {
      expect(getCategoryFullName(categories, 4)).toEqual('cat4abbr: cat4name');
    });
  });
  
/* ------------------------ getCategoryName ------------------------ */
  describe('getCategoryName', () => {
    const categories = [
      { id: 4, name: 'cat4name', abbreviation: 'cat4abbr', i18nBase: '', icon: 'help-circle' },
      { id: 6, name: 'cat6name', abbreviation: 'cat6abbr', i18nBase: '', icon: 'help-circle' },
    ];
  
    it('should return the name of the specified category', () => {
      expect(getCategoryName(categories, 6)).toEqual('cat6name');
    });
  });
  
/* ------------------------ getCategoryAbbreviation ------------------------ */
  describe('getCategoryAbbreviation', () => {
    const categories = [
      { id: 6, name: 'cat6name', abbreviation: 'cat6abbr', i18nBase: '', icon: 'help-circle' },
      { id: 4, name: 'cat4name', abbreviation: 'cat4abbr', i18nBase: '', icon: 'help-circle' },
  ];
  
    it('should return the translated abbreviation of the specified category', () => {
      expect(getCategoryAbbreviation(categories, 4)).toEqual('cat4abbr');
    });
  });
  
/* ------------------------ getCategoryDescription ------------------------ */
  describe('getCategoryDescription', () => {
    const categories = [
      { id: 2, name: 'cat2name', abbreviation: 'cat2abbr', i18nBase: 'This category is undefined', icon: 'help-circle' }
    ];
  
    it('should return the translated description of the specified category', () => {
      expect(getCategoryDescription(categories, 2)).toEqual('general.category.undefined.description');
    });
  });
  
/* ------------------------ getCategoryIcon ------------------------ */
  describe('getCategoryIcon', () => {
    const categories = [
      { id: 3, name: 'cat3name', abbreviation: 'cat3abbr', i18nBase: '', icon: 'help-circle' },
      { id: 6, name: 'cat6name', abbreviation: 'cat6abbr', i18nBase: '', icon: 'gravatar' },
      { id: 7, name: 'cat7name', abbreviation: 'cat7abbr', i18nBase: '', icon: 'radio-button-on' }
    ];
  
    it('should return the icon of the specified category', () => {
      expect(getCategoryIcon(categories, 6)).toEqual('gravatar');
    });
  });
  
/* ------------------------ checkCategoryValue ------------------------ */
describe('checkCategoryValue', () => {
  const categories = [
    { id: 3, name: 'cat3name', abbreviation: 'cat3abbr', i18nBase: '', icon: 'help-circle' },
    { id: 6, name: 'cat6name', abbreviation: 'cat6abbr', i18nBase: '', icon: 'gravatar' },
    { id: 7, name: 'cat7name', abbreviation: 'cat7abbr', i18nBase: '', icon: 'radio-button-on' }
];

  it('should return null if the specified category is valid', () => {
    expect(checkCategoryValue(6, categories)).toBeNull();
  });

  it('should return an error message if the specified category is invalid', () => {
    expect(checkCategoryValue(1234, categories)).toEqual('category is invalid: 1234');
  });
});

/* ------------------------ checkNumericEnum ------------------------ */
describe('checkNumericEnum', () => {
  const MyEnum = {
    Foo: 1,
    Bar: 2,
  };

  it('should return null if the specified value is a member of the specified numeric enum', () => {
    expect(checkNumericEnum(1, MyEnum)).toEqual('category is invalid: 1');
    expect(checkNumericEnum(2, MyEnum)).toEqual('category is invalid: 2');
  });

  it('should return an error message if the specified value is not a member of the specified numeric enum', () => {
    expect(checkNumericEnum(3, MyEnum)).toEqual('category is invalid: 3');
  });
});

