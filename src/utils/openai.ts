import OpenAI from 'openai'
import { z } from 'zod'
import { GameSave, GameTemplate, valuePayloadSchema, valueTypeSchema } from '../types/game'
import {
	buildMemoryOverviewPromptPacket,
	buildMemoryOverviewResponseFormat,
	buildPromptPacket,
	buildResponseFormat,
	memoryOverviewResultSchema,
	stepResultSchema,
} from './prompting'

export type GameTurnParams = {
	template: GameTemplate
	save: GameSave
	playerAction: string
	apiKey?: string | null
	model?: string | null
	memoryTurnCount?: number | null
	onNarrativeText?: (text: string) => void
	onPlayerOptions?: (options: string[]) => void
	onStateChanges?: (
		changes: Array<{ valueId: string; next: unknown; reason?: string }>
	) => void
	signal?: AbortSignal
}

export async function runGameTurn(params: GameTurnParams) {
	const resolvedKey =
		params.apiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY
	if (!resolvedKey) {
		throw new Error(
			'Add an OpenAI API key inside Settings to advance the story.'
		)
	}
	const resolvedModel =
		params.model?.trim() ||
		import.meta.env.VITE_OPENAI_MODEL ||
		'gpt-4.1-mini'
	const client = new OpenAI({
		apiKey: resolvedKey,
		dangerouslyAllowBrowser: true,
	})

	const packet = buildPromptPacket({
		template: params.template,
		save: params.save,
		playerAction: params.playerAction,
		memoryTurnCount: params.memoryTurnCount ?? undefined,
	})
	const responseFormat = buildResponseFormat(params.template)

	const stream = client.responses.stream(
		{
			model: resolvedModel,
			input: [
				{ role: 'system', content: packet.system },
				{ role: 'user', content: packet.user },
			],
			text: {
				format: {
					name: responseFormat.json_schema.name,
					type: 'json_schema',
					schema: responseFormat.json_schema.schema,
				},
			},
		} as any,
		{ signal: params.signal } as any
	)

	if (
		params.onNarrativeText ||
		params.onPlayerOptions ||
		params.onStateChanges
	) {
		let lastNarrative = ''
		let lastOptionsKey = ''
		let lastStateChangesKey = ''
		stream.on('response.output_text.delta', (event: any) => {
			try {
				const snapshotText =
					typeof event?.snapshot === 'string' ? event.snapshot : ''

				if (params.onNarrativeText) {
					const preview = extractJsonStringFieldPreview(
						snapshotText,
						'narrative'
					)
					if (preview !== null && preview !== lastNarrative) {
						lastNarrative = preview
						params.onNarrativeText(preview)
					}
				}

				if (params.onPlayerOptions) {
					const options = extractJsonStringArrayFieldPreview(
						snapshotText,
						'playerOptions'
					)
					if (options !== null) {
						const trimmed = options
							.map((value) => value.trim())
							.filter(Boolean)
						const key = JSON.stringify(trimmed)
						if (key !== lastOptionsKey) {
							lastOptionsKey = key
							params.onPlayerOptions(trimmed)
						}
					}
				}

				if (params.onStateChanges) {
					const changes = extractJsonObjectArrayFieldPreview(
						snapshotText,
						'stateChanges'
					)
					if (changes !== null) {
						const normalized = changes
							.map((item) => {
								if (!item || typeof item !== 'object') return null
								const valueId = (item as any).valueId
								const next = (item as any).next
								const reason = (item as any).reason
								if (typeof valueId !== 'string' || !valueId)
									return null
								return {
									valueId,
									next,
									reason:
										typeof reason === 'string'
											? reason
										: undefined,
								}
							})
							.filter(Boolean) as Array<{
							valueId: string
							next: unknown
							reason?: string
						}>
						const key = JSON.stringify(
							normalized.map((c) => [c.valueId, c.next])
						)
						if (key !== lastStateChangesKey) {
							lastStateChangesKey = key
							params.onStateChanges(normalized)
						}
					}
				}
			} catch {
				
			}
		})
	}

	const response = (await stream.finalResponse()) as any

	const payload = extractJsonPayload(response)
	return stepResultSchema.parse(payload)
}

export type MemoryOverviewParams = {
	template: GameTemplate
	save: GameSave
	apiKey?: string | null
	model?: string | null
	memoryTurnCount?: number | null
	signal?: AbortSignal
}

