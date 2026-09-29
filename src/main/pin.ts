import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Store } from "./db";

const hash = (pin: string, salt: Buffer) => scryptSync(pin, salt, 32);

export function setPin(store: Store, pin: string) {
  const salt = randomBytes(16);
  store.kvSet("pin_salt", salt.toString("hex"));
  store.kvSet("pin_hash", hash(pin, salt).toString("hex"));
}

export function hasPin(store: Store): boolean {
  return !!store.kvGet("pin_hash");
}

export function checkPin(store: Store, pin: string): boolean {
  const salt = store.kvGet("pin_salt");
  const want = store.kvGet("pin_hash");
  if (!salt || !want) return false;
  const got = hash(pin, Buffer.from(salt, "hex"));
  const w = Buffer.from(want, "hex");
  return got.length === w.length && timingSafeEqual(got, w);
}
