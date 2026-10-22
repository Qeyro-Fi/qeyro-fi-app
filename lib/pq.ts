import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";

/** ML-DSA-44 (FIPS 204) helpers. Everything runs in the browser; keys are never transmitted. */
export interface PqKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export const hex = (b: Uint8Array) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
export const fromHex = (s: string): Uint8Array => {
  const h = s.trim().replace(/^0x/, "");
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("Not valid hex");
  return Uint8Array.from(h.match(/.{2}/g) ?? [], (x) => parseInt(x, 16));
};

export function generateKeypair(): PqKeypair {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return ml_dsa44.keygen(seed);
}
export const sign = (message: Uint8Array, secretKey: Uint8Array) => ml_dsa44.sign(message, secretKey);
export const verify = (sig: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => {
  try {
    return ml_dsa44.verify(sig, message, publicKey);
  } catch {
    return false;
  }
};

const enc = new TextEncoder();

async function kdf(pass: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: new Uint8Array(salt), iterations: 600_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Passphrase-encrypted backup (PBKDF2-SHA256 600k + AES-256-GCM). */
export async function encryptBackup(kp: PqKeypair, pass: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await kdf(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(kp.secretKey)));
  return JSON.stringify({ format: "qeyro-fi/ml-dsa-44-backup/v1", kdf: "PBKDF2-SHA256-600000", cipher: "AES-256-GCM", salt: b64(salt), iv: b64(iv), publicKey: hex(kp.publicKey), secretKeyEncrypted: b64(ct) }, null, 2);
}

export async function decryptBackup(json: string, pass: string): Promise<PqKeypair> {
  const o = JSON.parse(json);
  if (o.format !== "qeyro-fi/ml-dsa-44-backup/v1") throw new Error("Not a QEYRO FI backup file");
  const key = await kdf(pass, new Uint8Array(unb64(o.salt)));
  try {
    const sk = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(unb64(o.iv)) }, key, new Uint8Array(unb64(o.secretKeyEncrypted))));
    return { publicKey: fromHex(o.publicKey), secretKey: sk };
  } catch {
    throw new Error("Wrong passphrase or corrupted file");
  }
}

export const pqSizes = { publicKey: 1312, secretKey: 2560, signature: 2420 };
