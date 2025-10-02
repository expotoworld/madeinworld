# Ebook Editor (Vite + React)

This is the web interface for Author role to write and manage the ebook.

## Scripts
- `npm run dev` – start dev server
- `npm run build` – production build
- `npm run preview` – preview build

## Env
- `VITE_API_BASE` – base URL for ebook-service if not running on same origin.

## Auth
Passwordless email login (Author-only) to be implemented. For now, the app shows a placeholder and relies on a JWT in memory to call `/api` endpoints.

## Saving behavior
- Debounced save (2s after typing cessation)
- Safeguard autosave every 10 minutes
- UI indicator: "Saving…" → "Saved!"

## Endpoints expected
- `PUT /api/ebook` – autosave draft
- `POST /api/ebook/versions` – manual snapshot
- `POST /api/ebook/publish` – publish immutable version
- `GET /api/ebook/versions?kind=published&limit=2` – app consumption

