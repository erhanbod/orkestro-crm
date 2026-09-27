import { createClient } from '@supabase/supabase-js'
import { Redis } from '@upstash/redis'

// Secure Vercel serverless webhook to accept website contact forms.
// Recommended env vars (set in Vercel):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (service_role, never expose to client)
// - ALLOWED_ORIGINS (comma separated list) — origins you expect requests from (optional)
// - FORM_WEBHOOK_SECRET (optional; only for server-to-server use)
// - CAPTCHA_PROVIDER = 'turnstile' | 'hcaptcha' (optional)
// - CAPTCHA_SECRET (secret for chosen provider)

function makeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

// Rate limiting config
const RATE_LIMIT_WINDOW_SEC = 60 // 1 minute
const RATE_LIMIT_MAX = 10
let redisClient = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  } catch (e) {
    console.warn('Failed to initialize Upstash Redis client', e)
    redisClient = null
  }
} else {
  // warn: in-memory limiter will be used as a fallback — not reliable on Vercel
  var ipCounters = new Map()
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (xf) return String(xf).split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

async function verifyCaptcha(provider, secret, token, remoteIp) {
  if (!provider || !secret || !token) return false
  try {
    if (provider === 'turnstile') {
      const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      })
      const j = await resp.json()
      return Boolean(j?.success)
    }
    if (provider === 'hcaptcha') {
      const resp = await fetch('https://hcaptcha.com/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      })
      const j = await resp.json()
      return Boolean(j?.success)
    }
    return false
  } catch (e) {
    console.error('Captcha verify error', e)
    return false
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = getClientIp(req)
  try {
    if (redisClient) {
      const key = `rl:${ip}`
      const hits = await redisClient.incr(key)
      if (hits === 1) await redisClient.expire(key, RATE_LIMIT_WINDOW_SEC)
      if (hits > RATE_LIMIT_MAX) return res.status(429).json({ error: 'Too many requests' })
    } else {
      // best-effort in-memory fallback
      const nowTs = Date.now()
      const counter = ipCounters.get(ip) || { count: 0, start: nowTs }
      if (nowTs - counter.start > RATE_LIMIT_WINDOW_SEC * 1000) {
        counter.count = 0
        counter.start = nowTs
      }
      counter.count += 1
      ipCounters.set(ip, counter)
      if (counter.count > RATE_LIMIT_MAX) return res.status(429).json({ error: 'Too many requests' })
    }
  } catch (e) {
    console.warn('Rate limit check failed', e)
  }

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const origin = req.headers.origin || req.headers.referer || null

  const payload = req.body || {}

  // Honeypot: bot submissions often populate hidden fields. Expect empty.
  const honey = (payload.honeypot || payload.hp || '').toString().trim()
  if (honey) return res.status(400).json({ error: 'Bot detected' })

  const name = String(payload.name || payload.fullName || '').slice(0, 200).trim()
  const email = String(payload.email || '').slice(0, 254).trim()
  const phone = String(payload.phone || payload.tel || '').slice(0, 50).trim()
  const company = String(payload.company || payload.org || '').slice(0, 200).trim()
  const messageRaw = String(payload.message || payload.enquiry || payload.msg || '').slice(0, 2000)
  const page_url = String(payload.page_url || payload.pageUrl || payload.source || '').slice(0, 2000) || null
  const captchaToken = String(payload.captchaToken || payload.turnstileToken || payload.hcaptchaToken || '')

  // Require CAPTCHA verification for browser submissions. Only allow bypass when
  // a trusted server-to-server header (FORM_WEBHOOK_SECRET) is present.
  const secret = process.env.FORM_WEBHOOK_SECRET
  const header = req.headers['x-form-webhook-secret'] || req.headers['x-form-secret']

  if (!(secret && header === secret)) {
    // Not a server-to-server call. Enforce captcha.
    const provider = process.env.CAPTCHA_PROVIDER || ''
    const captchaSecret = process.env.CAPTCHA_SECRET || ''
    if (!provider || !captchaSecret) {
      return res.status(401).json({ error: 'CAPTCHA required (server not configured)' })
    }

    const ok = await verifyCaptcha(provider, captchaSecret, captchaToken, ip)
    if (!ok) return res.status(401).json({ error: 'CAPTCHA verification failed' })

    // Verify hostname returned by captcha matches request origin (best-effort)
    try {
      const originHost = origin ? new URL(origin).hostname : null
      // provider verify function does not return hostname; perform a direct verify to inspect hostname
      // For simplicity, re-run verification to get the response and check hostname when provider is turnstile/hcaptcha
      if (provider === 'turnstile') {
        const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: captchaSecret, response: captchaToken, remoteip: ip }),
        })
        const j = await resp.json()
        if (originHost && j?.hostname && j.hostname !== originHost) {
          return res.status(401).json({ error: 'CAPTCHA hostname mismatch' })
        }
      }
      if (provider === 'hcaptcha') {
        const resp = await fetch('https://hcaptcha.com/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: captchaSecret, response: captchaToken, remoteip: ip }),
        })
        const j = await resp.json()
        if (originHost && j?.hostname && j.hostname !== originHost) {
          return res.status(401).json({ error: 'CAPTCHA hostname mismatch' })
        }
      }
    } catch (e) {
      console.warn('Failed to verify captcha hostname', e)
    }
  }

  if (!email && !name) {
    return res.status(400).json({ error: 'Missing contact name or email' })
  }

  // Basic email regex
  const emailValid = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (email && !emailValid) return res.status(400).json({ error: 'Invalid email' })

  // Simple sanitization: strip angle brackets
  const message = messageRaw.replace(/[<>]/g, '')

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Dedupe: if a recent deal exists with same contact_name or email, return it instead of inserting
  try {
    if (email) {
      const look = await supabase
        .from('deals')
        .select('id,contact_name,created_at')
        .ilike('contact_name', `%${email}%`)
        .limit(1)

      if (look.error) console.warn('Dedupe lookup error', look.error)
      if (look.data && look.data.length > 0) {
        const existing = look.data[0]
        // If found within last 7 days, skip insert
        const created = new Date(existing.created_at).getTime()
        if (Date.now() - created < 7 * 24 * 60 * 60 * 1000) {
          return res.status(200).json({ ok: true, id: existing.id, note: 'deduplicated' })
        }
      }
    }
  } catch (e) {
    console.warn('Dedupe check failed', e)
  }

  const now = new Date().toISOString()

  const newDeal = {
    id: makeId('deal'),
    name: name ? `${name} — Website lead` : `Website lead — ${email}`,
    aud_value: 0,
    stage: 'Lead',
    owner: null,
    account_or_partner: company || null,
    contact_name: name || email,
    expected_close_date: now,
    lead_source: 'Website',
    probability: 0,
    next_activity: '',
    created_at: now,
    is_archived: false,
    archived_at: null,
    deal_updates: [
      {
        id: makeId('update'),
        author: 'Website Form',
        message: message || `Contact from ${page_url || 'website'}`,
        created_at: now,
      },
    ],
  }

  try {
    const { error } = await supabase.from('deals').insert([newDeal])
    if (error) {
      console.error('Supabase insert error', error)
      return res.status(500).json({ error: 'Insert failed', details: error.message })
    }

    return res.status(201).json({ ok: true, id: newDeal.id })
  } catch (err) {
    console.error('Webhook handler error', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
