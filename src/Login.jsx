import { useState } from 'react'
import { signIn } from './lib/auth'

export default function Login({ onSuccess }) {
  const [email, setEmail] = useState('talk@orkestro.com.au')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await signIn(email.trim(), password)
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onSuccess(res.user)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow">
        <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
        <p className="mt-2 text-sm text-slate-600">Sign in to your Orkestro account.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block text-sm">
            <div className="text-slate-700 mb-1">Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
              required
            />
          </label>

          <label className="block text-sm">
            <div className="text-slate-700 mb-1">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
              required
            />
          </label>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full px-4 py-2 text-white"
              style={{ background: 'linear-gradient(135deg, #37d0ff 0%, #467bfd 30%, #5d63fd 62%, #b01cf5 100%)' }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
