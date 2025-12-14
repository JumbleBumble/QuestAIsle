import { mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import { basename, join } from '@tauri-apps/api/path'
import { z } from 'zod'
import { getAppLocalDataPath } from './storage'

async function ensureSubdirectory(subdir: string) {
	const path = await getAppLocalDataPath(subdir)
	await mkdir(path, { recursive: true })
	return path
}

export async function listJsonRecords<T>(subdir: string, schema: z.ZodSchema<T>) {
	const folder = await ensureSubdirectory(subdir)
	const entries = await readDir(folder)
	const records: T[] = []

	for (const entry of entries) {
		if (!entry.name || !entry.name.endsWith('.json')) {
			continue
		}

		const fullPath = await join(folder, entry.name)
		try {
			const raw = await readTextFile(fullPath)
			const parsed = schema.parse(JSON.parse(raw))
			records.push(parsed)
		} catch (error) {
			console.error('Failed to read record', entry.name, error)
		}
	}

	return records
}

export async function readJsonRecord<T>(subdir: string, filename: string, schema: z.ZodSchema<T>) {
	const folder = await ensureSubdirectory(subdir)
	const path = await join(folder, filename)
	const raw = await readTextFile(path)
	return schema.parse(JSON.parse(raw))
}

export async function writeJsonRecord<T>(subdir: string, filename: string, data: T) {
	const folder = await ensureSubdirectory(subdir)
	const path = await join(folder, filename)
	await writeTextFile(path, JSON.stringify(data, null, 2))
	return path
}

export async function deleteRecord(subdir: string, filename: string) {
	const folder = await ensureSubdirectory(subdir)
	const path = `${folder}/${filename}`
	await remove(path)
}

export async function nextSlug(subdir: string, base: string) {
	const normalized = base
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '')
	const folder = await ensureSubdirectory(subdir)
	const entries = await readDir(folder)
	const slugSet = new Set(
		entries
			.map((entry) => entry.name ?? '')
			.filter((name) => name.endsWith('.json'))
			.map((name) => name.replace(/\.json$/, '')),
	)
	if (!slugSet.has(normalized)) {
		return normalized
	}
	let suffix = 2
	while (slugSet.has(`${normalized}-${suffix}`)) {
		suffix += 1
	}
	return `${normalized}-${suffix}`
}

export function idFromFilename(path: string) {
	return basename(path).then((name) => name.replace(/\.json$/, ''))
}