export async function runMemoryOverview(params: MemoryOverviewParams) {
	const resolvedKey =
		params.apiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY
	if (!resolvedKey) {
		throw new Error(
			'Add an OpenAI API key inside Settings to advance the story.'
		)
	}
	const resolvedModel =
		params.model?.trim() ||
		import.meta.env.VITE_OPENAI_MODEL ||
		'gpt-4.1-mini'
	const client = new OpenAI({
		apiKey: resolvedKey,
		dangerouslyAllowBrowser: true,
	})

	const packet = buildMemoryOverviewPromptPacket({
		template: params.template,
		save: params.save,
		memoryTurnCount: params.memoryTurnCount ?? undefined,
	})
	const responseFormat = buildMemoryOverviewResponseFormat(params.template)

	const response = (await client.responses.create(
		{
			model: resolvedModel,
			input: [
				{ role: 'system', content: packet.system },
				{ role: 'user', content: packet.user },
			],
			text: {
				format: {
					name: responseFormat.json_schema.name,
					type: 'json_schema',
					schema: responseFormat.json_schema.schema,
				},
			},
		} as any,
		{ signal: params.signal } as any
	)) as any

	const payload = extractJsonPayload(response)
	return memoryOverviewResultSchema.parse(payload)
}

function extractJsonStringFieldPreview(jsonText: string, fieldName: string) {
	const keyNeedle = `"${fieldName}"`
	const keyIndex = jsonText.indexOf(keyNeedle)
	if (keyIndex === -1) {
		return null
	}
	let i = keyIndex + keyNeedle.length
	while (i < jsonText.length && /\s/.test(jsonText[i])) i++
	if (jsonText[i] !== ':') {
		return null
	}
	i++
	while (i < jsonText.length && /\s/.test(jsonText[i])) i++
	if (jsonText[i] !== '"') {
		return null
	}
	i++
	let out = ''
	while (i < jsonText.length) {
		const ch = jsonText[i]
		if (ch === '"') {
			return out
		}
		if (ch === '\\') {
			if (i + 1 >= jsonText.length) {
				return out
			}
			const esc = jsonText[i + 1]
			switch (esc) {
				case '"':
					out += '"'
					i += 2
					continue
				case '\\':
					out += '\\'
					i += 2
					continue
				case '/':
					out += '/'
					i += 2
					continue
				case 'b':
					out += '\b'
					i += 2
					continue
				case 'f':
					out += '\f'
					i += 2
					continue
				case 'n':
					out += '\n'
					i += 2
					continue
				case 'r':
					out += '\r'
					i += 2
					continue
				case 't':
					out += '\t'
					i += 2
					continue
				case 'u': {
					const hex = jsonText.slice(i + 2, i + 6)
					if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
						return out
					}
					out += String.fromCharCode(parseInt(hex, 16))
					i += 6
					continue
				}
				default:
					out += esc
					i += 2
					continue
			}
		}
		out += ch
		i++
	}
	return out
}

function extractJsonStringArrayFieldPreview(
	jsonText: string,
	fieldName: string
) {
	const keyNeedle = `"${fieldName}"`
	const keyIndex = jsonText.indexOf(keyNeedle)
	if (keyIndex === -1) {
		return null
	}
	let i = keyIndex + keyNeedle.length
	while (i < jsonText.length && /\s/.test(jsonText[i])) i++
	if (jsonText[i] !== ':') {
		return null
	}
	i++
	while (i < jsonText.length && /\s/.test(jsonText[i])) i++
	if (jsonText[i] !== '[') {
		return null
	}
	i++
	const items: string[] = []
	while (i < jsonText.length) {
		while (i < jsonText.length && /\s/.test(jsonText[i])) i++
		if (i >= jsonText.length) break
		const ch = jsonText[i]
		if (ch === ']') {
			return items
		}
		if (ch === ',') {
			i++
			continue
		}
		if (ch !== '"') {
			return items
		}
		i++
		let out = ''
		while (i < jsonText.length) {
			const c = jsonText[i]
			if (c === '"') {
				items.push(out)
				i++
				break
			}
			if (c === '\\') {
				if (i + 1 >= jsonText.length) {
					return items
				}
				const esc = jsonText[i + 1]
				switch (esc) {
					case '"':
						out += '"'
						i += 2
						continue
					case '\\':
						out += '\\'
						i += 2
						continue
					case '/':
						out += '/'
						i += 2
						continue
					case 'b':
						out += '\b'
						i += 2
						continue
					case 'f':
						out += '\f'
						i += 2
						continue
					case 'n':
						out += '\n'
						i += 2
						continue
					case 'r':
						out += '\r'
						i += 2
						continue
					case 't':
						out += '\t'
						i += 2
						continue
					case 'u': {
						const hex = jsonText.slice(i + 2, i + 6)
						if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
							return items
						}
						out += String.fromCharCode(parseInt(hex, 16))
						i += 6
						continue
					}
					default:
						out += esc
						i += 2
						continue
				}
			}
			out += c
			i++
		}
	}
	return items
}

