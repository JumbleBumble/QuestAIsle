import { useEffect } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BookmarkCheck, Play, Plus } from 'lucide-react'
import {
	useSaveRemover,
	useSaveWriter,
	useSavesQuery,
} from '../hooks/useSaveQueries'
import { GameTemplate } from '../types/game'
import { useGameStore } from '../state/useGameStore'
import { buildInitialValues } from '../utils/prompting'

export function SavePanel({
	template,
	templates,
}: {
	template?: GameTemplate | null
	templates?: GameTemplate[]
}) {
	const reduceMotion = useReducedMotion()
	const activeSaveId = useGameStore((state) => state.activeSaveId)
	const setActiveSave = useGameStore((state) => state.setActiveSave)
	const savesQuery = useSavesQuery(template ? template.id : null)
	const saveWriter = useSaveWriter()
	const remover = useSaveRemover()

	useEffect(() => {
		const saves = savesQuery.data ?? []
		if (!saves.length) {
			return
		}
		if (!activeSaveId || !saves.find((save) => save.id === activeSaveId)) {
			setActiveSave(saves[0].id)
		}
	}, [savesQuery.data, activeSaveId, setActiveSave])

	const handleCreateSave = async () => {
		if (!template) {
			return
		}
		const values = buildInitialValues(template)
		const created = await saveWriter.mutateAsync({
			templateId: template.id,
			title: `${template.title} Run ${new Date().toLocaleDateString()}`,
			values,
			history: [],
		})
		setActiveSave(created.id)
	}

	const saves = savesQuery.data ?? []

	return (
		<motion.section
			initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
			animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			transition={{ duration: 0.22, ease: 'easeOut' }}
			className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 text-white shadow-inner shadow-black/50"
		>
			<header className="flex items-center justify-between gap-4">
				<div>
					<p className="text-xs uppercase tracking-[0.4em] text-slate-300">
						Campaigns
					</p>
					<h2 className="text-xl font-semibold">Saved Adventures</h2>
				</div>
				<motion.button
					onClick={handleCreateSave}
					disabled={!template || saveWriter.isPending}
					whileHover={
						reduceMotion || !template || saveWriter.isPending
							? undefined
							: { scale: 1.02 }
					}
					whileTap={
						reduceMotion || !template || saveWriter.isPending
							? undefined
							: { scale: 0.99 }
					}
					className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<Plus className="h-4 w-4" /> New Run
				</motion.button>
			</header>

			<div className="mt-4 space-y-3">
				{savesQuery.isLoading && (
					<p className="text-sm text-slate-300">Loading saves…</p>
				)}
				{!saves.length && !savesQuery.isLoading && (
					<p className="text-sm text-slate-300">
						No saves yet. Start a new run above.
					</p>
				)}

				{saves.map((save) => (
					<motion.button
						key={save.id}
						onClick={() => setActiveSave(save.id)}
						whileHover={reduceMotion ? undefined : { x: 6 }}
						whileTap={reduceMotion ? undefined : { scale: 0.995 }}
						transition={
							reduceMotion
								? undefined
								: {
										type: 'spring',
										stiffness: 650,
										damping: 42,
										mass: 0.6,
								  }
						}
						className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
							activeSaveId === save.id
								? 'border-emerald-300 bg-emerald-400/10'
								: 'border-white/10 bg-white/5'
						}`}
					>
						<div className="flex items-center justify-between text-sm">
							<div>
								<h3 className="font-semibold">{save.title}</h3>
								<p className="text-xs text-slate-300">
									{templates?.find(
										(entry) => entry.id === save.templateId
									)?.title ?? 'Any Template'}{' '}
									· Updated{' '}
									{new Date(save.updatedAt).toLocaleString()}
								</p>
							</div>
							<div className="flex items-center gap-3">
								<motion.button
									onClick={(event) => {
										event.stopPropagation()
										remover.mutate(save.id)
										if (activeSaveId === save.id) {
											setActiveSave(null)
										}
									}}
									whileHover={
										reduceMotion
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion
											? undefined
											: { scale: 0.98 }
									}
									className="text-xs text-red-200 hover:text-red-100"
								>
									Delete
								</motion.button>
								<BookmarkCheck className="h-5 w-5 text-emerald-200" />
							</div>
						</div>
						<p className="mt-2 text-sm text-slate-200">
							{save.summary ?? 'Fresh run'}
						</p>
						<div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
							<span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
								<Play className="h-3 w-3" />{' '}
								{save.history.length} turns
							</span>
						</div>
					</motion.button>
				))}
			</div>
		</motion.section>
	)
}
