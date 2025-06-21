import { DeepRequired } from "ngx-vest-forms";

export type AuthCredentials = Partial<{
  loginEmail: string;
  loginPassword: string;
}>;

export const authCredentialsShape: DeepRequired<AuthCredentials> = {
  loginEmail: '',
  loginPassword: ''
};