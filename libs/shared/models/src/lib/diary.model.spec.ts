import { describe, expect, it } from 'vitest';
import { DiaryCollection, DiaryModel, DiaryModelName } from './diary.model';

describe('DiaryModel', () => {
  it('puts the tenant id into the tenants array', () => {
    const model = new DiaryModel('bka');
    expect(model.tenants).toEqual(['bka']);
  });

  it('starts as a draft with an empty weather record', () => {
    const model = new DiaryModel('bka');
    expect(model.status).toBe('draft');
    expect(model.weather).toEqual({ code: -1, min: 0, max: 0, precip: 0, sunrise: '', sunset: '' });
  });

  it('starts with empty collections rather than undefined', () => {
    const model = new DiaryModel('bka');
    expect(model.people).toEqual([]);
    expect(model.customPeopleLabels).toEqual([]);
    expect(model.places).toEqual([]);
    expect(model.events).toEqual([]);
    expect(model.done).toEqual([]);
    expect(model.media).toEqual([]);
  });

  it('names its collection and model type', () => {
    expect(DiaryCollection).toBe('diaries');
    expect(DiaryModelName).toBe('diary');
  });
});
