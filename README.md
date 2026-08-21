# EventVault

Private event media delivery for ticketed guests.

## Access model

| Tier | Access |
| --- | --- |
| VIP | Personal photos + speaker session media + group gallery |
| Standard | Group gallery only |

## What it does

- Guests enter a **ticket code** (no passwords)
- Admin imports guests (deduped by email), auto-generates codes, can email/copy/regenerate
- Admin uploads group photos, VIP personal photos, and session media
- Multi-event admin switcher (create and switch events)
- Media is served only through an **authorized** `/api/media/:id` proxy

## Photo storage cost (Cloudflare R2)

R2 free tier includes **10 GB**. Egress is free.

| Scenario | Approx size | Monthly storage |
| --- | --- | --- |
| Small retreat (~150 photos) | ~0.3 GB | **$0** |
| Typical retreat (~400 photos) | ~1–2 GB | **$0** |
| Heavy weekend (~1000 photos) | ~4 GB | **$0** |
| Very large (~2000 large files) | ~15 GB | **~$0.08** |

**Session videos:** prefer **YouTube Unlisted** — paste a single video **or a playlist** in admin (no R2 video cost). Guests play the playlist in the vault. Optional “available until” date hides them after that day.

## Stack

| Piece | Service |
| --- | --- |
| App | Next.js on **Vercel** |
| Database | **MongoDB Atlas** |
| Media | **Cloudflare R2** (local `/uploads` in development only) |
| Email (optional) | **Resend** |

## Security (v1)

- HttpOnly session cookies; shorter TTLs; production requires a strong `SESSION_SECRET`
- Timing-safe admin password check; rate limits on ticket + admin login
- Same-origin checks on state-changing APIs
- Guest tier re-checked from the database on every vault load
- Upload MIME/size limits and event/guest/session ownership checks
- No public R2 URLs for private media; legacy `?key=` media URLs disabled

## Local setup

1. Copy `.env.example` to `.env.local` and set at least:
   - `MONGODB_URI`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET` (≥ 32 characters)
2. Optional: R2 keys, `RESEND_API_KEY` + `EMAIL_FROM`, `APP_URL`
3. Install and run:

```bash
npm install
npm run dev
```

4. Open `/admin/login`, create an event, import guests, upload media.
5. Open `/` and enter a generated ticket code.

## Deploy (Vercel)

1. Import the GitHub repo in Vercel
2. Add the same env vars (R2 required for production media)
3. Do **not** rely on a public R2 bucket URL for guest photos

## Stage 2 status

- Ticket email via Resend (import + per-guest send)
- Multi-event create/switch in admin
- Still later: face tagging, payments, richer standard-tier session packs
