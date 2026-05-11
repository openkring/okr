import { BkModel } from './base.model';

export class WebsiteContentModel implements BkModel {
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public key = '';
  public de = '';
  public en = '';
  public isHtml = false;
}

export const WebsiteContentCollection = 'websiteContent';
export const WebsiteContentModelName = 'websiteContent';
