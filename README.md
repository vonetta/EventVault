# EventVault

Private event media delivery for ticketed guests.

## What it does

- Guests enter a **ticket code** to open their vault
- **VIP**: personal photos + all speaker sessions across event days
- **Standard**: group gallery only
- Admin imports guests and **auto-generates ticket codes**
- Admin uploads/tags media to guests and sessions

## Cost-conscious stack

| Piece | Service | Notes |
| --- | --- | --- |
| App hosting | **Vercel** (Hobby) | Free for this size |
| Database | **MongoDB Atlas** (M0) | Guests, codes, metadata |
| Media files | **Cloudflare R2** | Cheapest practical photo/video storage |
| Railway | Not required for v1 | Avoids an extra bill |

Photos/videos are **not** stored in MongoDB.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in:
   - `MONGODB_URI`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - Optional R2 keys (without R2, uploads go to local `/uploads` for development)
2. Install and run:

```bash
npm install
npm run dev
```

3. Open `/admin/login`, create the 3-day event, import guests, upload media.
4. Open `/` and enter a generated ticket code.

## Deploy (Vercel)

1. Push this repo to GitHub
2. Import the project in Vercel
3. Add the same env vars in Vercel project settings
4. Create a free Cloudflare R2 bucket and add those env vars for production media

## Access model

| Tier | Access |
| --- | --- |
| VIP | Personal photos + all session videos + group gallery |
| Standard | Group gallery only |
