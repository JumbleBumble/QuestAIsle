import { FormEvent, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { SendHorizonal, Sparkles, Activity, KeyRound } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { GameSave, GameTemplate } from '../types/game'
import { useGameStore } from '../state/useGameStore'
import { useGameTurn } from '../hooks/useGameTurn'
import { AppSettings } from '../data/settings'

export function SessionPanel({
	template,
	save,
	settings,
}: {
	template?: GameTemplate | null
	save?: GameSave | null
	settings?: AppSettings | null
}) {
	const playerAction = useGameStore((state) => state.playerAction)
	const setPlayerAction = useGameStore((state) => state.setPlayerAction)
	const setAdvancing = useGameStore((state) => state.setAdvancing)
	const turn = useGameTurn(template ?? undefined, save ?? undefined, {
		apiKey: settings?.openaiApiKey,
		model: settings?.openaiModel,
		memoryTurnCount: settings?.memoryTurnCount,
	})

	useEffect(() => {
		setAdvancing(turn.isPending)
	}, [turn.isPending, setAdvancing])

	useEffect(() => {
		if (turn.isSuccess) {
			setPlayerAction('')
		}
	}, [turn.isSuccess, setPlayerAction])

	const valueBlocks = useMemo(() => {
		if (!template || !save) {
			return []
		}
		return template.valueDefinitions.map((def) => ({
			id: def.id,
			label: def.label,
			value: save.values[def.id],
			meta: def,
		}))
	}, [template, save])

	const renderValue = (value: unknown) => {
		if (Array.isArray(value)) {
			return value.length ? value.join(', ') : 'Empty list'
		}
		if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value)
		}
		if (value === undefined || value === null) {
			return '—'
		}
		return String(value)
	}

	const history = save?.history.slice(-5).reverse() ?? []

	const latestSuggestions = useMemo(() => {
		if (!save?.history.length) {
			return []
		}
		const last = save.history[save.history.length - 1]
		return (last.playerOptions ?? []).filter((option) => option.trim().length > 0)
	}, [save])

	const handleSuggestion = (suggestion: string) => {
		setPlayerAction(suggestion)
	}

	const handleAdvance = (event: FormEvent) => {
		event.preventDefault()
		if (!template || !save) {
			return
		}
		turn.mutate(playerAction || 'Continue the scene')
	}

	const hasApiKey = Boolean(settings?.openaiApiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY)

	return (
		<section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black p-8 text-white shadow-2xl">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#7c3aed33,transparent_45%)]" aria-hidden />
			<div className="relative space-y-6">
				<header className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.4em] text-purple-200">Current Session</p>
						<h2 className="text-3xl font-semibold">{template?.title ?? 'Choose a template'}</h2>
						<p className="text-sm text-purple-100/80">{template?.premise ?? 'Design a story template to begin.'}</p>
					</div>
					{save && (
						<div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-purple-100">
							Session updated {new Date(save.updatedAt).toLocaleTimeString()}
						</div>
					)}
				</header>

				<div className="grid gap-4 md:grid-cols-3">
					{template && save ? (
						valueBlocks.map(({ id, label, value, meta }) => (
							<motion.div
								key={id}
								whileHover={{ scale: 1.01 }}
								className="rounded-2xl border border-white/10 bg-white/5 p-4"
							>
								<p className="text-xs uppercase tracking-[0.3em] text-purple-200">{label}</p>
								<p className="mt-2 text-base font-semibold">
									{renderValue(value)}
								</p>
								<p className="mt-1 text-xs text-purple-200/80">{meta.description}</p>
							</motion.div>
						))
					) : (
						<p className="md:col-span-3 text-sm text-purple-100/80">Select a template and save to see tracked values.</p>
					)}
				</div>

				<form onSubmit={handleAdvance} className="rounded-3xl border border-white/5 bg-white/5 p-5 backdrop-blur">
					<label className="flex items-center gap-3 text-sm uppercase tracking-[0.4em] text-purple-200">
						<Activity className="h-5 w-5" /> Player Action
					</label>
					<textarea
						value={playerAction}
						onChange={(event) => setPlayerAction(event.currentTarget.value)}
						placeholder="Steal the artifact, negotiate, or unleash magic…"
						rows={3}
						className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base focus:border-purple-400 focus:outline-none"
					/>
					{latestSuggestions.length > 0 && (
						<div className="mt-3 space-y-2">
							<p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-100/80">AI Suggests</p>
							<div className="flex flex-wrap gap-2">
								{latestSuggestions.map((suggestion) => (
									<button
										key={suggestion}
										type="button"
										onClick={() => handleSuggestion(suggestion)}
										className="rounded-2xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-purple-50 transition hover:border-purple-400 hover:bg-purple-500/20"
									>
										{suggestion}
									</button>
								))}
							</div>
						</div>
					)}
					<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs text-purple-100/70">Use vivid verbs & objectives. The AI will respect tracked values.</p>
						<button
							type="submit"
							disabled={!template || !save || turn.isPending || !hasApiKey}
							className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{turn.isPending ? 'Consulting Oracle…' : 'Advance Story'}
							<SendHorizonal className="h-4 w-4" />
						</button>
					</div>
					{!hasApiKey && (
						<p className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
							<KeyRound className="h-3 w-3" /> Add your OpenAI API key in the Settings panel to enable turns.
						</p>
					)}
					{turn.isError && (
						<p className="mt-2 text-sm text-rose-200">
							{turn.error instanceof Error ? turn.error.message : 'Unable to run the turn with OpenAI.'}
						</p>
					)}
				</form>

				<div className="space-y-3">
					<div className="flex items-center gap-3 text-sm text-purple-100">
						<Sparkles className="h-4 w-4" /> Story Log
					</div>
					{!history.length && <p className="text-sm text-purple-200/70">No turns yet. Submit an action to begin.</p>}
					{history.map((entry) => (
						<motion.article key={entry.id} className="rounded-3xl border border-white/5 bg-black/40 p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
							<p className="text-xs uppercase tracking-[0.3em] text-purple-400">Player</p>
							<p className="text-sm text-white">{entry.playerAction}</p>
							<p className="mt-3 text-xs uppercase tracking-[0.3em] text-fuchsia-300">AI Narrator</p>
							<div className="mt-1 text-base leading-relaxed text-white">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.narrative}</ReactMarkdown>
							</div>
							{entry.stateChanges.length > 0 && (
								<ul className="mt-3 text-xs text-emerald-200">
									{entry.stateChanges.map((change) => (
										<li key={change.valueId}>
											<strong>{change.valueId}</strong>: {JSON.stringify(change.next)}
										</li>
									))}
								</ul>
							)}
						</motion.article>
					))}
				</div>
			</div>
		</section>
	)
}
