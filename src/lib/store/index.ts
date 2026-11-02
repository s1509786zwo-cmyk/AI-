import { FileStore } from "./file";
import { PostgresStore } from "./postgres";
import type { Store } from "./types";

const globalForStore = globalThis as typeof globalThis & { __abStore?: Store };

export function getStore(): Store {
  if (!globalForStore.__abStore) {
    globalForStore.__abStore = process.env.DATABASE_URL
      ? new PostgresStore()
      : new FileStore();
  }
  return globalForStore.__abStore;
}

export type { Store };
