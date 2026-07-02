import { stringValidations } from "@okr/shared-util-core";

export function colorValidations(fieldName: string, color: unknown) {

  stringValidations(fieldName, color, 30);

  // tbd: test for valid color (hex, rgb, rgba, hsl, hsla)
}

