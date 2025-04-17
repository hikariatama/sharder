import { Chacha20 } from "ts-chacha20";

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function getSalsa(keySeed: string) {
  const data = new TextEncoder().encode(keySeed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const key = new Uint8Array(hashBuffer);

  return {
    encrypt: (message: Uint8Array): Uint8Array => {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const salsa = new Chacha20(key, nonce);
      const encrypted = salsa.encrypt(message);
      const nonceWithMessage = new Uint8Array(nonce.length + encrypted.length);
      nonceWithMessage.set(nonce);
      nonceWithMessage.set(encrypted, nonce.length);
      return nonceWithMessage;
    },
    decrypt: (data: Uint8Array) => {
      const nonce = data.slice(0, 12);
      const message = data.slice(12);
      const salsa = new Chacha20(key, nonce);
      const decrypted = salsa.decrypt(message);
      return decrypted;
    },
  }
}
