import { stringValidations } from "@bk2/shared/util";

export function colorValidations(fieldName: string, color: unknown) {

  stringValidations(fieldName, color, 30);

  // tbd: test for valid color (hex, rgb, rgba, hsl, hsla)
}

