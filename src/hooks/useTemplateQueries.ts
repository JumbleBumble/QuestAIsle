import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listTemplates, saveTemplate, removeTemplate, TemplateDraft } from '../data/templates'
import { GameTemplate } from '../types/game'

export const templateKeys = {
	all: ['templates'] as const,
	one: (slug: string) => [...templateKeys.all, slug] as const,
}

export function useTemplatesQuery() {
	return useQuery({ queryKey: templateKeys.all, queryFn: listTemplates })
}

export function useTemplateSaver() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: ({ draft, existing }: { draft: TemplateDraft; existing?: GameTemplate }) => saveTemplate(draft, existing),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: templateKeys.all })
		},
	})
}

export function useTemplateRemover() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (slug: string) => removeTemplate(slug),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: templateKeys.all })
		},
	})
}
