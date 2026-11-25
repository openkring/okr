import { InputSignal, signal } from '@angular/core';
import { SIGNAL } from '@angular/core/primitives/signals';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ArticleBlockView } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { ArticleBlock } from '@okr/shared-models';

import { ArticleBlocks } from './article-blocks';

const appName = signal('Kring');

/** The component without its template (a lib test does not compile one): its own computed over its own input. */
function viewsComputedOf(blocks: unknown[]): () => ArticleBlockView[] {
  TestBed.configureTestingModule({
    providers: [
      { provide: AppStore, useValue: { replacePlaceholders: (text: string) => text.replaceAll('@APPNAME@', appName()) } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new ArticleBlocks());
  const node = (component.blocks as InputSignal<ArticleBlock[]>)[SIGNAL];
  node.applyValueToInputSignal(node, blocks as ArticleBlock[]);
  return (component as unknown as { views: () => ArticleBlockView[] }).views;
}
const viewsOf = (blocks: unknown[]): ArticleBlockView[] => viewsComputedOf(blocks)();

describe('ArticleBlocks', () => {
  it('replaces the placeholders in texts and callouts, also in columns', () => {
    const text = (id: string) => ({ id, type: 'text', html: '<p>@APPNAME@ und @APPNAME@</p>' });
    expect(viewsOf([text('a'), { id: 'b', type: 'callout', tone: 'primary', html: '@APPNAME@' }, { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [text('d')] }, { size: 6, blocks: [text('e')] }] }])).toMatchObject([
      { type: 'text', html: '<p>Kring und Kring</p>' },
      { type: 'callout', html: 'Kring' },
      { type: 'columns', columns: [{ blocks: [{ html: '<p>Kring und Kring</p>' }] }, { blocks: [{ html: '<p>Kring und Kring</p>' }] }] },
    ]);
  });

  it('follows a placeholder that changes later (app config arriving late), and keeps the view of a text without one', () => {
    const views = viewsComputedOf([{ id: 'a', type: 'text', html: '<p>@APPNAME@</p>' }, { id: 'b', type: 'text', html: '<p>fest</p>' }]);
    const before = views();
    appName.set('SCS');
    const after = views();
    expect(after[0]).toMatchObject({ html: '<p>SCS</p>' });
    expect(after[1]).toBe(before[1]);
    appName.set('Kring');
    expect(views()[0]).toMatchObject({ html: '<p>Kring</p>' });
  });
});
