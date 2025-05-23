export enum RegexType {
    SimpleName,     
    Phone,
    UserName,
    Password,
    Iban,
    AHVN13,
    MacAddress,
    PLZ,
    CC_Visa_MC,
    FilePath
}

/*
    Find a better solution (the regexes are too complex, split into smaller parts first or use a library) for:
    IPv4:
    /^((?:2[0-5]{2}|1\d{2}|[1-9]\d|[1-9])\.(?:(?:2[0-5]{2}|1\d{2}|[1-9]\d|\d)\.){2}(?:2[0-5]{2}|1\d{2}|[1-9]\d|\d)):(\d|[1-9]\d|[1-9]\d{2,3}|[1-5]\d{4}|6[0-4]\d{3}|654\d{2}|655[0-2]\d|6553[0-5])$/.source,
    IPv6:
    /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(([0-9A-Fa-f]{1,4}:){0,5}:((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(::([0-9A-Fa-f]{1,4}:){0,5}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/.source,
    FilePath:
    /^((4\d{3})|(5[1-5]\d{2})|(6011))-?\d{4}-?\d{4}-?\d{4}|3[4,7]\d{13}/.source,
    Url: use new URL(string) see: https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url

    what3words:
    @what3words/api
    https://developer.what3words.com/tutorial/detecting-if-text-is-in-the-format-of-a-3-word-address
        /^\/*[^0-9`~!@#$%^&*()+\-_=[{\]}\\|'<,.>?/";:£§º©®\s]+[・.。][^0-9`~!@#$%^&*()+\-_=[{\]}\\|'<,.>?/";:£§º©®\s]+[・.。][^0-9`~!@#$%^&*()+\-_=[{\]}\\|'<,.>?/";:£§º©®\s]+$/.source,

    Credit card numbers:
    see: https://stackoverflow.com/questions/9315647/regex-credit-card-number-tests
    CC_Amex: ^3[47][0-9]{13}$
    CC_Diners: ^3(?:0[0-5]|[68][0-9])[0-9]{11}$
    CC_JCB: ^(?:2131|1800|35\d{3})\d{11}$
    CC_Maestro: ^(5018|5020|5038|6304|6759|6761|6763)[0-9]{8,15}$
    CC_Mastercard: ^(5[1-5][0-9]{14}|2(22[1-9][0-9]{12}|2[3-9][0-9]{13}|[3-6][0-9]{14}|7[0-1][0-9]{13}|720[0-9]{12}))$
    CC_Visa: ^4[0-9]{12}(?:[0-9]{3})?$
*/

/*
    most of these regexes were copied from http://regexlib.com or ChatGTP

    use it like this:
    regexp = new RegExp(Regex.Phone);
    test = regexp.test(testValue)

    regex literal notation:   /^[bla]\d{0.2}+$/'
    same in strong notation needs backslash excaping: '^[bla]\\d{0.2}+'
*/
export const REGEXES: string[] = [
        /.*/.source,
        /^\+(?:\d ?){6,14}\d$/.source,
        /^(\(?\+?\d+\)?)?[0-9_\- ()]*$/.source,
        /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.source,
        /(?!^\d*$)(?!^[a-zA-Z]*$)^([a-zA-Z0-9]{6,15})$/.source,
        /^[A-Z]{2}(?:[ ]?\d){18,20}$/.source,
        /^756\.(\d{4})\.(\d{4})\.(\d{2})$/.source,
        /^([0-9a-fA-F][0-9a-fA-F]:){5}([0-9a-fA-F][0-9a-fA-F])$/.source,
        /^(\d{4})$/.source,
        /^(?:4\d{12}(?:\d{3})?|5[1-5]\d{14})$/.source,
    ];