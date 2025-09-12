/**
 * Here, we define defaults that are used for consistency reasons across the app.
 * Only define defaults that are independent of any app-specific configuration.
 * App-specific configuration data is defined in the environment files or in the Firebase config.
 * The defaults are defined as constants, so that they can be used in the templates.
 * Any dependencies to other modules must be avoided. Otherwise, it could lead to circular dependencies.
 *
 */

//-----------------------------------------------
// form field patterns (for validators)
//-----------------------------------------------
export const SSN_PATTERN = '756[0-9]*';
export const TAX_ID_PATTERN = '^CHE[0-9]*';
export const IBAN_PATTERN = '^CH[0-9]*';
export const NAME_PATTERN = '[a-zA-Z öüäéâàèç-]*';
export const NAME_NUMBER_PATTERN = '[a-zA-Z0-9 öüäéâàèç-]*';
export const ALL_CHARS_PATTERN = '[!-~]*';
// keep the escapes, because we need it later within the regex)
// eslint-disable-next-line no-useless-escape
export const SPECIAL_CHARS_PATTERN = '[p{P}p{S}]'; // https://stackoverflow.com/questions/18057962/regex-pattern-including-all-special-characters
export const INTEGER_PATTERN = '[0-9]*';
export const PHONE_PATTERN = '[- +()0-9]{6,}';

// local images
export const AVATAR_URL = 'assets/img/logo_square.png';
export const AVATAR_ROUND_URL = 'assets/img/logo_round.png';
export const SHOW_FOOTER = false;
export const THUMBNAIL_SIZE = 200; // in px
export const AVATAR_SIZE_SMALL = 30; // in px
export const LOGO_WIDTH = 300; // in px
export const LOGO_HEIGHT = 200; // in px
export const BUTTON_WIDTH = '60'; // in px
export const BUTTON_HEIGHT = '60'; // in px
export const ICON_SIZE = '40'; // in px
//-----------------------------------------------
// dates
//-----------------------------------------------
export const END_FUTURE_DATE = 99991231;
export const END_FUTURE_DATE_STR = '99991231';
export const START_PAST_DATE = 19000101;
export const START_PAST_DATE_STR = '19000101';
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/**-------------------------------------------------------------------------
 * Styling
---------------------------------------------------------------------------*/
export const MODAL_STYLE = '.modalContent { background: #fff; border-radius: 10px; @media only screen and (min-width: 768px)  {  width: 50%; display: block; margin-left: auto; margin-right: auto; }}';

/**
 * User experience (UX)
 */
export const TOAST_LENGTH = 3000;

/**-------------------------------------------------------------------------
 * The length of a form field.
---------------------------------------------------------------------------*/
export const NAME_LENGTH = 50;
export const SHORT_NAME_LENGTH = 30;
export const LONG_NAME_LENGTH = 100;
export const ABBREVIATION_LENGTH = 5;
export const WORD_LENGTH = 20;
export const STREET_LENGTH = 50;
export const CITY_LENGTH = 30;
export const ZIP_LENGTH = 4;
export const INT_LENGTH = 6;
export const NUMBER_LENGTH = 10;
export const SHORT_NUMBER_LENGTH = 4;
export const COUNTRY_LENGTH = 2;
export const CURRENCY_LENGTH = 3;
export const DESCRIPTION_LENGTH = 5000;
export const COMMENT_LENGTH = 500;
export const EMAIL_LENGTH = 50;
export const PHONE_LENGTH = 30;
export const IBAN_LENGTH = 26;
export const BEXIO_ID_LENGTH = 6;
export const TAX_ID_LENGTH = 12;
export const SSN_LENGTH = 13;
export const DATE_LENGTH = 10;
export const STORE_DATE_LENGTH = 8;
export const STORE_DATETIME_LENGTH = 14;
export const TIME_LENGTH = 5;
export const LOCKER_LENGTH = 3;
export const KEY_LENGTH = 5;
export const URL_LENGTH = 1000;
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 24;

// misc form field values
export const DESCRIPTION_ROWS = 5;
export const COMMENT_ROWS = 2;
export const DEBOUNCE_TIME = 500;

/**-------------------------------------------------------------------------
 * Input Mode is a hint to the browser for which keyboard to display.
---------------------------------------------------------------------------*/
export type InputMode = 'decimal' | 'email' | 'numeric' | 'search' | 'tel' | 'text' | 'url';

/**-------------------------------------------------------------------------
 * Input Type defines the type of control to display.
---------------------------------------------------------------------------*/
export type InputType = 'date' | 'datetime-local' | 'email' | 'month' | 'number' | 'password' | 'search' | 'tel' | 'text' | 'time' | 'url' | 'week';

/**-------------------------------------------------------------------------
 * AutoComplete allows to apply automated assitance in filling out form field values
 * as well as guide the browser as to the type of information expected in a given field.
 *  * see: https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete
---------------------------------------------------------------------------*/
export type AutoComplete = 'name' | 'email' | 'tel' | 'url' | 'off' | 'given-name' | 'family-name' | 'new-password' | 'current-password' | 'organization' | 'street-address' | 'country' | 'country-name' | 'postal-code' | 'bday' | 'address-level2';
