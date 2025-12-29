import { DEFAULT_EMAIL } from "@bk2/shared-constants";

export type AuthCredentials = {
  loginEmail: string;
  loginPassword: string;
};

export const AUTH_CREDENTIAL_SHAPE: AuthCredentials = {
  loginEmail: DEFAULT_EMAIL,
  loginPassword: '',
};
