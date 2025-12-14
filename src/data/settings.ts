import { z } from 'zod'
import { readJsonRecord, writeJsonRecord } from '../utils/fileStorage'

const SETTINGS_DIR = 'settings'
const SETTINGS_FILE = 'config.json'

export const settingsSchema = z.object({
	openaiApiKey: z.string().optional(),
	openaiModel: z.string().default('gpt-4.1-mini'),
	memoryTurnCount: z.number().int().min(1).max(10).default(4),
	updatedAt: z.string().optional(),
})

export type AppSettings = z.infer<typeof settingsSchema>

const defaultSettings: AppSettings = {
	openaiApiKey: '',
	openaiModel: 'gpt-4.1-mini',
	memoryTurnCount: 4,
}

export async function loadSettings(): Promise<AppSettings> {
	try {
		return await readJsonRecord(SETTINGS_DIR, SETTINGS_FILE, settingsSchema)
	} catch (error) {
		return defaultSettings
	}
}

export async function saveSettings(partial: Partial<AppSettings>) {
	const current = await loadSettings()
	const next: AppSettings = {
		...current,
		...partial,
		updatedAt: new Date().toISOString(),
	}
	await writeJsonRecord(SETTINGS_DIR, SETTINGS_FILE, next)
	return next
}
