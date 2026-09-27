import { supabase } from './supabase'

const DEMO_USER = {
  email: 'talk@orkestro.com.au',
  password: 'Orkestro2026!!',
  name: 'Orkestro Demo',
}

const DEMO_USERS = [
  DEMO_USER,
  { email: 'Adam@orkestro.com.au', password: 'Orkestro2026!!', name: 'Adam Orkestro' },
]

export function buildRlsPolicySummary() {
  return {
    status: 'ready-for-later-auth',
    note: 'The deals table is RLS-enabled and prepared for future per-user policies once auth is added.',
  }
}

export async function signIn(email, password) {
  if (supabase) {
    try {
      const res = await supabase.auth.signInWithPassword({ email, password })
      if (res.error) {
        return { error: res.error.message }
      }
      const user = res.data?.user ?? null
      if (user) {
        // store minimal info locally for demo convenience
        window.localStorage.setItem('orkestro-user', JSON.stringify({ id: user.id, email: user.email }))
      }
      return { user }
    } catch (err) {
      return { error: err.message || String(err) }
    }
  }

  // Fallback demo auth (local-only)
  const match = DEMO_USERS.find((u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password)
  if (match) {
    const user = { id: `demo-${match.email.split('@')[0]}`, email: match.email, name: match.name }
    window.localStorage.setItem('orkestro-user', JSON.stringify(user))
    return { user }
  }

  return { error: 'Invalid credentials' }
}

export async function signOut() {
  if (supabase) {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      // ignore
    }
  }
  try {
    window.localStorage.removeItem('orkestro-user')
  } catch (e) {
    // ignore
  }
}

export function getUserSession() {
  try {
    const raw = window.localStorage.getItem('orkestro-user')
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

export function onAuthStateChange(cb) {
  if (supabase) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      cb(event, session ?? null)
    })
    return () => data.subscription.unsubscribe()
  }

  // No-op for demo mode
  return () => {}
}
