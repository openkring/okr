import { die, warn } from './log.util';

/**
 * Checks whether the given value is a valid integer in the given range between (including) minLimit and maxLmit.
 * The method returns null if the validation was ok or a message that describes the error.
 * @param value the value to validate
 * @param minLimit the lower limit
 * @param maxLimit the upper limit
 * @param acceptZero 0 as a default value in optional field is ok
 */
export function checkBoundedInteger(
    value: unknown, 
    minLimit = 0, 
    maxLimit = Infinity,
    acceptZero = true
    ): boolean {
    if (!value) die('validate.util/checkString: invalid value');
    if (typeof value !== 'number') {
        warn('validate.util/checkBoundedInteger: not a number type');
        return false;
    }
    if (isNaN(value)) {
        warn('validate.util/checkBoundedInteger: not a number (NaN)');
        return false;
    }
    if (value % 1 !== 0) {
        warn('validate.util/checkBoundedInteger: not a whole number');
        return false;
    }
    if (value === 0 && acceptZero === true) return true;
    if (value < minLimit) {
        warn(`validate.util/checkBoundedInteger: value ${value} is smaller than the minimum ${minLimit}`);
        return false;
    }
    if (value > maxLimit) {
        warn(`validate.util/checkBoundedInteger: value ${value} is bigger than the maximum ${maxLimit}`);
        return false;
    }
    return true;
}

/**
 * Checks whether the given value is a valid string.
 * @param value the value to validate
 * @param acceptEmptyString empty string can be ok e.g. in optional fields
 */
export function checkString(
    value: unknown,
    acceptEmptyString = false
    ): boolean {
    if (!value) die('validate.util/checkString: invalid value');
    if (typeof value !== 'string') {
        warn('validate.util/checkString: not a string type');
        return false;
    }
    if (value.length === 0) {
        if(acceptEmptyString === true) {
            return true;
        } else {
            warn('validate.util/checkString: empty string');
            return false;
        }
    }
    return true;
}

/**
 * This is a better password policy. It is currently not
 * enforced because it does not correspond to the Firebase password policy.
 * Validates a password according to the following policy:
 * - min 8 to max 20 characters
 * - must include at least one upper case letter
 * - must include at least one lower case letter
 * - must include at least one digit
 * see: http://regexlib.com
 * BEWARE: the password policy should be the same as Firebase's (when setting the password)
* @param control the password to validate

    const _result = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).8,20}$/.test(control.value);
 */
export function checkPassword(value: unknown): boolean {
    if (!value) die('validate.util/checkPassword: invalid value');
    if (typeof value !== 'string') die('validate.util/checkPassword: value must be of type string');
    if (/^.{6,20}$/.test(value) === true) {
        return true;
    } else {
        warn('validate.util/checkPassword: regexp test failed');
        return false;
    }
}
