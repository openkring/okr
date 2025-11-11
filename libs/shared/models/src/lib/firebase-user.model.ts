import { DEFAULT_EMAIL, DEFAULT_ID, DEFAULT_NAME, DEFAULT_PHONE, DEFAULT_URL } from "@bk2/shared-constants";

export class FirebaseUserModel {
  public uid = DEFAULT_ID;
  public email = DEFAULT_EMAIL; // Firebase Auth Login Email
  public displayName = DEFAULT_NAME;
  public emailVerified = false;
  public disabled = false;
  public phone = DEFAULT_PHONE;
  public photoUrl = DEFAULT_URL;
}
