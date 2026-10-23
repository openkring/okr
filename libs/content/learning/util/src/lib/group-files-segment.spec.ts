import { groupFilesSegment, groupLearningPageKey } from './learning-room';

const page = (over: Record<string, unknown> = {}) => ({
  okey: groupLearningPageKey('g1'), type: 'learning', isArchived: false, tenants: ['scs'], ...over,
});

describe('groupFilesSegment', () => {
  it('no learning page → document list', () => {
    expect(groupFilesSegment(null, 'g1', 'scs')).toBe('documents');
  });

  it('still loading → pending', () => {
    expect(groupFilesSegment(undefined, 'g1', 'scs')).toBe('pending');
  });

  it('live learning page of the tenant → learning room', () => {
    expect(groupFilesSegment(page(), 'g1', 'scs')).toBe('learning');
  });

  it('archived learning page → document list', () => {
    expect(groupFilesSegment(page({ isArchived: true }), 'g1', 'scs')).toBe('documents');
  });

  it('a page of another type under the key → document list', () => {
    expect(groupFilesSegment(page({ type: 'content' }), 'g1', 'scs')).toBe('documents');
  });

  it('a page of another tenant → document list', () => {
    expect(groupFilesSegment(page({ tenants: ['p13'] }), 'g1', 'scs')).toBe('documents');
  });

  it('a page of another group (stale read after a key change) → document list', () => {
    expect(groupFilesSegment(page({ okey: 'g2_learning' }), 'g1', 'scs')).toBe('documents');
  });

  it('no group key → document list', () => {
    expect(groupFilesSegment(page(), '', 'scs')).toBe('documents');
  });
});
