import type { ModalController } from '@ionic/angular';

import type { ArticleSection, CategoryListModel, UserModel } from '@okr/shared-models';

export interface ArticleEditorOptions { isNew: boolean; currentUser?: UserModel; roles: CategoryListModel; states: CategoryListModel; tagModel: string }

/**
 * Opens the article editor (spec 1.175 §7.1). The editor saves by itself; callers only reload.
 * @param section the section as it was read; for a new one with the key it will get
 * @returns the key of the saved section (of the tenant's own copy, if one was made); undefined when nothing was saved, also in trial mode
 */
export async function openArticleEditor(modalController: ModalController, section: ArticleSection, options: ArticleEditorOptions): Promise<string | undefined> {
  // dynamic: the editor and ProseMirror are in no chunk that readers load (see section-editor.loader.ts)
  const { ArticleEditorModal } = await import('./article-editor.modal');
  let savedKey: string | undefined;
  const modal = await modalController.create({
    component: ArticleEditorModal,
    cssClass: 'modal-fullscreen',
    // not the data of the dismissal: it may be closed after a save, with the close icon
    componentProps: { section, ...options, onSaved: (key: string): void => { savedKey = key; } },
  });
  await modal.present();
  await modal.onWillDismiss();
  return savedKey;
}
