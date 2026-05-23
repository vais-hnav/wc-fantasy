# WC26 Fantasy

A lightweight World Cup 2026 fantasy app with fixtures, standings, private leagues, admin controls, and server-side API-Football access.

## Run Locally

```bash
python3 server.py
```

Open `http://localhost:8000`.

## Environment

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set:

- `API_FOOTBALL_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DATABASE_URL`

Optional if you want to override the built-in auth project:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Free Hosting

Recommended option: Render Free Web Service.

1. Push this folder to a GitHub repository.
2. Open Render and create a new Blueprint from that repository.
3. Render will read `render.yaml`.
4. Add `API_FOOTBALL_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `DATABASE_URL`.
5. Deploy.

The app uses the host-provided `PORT` variable automatically.

## Database

The app uses Postgres when `DATABASE_URL` is present. It creates a compact
`app_stores` table automatically and stores app state as JSONB documents keyed by
store name.

If `DATABASE_URL` is not present, the app falls back to local `.data/*.json`
files for development.

## Notes

- API-Football calls stay server-side.
- Local JSON stores are excluded from the Docker image.
- Free hosts may sleep after inactivity, so use `DATABASE_URL` on Render for persistent app data.
