import OpenAI from 'openai'
import { z } from 'zod'
import { GameSave, GameTemplate, valuePayloadSchema, valueTypeSchema } from '../types/game'
import { buildPromptPacket, buildResponseFormat, stepResultSchema } from './prompting'

export type GameTurnParams = {
	template: GameTemplate
	save: GameSave
	playerAction: string
	apiKey?: string | null
	model?: string | null
	memoryTurnCount?: number | null
}

export async function runGameTurn(params: GameTurnParams) {
	const resolvedKey = params.apiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY
	if (!resolvedKey) {
		throw new Error('Add an OpenAI API key inside Settings to advance the story.')
	}
	const resolvedModel = params.model?.trim() || import.meta.env.VITE_OPENAI_MODEL || 'gpt-4.1-mini'
	const client = new OpenAI({ apiKey: resolvedKey, dangerouslyAllowBrowser: true })

	const packet = buildPromptPacket({
		template: params.template,
		save: params.save,
		playerAction: params.playerAction,
		memoryTurnCount: params.memoryTurnCount ?? undefined,
	})
	const responseFormat = buildResponseFormat(params.template)

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
	)) as any

	const payload = extractJsonPayload(response)
	return stepResultSchema.parse(payload)
}

const templateSuggestionSchema = z.object({
	title: z.string().min(3),
	premise: z.string().optional(),
	genre: z.string().optional(),
	setting: z.string().optional(),
	safety: z.string().optional(),
	instructionBlocks: z.array(z.string()).default([]),
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

export type TemplateSuggestion = z.infer<typeof templateSuggestionSchema>

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
				const candidateText = (segment as any).text ?? (segment as any).output_text
				if (typeof candidateText === 'string') {
					attempts.push(candidateText)
				}
				if ((segment as any).type === 'json_schema') {
					const schemaSegment = (segment as any).json_schema
					if (isPlainObject(schemaSegment?.output)) {
						return schemaSegment.output
					}
					if (schemaSegment?.arguments) {
						try {
							const parsed = JSON.parse(schemaSegment.arguments)
							if (isPlainObject(parsed)) {
								return parsed
							}
						} catch (error) {
							console.warn('Failed to parse schema arguments', schemaSegment.arguments)
						}
					}
				}
			}
		}
	}

	for (const attempt of attempts) {
		try {
			const parsed = JSON.parse(attempt)
			if (isPlainObject(parsed)) {
				return parsed
			}
		} catch (error) {
			continue
		}
	}

	throw new Error('Assistant response did not include valid JSON output. Make sure the template instructions remind the AI to only return JSON.')
}

function isPlainObject(candidate: unknown): candidate is Record<string, unknown> {
	return Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate))
}
