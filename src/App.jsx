import { useEffect, useMemo, useState } from 'react'
import { seedDeals } from './data/deals'
import { supabase } from './lib/supabase'
import orkestroLogo from './assets/Orkestro.svg'

const stages = [
  'Lead',
  'Contact Made',
  'Presentation',
  'Negotiation',
  'Verbal Won',
]

const currencyFormatter = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
})

const stageStyles = {
  Lead: 'bg-sky-100 text-sky-700',
  'Contact Made': 'bg-indigo-100 text-indigo-700',
  Presentation: 'bg-violet-100 text-violet-700',
  Negotiation: 'bg-amber-100 text-amber-700',
  'Verbal Won': 'bg-emerald-100 text-emerald-700',
}

const quickActions = [
  { key: 'contact', label: 'Contacts', icon: '👤', hint: 'Add contact context' },
  { key: 'account', label: 'Accounts', icon: '🏢', hint: 'Add account context' },
  { key: 'task', label: 'Tasks', icon: '✓', hint: 'Capture next task' },
  { key: 'note', label: 'Notes', icon: '✎', hint: 'Capture notes' },
  { key: 'meeting', label: 'Meetings', icon: '📅', hint: 'Log meeting' },
  { key: 'product', label: 'Products', icon: '📦', hint: 'Add product interest' },
]

const brandGradient = 'linear-gradient(135deg, #37d0ff 0%, #467bfd 30%, #5d63fd 62%, #b01cf5 100%)'

function BrandLogo() {
  return (
    <img
      src={orkestroLogo}
      alt="Orkestro"
      className="h-auto w-full max-w-[760px]"
    />
  )
}

function normalizeDeal(deal) {
  return {
    ...deal,
    aud_value: Number(deal.aud_value ?? 0),
    deal_updates: Array.isArray(deal.deal_updates)
      ? deal.deal_updates.map((update) => ({
          id: update.id ?? `update-${Date.now()}-${Math.random()}`,
          author: update.author ?? 'System',
          message: update.message ?? '',
          created_at: update.created_at ?? new Date().toISOString(),
        }))
      : [],
  }
}