function extractJsonObjectArrayFieldPreview(
	jsonText: string,
	fieldName: string
) {
	const keyNeedle = `"${fieldName}"`
	const keyIndex = jsonText.indexOf(keyNeedle)
	if (keyIndex === -1) {
		return null
	}
	let i = keyIndex + keyNeedle.length
	while (i < jsonText.length && /\s/.test(jsonText[i])) i++
	if (jsonText[i] !== ':') {
		return null
	}
	i++
	while (i < jsonText.length && /\s/.test(jsonText[i])) i++
	if (jsonText[i] !== '[') {
		return null
	}
	i++
	const objects: any[] = []
	let inString = false
	let escape = false
	let depth = 0
	let currentStart = -1
	for (; i < jsonText.length; i++) {
		const ch = jsonText[i]
		if (inString) {
			if (escape) {
				escape = false
				continue
			}
			if (ch === '\\') {
				escape = true
				continue
			}
			if (ch === '"') {
				inString = false
			}
			continue
		}
		if (ch === '"') {
			inString = true
			continue
		}
		if (ch === '{') {
			if (depth === 0) {
				currentStart = i
			}
			depth++
			continue
		}
		if (ch === '}') {
			if (depth > 0) {
				depth--
				if (depth === 0 && currentStart !== -1) {
					const candidate = jsonText.slice(currentStart, i + 1)
					try {
						objects.push(JSON.parse(candidate))
					} catch {
						return objects
					}
					currentStart = -1
				}
			}
			continue
		}
		if (ch === ']') {
			return objects
		}
	}
	return objects
}

const templateSuggestionSchema = z.object({
       title: z.string().min(3),
       premise: z.string().optional(),
       genre: z.string().optional(),
       setting: z.string().optional(),
       safety: z.string().optional(),
       instructionBlocks: z.array(z.string()).default([]),
       rollMode: z.boolean().optional(),
       values: z
	       .array(
		       z.object({
			       id: z.string().min(1),
			       label: z.string().min(1),
			       type: valueTypeSchema,
			       description: z.string().optional(),
			       defaultValue: valuePayloadSchema.optional(),
			       min: z.preprocess(
				       (value) => (value === null ? undefined : value),
				       z.number().finite().optional()
			       ),
			       max: z.preprocess(
				       (value) => (value === null ? undefined : value),
				       z.number().finite().optional()
			       ),
			       maxLength: z.preprocess(
				       (value) => (value === null ? undefined : value),
				       z.number().int().positive().optional()
			       ),
		       })
	       )
	       .min(1)
	       .max(10),
})

export type TemplateSuggestion = z.infer<typeof templateSuggestionSchema> & {
	rollMode?: boolean;
}

export type TemplateGeneratorParams = {
	prompt: string
	apiKey?: string | null
	model?: string | null
	mode?: 'new' | 'edit'
	baseTemplate?: TemplateSuggestion
}

const scalarJsonSchema = {
	anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
}

const anyValueJsonSchema = {
	anyOf: [
		scalarJsonSchema,
		{ type: 'array', items: scalarJsonSchema },
		{
			type: 'object',
			additionalProperties: {
				anyOf: [
					scalarJsonSchema,
					{ type: 'array', items: scalarJsonSchema },
				],
			},
		},
	],
}

const templateResponseFormat = {
	type: 'json_schema' as const,
	json_schema: {
		name: 'template_blueprint_v1',
		schema: {
			type: 'object',
			required: [
				'title',
				'premise',
				'genre',
				'setting',
				'safety',
				'instructionBlocks',
				'values',
			],
			additionalProperties: false,
			properties: {
				title: {
					type: 'string',
					description: 'Short evocative template title.',
				},
				premise: {
					type: 'string',
					description: 'Premise players will follow.',
				},
				genre: { type: 'string' },
				setting: { type: 'string' },
				safety: { type: 'string' },
				instructionBlocks: {
					type: 'array',
					items: { type: 'string' },
					minItems: 0,
					maxItems: 4,
					description: 'Short GM directives, 1-3 sentences each.',
				},
				values: {
					type: 'array',
					minItems: 3,
					maxItems: 8,
					items: {
						type: 'object',
						required: [
							'id',
							'label',
							'type',
							'description',
							'defaultValue',
							'min',
							'max',
							'maxLength',
						],
						additionalProperties: false,
						properties: {
							id: { type: 'string', pattern: '^[a-z0-9_-]+$' },
							label: { type: 'string' },
							type: {
								type: 'string',
								enum: valueTypeSchema.options,
							},
							description: { type: 'string' },
							defaultValue: anyValueJsonSchema,
							min: {
								anyOf: [{ type: 'number' }, { type: 'null' }],
								description:
									'Optional numeric minimum (only for integer/float/number).',
							},
							max: {
								anyOf: [{ type: 'number' }, { type: 'null' }],
								description:
									'Optional numeric maximum (only for integer/float/number).',
							},
							maxLength: {
								anyOf: [{ type: 'number' }, { type: 'null' }],
								description:
									'Optional max array length (only for array).',
							},
						},
					},
				},
			},
		},
	},
}

