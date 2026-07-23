import {randomBytes} from "node:crypto";

export function createSessionId(now = new Date(), entropy = randomBytes(3).toString("hex")): string {
  const timestamp = now.toISOString().replaceAll(/[-:TZ.]/g, "").slice(0, 14);
  return `cp_${timestamp}_${entropy}`;
}
