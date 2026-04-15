# Finest Monia

A modern romantic web application built with:
- React + TypeScript (frontend)
- Node.js + Express + TypeScript (backend)
- PostgreSQL (data storage)

## Features

- Elegant sidebar navigation (`Overview`, `Playlist`, `Gallery`, `Upload`)
- Upload and play MP3/MP4 tracks
- Upload and display photo/video memories
- Delete tracks and gallery moments
- Stylish romantic UI designed to feel intimate and premium

## Project structure

- `client` - React app
- `server` - Express API and media upload handling

## 1) Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Update `.env` if needed:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finest_monia
```

Create PostgreSQL DB:

```sql
CREATE DATABASE finest_monia;
```

Run backend:

```bash
npm run dev
```

## 2) Frontend setup

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## API endpoints

- `GET /api/playlist`
- `POST /api/playlist`
- `DELETE /api/playlist/:id`
- `GET /api/gallery`
- `POST /api/gallery`
- `DELETE /api/gallery/:id`

Uploaded files are served from:

- `GET /uploads/<filename>`
