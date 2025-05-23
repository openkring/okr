import { SHORT_NAME_LENGTH } from "@bk2/shared/config";
import { stringValidations } from "@bk2/shared/util";

export function phoneValidations(fieldName: string, phoneNumber: unknown ) {

  stringValidations(fieldName, phoneNumber, SHORT_NAME_LENGTH, 10);

  // tdb: validate phone number format based on country
}

