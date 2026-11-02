const active = new Set<string>();

export function tryLock(id: string): boolean {
  if (active.has(id)) return false;
  active.add(id);
  return true;
}

export function unlock(id: string): void {
  active.delete(id);
}

export function isLocked(id: string): boolean {
  return active.has(id);
}
