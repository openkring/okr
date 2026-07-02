import { SHORT_NAME_LENGTH } from "@okr/shared-constants";
import { stringValidations } from "@okr/shared-util-core";

export function phoneValidations(fieldName: string, phoneNumber: unknown ) {

  stringValidations(fieldName, phoneNumber, SHORT_NAME_LENGTH, 10);

  // tdb: validate phone number format based on country
}

