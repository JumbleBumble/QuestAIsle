import { GameSave, saveSchema } from '../types/game'
import { listJsonRecords, writeJsonRecord, deleteRecord, readJsonRecord } from '../utils/fileStorage'

const SAVES_DIR = 'saves'

export type SaveDraft = {
	id?: string
	templateId: string
	title: string
	summary?: string
	lastMemoryOverviewAtHistoryLen?: GameSave['lastMemoryOverviewAtHistoryLen']
	sessionValueDefinitions?: GameSave['sessionValueDefinitions']
	values: GameSave['values']
	memories?: GameSave['memories']
	history?: GameSave['history']
}

export async function listSaves(templateFilter?: string) {
	const saves = await listJsonRecords(SAVES_DIR, saveSchema)
	const filtered = templateFilter
		? saves.filter((save) => save.templateId === templateFilter)
		: saves
	return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadSave(id: string) {
	return readJsonRecord(SAVES_DIR, `${id}.json`, saveSchema)
}

export async function removeSave(id: string) {
	await deleteRecord(SAVES_DIR, `${id}.json`)
}

export async function persistSave(draft: SaveDraft, existing?: GameSave) {
	const now = new Date().toISOString()
	const base =
		existing ??
		(draft.id
			? await loadSave(draft.id).catch(() => undefined)
			: undefined)
	const save: GameSave = {
		id: base?.id ?? draft.id ?? crypto.randomUUID(),
		templateId: draft.templateId,
		title: draft.title,
		summary: draft.summary ?? base?.summary,
		lastMemoryOverviewAtHistoryLen:
			draft.lastMemoryOverviewAtHistoryLen ??
			base?.lastMemoryOverviewAtHistoryLen ??
			0,
		sessionValueDefinitions:
			draft.sessionValueDefinitions ??
			base?.sessionValueDefinitions ??
			[],
		values: draft.values,
		memories: draft.memories ?? base?.memories ?? [],
		history: draft.history ?? base?.history ?? [],
		createdAt: base?.createdAt ?? now,
		updatedAt: now,
	}

	await writeJsonRecord(SAVES_DIR, `${save.id}.json`, save)
	return save
}
