import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GameSave, GameTemplate } from '../types/game'
import { runGameTurn, runMemoryOverview } from '../utils/openai'
import {
	applyChangesToMemories,
	applyChangesToValues,
} from '../utils/prompting'
import { persistSave } from '../data/saves'
import { saveKeys } from './useSaveQueries'

export type RunSettings = {
	apiKey?: string | null
	model?: string | null
	memoryTurnCount?: number | null
}

export type RunStreaming = {
	onNarrativeText?: (text: string) => void
	onPlayerOptions?: (options: string[]) => void
	onStateChanges?: (
		changes: Array<{ valueId: string; next: unknown; reason?: string }>
	) => void
	onPhase?: (phase: 'turn' | 'memoryOverview' | 'persist') => void
}

export function useGameTurn(
	template?: GameTemplate,
	save?: GameSave,
	settings?: RunSettings,
	streaming?: RunStreaming
) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (playerAction: string) => {
			if (!template || !save) {
				throw new Error(
					'Select a template and save before advancing the story.'
				)
			}
			try {
				streaming?.onPhase?.('turn')
			} catch {
				
			}
			const abortController = new AbortController()
			const runWithTimeout = async <T,>(
				promise: Promise<T>,
				timeoutMs: number
			) => {
				let timeoutId: ReturnType<typeof setTimeout> | undefined
				try {
					return await Promise.race([
						promise,
						new Promise<T>((_, reject) => {
							timeoutId = setTimeout(() => {
								try {
									abortController.abort()
								} catch {
									
								}
								reject(
									new Error('Turn timed out. Please try again.')
								)
							}, timeoutMs)
						}),
					])
				} finally {
					if (timeoutId) {
						clearTimeout(timeoutId)
					}
				}
			}

			const result = await runWithTimeout(
				runGameTurn({
					template,
					save,
					playerAction,
					apiKey: settings?.apiKey,
					model: settings?.model,
					memoryTurnCount: settings?.memoryTurnCount ?? undefined,
					onNarrativeText: streaming?.onNarrativeText,
					onPlayerOptions: streaming?.onPlayerOptions,
					onStateChanges: streaming?.onStateChanges,
					signal: abortController.signal,
				}),
				120_000
			)
			const updatedValues = applyChangesToValues(
				template,
				save.values,
				result.stateChanges
			)
			let updatedMemories = applyChangesToMemories(
				save.memories ?? [],
				result.memoryChanges ?? []
			)
			let d20Roll: number | undefined = undefined
			if (template.rollMode) {
				d20Roll = Math.floor(Math.random() * 20) + 1
			}
			const step = {
				id: crypto.randomUUID(),
				playerAction: playerAction || 'Continue',
				narrative: result.narrative,
				stateChanges: result.stateChanges.map((change) => ({
					valueId: change.valueId,
					previous: save.values[change.valueId],
					next: change.next,
					reason: change.reason,
				})),
				playerOptions: result.playerOptions ?? [],
				createdAt: new Date().toISOString(),
				d20Roll,
			}

			const history = [...save.history, step]
			const interval = Math.max(
				1,
				Math.min(10, settings?.memoryTurnCount ?? 4)
			)
			const historyLen = history.length
			const lastCursor = save.lastMemoryOverviewAtHistoryLen ?? 0
			const normalizedCursor = Math.min(lastCursor, historyLen)
			const shouldRunOverview = historyLen - normalizedCursor >= interval
			let nextCursor = normalizedCursor

			if (shouldRunOverview) {
				try {
					streaming?.onPhase?.('memoryOverview')
				} catch {
					
				}
				const overviewSave: GameSave = {
					...save,
					summary: result.summary ?? save.summary,
					values: updatedValues,
					memories: updatedMemories,
					history,
					lastMemoryOverviewAtHistoryLen: normalizedCursor,
				}
				const runOverviewOnce = () =>
					runMemoryOverview({
						template,
						save: overviewSave,
						apiKey: settings?.apiKey,
						model: settings?.model,
						memoryTurnCount: interval,
						signal: abortController.signal,
					})

				let overviewResult:
					| Awaited<ReturnType<typeof runMemoryOverview>>
					| null = null
				try {
					overviewResult = await runOverviewOnce()
				} catch (error) {
					if (abortController.signal.aborted) {
						throw error
					}
					await new Promise((resolve) => setTimeout(resolve, 750))
					try {
						overviewResult = await runOverviewOnce()
					} catch {
						overviewResult = null
					}
				}

				if (overviewResult) {
					updatedMemories = applyChangesToMemories(
						updatedMemories,
						overviewResult.memoryChanges ?? []
					)
					nextCursor = historyLen
				}
			}

			try {
				streaming?.onPhase?.('persist')
			} catch {
				
			}

			const updatedSave = await persistSave({
				id: save.id,
				templateId: save.templateId,
				title: save.title,
				summary: result.summary ?? save.summary,
				lastMemoryOverviewAtHistoryLen: nextCursor,
				values: updatedValues,
				memories: updatedMemories,
				history,
			})

			return { updatedSave, result }
		},
		onSuccess: (data) => {
			if (template) {
				client.setQueryData(
					saveKeys.byTemplate(template.id),
					(current?: GameSave[]) => {
						if (!current) {
							return data?.updatedSave
								? [data.updatedSave]
								: current
						}
						if (!data?.updatedSave) {
							return current
						}
						const idx = current.findIndex(
							(save) => save.id === data.updatedSave.id
						)
						if (idx === -1) {
							return [data.updatedSave, ...current]
						}
						const clone = [...current]
						clone[idx] = data.updatedSave
						return clone
					}
				)
				client.invalidateQueries({
					queryKey: saveKeys.byTemplate(template.id),
				})
			}
			client.invalidateQueries({ queryKey: saveKeys.all })
		},
	})
}
