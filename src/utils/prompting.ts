import { z } from 'zod'
import {
	GameSave,
	GameTemplate,
	GameValueDefinition,
	GameValuePayload,
	PromptPacket,
	ScalarValue,
	valuePayloadSchema,
} from '../types/game'

const fallbackMap: Record<string, GameValuePayload> = {
	boolean: false,
	integer: 0,
	float: 0,
	number: 0,
	string: '',
	text: '',
	array: [],
	object: {},
}

function formatValue(def: GameValueDefinition, value: GameValuePayload | undefined) {
	const resolved = value ?? def.defaultValue ?? fallbackMap[def.type] ?? ''
	return typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
}

function formatConstraints(def: GameValueDefinition) {
	if (def.type === 'integer' || def.type === 'float' || def.type === 'number') {
		const min = def.min
		const max = def.max
		if (min === undefined && max === undefined) {
			return ''
		}
		if (min !== undefined && max !== undefined) {
			return ` [min=${min}, max=${max}]`
		}
		if (min !== undefined) {
			return ` [min=${min}]`
		}
		return ` [max=${max}]`
	}

	if (def.type === 'array') {
		return def.maxLength ? ` [maxLength=${def.maxLength}]` : ''
	}

	return ''
}

function snapshotValues(template: GameTemplate, save: GameSave) {
	const snapshot: Record<string, GameValuePayload> = {}
	for (const def of template.valueDefinitions) {
		snapshot[def.id] = coerceValueForType(def, save.values[def.id] ?? def.defaultValue ?? fallbackMap[def.type])
	}
	return snapshot
}

export function buildInitialValues(template: GameTemplate) {
	const values: Record<string, GameValuePayload> = {}
	for (const def of template.valueDefinitions) {
		values[def.id] = coerceValueForType(def, def.defaultValue ?? fallbackMap[def.type])
	}
	return values
}

export const stepResultSchema = z.object({
	narrative: z.string(),
	summary: z.string().optional(),
	stateChanges: z
		.array(
			z.object({
				valueId: z.string(),
				valueLabel: z.string().optional(),
				next: valuePayloadSchema,
				reason: z.string().optional(),
			}),
		)
		.default([]),
	journalEntry: z.string().optional(),
	playerOptions: z.array(z.string()).optional(),
})

export type StepResult = z.infer<typeof stepResultSchema>

export function buildPromptPacket(args: {
	template: GameTemplate
	save: GameSave
	playerAction: string
	memoryTurnCount?: number
}): PromptPacket {
	const { template, save, playerAction, memoryTurnCount } = args
	const snapshot = snapshotValues(template, save)
	const valueLines = template.valueDefinitions
		.map(
			(def) =>
				`- ${def.label} (${def.type} :: ${def.id})${formatConstraints(def)} = ${formatValue(def, snapshot[def.id])}`,
		)
		.join('\n')
	const turnWindow = Math.max(1, Math.min(10, memoryTurnCount ?? 4))
	const recentSteps = save.history
		.slice(-turnWindow)
		.map((step) => {
			const changeReasons = step.stateChanges
				.filter((change) => Boolean(change.reason?.trim()))
				.map((change) => `    - ${change.valueId}: ${change.reason}`)
				.join('\n')
			const changeBlock = changeReasons ? `\n  Value Changes:\n${changeReasons}` : ''
			return `• Player: ${step.playerAction}\n  GM: ${step.narrative}${changeBlock}`
		})
		.join('\n')

	errorIfMissing(template)

	const systemPrompt = `You are an AI game master running the narrative "${template.title}".
Setting: ${template.setting ?? 'Flexible'}
Premise: ${template.premise ?? 'Player-driven'}
Safety Guardrails: ${template.safety ?? 'Keep it safe, heroic, and PG-13.'}
Never break character. Update tracked values only when required. Always obey the template instructions below.
${template.instructionBlocks.map((block, index) => `[Block ${index + 1}] ${block}`).join('\n\n')}`

	const userPrompt = `Player Action: ${playerAction || 'Continue the adventure.'}
Current Values:\n${valueLines || 'No tracked values yet.'}
Recent Turns:\n${recentSteps || 'First turn — provide an exciting opener.'}

Respond with a cinematic paragraph that advances the story, then describe every tracked value you changed.`

	return { system: systemPrompt, user: userPrompt }
}

