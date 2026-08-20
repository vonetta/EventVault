import { customAlphabet } from "nanoid";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generate = customAlphabet(alphabet, 8);

/** Human-friendly ticket code, e.g. EV-K7M2Q9XP */
export function createTicketCode(prefix = "EV") {
  return `${prefix}-${generate()}`;
}

export function normalizeTicketCode(input: string) {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}
