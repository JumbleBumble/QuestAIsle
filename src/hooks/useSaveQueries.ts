import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listSaves, persistSave, removeSave, SaveDraft } from '../data/saves'

export const saveKeys = {
	all: ['saves'] as const,
	byTemplate: (templateId: string | null) => [...saveKeys.all, templateId ?? 'all'] as const,
}

export function useSavesQuery(templateId: string | null) {
	return useQuery({
		queryKey: saveKeys.byTemplate(templateId),
		queryFn: () => listSaves(templateId ?? undefined),
	})
}

export function useSaveWriter() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (draft: SaveDraft) => persistSave(draft),
		onSuccess: (_, variables) => {
			client.invalidateQueries({ queryKey: saveKeys.byTemplate(variables.templateId) })
		},
	})
}

export function useSaveRemover() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (id: string) => removeSave(id),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: saveKeys.all })
		},
	})
}
