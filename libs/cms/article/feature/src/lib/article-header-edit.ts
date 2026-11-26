import { Component, Directive, ElementRef, effect, inject, input, output } from '@angular/core';
import { IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular';

import type { SectionIntroPosition } from '@okr/shared-models';

/** The header fields of an article that are edited in place. */
export type ArticleHeaderField = 'title' | 'subTitle' | 'intro';
export interface ArticleHeaderChange { field: ArticleHeaderField; value: string }

/**
 * Plain text typed in place: no markup, one line unless `multiline`. The element shows `value`; while it is typed into it keeps
 * its own text (the caret stays), it is only rewritten when `value` comes back different (undo, redo).
 */
@Directive({
  selector: '[okrPlainEditable]',
  standalone: true,
  host: {
    contenteditable: 'plaintext-only',
    role: 'textbox',
    spellcheck: 'true',
    '[class.empty]': '!value()',
    '[attr.data-placeholder]': 'placeholder()',
    '[attr.aria-label]': 'placeholder()',
    '[attr.aria-multiline]': 'multiline()',
    '(input)': 'onInput()',
    '(keydown.enter)': 'onEnter($event)',
  },
})
export class PlainEditable {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  public readonly value = input('');
  public readonly placeholder = input('');
  public readonly multiline = input(false);
  public readonly valueChange = output<string>();

  constructor() {
    effect(() => {
      const value = this.value();
      if (this.read() !== value) this.element.textContent = value;
    });
  }

  protected onInput(): void {
    const text = this.read();
    // an empty field may keep a <br> of the browser: without it the placeholder shows
    if (text === '') this.element.textContent = '';
    this.valueChange.emit(text);
  }

  protected onEnter(event: Event): void {
    if (!this.multiline()) event.preventDefault();
  }

  private read(): string {
    const text = (this.element.innerText ?? this.element.textContent ?? '').replace(/\r/g, '');
    return this.multiline() ? text.replace(/\n+$/, '') : text.replace(/\n/g, ' ');
  }
}

/**
 * The header of an article in the editor (title, subtitle and intro), drawn as readers see it and typed into in place. An empty
 * one shows its name, so that it can be filled; readers do not see empty ones. `data-canvas-tool`: the canvas leaves clicks and
 * keys in it alone.
 */
@Component({
  selector: 'okr-article-header-edit',
  standalone: true,
  imports: [PlainEditable, IonCardHeader, IonCardTitle, IonCardSubtitle],
  host: { 'data-canvas-tool': '' },
  styles: [`
    :host { display: block; }
    /* as okr-optional-card-header; iOS places the subtitle above the title */
    ion-card-header { display: flex; flex-flow: column-reverse; padding-bottom: 0px; }
    ion-card-title { font-size: 1.25rem; font-weight: 600; }
    .intro-above { margin: 0; padding: 16px 16px 0 16px; font-size: 0.8rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ion-color-secondary); }
    .intro-above + ion-card-header { padding-top: 4px; }
    .intro-below { margin: 0; padding: 8px 16px 0 16px; opacity: 0.8; white-space: pre-line; }
    [okrPlainEditable] { display: block; min-height: 1.2em; border-radius: 4px; outline: none; cursor: text; }
    [okrPlainEditable]:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--ion-color-primary) 40%, transparent); }
    [okrPlainEditable]:focus-visible, [okrPlainEditable]:focus { box-shadow: 0 0 0 2px var(--ion-color-primary); }
    [okrPlainEditable].empty::before { content: attr(data-placeholder); opacity: 0.45; pointer-events: none; }
  `],
  template: `
    @if (introPosition() === 'above') {
      <p class="intro-above" okrPlainEditable [value]="intro()" [placeholder]="introPlaceholder()" (valueChange)="emit('intro', $event)"></p>
    }
    <ion-card-header>
      <ion-card-title><span okrPlainEditable [value]="title()" [placeholder]="titlePlaceholder()" (valueChange)="emit('title', $event)"></span></ion-card-title>
      <ion-card-subtitle><span okrPlainEditable [value]="subTitle()" [placeholder]="subTitlePlaceholder()" (valueChange)="emit('subTitle', $event)"></span></ion-card-subtitle>
    </ion-card-header>
    @if (introPosition() !== 'above') {
      <p class="intro-below" okrPlainEditable [multiline]="true" [value]="intro()" [placeholder]="introPlaceholder()" (valueChange)="emit('intro', $event)"></p>
    }
  `,
})
export class ArticleHeaderEdit {
  /** as stored: placeholders such as @APPNAME@ are edited, not replaced */
  public readonly title = input('');
  public readonly subTitle = input('');
  public readonly intro = input('');
  public readonly introPosition = input<SectionIntroPosition>('below');
  public readonly titlePlaceholder = input('');
  public readonly subTitlePlaceholder = input('');
  public readonly introPlaceholder = input('');

  public readonly headerChange = output<ArticleHeaderChange>();

  protected emit(field: ArticleHeaderField, value: string): void {
    this.headerChange.emit({ field, value });
  }
}
