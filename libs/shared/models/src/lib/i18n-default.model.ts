import { DEFAULT_KEY } from '@bk2/shared-constants';
import { BkModel } from './base.model';

export class I18nDefaultModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = [];
  public module = DEFAULT_KEY;
  public key = DEFAULT_KEY;
  public de = DEFAULT_KEY;
  public en = DEFAULT_KEY;
  public fr = DEFAULT_KEY;
  public es = DEFAULT_KEY;
  public it = DEFAULT_KEY;
  public isHtml = false;
  public isArchived = false;
}

export const I18nDefaultCollection = 'i18nDefault';
export const I18nDefaultModelName = 'i18nDefault';
