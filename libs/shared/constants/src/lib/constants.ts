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
export const DEFAULT_IMAGE_WIDTH_SMALL = 160; // in px
export const DEFAULT_IMAGE_HEIGHT_SMALL = 90;
export const DEFAULT_IMAGE_WIDTH = 480; // in px
export const DEFAULT_IMAGE_HEIGHT = 270;
export const DEFAULT_ALBUM_WIDTH = 400;
export const DEFAULT_ALBUM_HEIGHT = 400;
export const THUMBNAIL_SIZE = 200; // in px
export const AVATAR_SIZE_SMALL = 30; // in px
export const LOGO_WIDTH = 300; // in px
export const LOGO_HEIGHT = 200; // in px
export const BUTTON_WIDTH = '60'; // in px
export const BUTTON_HEIGHT = '60'; // in px
export const ICON_SIZE = '40'; // in px
export const DEFAULT_SIZES = '(max-width: 786px) 50vw, 100vw';
export const DEFAULT_BORDER = '1px';
export const DEFAULT_BORDER_RADIUS = '4';
//-----------------------------------------------
// dates
//-----------------------------------------------
export const END_FUTURE_DATE = 99991231;
export const END_FUTURE_DATE_STR = '99991231';
export const START_PAST_DATE = 19000101;
export const START_PAST_DATE_STR = '19000101';
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
export const MAX_DATES_PER_SERIES = 100;

//-----------------------------------------------
// default types
//-----------------------------------------------
export const DEFAULT_ACCOUNT_NAME = 'bank';
export const DEFAULT_CALEVENT_TYPE = 'training';
export const DEFAULT_CAR_TYPE = 'hatchback';
export const DEFAULT_COMPETITION_LEVEL = 'masters';
export const DEFAULT_CONTENT_STATE = 'draft';
export const DEFAULT_DOCUMENT_TYPE = 'info';
export const DEFAULT_DOCUMENT_SOURCE = 'storage';
export const DEFAULT_GENDER = 'male';
export const DEFAULT_IMPORTANCE = 'medium';
export const DEFAULT_INVOICE_POSITION_TYPE = 'fix';
export const DEFAULT_INVOICE_POSITION_USAGE = 'membershipFee';
export const DEFAULT_LOCATION_TYPE = 'address';
export const DEFAULT_MCAT = 'active';
export const DEFAULT_MSTATE = 'active';
export const DEFAULT_MENU_ACTION = 'browse';
export const DEFAULT_OCAT = 'use';
export const DEFAULT_ORG_TYPE = 'association';
export const DEFAULT_OSTATE = 'active';
export const DEFAULT_PAGE_TYPE = 'content';
export const DEFAULT_PERIODICITY = 'once';
export const DEFAULT_PERSONAL_REL = 'parentChild';
export const DEFAULT_PET_TYPE = 'cat';
export const DEFAULT_PRIORITY = 'medium';
export const DEFAULT_RBOAT_TYPE = 'b1x';
export const DEFAULT_RBOAT_USAGE = 'breitensport';
export const DEFAULT_RESOURCE_TYPE = 'rboat';
export const DEFAULT_RES_REASON = 'social';
export const DEFAULT_RES_STATE = 'initial';
export const DEFAULT_SECTION_TYPE = 'article';
export const DEFAULT_TASK_STATE = 'initial';
export const DEFAULT_TRANSFER_TYPE = 'purchase';
export const DEFAULT_TRANSFER_STATE = 'initial';
export const DEFAULT_WORKREL_TYPE = 'employee';
export const DEFAULT_WORKREL_STATE = 'active';
export const DEFAULT_ROLE = 'registered';

//-----------------------------------------------
// other defaults
//-----------------------------------------------
export const DEFAULT_CURRENCY = 'CHF';
export const DEFAULT_ICON = 'other';
export const DEFAULT_SALARY = 6000;
export const DEFAULT_KEY = '';
export const DEFAULT_NAME = '';
export const DEFAULT_NOTES = '';
export const DEFAULT_TAGS = '';
export const DEFAULT_PRICE = 0;
export const DEFAULT_COUNT = '1';
export const DEFAULT_TITLE = '';
export const DEFAULT_LOCALE = 'de-ch';
export const DEFAULT_SECTIONS: string[] = [];
export const DEFAULT_TENANTS: string[] = [];
export const DEFAULT_DATE = '';
export const DEFAULT_DATETIME = '';
export const DEFAULT_TIME = '';
export const DEFAULT_ID = '';
export const DEFAULT_INDEX = '';
export const DEFAULT_LABEL = '';
export const DEFAULT_CALENDARS: string[] = [];
export const DEFAULT_MENUITEMS: string[] = [];
export const DEFAULT_URL = '';
export const DEFAULT_PATH = '';
export const DEFAULT_EMAIL = '';
export const DEFAULT_PHONE = '';
export const DEFAULT_ZIP = '';
export const DEFAULT_STREETNAME = '';
export const DEFAULT_STREETNUMBER = '';
export const DEFAULT_CITY = '';
export const DEFAULT_COUNTRY = 'CH';
export const DEFAULT_ORDER = 1;
export const IMAGE_MIMETYPES = [
    'image/png',
    'image/jpg',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/tiff',
    'image/bmp']; //  'image/svg+xml' currently not supported. 
export const DEFAULT_MIMETYPES = [
    'image/png', 
    'image/jpg', 
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.apple.pages',
    'application/vnd.apple.numbers',
    'application/vnd.apple.keynote',
    'com.apple.iwork.pages.pages',
    'com.apple.iwork.numbers.numbers',
    'com.apple.iwork.keynote.key',
    'application/x-iwork-pages-sffpages',
    'public.zip-archive',
    'application/zip',
    'public.data'
    ];


/**-------------------------------------------------------------------------
 * Styling
---------------------------------------------------------------------------*/
export const MODAL_STYLE = '.modalContent { background: #fff; border-radius: 10px; @media only screen and (min-width: 768px)  {  width: 50%; display: block; margin-left: auto; margin-right: auto; }}';
export const SIZE_SM = 576; // px
export const SIZE_MD = 768; // px
export const SIZE_LG = 992; // px
export const SIZE_XL = 1200; // px
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
