import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { initDb, pool } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../uploads");

/* ── Multer: memory storage (files go to DB, not disk) ── */
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const port = Number(process.env.PORT ?? 4000);
let spotifyTokenCache: { accessToken: string; expiresAtMs: number } | null = null;

function cleanBaseName(filename: string) {
  return filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function inferTrackMeta(filename: string) {
  const base = cleanBaseName(filename);
  const splitByDash = base.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (splitByDash.length >= 2) {
    return { artist: splitByDash[0], title: splitByDash.slice(1).join(" - ") };
  }

  const splitBySingleDash = base.split("-").map((part) => part.trim()).filter(Boolean);
  if (splitBySingleDash.length >= 2) {
    return { artist: splitBySingleDash[0], title: splitBySingleDash.slice(1).join(" - ") };
  }

  return { artist: "Unknown Artist", title: base || "Untitled Track" };
}

function inferPlaylistMediaType(mimeType: string): "audio" | "video" | null {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

function inferGalleryMediaType(mimeType: string): "image" | "video" | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

app.use(cors());
app.use(express.json());

/* Keep serving old disk-based uploads for backward compatibility */
app.use("/uploads", express.static(uploadDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "Finest Monia API" });
});

/* ═══════════════════════════════════════════════════════
   MEDIA — Serve binary from DB
   ═══════════════════════════════════════════════════════ */
app.get("/api/media/playlist/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT file_data, mime_type FROM playlist_items WHERE id = $1;",
    [id]
  );

  if (result.rowCount === 0 || !result.rows[0].file_data) {
    res.status(404).json({ error: "Media not found." });
    return;
  }

  const row = result.rows[0];
  res.set("Content-Type", row.mime_type || "application/octet-stream");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(row.file_data);
});

app.get("/api/media/gallery/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT file_data, mime_type FROM gallery_items WHERE id = $1;",
    [id]
  );

  if (result.rowCount === 0 || !result.rows[0].file_data) {
    res.status(404).json({ error: "Media not found." });
    return;
  }

  const row = result.rows[0];
  res.set("Content-Type", row.mime_type || "application/octet-stream");
  res.set("Cache-Control", "public, max-age=86400");
  res.send(row.file_data);
});

/* ═══════════════════════════════════════════════════════
   SPOTIFY — Auth & Search
   ═══════════════════════════════════════════════════════ */
async function getSpotifyAccessToken() {
  const now = Date.now();
  if (spotifyTokenCache && spotifyTokenCache.expiresAtMs > now + 30_000) {
    return spotifyTokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials are missing.");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    const details = await tokenRes.text().catch(() => "");
    throw new Error(`Spotify token request failed: ${details.slice(0, 300)}`);
  }

  const tokenJson = (await tokenRes.json()) as { access_token: string; expires_in: number };
  spotifyTokenCache = {
    accessToken: tokenJson.access_token,
    expiresAtMs: now + tokenJson.expires_in * 1000,
  };
  return tokenJson.access_token;
}

/* ═══════════════════════════════════════════════════════
   YOUTUBE — Search
   ═══════════════════════════════════════════════════════ */
app.get("/api/youtube/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "YOUTUBE_API_KEY is not set on the server." });
    return;
  }

  const url =
    "https://www.googleapis.com/youtube/v3/search" +
    `?part=snippet&type=video&maxResults=12&q=${encodeURIComponent(q)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    res.status(502).json({ error: "YouTube request failed", details: text.slice(0, 500) });
    return;
  }
  res.json(await response.json());
});

app.get("/api/spotify/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  try {
    const accessToken = await getSpotifyAccessToken();
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=12`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!searchRes.ok) {
      const details = await searchRes.text().catch(() => "");
      res.status(502).json({ error: "Spotify request failed", details: details.slice(0, 500) });
      return;
    }
    res.json(await searchRes.json());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/* ═══════════════════════════════════════════════════════
   PLAYLIST — CRUD
   ═══════════════════════════════════════════════════════ */
const PLAYLIST_COLUMNS =
  "id, title, artist, media_type, file_url, source, external_id, cover_url, sort_order, created_at, mime_type";

