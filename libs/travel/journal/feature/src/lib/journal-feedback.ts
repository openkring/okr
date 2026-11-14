import { Component, computed, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';

import { CommentListI18n } from '@okr/comment-util';
import { ImageConfig, SectionFeedback, SectionModel } from '@okr/shared-models';
import { fill } from '@okr/shared-util-core';
import { JournalCommentItem, JournalComments, JournalFeedbackAction, JournalFeedbackSheet, JournalReactionChips } from '@okr/travel-journal-ui';
import { imageBadgeText, imageTitle, JOURNAL_QUICK_REACTIONS, JournalI18n, parentKeyOf, ReactionSummary } from '@okr/travel-journal-util';

/** The reactions and comments of one parent (`section.<key>` / `image.<key>`), as the reader sees them. */
export interface FeedbackThread { parentKey: string; reactions: ReactionSummary[]; comments: JournalCommentItem[] }
/** An image whose comments are open under its section, titled with the image's name. */
export interface ImageThread extends FeedbackThread { title: string }
/** Switch `emoji` on `parentKey` on (`active`) or off. */
export interface FeedbackReaction { parentKey: string; emoji: string; active: boolean }
export interface FeedbackText { parentKey: string; text: string }
export type FeedbackChoice = { kind: 'react'; emoji: string } | { kind: 'action'; id: string };

/** The image sheet's own actions; the story page adds the section's edit actions after them. */
export const IMAGE_ACTION = { comment: 'image.comment', comments: 'image.comments', slider: 'image.slider' } as const;

/** Tapping an emoji takes one's own reaction back, else adds it. */
export function toggledReaction(parentKey: string, reactions: ReactionSummary[], emoji: string): FeedbackReaction {
  return { parentKey, emoji, active: !reactions.some((r) => r.emoji === emoji && r.mine) };
}

/** The parent key of a journal image (its key is the `label` of the section's ImageConfig). */
export function imageParentKey(image: ImageConfig): string {
  return parentKeyOf({ kind: 'image', id: image.label });
}

/** The images an article or album shows (urls resolved as drawn); other types have none to react to. */
export function sectionImages(section: SectionModel): ImageConfig[] {
  if (section.type !== 'article' && section.type !== 'album') return [];
  const images = (section.properties as unknown as Record<string, unknown>)['images'];
  return Array.isArray(images) ? (images as ImageConfig[]) : [];
}

/** The badge per image (by `label`), only the parts whose switch is on; an image without feedback gets none. */
export function imageBadgesOf(images: ImageConfig[], feedback: SectionFeedback, threadOf: (image: ImageConfig) => FeedbackThread): Record<string, string> {
  const badges: Record<string, string> = {};
  if (!feedback.imageReactions && !feedback.imageComments) return badges;
  for (const image of images) {
    const thread = threadOf(image);
    const reactions = feedback.imageReactions ? thread.reactions.reduce((sum, r) => sum + r.count, 0) : 0;
    const text = imageBadgeText(reactions, feedback.imageComments ? thread.comments.length : 0);
    if (text) badges[image.label] = text;
  }
  return badges;
}

/**
 * The reaction sheet: the quick row (JOURNAL_QUICK_REACTIONS) with «mehr …», then `actions`. «mehr …» opens the
 * chat's emoji picker, imported on that tap only: `emoji-picker-element` must never enter an eager chunk (lazy-loading
 * skill, plan decision 8). Resolves to the chosen emoji or action, undefined when the reader closed it.
 */
export async function openFeedbackSheet(
  modalController: ModalController, toastController: ToastController, i18n: JournalI18n,
  options: { header?: string; reactions: boolean; mine: string[]; actions: JournalFeedbackAction[] },
): Promise<FeedbackChoice | undefined> {
  if (!options.reactions && options.actions.length === 0) return undefined;
  const sheet = await modalController.create({
    component: JournalFeedbackSheet,
    componentProps: {
      header: options.header ?? '', quickReactions: options.reactions ? JOURNAL_QUICK_REACTIONS : [], mine: options.mine,
      moreLabel: i18n.reaction_more(), actions: options.actions,
    },
    cssClass: 'auto-height-modal',
    breakpoints: [0, 1],
    initialBreakpoint: 1,
  });
  await sheet.present();
  const { role, data } = await sheet.onDidDismiss<string>();
  if (role === 'react' && data) return { kind: 'react', emoji: data };
  if (role === 'action' && data) return { kind: 'action', id: data };
  if (role !== 'picker') return undefined;
  let EmojiPickerModal: typeof import('@okr/chat-ui').EmojiPickerModal;
  try {
    ({ EmojiPickerModal } = await import('@okr/chat-ui'));
  } catch {
    // offline before the picker's chunk was ever loaded (PWA): say so instead of failing silently
    const toast = await toastController.create({ message: i18n.error_generic(), duration: 3000, position: 'bottom' });
    await toast.present();
    return undefined;
  }
  const picker = await modalController.create({ component: EmojiPickerModal, componentProps: { title: i18n.reaction_picker() }, cssClass: 'auto-height-modal' });
  await picker.present();
  const picked = await picker.onWillDismiss<string>();
  return picked.role === 'confirm' && picked.data ? { kind: 'react', emoji: picked.data } : undefined;
}

/**
 * The sheet of an image of an article or album (spec 1.154 §7): titled with the image's name, the emoji row (image
 * reactions on), «Kommentieren» and «Kommentare ansehen (n)» (image comments on), «Im Vollbild-Slider öffnen», then
 * `extra` (the authors' section actions).
 */
export function openImageSheet(
  modalController: ModalController, toastController: ToastController, i18n: JournalI18n,
  context: { image: ImageConfig; index: number; feedback: SectionFeedback; thread: FeedbackThread; extra?: JournalFeedbackAction[] },
): Promise<FeedbackChoice | undefined> {
  const { feedback, thread } = context;
  const count = thread.comments.length;
  const actions: JournalFeedbackAction[] = [
    ...(feedback.imageComments ? [{ id: IMAGE_ACTION.comment, label: i18n.image_comment(), icon: 'chatbubble' }] : []),
    ...(feedback.imageComments && count > 0 ? [{ id: IMAGE_ACTION.comments, label: fill(i18n.image_comments_view(), { count }), icon: 'eye-on' }] : []),
    { id: IMAGE_ACTION.slider, label: i18n.image_slider(), icon: 'images' },
    ...(context.extra ?? []),
  ];
  return openFeedbackSheet(modalController, toastController, i18n, {
    header: imageTitle(context.image, context.index, (n) => fill(i18n.image_photo(), { n })),
    reactions: feedback.imageReactions,
    mine: thread.reactions.filter((r) => r.mine).map((r) => r.emoji),
    actions,
  });
}

/**
 * The footer under a section of the story or guest page (spec 1.154 §7), per the section's switches: the reaction
 * chips with «＋», the folded comments with the composer, and — after «Kommentieren» / «Kommentare ansehen» on one of
 * its images — that image's comments. It sits outside the section's tappable edit area. The page writes: the story
 * page through the journal store (offline on the iPad), the guest page through `journalGuest`.
 */
@Component({
  selector: 'okr-journal-feedback',
  standalone: true,
  imports: [JournalReactionChips, JournalComments],
  styles: [`
    :host { display: block; padding: 4px 16px 12px; }
    .image { margin-top: 12px; padding: 8px 12px; border-left: 3px solid var(--ion-color-light-shade); }
    okr-journal-reaction-chips + okr-journal-comments { margin-top: 4px; }
  `],
  template: `
    @if (feedback().reactions && (section().reactions.length > 0 || canWrite())) {
      <okr-journal-reaction-chips [chips]="section().reactions" [canReact]="canWrite()" [addLabel]="i18n().reaction_add()"
        (toggled)="toggle(section(), $event)" (addClicked)="add(section())" />
    }
    @if (feedback().comments) {
      <okr-journal-comments [comments]="section().comments" [i18n]="i18n()" [commentI18n]="commentI18n()" [canWrite]="canWrite()" [busy]="busy()"
        (sent)="commented.emit({ parentKey: section().parentKey, text: $event })" (deleteClicked)="deleted.emit($event)" />
    }
    @if (image(); as img) {
      <div class="image" #imagePanel>
        <okr-journal-comments [title]="imageHeading()" [comments]="img.comments" [i18n]="i18n()" [commentI18n]="commentI18n()"
          [canWrite]="canWrite() && feedback().imageComments" [busy]="busy()"
          (sent)="commented.emit({ parentKey: img.parentKey, text: $event })" (deleteClicked)="deleted.emit($event)" (closed)="imageClosed.emit()" />
        @if (feedback().imageReactions && (img.reactions.length > 0 || canWrite())) {
          <okr-journal-reaction-chips [chips]="img.reactions" [canReact]="canWrite()" [addLabel]="i18n().reaction_add()"
            (toggled)="toggle(img, $event)" (addClicked)="add(img)" />
        }
      </div>
    }
  `,
})
export class JournalFeedback {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);

  public readonly section = input.required<FeedbackThread>();
  public readonly feedback = input.required<SectionFeedback>();
  /** the image whose comments are open here, if any */
  public readonly image = input<ImageThread | undefined>(undefined);
  /** false shows reactions and comments without any controls */
  public readonly canWrite = input(true);
  /** true while a comment is being sent */
  public readonly busy = input(false);
  public readonly i18n = input.required<JournalI18n>();
  public readonly commentI18n = input.required<CommentListI18n>();
  public readonly reacted = output<FeedbackReaction>();
  public readonly commented = output<FeedbackText>();
  /** the key of one's own comment to delete */
  public readonly deleted = output<string>();
  public readonly imageClosed = output<void>();

  private readonly imagePanel = viewChild<ElementRef<HTMLElement>>('imagePanel');
  private readonly imageKey = computed(() => this.image()?.parentKey);
  protected readonly imageHeading = computed(() => fill(this.i18n().image_comments_title(), { title: this.image()?.title ?? '' }));

  public constructor() {
    // an image's comments opened from its sheet: bring them into view once (not again on every refresh of the thread)
    effect(() => {
      const panel = this.imagePanel();
      if (this.imageKey() && panel) setTimeout(() => panel.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    });
  }

  protected toggle(thread: FeedbackThread, emoji: string): void {
    this.reacted.emit(toggledReaction(thread.parentKey, thread.reactions, emoji));
  }

  protected async add(thread: FeedbackThread): Promise<void> {
    const choice = await openFeedbackSheet(this.modalController, this.toastController, this.i18n(), {
      reactions: true, mine: thread.reactions.filter((r) => r.mine).map((r) => r.emoji), actions: [],
    });
    if (choice?.kind === 'react') this.toggle(thread, choice.emoji);
  }
}
