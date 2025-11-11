import { DEFAULT_EMAIL } from "@bk2/shared-constants";

export type AuthCredentials = {
  loginEmail: string;
  loginPassword: string;
};

export const authCredentialsShape: AuthCredentials = {
  loginEmail: DEFAULT_EMAIL,
  loginPassword: '',
};
