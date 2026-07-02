import { DEFAULT_EMAIL } from "@okr/shared-constants";

export type AuthCredentials = {
  loginEmail: string;
  loginPassword: string;
};

export const AUTH_CREDENTIAL_SHAPE: AuthCredentials = {
  loginEmail: DEFAULT_EMAIL,
  loginPassword: '',
};
