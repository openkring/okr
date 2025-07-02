import * as CryptoJS from 'crypto-js';  

/**
 * Encryption/Decryption utility using AES-256-GCM with CrypotJS
 */

/**
 * Encrypts plain text using the AES-256-GCM encryption algorithm.
 *
 * @param plainText - The text to be encrypted.
 * @param password - The encryption password or secret key.
 *
 * @returns A Promise that resolves to the encrypted text as a string.
 *    If the password is empty, the original plain text is returned.
 */
export async function encrypt(plainText: string, password: string): Promise<string> {
    if (!password || password.length === 0) return plainText;
    return CryptoJS.AES.encrypt(plainText.trim(), password.trim()).toString(); 
}

/**
 * Decrypts an encrypted text using the AES-256-GCM decryption algorithm.
 *
 * @param encryptedText - The text to be decrypted.
 * @param password - The decryption password or secret key.
 *
 * @returns A Promise that resolves to the decrypted text as a string. 
 *      If the password is wrong, an empty string is returned.
 *      if the password is invalid, the original encrypted text is returned.
 */
export async function decrypt(encryptedText: string, password: string): Promise<string> {
    // Check if the decryption password is empty or invalid
    if (!password || password.length === 0) return encryptedText;

    // Attempt to decrypt the encrypted text using AES-256-GCM decryption
    try {
      const _bytes = CryptoJS.AES.decrypt(encryptedText.trim(), password.trim());

      // Convert the decrypted bytes to a UTF-8 encoded string
      return _bytes.toString(CryptoJS.enc.Utf8);  
    }
    catch (error) {
        // If the password is wrong, an empty string is returned
        console.warn('decrypt error: ' + error + '; returning empty string');
        return '';
    }
}
