import { useMutation, useQueryClient } from '@tanstack/react-query'
import { GameSave, GameTemplate } from '../types/game'
import { runGameTurn } from '../utils/openai'
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
			const abortController = new AbortController()
			const result = await runGameTurn({
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
			})
			const updatedValues = applyChangesToValues(
				template,
				save.values,
				result.stateChanges
			)
			const updatedMemories = applyChangesToMemories(
				save.memories ?? [],
				result.memoryChanges ?? []
			)
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
			}

			const updatedSave = await persistSave({
				id: save.id,
				templateId: save.templateId,
				title: save.title,
				summary: result.summary ?? save.summary,
				values: updatedValues,
				memories: updatedMemories,
				history: [...save.history, step],
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