function App() {
  const [deals, setDeals] = useState(seedDeals)
  const [draggedDealId, setDraggedDealId] = useState(null)
  const [selectedDealId, setSelectedDealId] = useState(seedDeals[0]?.id ?? null)
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [draftDeal, setDraftDeal] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [stageFilter, setStageFilter] = useState('All')
  const [newUpdateText, setNewUpdateText] = useState('')

  const selectedDeal = deals.find((deal) => deal.id === selectedDealId) ?? null

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    async function loadDeals() {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('created_at', { ascending: true })

      if (!error && data) {
        setDeals(data.map(normalizeDeal))
      }
    }

    loadDeals()

    const channel = supabase
      .channel('crm-deals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDeals((current) => [...current, normalizeDeal(payload.new)])
          }

          if (payload.eventType === 'UPDATE') {
            setDeals((current) =>
              current.map((deal) =>
                deal.id === payload.new.id ? normalizeDeal(payload.new) : deal,
              ),
            )
          }

          if (payload.eventType === 'DELETE') {
            setDeals((current) =>
              current.filter((deal) => deal.id !== payload.old.id),
            )
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const pipelineTotal = useMemo(
    () => deals.reduce((sum, deal) => sum + Number(deal.aud_value ?? 0), 0),
    [deals],
  )

  const filteredDeals = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return deals.filter((deal) => {
      const matchesStage = stageFilter === 'All' || deal.stage === stageFilter
      const searchableText = [
        deal.name,
        deal.account_or_partner,
        deal.owner,
        deal.contact_name,
        deal.lead_source,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch)

      return matchesStage && matchesSearch
    })
  }, [deals, searchTerm, stageFilter])

  const dealsByStage = useMemo(
    () =>
      stages.reduce((acc, stage) => {
        acc[stage] = filteredDeals.filter((deal) => deal.stage === stage)
        return acc
      }, {}),
    [filteredDeals],
  )

  const moveDealToStage = async (dealId, nextStage) => {
    if (!dealId || !nextStage) {
      return
    }

    setDeals((current) =>
      current.map((deal) =>
        deal.id === dealId ? { ...deal, stage: nextStage } : deal,
      ),
    )

    if (supabase) {
      await supabase.from('deals').update({ stage: nextStage }).eq('id', dealId)
    }
  }

  const startEditing = () => {
    if (!selectedDeal) {
      return
    }

    setDraftDeal({
      ...selectedDeal,
      aud_value: selectedDeal.aud_value ?? 0,
      probability: selectedDeal.probability ?? 0,
    })
    setIsEditing(true)
  }

  const startCreating = (prefill = {}) => {
    const today = new Date().toISOString().slice(0, 10)
    const newDealDraft = {
      id: crypto.randomUUID ? crypto.randomUUID() : `deal-${Date.now()}`,
      name: '',
      aud_value: 0,
      stage: 'Lead',
      owner: '',
      account_or_partner: '',
      contact_name: '',
      expected_close_date: today,
      lead_source: '',
      probability: 0,
      next_activity: '',
      created_at: new Date().toISOString(),
      deal_updates: [],
      ...prefill,
    }

    setDraftDeal(newDealDraft)
    setIsCreating(true)
  }

  const updateDraftField = (field, value) => {
    setDraftDeal((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const addDealUpdate = async () => {
    if (!selectedDeal || !newUpdateText.trim()) {
      return
    }

    const timestamp = new Date().toISOString()
    const nextUpdate = {
      id: crypto.randomUUID ? crypto.randomUUID() : `update-${Date.now()}`,
      author: 'Current user',
      message: newUpdateText.trim(),
      created_at: timestamp,
    }

    const updatedDeal = normalizeDeal({
      ...selectedDeal,
      next_activity: nextUpdate.message,
      deal_updates: [nextUpdate, ...(selectedDeal.deal_updates ?? [])],
    })

    setDeals((current) =>
      current.map((deal) => (deal.id === selectedDeal.id ? updatedDeal : deal)),
    )
    setNewUpdateText('')

    if (supabase) {
      try {
        await supabase
          .from('deals')
          .update({
            next_activity: updatedDeal.next_activity,
            deal_updates: updatedDeal.deal_updates,
          })
          .eq('id', selectedDeal.id)
      } catch (error) {
        console.warn('Deal update log sync failed:', error)
      }
    }
  }

  const saveDeal = async () => {
    if (!selectedDeal || !draftDeal) {
      return
    }

    const normalizedDeal = normalizeDeal({
      ...selectedDeal,
      ...draftDeal,
      aud_value: Number(draftDeal.aud_value ?? 0),
      probability: Number(draftDeal.probability ?? 0),
    })

    setDeals((current) =>
      current.map((deal) => (deal.id === selectedDeal.id ? normalizedDeal : deal)),
    )

    if (supabase) {
      await supabase
        .from('deals')
        .update({
          name: normalizedDeal.name,
          aud_value: normalizedDeal.aud_value,
          stage: normalizedDeal.stage,
          owner: normalizedDeal.owner,
          account_or_partner: normalizedDeal.account_or_partner,
          contact_name: normalizedDeal.contact_name,
          expected_close_date: normalizedDeal.expected_close_date,
          lead_source: normalizedDeal.lead_source,
          probability: normalizedDeal.probability,
          next_activity: normalizedDeal.next_activity,
          deal_updates: normalizedDeal.deal_updates,
        })
        .eq('id', selectedDeal.id)
    }

    setIsEditing(false)
    setDraftDeal(null)
  }

  const createDeal = async () => {
    if (!draftDeal || !draftDeal.name.trim()) {
      return
    }

    const normalizedDeal = normalizeDeal({
      ...draftDeal,
      name: draftDeal.name.trim(),
      aud_value: Number(draftDeal.aud_value ?? 0),
      probability: Number(draftDeal.probability ?? 0),
    })

    setDeals((current) => [normalizedDeal, ...current])
    setSelectedDealId(normalizedDeal.id)

    if (supabase) {
      await supabase.from('deals').insert([
        {
          id: normalizedDeal.id,
          name: normalizedDeal.name,
          aud_value: normalizedDeal.aud_value,
          stage: normalizedDeal.stage,
          owner: normalizedDeal.owner,
          account_or_partner: normalizedDeal.account_or_partner,
          contact_name: normalizedDeal.contact_name,
          expected_close_date: normalizedDeal.expected_close_date,
          lead_source: normalizedDeal.lead_source,
          probability: normalizedDeal.probability,
          next_activity: normalizedDeal.next_activity,
          created_at: normalizedDeal.created_at,
          deal_updates: normalizedDeal.deal_updates,
        },
      ])
    }

    setIsCreating(false)
    setDraftDeal(null)
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex gap-4">
          <aside className="flex w-20 shrink-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:w-24">
            <button
              type="button"
              onClick={() => setSelectedDealId(null)}
              className="mb-1 flex h-10 w-10 items-center justify-center self-center rounded-xl border border-slate-200 bg-slate-50 text-lg text-slate-600 transition hover:border-[#5d63fd] hover:bg-[#f0ecff] hover:text-[#467bfd]"
              title="Home"
              aria-label="Home"
            >
              🏠
            </button>
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Tools
            </div>
            {quickActions.map((action) => (
              <button
                key={action.key}
                type="button"
                title={action.hint}
                onClick={() => {
                  const prefill =
                    action.key === 'contact'
                      ? { contact_name: 'New contact' }
                      : action.key === 'account'
                        ? { account_or_partner: 'New account' }
                        : action.key === 'task'
                          ? { next_activity: 'Follow up task' }
                          : action.key === 'meeting'
                            ? { next_activity: 'Schedule meeting' }
                            : action.key === 'product'
                              ? { lead_source: 'Product interest' }
                              : { next_activity: 'Add note' }

                  startCreating(prefill)
                }}
                className="group flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-3 text-center transition hover:border-[#5d63fd] hover:bg-[#f0ecff] hover:text-[#467bfd]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg shadow-sm group-hover:bg-[#eaf3ff]">
                  {action.icon}
                </span>
                <span className="text-[10px] font-medium text-slate-600 group-hover:text-[#467bfd]">
                  {action.label}
                </span>
              </button>
            ))}
          </aside>

          <div className="flex-1">
            <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startCreating}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-white transition shadow-[0_10px_20px_rgba(45,125,247,0.28)] hover:brightness-110"
              style={{ background: brandGradient }}
            >
              + New deal
            </button>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {deals.length} deals
            </div>
            <div className="rounded-full text-white px-3 py-1 text-xs font-medium"
              style={{ background: 'linear-gradient(135deg, #1f2a3a 0%, #2d7df7 36%, #6a5fe8 100%)' }}
            >
              {currencyFormatter.format(pipelineTotal)} pipeline
            </div>
          </div>
            </header>

            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-slate-400" aria-hidden="true">
              <path d="M21 21L16.65 16.65M18 10.5C18 14.6421 14.6421 18 10.5 18C6.35786 18 3 14.6421 3 10.5C3 6.35786 6.35786 3 10.5 3C14.6421 3 18 6.35786 18 10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search deals, owners, accounts..."
              className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <span>Stage</span>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none transition focus:border-sky-400"
            >
              <option value="All">All</option>
              {stages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
            </div>

            {isCreating && draftDeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-slate-900">Create new deal</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false)
                    setDraftDeal(null)
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Deal name
                  <input
                    value={draftDeal.name}
                    onChange={(event) => updateDraftField('name', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                    placeholder="New opportunity"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  AUD value
                  <input
                    type="number"
                    value={draftDeal.aud_value}
                    onChange={(event) => updateDraftField('aud_value', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Stage
                  <select
                    value={draftDeal.stage}
                    onChange={(event) => updateDraftField('stage', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  >
                    {stages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Owner
                  <input
                    value={draftDeal.owner}
                    onChange={(event) => updateDraftField('owner', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Account / partner
                  <input
                    value={draftDeal.account_or_partner}
                    onChange={(event) => updateDraftField('account_or_partner', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Contact person
                  <input
                    value={draftDeal.contact_name || ''}
                    onChange={(event) => updateDraftField('contact_name', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Expected close date
                  <input
                    type="date"
                    value={draftDeal.expected_close_date}
                    onChange={(event) => updateDraftField('expected_close_date', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Lead source
                  <input
                    value={draftDeal.lead_source || ''}
                    onChange={(event) => updateDraftField('lead_source', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Probability (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draftDeal.probability ?? 0}
                    onChange={(event) => updateDraftField('probability', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  Next activity
                  <input
                    value={draftDeal.next_activity || ''}
                    onChange={(event) => updateDraftField('next_activity', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false)
                    setDraftDeal(null)
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createDeal}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Create deal
                </button>
              </div>
            </div>
          </div>
        )}

            {isEditing && draftDeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-xl font-bold text-slate-900">Edit deal</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setDraftDeal(null)
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Deal name
                  <input
                    value={draftDeal.name}
                    onChange={(event) => updateDraftField('name', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  AUD value
                  <input
                    type="number"
                    value={draftDeal.aud_value}
                    onChange={(event) => updateDraftField('aud_value', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Stage
                  <select
                    value={draftDeal.stage}
                    onChange={(event) => updateDraftField('stage', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  >
                    {stages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Owner
                  <input
                    value={draftDeal.owner}
                    onChange={(event) => updateDraftField('owner', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Account / partner
                  <input
                    value={draftDeal.account_or_partner}
                    onChange={(event) => updateDraftField('account_or_partner', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Contact person
                  <input
                    value={draftDeal.contact_name || ''}
                    onChange={(event) => updateDraftField('contact_name', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Expected close date
                  <input
                    type="date"
                    value={draftDeal.expected_close_date}
                    onChange={(event) => updateDraftField('expected_close_date', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Lead source
                  <input
                    value={draftDeal.lead_source || ''}
                    onChange={(event) => updateDraftField('lead_source', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Probability (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={draftDeal.probability ?? 0}
                    onChange={(event) => updateDraftField('probability', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  Next activity
                  <input
                    value={draftDeal.next_activity || ''}
                    onChange={(event) => updateDraftField('next_activity', event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                  />
                </label>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setDraftDeal(null)
                  }}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveDeal}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}

            {selectedDeal ? (
              <aside className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Deal details
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">
                      {selectedDeal.name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startEditing}
                      className="rounded-full px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110"
              style={{ background: brandGradient }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDealId(null)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      Back to pipeline
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Stage</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{selectedDeal.stage}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Value</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {currencyFormatter.format(selectedDeal.aud_value)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Owner</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{selectedDeal.owner}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Close date</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {new Date(selectedDeal.expected_close_date).toLocaleDateString('en-AU', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Account / partner
                    </h3>
                    <p className="mt-2 text-base font-medium text-slate-900">
                      {selectedDeal.account_or_partner}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Contact person
                    </h3>
                    <p className="mt-2 text-base font-medium text-slate-900">
                      {selectedDeal.contact_name || 'Not assigned'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Lead source
                    </h3>
                    <p className="mt-2 text-base font-medium text-slate-900">
                      {selectedDeal.lead_source || 'Unknown'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Probability
                    </h3>
                    <p className="mt-2 text-base font-medium text-slate-900">
                      {selectedDeal.probability ?? 0}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Next activity
                    </h3>
                    <p className="mt-2 text-base font-medium text-slate-900">
                      {selectedDeal.next_activity || 'No activity queued'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Activity log
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-900">Deal updates</h3>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                      {(selectedDeal.deal_updates ?? []).length} updates
                    </span>
                  </div>

                  <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Add update
                      <textarea
                        value={newUpdateText}
                        onChange={(event) => setNewUpdateText(event.target.value)}
                        rows={3}
                        placeholder="Add a progress note, call summary, or status update..."
                        className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                      />
                    </label>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={addDealUpdate}
                        className="rounded-full px-3 py-1.5 text-sm font-medium text-white transition hover:brightness-110"
                        style={{ background: brandGradient }}
                      >
                        Save update
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(selectedDeal.deal_updates ?? []).length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                        No updates yet. Add the first note to start the deal activity log.
                      </div>
                    ) : (
                      (selectedDeal.deal_updates ?? []).map((update) => (
                        <div key={update.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-slate-800">{update.author}</span>
                            <time className="text-xs text-slate-500">
                              {new Date(update.created_at).toLocaleString('en-AU', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </div>
                          <p className="text-sm leading-6 text-slate-700">{update.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </aside>
            ) : (
              <>
                <div className="mb-5 grid gap-3 md:grid-cols-5">
                  {stages.map((stage) => {
                    const stageDeals = dealsByStage[stage] ?? []
                    const stageValue = stageDeals.reduce(
                      (sum, deal) => sum + Number(deal.aud_value ?? 0),
                      0,
                    )

                    return (
                      <div key={stage} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${stageStyles[stage]}`}>
                            {stage}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {stageDeals.length}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-700">
                          {currencyFormatter.format(stageValue)}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  {stages.map((stage) => (
                    <div
                      key={stage}
                      className="min-h-[520px] rounded-xl border border-slate-200 bg-slate-50 p-2.5 shadow-inner"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => moveDealToStage(draggedDealId, stage)}
                    >
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">{stage}</span>
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {dealsByStage[stage]?.length ?? 0}
                        </span>
                      </div>

                      {((dealsByStage[stage] ?? []).length === 0) && (
                        <div className="flex min-h-[110px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/80 p-4 text-center text-xs text-slate-400">
                          No matching deals
                        </div>
                      )}

                      <div className="space-y-2.5">
                        {(dealsByStage[stage] ?? []).map((deal) => (
                          <article
                            key={deal.id}
                            draggable
                            onDragStart={() => setDraggedDealId(deal.id)}
                            onDragEnd={() => setDraggedDealId(null)}
                            className="cursor-grab rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md active:cursor-grabbing"
                          >
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDealId(deal.id)}
                                  className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 transition hover:text-sky-700"
                                >
                                  {deal.name}
                                </button>
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">{deal.account_or_partner}</p>
                              </div>
                              <span className={`inline-flex rounded-full px-1.5 py-1 text-[9px] font-semibold ${stageStyles[stage]}`}>
                                {deal.owner}
                              </span>
                            </div>

                            <div className="mb-2 text-base font-bold text-slate-900">
                              {currencyFormatter.format(deal.aud_value)}
                            </div>

                            <dl className="space-y-1.5 text-[11px] text-slate-600">
                              <div className="flex items-center justify-between gap-3">
                                <dt>Owner</dt>
                                <dd className="font-medium text-slate-800">{deal.owner}</dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt>Partner</dt>
                                <dd className="truncate font-medium text-slate-800">{deal.account_or_partner}</dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt>Close</dt>
                                <dd className="font-medium text-slate-800">
                                  {new Date(deal.expected_close_date).toLocaleDateString('en-AU', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