app.get("/api/playlist", async (_req, res) => {
  const result = await pool.query(
    `SELECT ${PLAYLIST_COLUMNS} FROM playlist_items ORDER BY sort_order ASC, created_at DESC;`
  );
  res.json(result.rows);
});

app.post("/api/playlist/spotify", async (req, res) => {
  const body = req.body as {
    spotifyId?: string;
    title?: string;
    artist?: string;
    previewUrl?: string | null;
    spotifyUrl?: string;
    coverUrl?: string;
  };

  const spotifyId = typeof body.spotifyId === "string" ? body.spotifyId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const artist = typeof body.artist === "string" ? body.artist.trim() : "";
  const previewUrl = typeof body.previewUrl === "string" ? body.previewUrl.trim() : "";
  const spotifyUrl = typeof body.spotifyUrl === "string" ? body.spotifyUrl.trim() : "";
  const coverUrl = typeof body.coverUrl === "string" ? body.coverUrl.trim() : "";

  if (!spotifyId || !title || !artist || !spotifyUrl) {
    res.status(400).json({ error: "Missing required Spotify track fields." });
    return;
  }
  const fileUrl = previewUrl || spotifyUrl;
  if (!/^https?:\/\//i.test(fileUrl)) {
    res.status(400).json({ error: "Invalid stream URL." });
    return;
  }

  const orderResult = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM playlist_items;"
  );
  const nextOrder = Number(orderResult.rows[0]?.next_order ?? 0);

  const result = await pool.query(
    `INSERT INTO playlist_items (title, artist, media_type, file_url, sort_order, source, external_id, cover_url)
     VALUES ($1, $2, 'audio', $3, $4, 'spotify', $5, $6)
     RETURNING ${PLAYLIST_COLUMNS};`,
    [title, artist, fileUrl, nextOrder, spotifyId, coverUrl || null]
  );

  res.status(201).json(result.rows[0]);
});

app.post("/api/playlist/youtube", async (req, res) => {
  const body = req.body as {
    videoId?: string;
    title?: string;
    channelTitle?: string;
    thumbUrl?: string;
  };

  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const channelTitle = typeof body.channelTitle === "string" ? body.channelTitle.trim() : "";
  const thumbUrl = typeof body.thumbUrl === "string" ? body.thumbUrl.trim() : "";

  if (!videoId || !title) {
    res.status(400).json({ error: "Missing required YouTube fields." });
    return;
  }

  const orderResult = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM playlist_items;"
  );
  const nextOrder = Number(orderResult.rows[0]?.next_order ?? 0);

  const fileUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const result = await pool.query(
    `INSERT INTO playlist_items (title, artist, media_type, file_url, sort_order, source, external_id, cover_url)
     VALUES ($1, $2, 'video', $3, $4, 'youtube', $5, $6)
     RETURNING ${PLAYLIST_COLUMNS};`,
    [title, channelTitle || "YouTube", fileUrl, nextOrder, videoId, thumbUrl || null]
  );

  res.status(201).json(result.rows[0]);
});

/* ── Upload file → store in DB as BYTEA ── */
app.post("/api/playlist", upload.single("media"), async (req, res) => {
  const media = req.file;
  const { title, artist, mediaType } = req.body;

  if (!media) {
    res.status(400).json({ error: "Missing media file." });
    return;
  }

  const inferredType = inferPlaylistMediaType(media.mimetype);
  if (!inferredType) {
    res.status(400).json({ error: "Only audio and video files are allowed for playlist." });
    return;
  }

  const inferredMeta = inferTrackMeta(media.originalname);
  const safeTitle = typeof title === "string" && title.trim() ? title.trim() : inferredMeta.title;
  const safeArtist =
    typeof artist === "string" && artist.trim() ? artist.trim() : inferredMeta.artist;
  const safeMediaType =
    mediaType === "audio" || mediaType === "video" ? mediaType : inferredType;

  const orderResult = await pool.query(
    "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM playlist_items;"
  );
  const nextOrder = Number(orderResult.rows[0]?.next_order ?? 0);

  /* Insert with placeholder file_url, then update with real URL using the generated id */
  const insertResult = await pool.query(
    `INSERT INTO playlist_items (title, artist, media_type, file_url, sort_order, source, file_data, mime_type)
     VALUES ($1, $2, $3, '', $4, 'upload', $5, $6)
     RETURNING id;`,
    [safeTitle, safeArtist, safeMediaType, nextOrder, media.buffer, media.mimetype]
  );

  const newId = insertResult.rows[0].id;
  const fileUrl = `/api/media/playlist/${newId}`;

  const result = await pool.query(
    `UPDATE playlist_items SET file_url = $1 WHERE id = $2 RETURNING ${PLAYLIST_COLUMNS};`,
    [fileUrl, newId]
  );

  res.status(201).json(result.rows[0]);
});

