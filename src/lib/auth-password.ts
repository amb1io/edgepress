/**
 * Hash/verify de senha com scrypt em parâmetros reduzidos para caber no limite
 * de CPU do Cloudflare Workers (better-auth padrão usa N=16384 e estoura o limite).
 *
 * Novos hashes usam N=1024 (formato "v1:salt:key"). Hashes antigos (salt:key) usam
 * N=16384 para compatibilidade.
 */
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const hex = {
  encode: (bytes: Uint8Array) =>
    [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""),
  decode: (str: string) =>
    new Uint8Array(str.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))),
};

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}

/** Parâmetros leves para Workers (menos CPU). */
const LIGHT = { N: 1024, r: 8, p: 1, dkLen: 64 } as const;
/** Parâmetros padrão do better-auth (compatibilidade com hashes antigos). */
const DEFAULT = { N: 16384, r: 16, p: 1, dkLen: 64 } as const;

const PREFIX_V1 = "v1:";

async function scrypt(
  password: string,
  salt: Uint8Array,
  params: { N: number; r: number; p: number; dkLen: number }
): Promise<Uint8Array> {
  return scryptAsync(password.normalize("NFKC"), salt, {
    ...params,
    maxmem: 128 * params.N * params.r * 2,
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await scrypt(password, salt, LIGHT);
  return `${PREFIX_V1}${hex.encode(salt)}:${hex.encode(key)}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const isV1 = hash.startsWith(PREFIX_V1);
  const rest = isV1 ? hash.slice(PREFIX_V1.length) : hash;
  const parts = rest.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, keyHex] = parts;
  if (!saltHex || !keyHex) return false;
  const key = hexToBytes(keyHex);
  const derived = isV1
    ? await scrypt(password, hex.decode(saltHex), LIGHT)
    : await scryptAsync(password.normalize("NFKC"), saltHex, {
        ...DEFAULT,
        maxmem: 128 * DEFAULT.N * DEFAULT.r * 2,
      });
  return constantTimeEqual(derived, key);
}
