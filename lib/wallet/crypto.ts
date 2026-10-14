import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM for bank numbers. Key: WALLET_ENCRYPTION_KEY = 32 random bytes, base64 (openssl rand -base64 32).
// Stored format: v1.<iv>.<tag>.<ciphertext> (base64url). Never log decrypted values.

function key(): Buffer | null {
  const raw = process.env.WALLET_ENCRYPTION_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw.trim(), "base64");
  return k.length === 32 ? k : null;
}
export const encryptionReady = () => key() !== null;

export function encrypt(plain: string): string {
  const k = key(); if (!k) throw new Error("WALLET_ENCRYPTION_KEY is missing or not 32 bytes (base64).");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(blob: string): string {
  const k = key(); if (!k) throw new Error("WALLET_ENCRYPTION_KEY is missing or not 32 bytes (base64).");
  const [v, iv, tag, ct] = String(blob).split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised encrypted value.");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
