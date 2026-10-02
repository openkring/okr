import { describe, expect, it } from 'vitest';
import { buildPain001Xml, Pain001Input, parseRecipientAddress } from './pain001-xml.util';

const base: Pain001Input = {
  msgId: 'SCS-EXP-1', executionDate: '20261015', debtorName: 'Seeclub Stäfa',
  debtorIban: 'CH93 0076 2011 6238 5295 7', createdAt: '2026-10-02T10:00:00.000Z', payments: [],
};
const pay = (over: Partial<Pain001Input['payments'][0]>) => ({
  endToEndId: 'E2E1', amount: { amount: 12550, currency: 'CHF' }, recipientName: 'Max Muster',
  recipientIban: 'CH5604835012345678009', recipientAddress: '', reference: 'Spesen: Benzin', ...over,
});

describe('parseRecipientAddress', () => {
  it('parses a three-line address', () =>
    expect(parseRecipientAddress('Bahnhofstrasse 1\n8001 Zürich\nCH'))
      .toEqual({ street: 'Bahnhofstrasse 1', zip: '8001', town: 'Zürich', country: 'CH' }));
  it('parses a one-line address with commas and defaults a 4-digit zip to CH', () =>
    expect(parseRecipientAddress('Bahnhofstrasse 1, 8001 Zürich'))
      .toEqual({ street: 'Bahnhofstrasse 1', zip: '8001', town: 'Zürich', country: 'CH' }));
  it('returns undefined without a zip + town line', () =>
    expect(parseRecipientAddress('Muster AG')).toBeUndefined());
  it('returns undefined for an empty string', () => expect(parseRecipientAddress('')).toBeUndefined());
});

describe('buildPain001Xml', () => {
  it('writes the debtor IBAN normalised and the debtor name', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({})] });
    expect(xml).toContain('<Dbtr><Nm>Seeclub Stäfa</Nm></Dbtr>');
    expect(xml).toContain('<DbtrAcct><Id><IBAN>CH9300762011623852957</IBAN></Id></DbtrAcct>');
  });
  it('formats amounts with two decimals', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({})] });
    expect(xml).toContain('<InstdAmt Ccy="CHF">125.50</InstdAmt>');
    expect(xml).toContain('<CtrlSum>125.50</CtrlSum>');
  });
  it('puts a QRR reference into Strd/CdtrRefInf without spaces', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({
      recipientIban: 'CH4431999123000889012', reference: '21 00000 00003 13947 14300 09017', referenceType: 'QRR',
    })] });
    expect(xml).toContain('<Prtry>QRR</Prtry>');
    expect(xml).toContain('<Ref>210000000003139471430009017</Ref>');
    expect(xml).not.toContain('<Ustrd>');
  });
  it('puts a SCOR reference into Strd with Cd SCOR', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({ reference: 'RF18 5390 0754 7034', referenceType: 'SCOR' })] });
    expect(xml).toContain('<Cd>SCOR</Cd>');
    expect(xml).toContain('<Ref>RF18539007547034</Ref>');
  });
  it('keeps a NON reference as Ustrd', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({ referenceType: 'NON' })] });
    expect(xml).toContain('<Ustrd>Spesen: Benzin</Ustrd>');
  });
  it('derives the type of a legacy payment without referenceType', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({
      recipientIban: 'CH4431999123000889012', reference: '210000000003139471430009017',
    })] });
    expect(xml).toContain('<Prtry>QRR</Prtry>');
  });
  it('writes a structured creditor address when one is parseable', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({ recipientAddress: 'Seestrasse 5\n8712 Stäfa\nCH' })] });
    expect(xml).toContain('<PstlAdr><StrtNm>Seestrasse 5</StrtNm><PstCd>8712</PstCd><TwnNm>Stäfa</TwnNm><Ctry>CH</Ctry></PstlAdr>');
  });
  it('omits the address element when none is parseable', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({ recipientAddress: '' })] });
    expect(xml).not.toContain('<PstlAdr>');
  });
  it('escapes XML special characters', () => {
    const xml = buildPain001Xml({ ...base, payments: [pay({ recipientName: 'Müller & <Söhne>' })] });
    expect(xml).toContain('Müller &amp; &lt;Söhne&gt;');
  });
  it('converts a StoreDate execution date to ISO', () => {
    expect(buildPain001Xml({ ...base, payments: [pay({})] })).toContain('<ReqdExctnDt><Dt>2026-10-15</Dt></ReqdExctnDt>');
  });
});
