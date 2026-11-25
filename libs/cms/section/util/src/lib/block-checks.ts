import { enforce, test } from 'vest';

import type { ImageConfig } from '@okr/shared-models';
import { isSafeLinkTarget, resolveImageStyle } from '@okr/shared-util-core';

import { isObject } from './article-block.util';
import { imageConfigValidations, imageStyleValidations } from './image.validations';

/** What the validations of the blocks of an article and of a mail share. Internal: not exported from the lib. */

export function check(field: string, ok: boolean): void {
  test(field, 'invalidValue', () => {
    enforce(ok).isTruthy();
  });
}

/** An optional enumerated value: absent is fine, a present one must be known. */
export function checkOneOf(field: string, value: unknown, allowed: readonly string[]): void {
  check(field, value === undefined || (typeof value === 'string' && allowed.includes(value)));
}

const IMAGE_LINK_MESSAGE = '@cms/section/feature.validation.imageLink';

/** Its link opens without a check of its own in older apps, so only safe targets are stored (no `javascript:`). */
export function checkImage(field: string, image: unknown, linkMessage = IMAGE_LINK_MESSAGE): void {
  if (!isObject(image)) {
    check(`${field}.url`, false);
    return;
  }
  imageConfigValidations(field, image as unknown as ImageConfig);
  test(`${field}.actionUrl`, linkMessage, () => {
    enforce(isSafeLinkTarget(image['actionUrl'])).isTruthy();
  });
}

/** An optional partial image style: a non-object is an error, an object is checked on top of the defaults. */
export function checkImageStyle(field: string, style: unknown): void {
  if (style === undefined) return;
  if (!isObject(style)) check(field, false);
  else imageStyleValidations(resolveImageStyle(style), `${field}.`);
}

/** Two or three columns with a list of blocks each, their sizes fill the 12 of the grid. */
export function areColumns(columns: unknown): boolean {
  const list = Array.isArray(columns) ? columns : [];
  const sizes = list.map((c) => (isObject(c) ? c['size'] : undefined));
  return (list.length === 2 || list.length === 3)
    && list.every((c) => isObject(c) && Array.isArray(c['blocks']))
    && sizes.every((s) => typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 11)
    && sizes.reduce<number>((sum, s) => sum + (typeof s === 'number' ? s : 0), 0) === 12;
}

/** The blocks of each column that has a list of them. */
export function columnLists(columns: unknown): unknown[][] {
  return (Array.isArray(columns) ? columns : []).flatMap((c) => (isObject(c) && Array.isArray(c['blocks']) ? [c['blocks']] : []));
}

/** Every block, the ones inside columns included, has an id that no other has. */
export function haveOwnIds(blocks: unknown[]): boolean {
  const ids = idsOf(blocks);
  return ids.every((id) => typeof id === 'string' && id !== '') && new Set(ids).size === ids.length;
}

function idsOf(blocks: unknown[]): unknown[] {
  return blocks.filter(isObject).flatMap((block) => [block['id'], ...(block['type'] === 'columns' ? columnLists(block['columns']).flatMap(idsOf) : [])]);
}
