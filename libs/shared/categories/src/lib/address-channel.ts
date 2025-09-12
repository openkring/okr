import { AddressChannel, CategoryModel } from '@bk2/shared-models';

export type AddressChannelCategory = CategoryModel; 

export const AddressChannels: AddressChannelCategory[] = [{
  id: AddressChannel.Phone,
  abbreviation: 'TEL',
  name: 'phone',
  i18nBase: 'subject.address.channel.phone',
  icon: 'tel'
},
{
  id: AddressChannel.Email,
  abbreviation: 'EMAIL',
  name: 'email',
  i18nBase: 'subject.address.channel.email',
  icon: 'email'
},
{
  id: AddressChannel.Web,
  abbreviation: 'WEB',
  name: 'web',
  i18nBase: 'subject.address.channel.web',
  icon: 'globe'
},
{
  id: AddressChannel.Twitter,
  abbreviation: 'TWT',
  name: 'twitter',
  i18nBase: 'subject.address.channel.twitter',
  icon: 'twitter'
},
{
  id: AddressChannel.Linkedin,
  abbreviation: 'LKD',
  name: 'linkedin',
  i18nBase: 'subject.address.channel.linkedin',
  icon: 'linkedin'
},
{
  id: AddressChannel.Facebook,
  abbreviation: 'FB',
  name: 'facebook',
  i18nBase: 'subject.address.channel.facebook',
  icon: 'facebook'
},
{
  id: AddressChannel.Xing,
  abbreviation: 'XING',
  name: 'xing',
  i18nBase: 'subject.address.channel.xing',
  icon: 'xing'
},
{
  id: AddressChannel.Skype,
  abbreviation: 'SKP',
  name: 'skype',
  i18nBase: 'subject.address.channel.skype',
  icon: 'skype'
},
{
  id: AddressChannel.Custom,
  abbreviation: 'CUST',
  name: 'custom',
  i18nBase: 'subject.address.channel.custom',
  icon: 'reddit'
},
{
  id: AddressChannel.Postal,
  abbreviation: 'POST',
  name: 'postal',
  i18nBase: 'subject.address.channel.postal',
  icon: 'mail-open'
},
{
  id: AddressChannel.Instagram,
  abbreviation: 'INSTA',
  name: 'instagram',
  i18nBase: 'subject.address.channel.instagram',
  icon: 'instagram'
},
{
  id: AddressChannel.Signal,
  abbreviation: 'SIGNL',
  name: 'signal',
  i18nBase: 'subject.address.channel.signal',
  icon: 'chatbubble'
},
{
  id: AddressChannel.Wire,
  abbreviation: 'WIRE',
  name: 'wire',
  i18nBase: 'subject.address.channel.wire',
  icon: 'chatbubble'
},
{
  id: AddressChannel.Github,
  abbreviation: 'GITH',
  name: 'github',
  i18nBase: 'subject.address.channel.github',
  icon: 'github'
},
{
  id: AddressChannel.Threema,
  abbreviation: 'THRMA',
  name: 'threema',
  i18nBase: 'subject.address.channel.threema',
  icon: 'chatbubble'
},
{
  id: AddressChannel.Telegram,
  abbreviation: 'TLGR',
  name: 'telegram',
  i18nBase: 'subject.address.channel.telegram',
  icon: 'chatbubble'
},
{
  id: AddressChannel.Whatsapp,
  abbreviation: 'WHAT',
  name: 'whatsapp',
  i18nBase: 'subject.address.channel.whatsapp',
  icon: 'chatbubble'
},
{
  id: AddressChannel.BankAccount,
  abbreviation: 'ACCT',
  name: 'bankaccount',
  i18nBase: 'subject.address.channel.bankaccount',
  icon: 'finance_cash_note'
}
];