app.patch("/api/playlist/reorder", async (req, res) => {
  const { orderedIds } = req.body as { orderedIds?: number[] };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: "orderedIds must be a non-empty array." });
    return;
  }

  const updates = orderedIds.map((id, index) =>
    pool.query("UPDATE playlist_items SET sort_order = $1 WHERE id = $2;", [index, id])
  );

  await Promise.all(updates);
  res.status(204).send();
});

app.delete("/api/playlist/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "DELETE FROM playlist_items WHERE id = $1 RETURNING id;",
    [id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Track not found." });
    return;
  }

  res.status(204).send();
});

/* ═══════════════════════════════════════════════════════
   GALLERY — CRUD
   ═══════════════════════════════════════════════════════ */
const GALLERY_COLUMNS = "id, title, media_type, file_url, note, created_at, mime_type";

app.get("/api/gallery", async (_req, res) => {
  const result = await pool.query(
    `SELECT ${GALLERY_COLUMNS} FROM gallery_items ORDER BY created_at DESC;`
  );
  res.json(result.rows);
});

/* ── Upload file → store in DB as BYTEA ── */
app.post("/api/gallery", upload.single("media"), async (req, res) => {
  const media = req.file;
  const { title, note, mediaType } = req.body;

  if (!media) {
    res.status(400).json({ error: "Missing media file." });
    return;
  }

  const inferredType = inferGalleryMediaType(media.mimetype);
  if (!inferredType) {
    res.status(400).json({ error: "Only image and video files are allowed for gallery." });
    return;
  }

  const safeTitle =
    typeof title === "string" && title.trim() ? title.trim() : cleanBaseName(media.originalname);
  const safeNote = typeof note === "string" ? note.trim() : "";
  const safeMediaType =
    mediaType === "image" || mediaType === "video" ? mediaType : inferredType;

  /* Insert with placeholder file_url, then update with real URL using the generated id */
  const insertResult = await pool.query(
    `INSERT INTO gallery_items (title, media_type, file_url, note, file_data, mime_type)
     VALUES ($1, $2, '', $3, $4, $5)
     RETURNING id;`,
    [safeTitle || "Memory", safeMediaType, safeNote, media.buffer, media.mimetype]
  );

  const newId = insertResult.rows[0].id;
  const fileUrl = `/api/media/gallery/${newId}`;

  const result = await pool.query(
    `UPDATE gallery_items SET file_url = $1 WHERE id = $2 RETURNING ${GALLERY_COLUMNS};`,
    [fileUrl, newId]
  );

  res.status(201).json(result.rows[0]);
});

app.patch("/api/gallery/:id", async (req, res) => {
  const { id } = req.params;
  const { title } = req.body as { title?: string };

  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required." });
    return;
  }

  const result = await pool.query(
    `UPDATE gallery_items SET title = $1 WHERE id = $2 RETURNING ${GALLERY_COLUMNS};`,
    [title.trim(), id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Media item not found." });
    return;
  }

  res.json(result.rows[0]);
});

app.delete("/api/gallery/:id", async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "DELETE FROM gallery_items WHERE id = $1 RETURNING id;",
    [id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Media item not found." });
    return;
  }

  res.status(204).send();
});

/* ═══════════════════════════════════════════════════════
   START
   ═══════════════════════════════════════════════════════ */
async function start() {
  await initDb();
  app.listen(port, () => {
    console.log(`Finest Monia API running on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
