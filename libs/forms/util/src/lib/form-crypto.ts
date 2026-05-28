/**
 * Client-side AES-256-GCM encryption for form file uploads (§9.2).
 * All cryptographic operations use the Web Crypto API — keys never leave the browser.
 *
 * Key derivation: PBKDF2-SHA-256, 200 000 iterations, 32-byte output
 * Encryption:     AES-256-GCM, 12-byte random IV
 */

export interface EncryptedBlob {
  ciphertext: ArrayBuffer;
  iv: Uint8Array;        // 12 bytes
  saltBase64: string;    // base64-encoded 16-byte salt (for key re-derivation)
}

export interface EncryptedFileMetadata {
  encryptedName: string;   // base64url-encoded encrypted original filename
  ivBase64: string;
  saltBase64: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;     // URL to the encrypted blob in Firebase Storage
}

const PBKDF2_ITERATIONS = 200_000;
const KEY_LENGTH_BITS = 256;

// ──────────────────────────────────────────
// Password utilities
// ──────────────────────────────────────────

/** Generates a cryptographically random 20-character base64url password. */
export function generateEncryptionPassword(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Generates a random 16-byte salt, returned as base64. */
export function generateSalt(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return btoa(String.fromCharCode(...salt));
}

// ──────────────────────────────────────────
// Key derivation
// ──────────────────────────────────────────

export async function deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
  const saltBytes = Uint8Array.from(atob(saltBase64), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derives a hash string from the password for round-trip verification storage.
 * NOT used as a decryption key — only to verify the user entered the right password.
 */
export async function hashPasswordForVerification(password: string, saltBase64: string): Promise<string> {
  const key = await deriveKey(password, saltBase64);
  // Export as raw and hex-encode to produce a deterministic verifier string
  const exported = await crypto.subtle.exportKey('raw', key);
  return Array.from(new Uint8Array(exported))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ──────────────────────────────────────────
// Encryption
// ──────────────────────────────────────────

export async function encryptData(key: CryptoKey, plaintext: ArrayBuffer): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext, iv };
}

export async function encryptFile(
  file: File,
  password: string,
  saltBase64: string,
): Promise<EncryptedBlob> {
  const key = await deriveKey(password, saltBase64);
  const plaintext = await file.arrayBuffer();
  const { ciphertext, iv } = await encryptData(key, plaintext);
  return { ciphertext, iv, saltBase64 };
}

// ──────────────────────────────────────────
// Decryption
// ──────────────────────────────────────────

export async function decryptData(key: CryptoKey, ciphertext: ArrayBuffer, iv: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
}

export async function decryptFile(
  encryptedBlobUrl: string,
  ivBase64: string,
  saltBase64: string,
  password: string,
): Promise<ArrayBuffer> {
  const key = await deriveKey(password, saltBase64);
  const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
  const response = await fetch(encryptedBlobUrl);
  const ciphertext = await response.arrayBuffer();
  return decryptData(key, ciphertext, iv);
}
