import { FormEvent, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
	SendHorizontal,
	Sparkles,
	Activity,
	KeyRound,
	PlusCircle,
	Save,
	Copy,
	ChevronLeft,
	ChevronRight,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
	GameSave,
	GameTemplate,
	GameValueDefinition,
	valuePayloadSchema,
	valueTypeSchema,
} from '../types/game'
import { useGameStore } from '../state/useGameStore'
import { useGameTurn } from '../hooks/useGameTurn'
import { AppSettings } from '../data/settings'
import { buildEffectiveTemplate } from '../utils/effectiveTemplate'
import { coerceValueForType } from '../utils/prompting'
import { useSaveWriter } from '../hooks/useSaveQueries'
import { useTemplateSaver } from '../hooks/useTemplateQueries'

export function SessionPanel({
	template,
	save,
	settings,
}: {
	template?: GameTemplate | null
	save?: GameSave | null
	settings?: AppSettings | null
}) {
	const reduceMotion = useReducedMotion()
	const playerAction = useGameStore((state) => state.playerAction)
	const setPlayerAction = useGameStore((state) => state.setPlayerAction)
	const setAdvancing = useGameStore((state) => state.setAdvancing)
	const saveWriter = useSaveWriter()
	const templateSaver = useTemplateSaver()
	const [isEditingValues, setIsEditingValues] = useState(false)
	const [localSaveOverride, setLocalSaveOverride] =
		useState<GameSave | null>(null)
	const [sessionDefsDraft, setSessionDefsDraft] = useState<
		GameValueDefinition[]
	>([])
	const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({})
	const [runValueError, setRunValueError] = useState<string | null>(null)
	const [templateExportMessage, setTemplateExportMessage] = useState<
		string | null
	>(null)
	const [historyPage, setHistoryPage] = useState(0)
	const [historyEditId, setHistoryEditId] = useState<string | null>(null)
	const [historyEditPlayerAction, setHistoryEditPlayerAction] = useState('')
	const [historyEditNarrative, setHistoryEditNarrative] = useState('')
	const [pendingRewindId, setPendingRewindId] = useState<string | null>(null)
	const [historyOpError, setHistoryOpError] = useState<string | null>(null)

	const resolvedSave = useMemo(() => {
		if (localSaveOverride && localSaveOverride.id === save?.id) {
			return localSaveOverride
		}
		return save ?? null
	}, [localSaveOverride, save])

	useEffect(() => {
		setLocalSaveOverride(null)
	}, [save?.id])

	const effectiveTemplate = useMemo(() => {
		if (!template) {
			return undefined
		}
		return buildEffectiveTemplate(template, resolvedSave)
	}, [template, resolvedSave])

	const editorTemplate = useMemo(() => {
		if (!template || !resolvedSave) {
			return undefined
		}
		return buildEffectiveTemplate(template, {
			...resolvedSave,
			sessionValueDefinitions: sessionDefsDraft,
		})
	}, [template, resolvedSave, sessionDefsDraft])

	const effectiveTurn = useGameTurn(
		effectiveTemplate,
		resolvedSave ?? undefined,
		{
			apiKey: settings?.openaiApiKey,
			model: settings?.openaiModel,
			memoryTurnCount: settings?.memoryTurnCount,
		}
	)

	useEffect(() => {
		setAdvancing(effectiveTurn.isPending)
	}, [effectiveTurn.isPending, setAdvancing])

	useEffect(() => {
		if (effectiveTurn.isSuccess) {
			setPlayerAction('')
		}
	}, [effectiveTurn.isSuccess, setPlayerAction])

	const stringifyValue = (value: unknown) => {
		if (value === undefined || value === null) {
			return ''
		}
		if (typeof value === 'string') {
			return value
		}
		try {
			return JSON.stringify(value)
		} catch {
			return String(value)
		}
	}

	useEffect(() => {
		if (!resolvedSave) {
			setSessionDefsDraft([])
			setValueDrafts({})
			setRunValueError(null)
			setTemplateExportMessage(null)
			setHistoryPage(0)
			setHistoryEditId(null)
			setPendingRewindId(null)
			setHistoryOpError(null)
			return
		}
		setSessionDefsDraft(resolvedSave.sessionValueDefinitions ?? [])
		const drafts: Record<string, string> = {}
		const defs = effectiveTemplate?.valueDefinitions ?? []
		for (const def of defs) {
			drafts[def.id] = stringifyValue(resolvedSave.values?.[def.id])
		}
		setValueDrafts(drafts)
		setRunValueError(null)
		setTemplateExportMessage(null)
		setHistoryPage(0)
		setHistoryEditId(null)
		setPendingRewindId(null)
		setHistoryOpError(null)
	}, [resolvedSave?.id, effectiveTemplate?.valueDefinitions])

	const valueBlocks = useMemo(() => {
		if (!effectiveTemplate || !resolvedSave) {
			return []
		}
		return effectiveTemplate.valueDefinitions.map((def) => ({
			id: def.id,
			label: def.label,
			value: resolvedSave.values[def.id],
			meta: def,
		}))
	}, [effectiveTemplate, resolvedSave])

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

	const historyPageSize = 5
	const fullHistory = useMemo(() => {
		if (!resolvedSave?.history?.length) {
			return []
		}
		return [...resolvedSave.history].reverse()
	}, [resolvedSave?.history])

	const historyPageCount = Math.max(
		1,
		Math.ceil(fullHistory.length / historyPageSize)
	)
	const clampedHistoryPage = Math.min(historyPage, historyPageCount - 1)

	useEffect(() => {
		if (clampedHistoryPage !== historyPage) {
			setHistoryPage(clampedHistoryPage)
		}
	}, [clampedHistoryPage, historyPage])

	const history = useMemo(() => {
		const start = clampedHistoryPage * historyPageSize
		return fullHistory.slice(start, start + historyPageSize)
	}, [clampedHistoryPage, fullHistory])

	const latestSuggestions = useMemo(() => {
		if (!resolvedSave?.history.length) {
			return []
		}
		const last = resolvedSave.history[resolvedSave.history.length - 1]
		return (last.playerOptions ?? []).filter(
			(option) => option.trim().length > 0
		)
	}, [resolvedSave])

	const handleSuggestion = (suggestion: string) => {
		setPlayerAction(suggestion)
	}

	const handleAdvance = (event: FormEvent) => {
		event.preventDefault()
		if (!effectiveTemplate || !resolvedSave) {
			return
		}
		if (effectiveTurn.isPending) {
			return
		}
		const nextAction = playerAction.trim()
		effectiveTurn.mutate(nextAction || 'Continue the scene')
	}

	const handleStartHistoryEdit = (stepId: string) => {
		setHistoryOpError(null)
		setPendingRewindId(null)
		if (!resolvedSave) {
			return
		}
		const step = resolvedSave.history.find((entry) => entry.id === stepId)
		if (!step) {
			return
		}
		setHistoryEditId(stepId)
		setHistoryEditPlayerAction(step.playerAction)
		setHistoryEditNarrative(step.narrative)
	}

	const handleCancelHistoryEdit = () => {
		setHistoryEditId(null)
		setHistoryEditPlayerAction('')
		setHistoryEditNarrative('')
		setHistoryOpError(null)
	}

	const handleSaveHistoryEdit = async (stepId: string) => {
		setHistoryOpError(null)
		setPendingRewindId(null)
		if (!resolvedSave) {
			return
		}
		const trimmedAction = historyEditPlayerAction.trim()
		const trimmedNarrative = historyEditNarrative.trim()
		if (!trimmedAction) {
			setHistoryOpError('Player action cannot be empty.')
			return
		}
		if (!trimmedNarrative) {
			setHistoryOpError('Narrative cannot be empty.')
			return
		}
		const nextHistory = resolvedSave.history.map((entry) =>
			entry.id === stepId
				? {
						...entry,
						playerAction: trimmedAction,
						narrative: trimmedNarrative,
				  }
				: entry
		)
		try {
			const updated = await saveWriter.mutateAsync({
				id: resolvedSave.id,
				templateId: resolvedSave.templateId,
				title: resolvedSave.title,
				summary: resolvedSave.summary,
				sessionValueDefinitions: resolvedSave.sessionValueDefinitions,
				values: resolvedSave.values,
				history: nextHistory,
			})
			setLocalSaveOverride(updated)
			setHistoryEditId(null)
		} catch (error) {
			setHistoryOpError(
				error instanceof Error
					? error.message
					: 'Unable to save history edits.'
			)
		}
	}

	const handleConfirmRewind = async (stepId: string) => {
		setHistoryOpError(null)
		setHistoryEditId(null)
		if (!resolvedSave) {
			return
		}
		const stepIndex = resolvedSave.history.findIndex(
			(entry) => entry.id === stepId
		)
		if (stepIndex === -1) {
			return
		}
		const keepCount = stepIndex

		const nextValues = { ...resolvedSave.values }
		for (let i = resolvedSave.history.length - 1; i >= keepCount; i -= 1) {
			const step = resolvedSave.history[i]
			for (const change of step.stateChanges ?? []) {
				if (change.previous === undefined) {
					delete nextValues[change.valueId]
					continue
				}
				nextValues[change.valueId] = change.previous
			}
		}

		try {
			const updated = await saveWriter.mutateAsync({
				id: resolvedSave.id,
				templateId: resolvedSave.templateId,
				title: resolvedSave.title,
				summary: resolvedSave.summary,
				sessionValueDefinitions: resolvedSave.sessionValueDefinitions,
				values: nextValues,
				history: resolvedSave.history.slice(0, keepCount),
			})
			setLocalSaveOverride(updated)
			setPendingRewindId(null)
		} catch (error) {
			setHistoryOpError(
				error instanceof Error
					? error.message
					: 'Unable to rewind the session.'
			)
		}
	}

	const fallbackMap: Record<string, unknown> = {
		boolean: false,
		integer: 0,
		float: 0,
		number: 0,
		string: '',
		text: '',
		array: [],
		object: {},
	}

	const parseValueInput = (def: GameValueDefinition, rawInput: string) => {
		const raw = rawInput.trim()
		if (!raw) {
			return undefined
		}
		let candidate: unknown = raw
		if (def.type === 'integer') {
			candidate = Number.parseInt(raw, 10)
		} else if (def.type === 'float' || def.type === 'number') {
			candidate = Number.parseFloat(raw)
		} else if (def.type === 'boolean') {
			const lowered = raw.toLowerCase()
			if (lowered === 'true') {
				candidate = true
			} else if (lowered === 'false') {
				candidate = false
			} else {
				throw new Error('Invalid boolean value. Use true or false.')
			}
		} else if (def.type === 'array' || def.type === 'object') {
			try {
				candidate = JSON.parse(raw)
			} catch {
				throw new Error(
					`Invalid ${def.type} value. For array/object, enter valid JSON.`
				)
			}
		}

		const validated = valuePayloadSchema.safeParse(candidate)
		if (!validated.success) {
			throw new Error(
				`Value for "${def.id}" must be a string/number/boolean, an array of those, or an object of those.`
			)
		}
		return validated.data
	}

	const handleAddSessionValue = () => {
		setRunValueError(null)
		setTemplateExportMessage(null)
		const nextIndex = sessionDefsDraft.length + 1
		const next: GameValueDefinition = {
			id: `run_value_${nextIndex}`,
			label: 'Run Value',
			type: 'string',
			description: '',
			visibility: 'public',
			defaultValue: '',
		}
		setSessionDefsDraft((current) => [...current, next])
		setValueDrafts((current) => ({
			...current,
			[next.id]: current[next.id] ?? '',
		}))
		setIsEditingValues(true)
	}

	const handleUpdateSessionDef = (
		index: number,
		patch: Partial<GameValueDefinition>
	) => {
		setSessionDefsDraft((current) => {
			const clone = [...current]
			const previousId = clone[index]?.id
			clone[index] = { ...clone[index], ...patch }
			const nextId = clone[index]?.id
			if (
				patch.id !== undefined &&
				previousId &&
				nextId &&
				previousId !== nextId
			) {
				setValueDrafts((drafts) => {
					const nextDrafts = { ...drafts }
					if (!(nextId in nextDrafts)) {
						nextDrafts[nextId] = nextDrafts[previousId] ?? ''
					}
					delete nextDrafts[previousId]
					return nextDrafts
				})
			}
			return clone
		})
	}

	const handleRemoveSessionDef = (index: number) => {
		setRunValueError(null)
		setTemplateExportMessage(null)
		setSessionDefsDraft((current) => {
			const clone = [...current]
			const removed = clone.splice(index, 1)[0]
			if (removed) {
				setValueDrafts((drafts) => {
					const next = { ...drafts }
					delete next[removed.id]
					return next
				})
			}
			return clone
		})
	}

	const handlePersistRunValues = async () => {
		setRunValueError(null)
		setTemplateExportMessage(null)
		if (!template || !effectiveTemplate || !resolvedSave) {
			return
		}

		const baseIds = new Set(template.valueDefinitions.map((def) => def.id))
		const sessionIds = new Set<string>()
		for (const def of sessionDefsDraft) {
			if (!def.id.trim()) {
				setRunValueError('Every run-only value needs an id.')
				return
			}
			if (baseIds.has(def.id)) {
				setRunValueError(
					`Run-only value id "${def.id}" conflicts with a template value id.`
				)
				return
			}
			if (sessionIds.has(def.id)) {
				setRunValueError(`Duplicate run-only value id "${def.id}".`)
				return
			}
			sessionIds.add(def.id)
		}

		const allowedIds = new Set(
			buildEffectiveTemplate(template, {
				...resolvedSave,
				sessionValueDefinitions: sessionDefsDraft,
			}).valueDefinitions.map((def) => def.id)
		)

		const nextValues: GameSave['values'] = {}
		for (const def of buildEffectiveTemplate(template, {
			...resolvedSave,
			sessionValueDefinitions: sessionDefsDraft,
		}).valueDefinitions) {
			const raw = valueDrafts[def.id] ?? ''
			let parsed
			try {
				parsed = parseValueInput(def, raw)
			} catch (error) {
				setRunValueError(
					error instanceof Error
						? error.message
						: 'Unable to parse a run value.'
				)
				return
			}
			if (parsed === undefined) {
				const existing = resolvedSave.values?.[def.id]
				const fallback =
					def.defaultValue ?? (fallbackMap[def.type] as any)
				nextValues[def.id] = coerceValueForType(
					def,
					(existing ?? fallback) as any
				)
				continue
			}
			nextValues[def.id] = coerceValueForType(def, parsed as any)
		}

		for (const [key, val] of Object.entries(resolvedSave.values ?? {})) {
			if (!allowedIds.has(key)) {
				continue
			}
			if (key in nextValues) {
				continue
			}
			nextValues[key] = val
		}

		try {
			const updated = await saveWriter.mutateAsync({
				id: resolvedSave.id,
				templateId: resolvedSave.templateId,
				title: resolvedSave.title,
				summary: resolvedSave.summary,
				sessionValueDefinitions: sessionDefsDraft,
				values: nextValues,
				history: resolvedSave.history,
			})
			setLocalSaveOverride(updated)
		} catch (error) {
			setRunValueError(
				error instanceof Error
					? error.message
					: 'Unable to save run values.'
			)
		}
	}

	const handleSaveAsNewTemplate = async () => {
		setRunValueError(null)
		setTemplateExportMessage(null)
		if (!template || !resolvedSave) {
			return
		}
		const merged = buildEffectiveTemplate(template, {
			...resolvedSave,
			sessionValueDefinitions: sessionDefsDraft,
		})
		try {
			const created = await templateSaver.mutateAsync({
				draft: {
					title: `${template.title} (Run Copy)`,
					premise: template.premise,
					genre: template.genre,
					setting: template.setting,
					safety: template.safety,
					instructionBlocks: template.instructionBlocks,
					valueDefinitions: merged.valueDefinitions,
				},
			})
			setTemplateExportMessage(`Saved new template: ${created.title}`)
		} catch (error) {
			setTemplateExportMessage(null)
			setRunValueError(
				error instanceof Error
					? error.message
					: 'Unable to save as a new template.'
			)
		}
	}

	const hasApiKey = Boolean(
		settings?.openaiApiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY
	)

	return (
		<motion.section
			initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
			animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			transition={{ duration: 0.24, ease: 'easeOut' }}
			className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-linear-to-br from-slate-900 via-slate-950 to-black p-8 text-white shadow-2xl"
		>
			<div
				className="absolute inset-0 bg-[radial-gradient(circle_at_top,#7c3aed33,transparent_45%)]"
				aria-hidden
			/>
			<div className="relative space-y-6">
				<header className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.4em] text-purple-200">
							Current Session
						</p>
						<h2 className="text-3xl font-semibold">
							{template?.title ?? 'Choose a template'}
						</h2>
						<p className="text-sm text-purple-100/80">
							{template?.premise ??
								'Design a story template to begin.'}
						</p>
					</div>
					{resolvedSave && (
						<div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-purple-100">
							Session updated{' '}
							{new Date(
								resolvedSave.updatedAt
							).toLocaleTimeString()}
						</div>
					)}
				</header>

				{effectiveTemplate && editorTemplate && resolvedSave && (
					<div className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-xs uppercase tracking-[0.3em] text-purple-200">
									Run Values
								</p>
								<p className="text-sm text-purple-100/80">
									Edit values for this run, or add run-only
									tracked values without changing the base
									template.
								</p>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<motion.button
									type="button"
									onClick={() =>
										setIsEditingValues(
											(current) => !current
										)
									}
									whileHover={
										reduceMotion
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion
											? undefined
											: { scale: 0.99 }
									}
									className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
								>
									{isEditingValues
										? 'Close editor'
										: 'Edit run values'}
								</motion.button>
								<motion.button
									type="button"
									onClick={handleAddSessionValue}
									whileHover={
										reduceMotion
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion
											? undefined
											: { scale: 0.99 }
									}
									className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
								>
									<PlusCircle className="h-4 w-4" /> Add run
									value
								</motion.button>
							</div>
						</div>

						{isEditingValues && (
							<div className="mt-4 space-y-4">
								<div className="grid gap-3 md:grid-cols-2">
									{editorTemplate.valueDefinitions.map(
										(def) => {
											const isRunOnly =
												sessionDefsDraft.some(
													(entry) =>
														entry.id === def.id
												)
											return (
												<div
													key={def.id}
													className="rounded-2xl border border-white/10 bg-black/30 p-4"
												>
													<div className="flex items-start justify-between gap-3">
														<div>
															<p className="text-xs uppercase tracking-[0.3em] text-purple-200">
																{def.label}{' '}
																<span className="text-purple-100/60">
																	({def.id})
																</span>
															</p>
															<p className="text-xs text-purple-100/70">
																Type:{' '}
																{def.type}
																{isRunOnly
																	? ' · Run-only'
																	: ' · Template'}
															</p>
														</div>
													</div>
													<textarea
														value={
															valueDrafts[
																def.id
															] ?? ''
														}
														onChange={(event) => {
															setValueDrafts(
																(current) => ({
																	...current,
																	[def.id]:
																		event
																			.currentTarget
																			.value,
																})
															)
														}}
														rows={2}
														placeholder="Leave blank to keep current value"
														className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
													/>
												</div>
											)
										}
									)}
								</div>

								{sessionDefsDraft.length > 0 && (
									<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
										<p className="text-xs uppercase tracking-[0.3em] text-purple-200">
											Run-only tracked values
											(definitions)
										</p>
										<div className="mt-3 space-y-3">
											{sessionDefsDraft.map(
												(def, index) => (
													<div
														key={`${def.id}-${index}`}
														className="rounded-2xl border border-white/10 bg-black/30 p-4"
													>
														<div className="flex flex-wrap items-center gap-3">
															<input
																value={def.id}
																onChange={(
																	event
																) =>
																	handleUpdateSessionDef(
																		index,
																		{
																			id: event
																				.currentTarget
																				.value,
																		}
																	)
																}
																placeholder="value_id"
																className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
															/>
															<input
																value={
																	def.label
																}
																onChange={(
																	event
																) =>
																	handleUpdateSessionDef(
																		index,
																		{
																			label: event
																				.currentTarget
																				.value,
																		}
																	)
																}
																placeholder="Display label"
																className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
															/>
															<select
																value={
																	def.type
																}
																onChange={(
																	event
																) =>
																	handleUpdateSessionDef(
																		index,
																		{
																			type: event
																				.currentTarget
																				.value as any,
																		}
																	)
																}
																className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
															>
																{valueTypeSchema.options.map(
																	(
																		option
																	) => (
																		<option
																			key={
																				option
																			}
																			value={
																				option
																			}
																			className="bg-slate-900"
																		>
																			{
																				option
																			}
																		</option>
																	)
																)}
															</select>
															<motion.button
																type="button"
																onClick={() =>
																	handleRemoveSessionDef(
																		index
																	)
																}
																whileHover={
																	reduceMotion
																		? undefined
																		: {
																				scale: 1.02,
																		  }
																}
																whileTap={
																	reduceMotion
																		? undefined
																		: {
																				scale: 0.98,
																		  }
																}
																className="text-xs text-red-200 hover:text-red-100"
															>
																Remove
															</motion.button>
														</div>
														<input
															value={
																def.description ??
																''
															}
															onChange={(
																event
															) =>
																handleUpdateSessionDef(
																	index,
																	{
																		description:
																			event
																				.currentTarget
																				.value,
																	}
																)
															}
															placeholder="Narrative guidance"
															className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
														/>
													</div>
												)
											)}
										</div>
									</div>
								)}

								<div className="flex flex-wrap items-center justify-between gap-3">
									<p className="text-xs text-purple-100/70">
										Numbers can be plain text;
										arrays/objects must be JSON. Leave a
										value blank to keep the current value.
									</p>
									<div className="flex flex-wrap items-center gap-2">
										<motion.button
											type="button"
											disabled={saveWriter.isPending}
											onClick={handlePersistRunValues}
											whileHover={
												reduceMotion ||
												saveWriter.isPending
													? undefined
													: { scale: 1.01 }
											}
											whileTap={
												reduceMotion ||
												saveWriter.isPending
													? undefined
													: { scale: 0.99 }
											}
											className="inline-flex items-center gap-2 rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
										>
											<Save className="h-4 w-4" />
											{saveWriter.isPending
												? 'Saving…'
												: 'Save to this run'}
										</motion.button>
										<motion.button
											type="button"
											disabled={templateSaver.isPending}
											onClick={handleSaveAsNewTemplate}
											whileHover={
												reduceMotion ||
												templateSaver.isPending
													? undefined
													: { scale: 1.01 }
											}
											whileTap={
												reduceMotion ||
												templateSaver.isPending
													? undefined
													: { scale: 0.99 }
											}
											className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
										>
											<Copy className="h-4 w-4" />
											Save as new template
										</motion.button>
									</div>
								</div>
								{runValueError && (
									<p className="text-sm text-rose-200">
										{runValueError}
									</p>
								)}
								{templateExportMessage && (
									<p className="text-sm text-emerald-200">
										{templateExportMessage}
									</p>
								)}
							</div>
						)}
					</div>
				)}

				<div className="grid gap-4 md:grid-cols-3">
					{effectiveTemplate && resolvedSave ? (
						valueBlocks.map(({ id, label, value, meta }) => (
							<motion.div
								key={id}
								whileHover={{ scale: 1.01 }}
								className="rounded-2xl border border-white/10 bg-white/5 p-4"
							>
								<p className="text-xs uppercase tracking-[0.3em] text-purple-200">
									{label}
								</p>
								<p className="mt-2 text-base font-semibold">
									{renderValue(value)}
								</p>
								<p className="mt-1 text-xs text-purple-200/80">
									{meta.description}
								</p>
							</motion.div>
						))
					) : (
						<p className="md:col-span-3 text-sm text-purple-100/80">
							Select a template and save to see tracked values.
						</p>
					)}
				</div>

				<form
					onSubmit={handleAdvance}
					className="rounded-3xl border border-white/5 bg-white/5 p-5 backdrop-blur"
				>
					<label className="flex items-center gap-3 text-sm uppercase tracking-[0.4em] text-purple-200">
						<Activity className="h-5 w-5" /> Player Action
					</label>
					<textarea
						value={playerAction}
						onChange={(event) =>
							setPlayerAction(event.currentTarget.value)
						}
						placeholder="Steal the artifact, negotiate, or unleash magic…"
						rows={3}
						className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base focus:border-purple-400 focus:outline-none"
					/>
					{latestSuggestions.length > 0 && (
						<div className="mt-3 space-y-2">
							<p className="text-xs font-semibold uppercase tracking-[0.3em] text-purple-100/80">
								AI Suggests
							</p>
							<div className="flex flex-wrap gap-2">
								{latestSuggestions.map((suggestion) => (
									<motion.button
										key={suggestion}
										type="button"
										onClick={() =>
											handleSuggestion(suggestion)
										}
										whileHover={
											reduceMotion
												? undefined
												: { scale: 1.02 }
										}
										whileTap={
											reduceMotion
												? undefined
												: { scale: 0.99 }
										}
										className="rounded-2xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-purple-50 transition hover:border-purple-400 hover:bg-purple-500/20"
									>
										{suggestion}
									</motion.button>
								))}
							</div>
						</div>
					)}
					<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
						<p className="text-xs text-purple-100/70">
							Use vivid verbs & objectives. The AI will respect
							tracked values.
						</p>
						<motion.button
							type="submit"
							disabled={
								!effectiveTemplate ||
								!resolvedSave ||
								effectiveTurn.isPending ||
								!hasApiKey
							}
							whileHover={
								reduceMotion ||
								!effectiveTemplate ||
								!resolvedSave ||
								effectiveTurn.isPending ||
								!hasApiKey
									? undefined
									: { scale: 1.01 }
							}
							whileTap={
								reduceMotion ||
								!effectiveTemplate ||
								!resolvedSave ||
								effectiveTurn.isPending ||
								!hasApiKey
									? undefined
									: { scale: 0.99 }
							}
							className="inline-flex items-center gap-2 rounded-2xl bg-linear-to-r from-indigo-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold shadow-lg shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{effectiveTurn.isPending
								? 'Consulting Oracle…'
								: 'Advance Story'}
							<SendHorizontal className="h-4 w-4" />
						</motion.button>
					</div>
					{!hasApiKey && (
						<p className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
							<KeyRound className="h-3 w-3" /> Add your OpenAI
							API key in the Settings panel to enable turns.
						</p>
					)}
					{effectiveTurn.isError && (
						<p className="mt-2 text-sm text-rose-200">
							{effectiveTurn.error instanceof Error
								? effectiveTurn.error.message
								: 'Unable to run the turn with OpenAI.'}
						</p>
					)}
				</form>

				<div className="space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-purple-100">
						<div className="flex items-center gap-3">
							<Sparkles className="h-4 w-4" /> Story Log
						</div>
						{fullHistory.length > 0 && (
							<div className="flex flex-wrap items-center gap-2 text-xs text-purple-100/80">
								<motion.button
									type="button"
									onClick={() =>
										setHistoryPage((current) =>
											Math.max(0, current - 1)
										)
									}
									disabled={clampedHistoryPage === 0}
									aria-label="Newer page"
									whileHover={
										reduceMotion ||
										clampedHistoryPage === 0
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion ||
										clampedHistoryPage === 0
											? undefined
											: { scale: 0.99 }
									}
									className="rounded-2xl border border-white/10 bg-black/30 px-3 py-1 text-xs text-purple-50 hover:border-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
								>
									<ChevronLeft className="h-4 w-4" />
								</motion.button>
								<span className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1">
									Page {clampedHistoryPage + 1} of{' '}
									{historyPageCount}
								</span>
								<motion.button
									type="button"
									onClick={() =>
										setHistoryPage((current) =>
											Math.min(
												historyPageCount - 1,
												current + 1
											)
										)
									}
									disabled={
										clampedHistoryPage >=
										historyPageCount - 1
									}
									aria-label="Older page"
									whileHover={
										reduceMotion ||
										clampedHistoryPage >=
											historyPageCount - 1
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion ||
										clampedHistoryPage >=
											historyPageCount - 1
											? undefined
											: { scale: 0.99 }
									}
									className="rounded-2xl border border-white/10 bg-black/30 px-3 py-1 text-xs text-purple-50 hover:border-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
								>
									<ChevronRight className="h-4 w-4" />
								</motion.button>
							</div>
						)}
					</div>
					{historyOpError && (
						<p className="text-sm text-rose-200">
							{historyOpError}
						</p>
					)}
					{!fullHistory.length && (
						<p className="text-sm text-purple-200/70">
							No turns yet. Submit an action to begin.
						</p>
					)}
					{history.map((entry) => (
						<motion.article
							key={entry.id}
							className="rounded-3xl border border-white/5 bg-black/40 p-4"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="text-xs uppercase tracking-[0.3em] text-purple-400">
										Player
									</p>
									{historyEditId === entry.id ? (
										<input
											value={historyEditPlayerAction}
											onChange={(event) =>
												setHistoryEditPlayerAction(
													event.currentTarget.value
												)
											}
											className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
									) : (
										<p className="text-sm text-white">
											{entry.playerAction}
										</p>
									)}
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{historyEditId === entry.id ? (
										<>
											<motion.button
												type="button"
												onClick={() =>
													handleSaveHistoryEdit(
														entry.id
													)
												}
												whileHover={
													reduceMotion ||
													saveWriter.isPending
														? undefined
														: { scale: 1.02 }
												}
												whileTap={
													reduceMotion ||
													saveWriter.isPending
														? undefined
														: { scale: 0.99 }
												}
												disabled={saveWriter.isPending}
												className="rounded-2xl bg-white/10 px-3 py-1 text-xs font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
											>
												Save
											</motion.button>
											<motion.button
												type="button"
												onClick={
													handleCancelHistoryEdit
												}
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.02 }
												}
												whileTap={
													reduceMotion
														? undefined
														: { scale: 0.99 }
												}
												className="rounded-2xl border border-white/10 bg-black/30 px-3 py-1 text-xs text-purple-50 hover:border-purple-400"
											>
												Cancel
											</motion.button>
										</>
									) : (
										<>
											<motion.button
												type="button"
												onClick={() =>
													handleStartHistoryEdit(
														entry.id
													)
												}
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.02 }
												}
												whileTap={
													reduceMotion
														? undefined
														: { scale: 0.99 }
												}
												className="rounded-2xl border border-white/10 bg-white/10 px-3 py-1 text-xs text-purple-50 transition hover:border-purple-400 hover:bg-purple-500/20"
											>
												Edit
											</motion.button>
											<motion.button
												type="button"
												onClick={() => {
													setHistoryOpError(null)
													setHistoryEditId(null)
													setPendingRewindId(
														entry.id
													)
												}}
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.02 }
												}
												whileTap={
													reduceMotion
														? undefined
														: { scale: 0.99 }
												}
												className="rounded-2xl border border-white/10 bg-black/30 px-3 py-1 text-xs text-purple-50 hover:border-purple-400"
											>
												Rewind
											</motion.button>
										</>
									)}
								</div>
							</div>
							<p className="mt-3 text-xs uppercase tracking-[0.3em] text-fuchsia-300">
								AI Narrator
							</p>
							{historyEditId === entry.id ? (
								<textarea
									value={historyEditNarrative}
									onChange={(event) =>
										setHistoryEditNarrative(
											event.currentTarget.value
										)
									}
									rows={4}
									className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white focus:border-purple-400 focus:outline-none"
								/>
							) : (
								<div className="mt-1 text-base leading-relaxed text-white">
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{entry.narrative}
									</ReactMarkdown>
								</div>
							)}
							{pendingRewindId === entry.id && (
								<div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
									<p className="text-xs text-purple-100/80">
										Rewind to before this step? This
										removes this turn and any later turns,
										and restores tracked values using the
										recorded previous values.
									</p>
									<div className="mt-2 flex flex-wrap items-center gap-2">
										<motion.button
											type="button"
											onClick={() =>
												handleConfirmRewind(entry.id)
											}
											disabled={saveWriter.isPending}
											whileHover={
												reduceMotion ||
												saveWriter.isPending
													? undefined
													: { scale: 1.02 }
											}
											whileTap={
												reduceMotion ||
												saveWriter.isPending
													? undefined
													: { scale: 0.99 }
											}
											className="rounded-2xl bg-linear-to-r from-emerald-500 to-teal-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
										>
											Confirm rewind
										</motion.button>
										<motion.button
											type="button"
											onClick={() =>
												setPendingRewindId(null)
											}
											whileHover={
												reduceMotion
													? undefined
													: { scale: 1.02 }
											}
											whileTap={
												reduceMotion
													? undefined
													: { scale: 0.99 }
											}
											className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-purple-50 hover:border-purple-400"
										>
											Cancel
										</motion.button>
									</div>
								</div>
							)}
							{(entry.stateChanges?.length ?? 0) > 0 && (
								<ul className="mt-3 text-xs text-emerald-200">
									{(entry.stateChanges ?? []).map(
										(change) => (
											<li key={change.valueId}>
												<strong>
													{change.valueId}
												</strong>
												: {JSON.stringify(change.next)}
											</li>
										)
									)}
								</ul>
							)}
						</motion.article>
					))}
				</div>
			</div>
		</motion.section>
	)
}