function errorIfMissing(template: GameTemplate) {
	if (!template.valueDefinitions.length) {
		throw new Error('Templates require at least one value definition to build prompts.')
	}
}

const scalarJsonSchema = { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }] }

const anyValueJsonSchema = {
	anyOf: [
		scalarJsonSchema,
		{ type: 'array', items: scalarJsonSchema },
		{
			type: 'object',
			additionalProperties: {
				anyOf: [scalarJsonSchema, { type: 'array', items: scalarJsonSchema }],
			},
		},
	],
}

export function buildResponseFormat(template: GameTemplate) {
	return {
		type: 'json_schema' as const,
		json_schema: {
			name: `game_step_${template.slug}`,
				schema: {
					type: 'object',
					required: ['narrative', 'summary', 'journalEntry', 'playerOptions', 'stateChanges'],
					additionalProperties: false,
					properties: {
						narrative: { type: 'string', description: 'Main cinematic narration returned to the player.' },
						summary: { type: 'string', description: 'One sentence recap of the turn.' },
						journalEntry: { type: 'string', description: 'Optional log line to persist in journals.' },
						playerOptions: {
						type: 'array',
						items: { type: 'string' },
						description: 'Suggested next moves or prompts for the player.',
					},
					stateChanges: {
						type: 'array',
						items: {
							type: 'object',
							required: ['valueId', 'valueLabel', 'next', 'reason'],
							additionalProperties: false,
							properties: {
								valueId: { type: 'string', enum: template.valueDefinitions.map((def) => def.id) },
								valueLabel: { type: 'string' },
								next: anyValueJsonSchema,
								reason: { type: 'string' },
							},
						},
					},
				},
			},
		},
	}
}

export function coerceValueForType(def: GameValueDefinition, value: GameValuePayload | undefined) {
	if (value === undefined || value === null) {
		return def.defaultValue ?? fallbackMap[def.type]
	}

	const clampNumber = (candidate: number) => {
		if (!Number.isFinite(candidate)) {
			return def.defaultValue ?? fallbackMap[def.type]
		}
		let next = candidate
		if (def.min !== undefined) {
			next = Math.max(next, def.min)
		}
		if (def.max !== undefined) {
			next = Math.min(next, def.max)
		}
		return next
	}

	if (def.type === 'integer') {
		const coerced = Math.trunc(Number(value))
		const clamped = clampNumber(coerced)
		return typeof clamped === 'number' ? Math.trunc(clamped) : clamped
	}

	if (def.type === 'float' || def.type === 'number') {
		return clampNumber(Number(value))
	}

	if (def.type === 'boolean') {
		return Boolean(value)
	}

	if (def.type === 'array') {
		let next: ScalarValue[]
		if (Array.isArray(value)) {
			next = value as ScalarValue[]
		} else if (typeof value === 'object') {
			next = [JSON.stringify(value)]
		} else {
			next = [value as ScalarValue]
		}
		if (def.maxLength !== undefined && Number.isFinite(def.maxLength) && def.maxLength > 0) {
			next = next.slice(0, def.maxLength)
		}
		return next as GameValuePayload
	}

	if (def.type === 'object' && (typeof value !== 'object' || value === null)) {
		return { value }
	}

	return value
}

type ChangeCandidate = { valueId: string; next: GameValuePayload }

export function applyChangesToValues(
	template: GameTemplate,
	currentValues: Record<string, GameValuePayload>,
	changes: ChangeCandidate[],
) {
	const updated = { ...currentValues }
	for (const change of changes) {
		const definition = template.valueDefinitions.find((def) => def.id === change.valueId)
		if (!definition) {
			continue
		}
		updated[change.valueId] = coerceValueForType(definition, change.next)
	}
	return updated
}
