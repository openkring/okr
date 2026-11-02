import { describe, expect, it } from 'vitest';

import { isCompleteJsSettings, JS_USER_GROUPS, jsMainSportCategories } from './js-durations';

describe('jsMainSportCategories', () => {
  it('NG 1 knows only Abs. 1, NG 2 only Abs. 2', () => {
    expect(jsMainSportCategories('1')).toEqual(['abs1']);
    expect(jsMainSportCategories('2')).toEqual(['abs2']);
  });

  it('NG 4 and NG 5 know both', () => {
    expect(jsMainSportCategories('4')).toEqual(['abs1', 'abs2']);
    expect(jsMainSportCategories('5')).toEqual(['abs1', 'abs2']);
  });

  it('an unknown or missing user group offers nothing', () => {
    expect(jsMainSportCategories('3')).toEqual([]);
    expect(jsMainSportCategories(undefined)).toEqual([]);
  });

  it('offers exactly the pairs isCompleteJsSettings accepts', () => {
    for (const userGroup of JS_USER_GROUPS) {
      for (const mainSportCategory of ['abs1', 'abs2'] as const) {
        expect(jsMainSportCategories(userGroup).includes(mainSportCategory)).toBe(isCompleteJsSettings({ userGroup, mainSportCategory }));
      }
    }
  });
});
