import { describe, it, expect } from 'vitest';
import { FolderModel } from '@bk2/shared-models';
import { getFolderIndex, getFolderTitle, newFolderModel } from './folder.util';

describe('getFolderTitle', () => {
  it('should return the correct translation key for create', () => {
    expect(getFolderTitle('create')).toBe('folder.operation.create.label');
  });

  it('should return the correct translation key for delete', () => {
    expect(getFolderTitle('delete')).toBe('folder.operation.delete.label');
  });
});

describe('newFolderModel', () => {
  it('should create a folder with the given tenant and name', () => {
    const folder = newFolderModel('tenant1', 'My Folder');
    expect(folder).toBeInstanceOf(FolderModel);
    expect(folder.tenants).toContain('tenant1');
    expect(folder.name).toBe('My Folder');
    expect(folder.title).toBe('My Folder');
  });

  it('should set parentKeys when provided', () => {
    const folder = newFolderModel('tenant1', 'Sub', ['parent1', 'parent2']);
    expect(folder.parents).toEqual(['parent1', 'parent2']);
  });

  it('should default to empty parents when not provided', () => {
    const folder = newFolderModel('tenant1');
    expect(folder.parents).toEqual([]);
  });
});

describe('getFolderIndex', () => {
  it('should include name in the index', () => {
    const folder = newFolderModel('tenant1', 'Reports');
    folder.description = 'Annual reports';
    const index = getFolderIndex(folder);
    expect(index).toContain('n:Reports');
    expect(index).toContain('d:Annual reports');
  });
});
