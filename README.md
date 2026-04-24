# YouTube sharing — frontend (React + Vite)

SPA for the Remitano-style exercise. In **local dev**, API calls go to the **same origin** as the Vite app (`/api/...`); Vite **proxies** them to Rails on port 3000 (see `vite.config.js`). That avoids browser **CORS** issues and the generic **“Failed to fetch”** error.

## Setup

```bash
npm install
cp .env.example .env
```

For local development, **leave `VITE_API_URL` unset** (or commented) in `.env` so the proxy is used.  
If you previously set `VITE_API_URL=http://localhost:3000`, remove it for dev or the browser will call Rails directly and may hit CORS.

## Dev server

1. Start Rails on **port 3000** (`backend/` → `bin/rails server -p 3000`).
2. Then:

```bash
npm run dev
```

Open **http://localhost:5173** (or **http://127.0.0.1:5173**).

## Production build

```bash
npm run build
```

Set **`VITE_API_URL`** to your deployed API (HTTPS). No Vite proxy in production builds.
