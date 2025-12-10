# Fresh Alt-Text Stack

Lightweight backend + frontend built together for quick alt-text generation with guarded token usage.

## Run locally
```bash
npm run start:fresh
# opens on http://localhost:4000
```

## API
- `POST /api/alt-text`
  - Body:
    ```json
    {
      "image": { "base64": "…", "width": 600, "height": 400, "mime_type": "image/jpeg" },
      "context": { "title": "Hero banner", "pageTitle": "Home" }
    }
    ```
  - Returns `{ altText, warnings[], usage, meta }`
  - Auth (optional): set `ALT_API_TOKEN` and send `Authorization: Bearer <token>` or `X-API-Key: <token>`. For per-site limits, send `X-Site-Key: <siteId>`.
  - CORS: lock to `ALLOWED_ORIGINS` if set.
  - Rate limit: `RATE_LIMIT_PER_SITE` per minute (per `X-Site-Key`), optional `RATE_LIMIT_GLOBAL` for all sites.
  - Cache: deduplication by base64 hash; Redis-backed if `REDIS_URL` is set, otherwise in-memory.
  - Batch queue: `POST /api/jobs` with `{ images: [{ image, context? }], context? }`; poll `/api/jobs/:jobId`. Queue and job records use Redis if available; otherwise in-memory.
- `POST /api/usage` (site summary, optional per-user breakdown with `X-WP-User-ID`/`X-WP-User-Email`; headers: `X-Site-Key` and bearer if token mode enabled)
- `GET /billing/plans` (public)
- `POST /billing/checkout` (token + `X-Site-Key`; creates Stripe checkout session)
- `POST /billing/portal` (token + `X-Site-Key`; requires `customerId`)
- `GET /billing/subscription` (token + `X-Site-Key`; optional)

## Notes
- Validation is gentle: only blocks clearly bad payloads (invalid base64 or >512KB); otherwise returns warnings.
- If `ALTTEXT_OPENAI_API_KEY` (or `OPENAI_API_KEY`) is missing, the service returns a deterministic fallback alt text instead of erroring.
- Frontend lives in `fresh-stack/frontend` and is served by the same Express app. Uploading an image auto-fills dimensions to keep token costs predictable.
- Env sample: see `fresh-stack/.env.example`.
- Optional Redis for cache/rate limit/queue: set `REDIS_URL`. Billing uses Stripe; set `STRIPE_SECRET_KEY` and price IDs (`ALTTEXT_AI_STRIPE_PRICE_PRO/AGENCY/CREDITS`).