export async function generateTemplateFromPrompt(
	params: TemplateGeneratorParams
) {
	const resolvedKey =
		params.apiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY
	if (!resolvedKey) {
		throw new Error(
			'Add an OpenAI API key inside Settings to generate templates.'
		)
	}
	const resolvedModel =
		params.model?.trim() ||
		import.meta.env.VITE_OPENAI_MODEL ||
		'gpt-4.1-mini'
	const client = new OpenAI({
		apiKey: resolvedKey,
		dangerouslyAllowBrowser: true,
	})

	const mode = params.mode ?? 'new'
	const baseTemplateJson = params.baseTemplate
		? JSON.stringify(params.baseTemplate, null, 2)
		: null

	const systemPrompt = `You are an award-winning tabletop RPG designer. Craft story templates with concrete stakes, clear safety guidance, and 3-8 precise tracked values. Generate compact JSON that follows the provided schema exactly.

For numeric tracked values (integer/float/number), you may optionally include min/max to establish bounds. For array tracked values, you may optionally include maxLength to cap list size.`

	const userPrompt =
		mode === 'edit'
			? `You are editing an existing GM template.

Current template JSON:
${baseTemplateJson ?? '{}'}

Edit request:
"""${params.prompt}"""

Return a fully updated template (not a diff) that follows the schema exactly.

Editing rules:
- Preserve existing tracked value ids whenever possible (do not rename ids unless the request explicitly requires it).
- Keep the tracked values list within 3-8 items.
- Keep safety guidance and instruction blocks concise and actionable.
`
			: `Design a cinematic GM template for the following request:
"""${params.prompt}"""

Ensure each tracked value has a concise snake_case id, a descriptive label, and defaults that reflect the genre.`

	const response = (await client.responses.create({
		model: resolvedModel,
		input: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		],
		text: {
			format: {
				name: templateResponseFormat.json_schema.name,
				type: 'json_schema',
				schema: templateResponseFormat.json_schema.schema,
			},
		},
	} as any)) as any

	const payload = extractJsonPayload(response)
	return templateSuggestionSchema.parse(payload)
}


function stripCodeFences(raw: string) {
	let text = raw.trim()
	if (text.startsWith('```')) {
		text = text.replace(/^```[a-zA-Z0-9_-]*\s*/, '')
		text = text.replace(/\s*```\s*$/, '')
	}
	return text.trim()
}

function tryParseJsonObjectFromText(text: string) {
	const cleaned = stripCodeFences(text)
	const candidates: string[] = [cleaned]

	const firstBrace = cleaned.indexOf('{')
	const lastBrace = cleaned.lastIndexOf('}')
	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		candidates.push(cleaned.slice(firstBrace, lastBrace + 1))
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate)
			if (isPlainObject(parsed)) {
				return parsed
			}
		} catch {}
	}

	return null
}

function extractJsonPayload(response: any) {
	const attempts: string[] = []
	if ('output_text' in response && response.output_text) {
		if (typeof response.output_text === 'string') {
			attempts.push(response.output_text)
		} else if (Array.isArray(response.output_text)) {
			for (const item of response.output_text) {
				if (typeof item === 'string') {
					attempts.push(item)
				}
			}
		}
	}

	for (const block of response.output ?? []) {
		if ('content' in block && Array.isArray(block.content)) {
			for (const segment of block.content) {
				const candidateText =
					(segment as any).text ?? (segment as any).output_text
				if (typeof candidateText === 'string') {
					attempts.push(candidateText)
				}
				if ((segment as any).type === 'json_schema') {
					const schemaSegment = (segment as any).json_schema
					if (isPlainObject(schemaSegment?.output)) {
						return schemaSegment.output
					}
					if (schemaSegment?.arguments) {
						const parsed =
							typeof schemaSegment.arguments === 'string'
								? tryParseJsonObjectFromText(
										schemaSegment.arguments
								  )
								: null
						if (parsed) {
							return parsed
						}
						console.warn(
							'Failed to parse schema arguments',
							schemaSegment.arguments
						)
					}
				}
			}
		}
	}

	for (const attempt of attempts) {
		const parsed = tryParseJsonObjectFromText(attempt)
		if (parsed) {
			return parsed
		}
	}

	throw new Error(
		'Assistant response did not include valid JSON output. Make sure the template instructions remind the AI to only return JSON.'
	)
}

function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
	return Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate))
}
