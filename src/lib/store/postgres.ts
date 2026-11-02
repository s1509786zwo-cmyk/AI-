import type { Battle, BattleSummary, Character } from "@/lib/engine/types";
import { toBattleSummary, type Store } from "./types";

type PgPool = import("pg").Pool;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ab_characters (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ab_battles (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ab_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);`;

/**
 * DATABASE_URL がある場合の永続ストア。スキーマは起動時に自己修復する。
 */
export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private pool: PgPool | null = null;
  private ready: Promise<void> | null = null;

  private async getPool(): Promise<PgPool> {
    if (!this.pool) {
      const { Pool } = await import("pg");
      const globalForPg = globalThis as typeof globalThis & { __abPool?: PgPool };
      this.pool =
        globalForPg.__abPool ??
        new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 6,
          connectionTimeoutMillis: 8000,
          idleTimeoutMillis: 30000,
        });
      this.pool.on("error", () => undefined);
      globalForPg.__abPool = this.pool;
    }
    return this.pool;
  }

  async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const pool = await this.getPool();
        await pool.query(SCHEMA_SQL);
      })().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    return this.ready;
  }

  async listCharacters(): Promise<Character[]> {
    await this.init();
    const pool = await this.getPool();
    const { rows } = await pool.query<{ data: Character }>(
      "SELECT data FROM ab_characters ORDER BY updated_at DESC",
    );
    return rows.map((r) => r.data);
  }

  async getCharacter(id: string): Promise<Character | null> {
    await this.init();
    const pool = await this.getPool();
    const { rows } = await pool.query<{ data: Character }>(
      "SELECT data FROM ab_characters WHERE id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async saveCharacter(character: Character): Promise<void> {
    await this.init();
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO ab_characters (id, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [character.id, JSON.stringify(character)],
    );
  }

  async deleteCharacter(id: string): Promise<void> {
    await this.init();
    const pool = await this.getPool();
    await pool.query("DELETE FROM ab_characters WHERE id = $1", [id]);
  }

  async listBattles(): Promise<BattleSummary[]> {
    await this.init();
    const pool = await this.getPool();
    const { rows } = await pool.query<{ data: Battle }>(
      "SELECT data FROM ab_battles ORDER BY updated_at DESC LIMIT 100",
    );
    return rows.map((r) => toBattleSummary(r.data));
  }

  async getBattle(id: string): Promise<Battle | null> {
    await this.init();
    const pool = await this.getPool();
    const { rows } = await pool.query<{ data: Battle }>(
      "SELECT data FROM ab_battles WHERE id = $1",
      [id],
    );
    return rows[0]?.data ?? null;
  }

  async saveBattle(battle: Battle): Promise<void> {
    await this.init();
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO ab_battles (id, data, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [battle.id, JSON.stringify(battle)],
    );
  }

  async deleteBattle(id: string): Promise<void> {
    await this.init();
    const pool = await this.getPool();
    await pool.query("DELETE FROM ab_battles WHERE id = $1", [id]);
  }

  async getSetting(key: string): Promise<string | null> {
    await this.init();
    const pool = await this.getPool();
    const { rows } = await pool.query<{ value: string }>(
      "SELECT value FROM ab_settings WHERE key = $1",
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.init();
    const pool = await this.getPool();
    if (!value) {
      await pool.query("DELETE FROM ab_settings WHERE key = $1", [key]);
      return;
    }
    await pool.query(
      `INSERT INTO ab_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }
}
