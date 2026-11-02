import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Battle, BattleSummary, Character } from "@/lib/engine/types";
import { toBattleSummary, type Store } from "./types";

interface FileDb {
  characters: Record<string, Character>;
  battles: Record<string, Battle>;
  settings: Record<string, string>;
}

const EMPTY: FileDb = { characters: {}, battles: {}, settings: {} };

/**
 * DATABASE_URL が無い環境（ローカル開発・プレビュー）向けの永続ストア。
 * 書き込みは直列化し、一時ファイル経由でアトミックに置き換える。
 */
export class FileStore implements Store {
  readonly kind = "file" as const;
  private file: string;
  private ready: Promise<void> | null = null;
  private cache: FileDb | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data")) {
    this.file = path.join(dir, "store.json");
  }

  async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await mkdir(path.dirname(this.file), { recursive: true });
        try {
          const raw = await readFile(this.file, "utf8");
          const parsed = JSON.parse(raw) as Partial<FileDb>;
          this.cache = {
            characters: parsed.characters ?? {},
            battles: parsed.battles ?? {},
            settings: parsed.settings ?? {},
          };
        } catch {
          this.cache = structuredClone(EMPTY);
        }
      })();
    }
    return this.ready;
  }

  private async db(): Promise<FileDb> {
    await this.init();
    return this.cache ?? structuredClone(EMPTY);
  }

  private mutate<T>(fn: (db: FileDb) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.db();
      const result = await fn(db);
      const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
      await mkdir(path.dirname(this.file), { recursive: true });
      await writeFile(tmp, JSON.stringify(db, null, 0), "utf8");
      await rename(tmp, this.file);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listCharacters(): Promise<Character[]> {
    const db = await this.db();
    return Object.values(db.characters).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getCharacter(id: string): Promise<Character | null> {
    const db = await this.db();
    return db.characters[id] ?? null;
  }

  async saveCharacter(character: Character): Promise<void> {
    await this.mutate((db) => {
      db.characters[character.id] = character;
    });
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.mutate((db) => {
      delete db.characters[id];
    });
  }

  async listBattles(): Promise<BattleSummary[]> {
    const db = await this.db();
    return Object.values(db.battles)
      .map(toBattleSummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getBattle(id: string): Promise<Battle | null> {
    const db = await this.db();
    return db.battles[id] ?? null;
  }

  async saveBattle(battle: Battle): Promise<void> {
    await this.mutate((db) => {
      db.battles[battle.id] = battle;
    });
  }

  async deleteBattle(id: string): Promise<void> {
    await this.mutate((db) => {
      delete db.battles[id];
    });
  }

  async getSetting(key: string): Promise<string | null> {
    const db = await this.db();
    return db.settings[key] ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.mutate((db) => {
      if (value === "") delete db.settings[key];
      else db.settings[key] = value;
    });
  }
}
