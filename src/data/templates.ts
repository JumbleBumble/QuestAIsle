import {
	templateSchema,
	GameTemplate,
	valueDefinitionSchema,
} from '../types/game'
import {
	listJsonRecords,
	writeJsonRecord,
	deleteRecord,
	nextSlug,
	readJsonRecord,
} from '../utils/fileStorage'
import { z } from 'zod'

const TEMPLATE_DIR = 'templates'

export type TemplateDraft = {
	title: string
	premise?: string
	genre?: string
	setting?: string
	safety?: string
	instructionBlocks?: string[]
	valueDefinitions: GameTemplate['valueDefinitions']
}

export async function listTemplates() {
	const templates = await listJsonRecords(TEMPLATE_DIR, templateSchema)
	return templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadTemplate(idOrSlug: string) {
	return readJsonRecord(TEMPLATE_DIR, `${idOrSlug}.json`, templateSchema)
}

export async function saveTemplate(
	draft: TemplateDraft,
	existing?: GameTemplate
) {
	const now = new Date().toISOString()
	const base =
		existing ??
		({
			id: crypto.randomUUID(),
			slug: await nextSlug(TEMPLATE_DIR, draft.title),
			createdAt: now,
		} as GameTemplate)

	const template: GameTemplate = {
		...base,
		title: draft.title,
		premise: draft.premise,
		genre: draft.genre,
		setting: draft.setting,
		safety: draft.safety,
		instructionBlocks: draft.instructionBlocks ?? [],
		valueDefinitions: draft.valueDefinitions,
		updatedAt: now,
	}

	await writeJsonRecord(TEMPLATE_DIR, `${template.slug}.json`, template)
	return template
}

export async function removeTemplate(idOrSlug: string) {
	await deleteRecord(TEMPLATE_DIR, `${idOrSlug}.json`)
}

export function validateTemplateDraft(draft: TemplateDraft) {
	return z
		.object({
			title: z.string().min(3),
			valueDefinitions: z
				.array(valueDefinitionSchema)
				.min(1, 'Add at least one tracked value'),
		})
		.parse(draft)
}
