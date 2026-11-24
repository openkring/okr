import type { ErrorHandler } from '@angular/core';
import type { ModalController, ToastController } from '@ionic/angular';

import type { ArticleSection, CategoryListModel, UserModel } from '@okr/shared-models';
import { showToast } from '@okr/shared-util-angular';

/** What the opening needs of the caller. `openFailed`: the message (`SECTION_I18N_KEYS.article_openFailed`). */
export interface ArticleEditorHost { modalController: ModalController; toastController: ToastController; errorHandler: ErrorHandler; openFailed: () => string }

export interface ArticleEditorOptions { isNew: boolean; currentUser?: UserModel; roles: CategoryListModel; states: CategoryListModel; tagModel: string }

/** `closed`: the key of the saved section (of the tenant's own copy, if one was made); undefined when nothing was saved, also in trial mode. */
export interface OpenedArticleEditor { closed: Promise<string | undefined> }

/**
 * Opens the article editor (spec 1.175 §7.1). The editor saves by itself; callers only reload. Answers when the window is shown, so
 * that a caller who ignores presses meanwhile does not depend on `closed`. Never rejects: a failed opening is told and undefined.
 * @param section the section as it was read; for a new one with the key it will get
 */
export async function openArticleEditor(host: ArticleEditorHost, section: ArticleSection, options: ArticleEditorOptions): Promise<OpenedArticleEditor | undefined> {
  try {
    // dynamic: the editor and ProseMirror are in no chunk that readers load (see section-editor.loader.ts)
    const { ArticleEditorModal } = await import('./article-editor.modal');
    let savedKey: string | undefined;
    const modal = await host.modalController.create({
      component: ArticleEditorModal,
      cssClass: 'modal-fullscreen',
      // not the data of the dismissal: it may be closed after a save, with the close icon
      componentProps: { section, ...options, onSaved: (key: string): void => { savedKey = key; } },
    });
    const closed = modal.onWillDismiss().then(() => savedKey);
    await modal.present();
    return { closed };
  } catch (error) {
    console.warn('openArticleEditor: the editor could not be opened', error);
    showToast(host.toastController, host.openFailed()).catch((ex: unknown) => console.warn('openArticleEditor: no toast', ex));
    // the app's handler reloads once for the chunk of an older version, and reports anything else; offline no reload brings the chunk
    if (navigator.onLine !== false) host.errorHandler.handleError(error);
    return undefined;
  }
}
