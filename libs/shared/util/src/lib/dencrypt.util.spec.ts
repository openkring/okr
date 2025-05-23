import { encrypt, decrypt } from './dencrypt.util'; 

describe('encrypt and decrypt functions', () => {
  const password = 'mySecretPassword';
  const plainText = 'Hello, World!';

  it('should encrypt and decrypt the text successfully', async () => {
    const encryptedText = await encrypt(plainText, password);
    expect(encryptedText).not.toEqual(plainText);

    const decryptedText = await decrypt(encryptedText, password);
    expect(decryptedText).toEqual(plainText);
  });

  it('should return the original text if the password is empty', async () => {
    const emptyPassword = '';
    const plainText = 'Hello, World!';
    const encryptedText = await encrypt(plainText, emptyPassword);
    expect(encryptedText).toEqual(plainText);
    expect(emptyPassword).toEqual('');

    const decryptedText = await decrypt(encryptedText, emptyPassword);
    expect(decryptedText).toEqual(plainText);
    expect(emptyPassword).toEqual('');
  });

  it('should return an empty string if the decryption password is incorrect', async () => {
    const incorrectPassword = 'wrongPassword';
    const encryptedText = await encrypt(plainText, password);

    // decrypted with corret password should work ok
    const decryptedTextCorrect = await decrypt(encryptedText, password);
    expect(decryptedTextCorrect).toEqual(plainText);

    // decrypted with wrong password should return the original text
    const decryptedText = await decrypt(encryptedText, incorrectPassword);
    expect(decryptedText).toEqual('');
  });
});
