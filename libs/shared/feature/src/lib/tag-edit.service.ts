import { inject, Injectable } from '@angular/core';

import { FirestoreService } from '@okr/shared-data-access';
import { OkrModel, TagCollection, TagModel } from '@okr/shared-models';
import { TagEditor } from '@okr/shared-util-angular';
import { hasRole, isOwnedBy, pickForTenant, string2stringArray } from '@okr/shared-util-core';

import { AppStore } from './app.store';

/** A tag definition as it arrives from Firestore (FirestoreService attaches the `okey`). */
export type TagDocument = TagModel & OkrModel;

/**
 * Edits the values of a tag definition (`tags` collection) — for AOC › Tags and, through
 * TAG_EDITOR, for the tag select modal. See the `tag-model` skill for the copy-on-write rule.
 */
@Injectable({ providedIn: 'root' })
export class TagEditService implements TagEditor {
  private readonly appStore = inject(AppStore);
  private readonly firestoreService = inject(FirestoreService);

  public editableModel(allChips: string): string | undefined {
    if (!hasRole('admin', this.appStore.currentUser())) return undefined;
    const wanted = string2stringArray(allChips).join(',');
    const models = [...new Set(this.appStore.allTags().map(tag => tag.tagModel))]
      .filter(model => string2stringArray(this.definition(model)?.tags ?? '').join(',') === wanted);
    // two definitions with the very same values cannot be told apart: offer neither
    return models.length === 1 ? models[0] : undefined;
  }

  public values(tagModel: string): string[] {
    return string2stringArray(this.definition(tagModel)?.tags ?? '');
  }

  public async add(tagModel: string, value: string): Promise<boolean> {
    const tag = this.definition(tagModel);
    const trimmed = value.trim();
    if (!tag || !trimmed) return false;
    const values = this.values(tagModel);
    if (values.includes(trimmed)) return true;
    return !!(await this.saveTags(tag, [...values, trimmed].join(',')));
  }

  public async remove(tagModel: string, value: string): Promise<boolean> {
    const tag = this.definition(tagModel);
    if (!tag) return false;
    return !!(await this.saveTags(tag, this.values(tagModel).filter(v => v !== value).join(',')));
  }

  /**
   * Persists an edited value list — copy-on-write. A definition shared with other tenants is never
   * mutated: the edit is forked into a new document for the current tenant alone, while the tenant
   * leaves the shared one. Only a definition owned by this tenant alone is updated in place.
   * @returns the key of the document that now holds the values, undefined when the write failed
   */
  public async saveTags(tag: TagDocument, tags: string, confirmMessage?: string, errorMessage?: string): Promise<string | undefined> {
    const tenantId = this.appStore.tenantId();
    const key = isOwnedBy(tag, tenantId)
      ? await this.firestoreService.updateModel<TagDocument>(TagCollection, { ...tag, tags }, false, confirmMessage, errorMessage, this.appStore.currentUser())
      : await this.firestoreService.forkModel<TagDocument>(TagCollection, tag, { tags }, errorMessage);
    if (key) this.appStore.reloadTags();
    return key;
  }

  /** The definition of `tagModel` the tenant sees (own beats shared, as AppStore.getTags). */
  private definition(tagModel: string): TagDocument | undefined {
    return pickForTenant<TagDocument>(this.appStore.allTags().filter(tag => tag.tagModel === tagModel) as TagDocument[], this.appStore.tenantId());
  }
}
