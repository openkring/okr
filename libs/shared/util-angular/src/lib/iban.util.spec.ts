import { parseIban, formatIban, extractIbanPart, checkIban, IbanPart, IbanFormat } from './iban.util';

describe('iban.util', () => {

    // parseIban
    it('parseIban("", false)', () => {
        expect(parseIban('', false)).toEqual('');
    });

    it('("NL91ABNA0417164300", default allowQrIban = true)', () => {
      expect(parseIban('NL91ABNA0417164300')).toEqual('NL91ABNA0417164300');
    });

    it('("NL92ABNA0517164300", invalid iban)', () => {
      expect(parseIban('NL92ABNA0517164300')).toEqual('');
    });

    it('("CH4431999123000889012", QrIban allowed)', () => {
      expect(parseIban('CH4431999123000889012')).toEqual('CH4431999123000889012');
    });

    it('("CH4431999123000889012", QrIban not allowed)', () => {
      expect(parseIban('CH4431999123000889012', false)).toEqual('');
    });

    it('("CH67 0070 0110 4044 7417 6", default allowQrIban = true)', () => {
      expect(parseIban('CH67 0070 0110 4044 7417 6')).toEqual('CH6700700110404474176');
    });

    // formatIban
    it('formatIban(empty, Electronic, false)', () => {
        expect(formatIban('', IbanFormat.Electronic, false)).toEqual('');
    });

    it('formatIban(validFriendly, Electronic)', () => {
      expect(formatIban('CH67 0070 0110 4044 7417 6', IbanFormat.Electronic)).toEqual('CH6700700110404474176');
    });

    it('formatIban(validElectronic, Electronic)', () => {
      expect(formatIban('CH6700700110404474176', IbanFormat.Electronic)).toEqual('CH6700700110404474176');
    });

    it('formatIban(validFriendly, Friendly)', () => {
      expect(formatIban('CH67 0070 0110 4044 7417 6', IbanFormat.Friendly)).toEqual('CH67 0070 0110 4044 7417 6');
    });

    it('formatIban(validElectronic, Friendly)', () => {
      expect(formatIban('CH6700700110404474176', IbanFormat.Friendly)).toEqual('CH67 0070 0110 4044 7417 6');
    });

    // extractIbanPart
    it('extractIbanPart(empty, IBAN)', () => {
        expect(extractIbanPart('', IbanPart.IBAN, false)).toEqual('');
    });
    it('extractIbanPart(validFriendlyNL, IBAN)', () => {
      expect(extractIbanPart('NL91 ABNA 0417 1643 00', IbanPart.IBAN)).toEqual('NL91ABNA0417164300');
    });
    it('extractIbanPart(validFriendlyNL, BBAN)', () => {
      expect(extractIbanPart('NL91 ABNA 0417 1643 00', IbanPart.BBAN)).toEqual('ABNA0417164300');
    });
    it('extractIbanPart(validFriendlyNL, CountryCode)', () => {
      expect(extractIbanPart('NL91 ABNA 0417 1643 00', IbanPart.CountryCode)).toEqual('NL');
    });
    it('extractIbanPart(validFriendlyCH, CountryCode)', () => {
      expect(extractIbanPart('CH67 0070 0110 4044 7417 6', IbanPart.CountryCode)).toEqual('CH');
    });

    // checkIban
    it('checkIban(empty, false)', () => {
      expect(checkIban('', false)).toEqual(false);
    });
    it('checkIban(validElectronic)', () => {
      expect(checkIban('CH6700700110404474176')).toEqual(true);
    });
    it('checkIban(invalidElectronic)', () => {
      expect(checkIban('CH6800700110404474176')).toEqual(false);
    });
});