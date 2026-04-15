import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS playlist_items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'video')),
      file_url TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'upload',
      external_id TEXT,
      cover_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload';
  `);

  await pool.query(`
    ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS external_id TEXT;
  `);

  await pool.query(`
    ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS cover_url TEXT;
  `);

  /* ── New: store binary media in DB ── */
  await pool.query(`
    ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS file_data BYTEA;
  `);

  await pool.query(`
    ALTER TABLE playlist_items
    ADD COLUMN IF NOT EXISTS mime_type TEXT;
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) - 1 AS rn
      FROM playlist_items
    )
    UPDATE playlist_items p
    SET sort_order = ranked.rn
    FROM ranked
    WHERE p.id = ranked.id AND p.sort_order = 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gallery_items (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
      file_url TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  /* ── New: store binary media in DB ── */
  await pool.query(`
    ALTER TABLE gallery_items
    ADD COLUMN IF NOT EXISTS file_data BYTEA;
  `);

  await pool.query(`
    ALTER TABLE gallery_items
    ADD COLUMN IF NOT EXISTS mime_type TEXT;
  `);
}
