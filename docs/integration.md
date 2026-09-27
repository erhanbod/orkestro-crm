**Website -> CRM Integration (Vercel webhook)**

Overview
- Use a serverless webhook on Vercel to receive contact form submissions from your website and write them into the CRM's `deals` table in Supabase.
 - Use a serverless webhook on Vercel to receive contact form submissions from your website and write them into the CRM's `deals` table in Supabase.

Why this approach
- Keeps Supabase keys server-side (use `service_role` key) so clients cannot write directly with elevated privileges.
- Simple to deploy to Vercel and easy to secure with a shared `FORM_WEBHOOK_SECRET` header and optional CAPTCHA.

Setup
1. Add the API file `api/submit-contact.js` to the project (already added).
2. In Vercel project settings add the following environment variables:
  - `FORM_WEBHOOK_SECRET` — random secret.
  - `SUPABASE_URL` — your Supabase URL.
  - `SUPABASE_SERVICE_ROLE_KEY` — Supabase service_role key.
  - `ALLOWED_ORIGINS` — e.g., https://your-site.com
  - optionally `CAPTCHA_PROVIDER` & `CAPTCHA_SECRET`.

3. Deploy to Vercel.

Client-side form example (POST JSON)
```js
fetch('https://your-vercel-app.com/api/submit-contact', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-form-webhook-secret': 'YOUR_SHARED_SECRET',
  },
  body: JSON.stringify({
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '0412 345 678',
    company: 'Acme Pty Ltd',
    message: 'Interested in your services',
    page_url: window.location.href,
  }),
})
.then(r => r.json()).then(console.log)
```

Field mapping
- `name` -> `deal.name` (appends "Website lead")
- `email`/`name` -> `contact_name`
- `company` -> `account_or_partner`
- `message` -> first `deal_updates` entry
- `page_url` stored in the message text

Security updates in this repo
- The webhook now implements safer defaults in `api/submit-contact.js`:
  - Origin checks via `ALLOWED_ORIGINS` env var.
  - Honeypot field detection (`honeypot` or `hp`).
  - Optional server-side CAPTCHA verification (Cloudflare Turnstile or hCaptcha) using `CAPTCHA_PROVIDER` and `CAPTCHA_SECRET`.
  - Basic rate-limiting per IP and deduplication by email.
  - Input validation and sanitization; the `SUPABASE_SERVICE_ROLE_KEY` remains server-side only.

Warnings
- Never store `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` env var — that exposes it to the browser.
- CAPTCHA must be enabled for browser forms; origin checks are not sufficient.
- In-memory rate-limiting is a fallback only. Use Upstash Redis (free tier) for production rate-limiting.
- Turn on RLS for contact/deals tables and limit browser anon key permissions; only the serverless function should use the service role key.

Security & recommendations
- Use a CAPTCHA (reCAPTCHA v3 or hCaptcha) on the form and verify server-side before inserting.
- Rate-limit the endpoint (Vercel edge middleware or 3rd-party service) to block spammers.
- Log incoming submissions to a secure logging sink (Datadog, Papertrail) for audit.
- Optionally, deduplicate by `email` within a short window to avoid duplicate leads.

Optional: create a `contacts` table and insert the contact there too, then link `deals.contact_id`.
