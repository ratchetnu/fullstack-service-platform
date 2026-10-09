import { randomInt } from "node:crypto";

// Crockford base32 without I, L, O and U: easy to read out over the phone.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Human-friendly booking reference such as "BK-7F3K2Q9M". 32^8 ≈ 10^12 possibilities. */
export function generateBookingReference(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `BK-${code}`;
}
