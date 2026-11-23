import { InputSignal } from '@angular/core';
import { SIGNAL } from '@angular/core/primitives/signals';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ArticleBlockView } from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ArticleBlock } from '@okr/shared-models';

import { ArticleBlocks } from './article-blocks';

/** The component without its template (a lib test does not compile one): its own computed over its own input. */
function viewsOf(blocks: unknown[]): ArticleBlockView[] {
  TestBed.configureTestingModule({
    providers: [
      { provide: AppStore, useValue: { replacePlaceholders: (text: string) => text.replaceAll('@APPNAME@', 'Kring') } },
      { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      { provide: I18nService, useValue: { translateAll: () => ({ zoomed: () => '' }) } },
    ],
  });
  const component = TestBed.runInInjectionContext(() => new ArticleBlocks());
  const node = (component.blocks as InputSignal<ArticleBlock[]>)[SIGNAL];
  node.applyValueToInputSignal(node, blocks as ArticleBlock[]);
  return (component as unknown as { views(): ArticleBlockView[] }).views();
}

describe('ArticleBlocks', () => {
  it('replaces the placeholders in texts and callouts, also in columns', () => {
    const text = (id: string) => ({ id, type: 'text', html: '<p>@APPNAME@ und @APPNAME@</p>' });
    expect(viewsOf([text('a'), { id: 'b', type: 'callout', tone: 'primary', html: '@APPNAME@' }, { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [text('d')] }, { size: 6, blocks: [text('e')] }] }])).toMatchObject([
      { type: 'text', html: '<p>Kring und Kring</p>' },
      { type: 'callout', html: 'Kring' },
      { type: 'columns', columns: [{ blocks: [{ html: '<p>Kring und Kring</p>' }] }, { blocks: [{ html: '<p>Kring und Kring</p>' }] }] },
    ]);
  });
});
