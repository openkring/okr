import type { PeopleSection } from '@okr/shared-models';
import { showToast } from '@okr/shared-util-angular';

import type { ArticleEditorHost, ArticleEditorOptions, OpenedArticleEditor } from './article-editor.loader';

export type PeopleEditorOptions = ArticleEditorOptions;

/**
 * Opens the people block editor (spec 1.181 §7.1), the way `openArticleEditor` opens the article editor. The editor saves by itself;
 * callers only reload. Answers when the window is shown. Never rejects: a failed opening is told and undefined.
 * @param section the section as it was read; for a new one with the key it will get
 */
export async function openPeopleEditor(host: ArticleEditorHost, section: PeopleSection, options: PeopleEditorOptions): Promise<OpenedArticleEditor | undefined> {
  try {
    // dynamic: the editor is in no chunk that readers load (see section-editor.loader.ts)
    const { PeopleEditorModal } = await import('./people-editor.modal');
    let savedKey: string | undefined;
    const modal = await host.modalController.create({
      component: PeopleEditorModal,
      cssClass: 'modal-fullscreen',
      // not the data of the dismissal: it may be closed after a save, with the close icon
      componentProps: { section, ...options, onSaved: (key: string): void => { savedKey = key; } },
    });
    const closed = modal.onWillDismiss().then(() => savedKey);
    await modal.present();
    return { closed };
  } catch (error) {
    console.warn('openPeopleEditor: the editor could not be opened', error);
    showToast(host.toastController, host.openFailed()).catch((ex: unknown) => console.warn('openPeopleEditor: no toast', ex));
    // the app's handler reloads once for the chunk of an older version, and reports anything else; offline no reload brings the chunk
    if (navigator.onLine !== false) host.errorHandler.handleError(error);
    return undefined;
  }
}
