/** Stable unique ids for every record. */
export function newId(): string {
  return crypto.randomUUID();
}
