import { z } from 'zod'

export const valueTypeSchema = z.enum([
	'boolean',
	'integer',
	'float',
	'number',
	'string',
	'text',
	'array',
	'object',
])

export type GameValueType = z.infer<typeof valueTypeSchema>

const scalarValueSchema = z.union([z.string(), z.number(), z.boolean()])

export type ScalarValue = z.infer<typeof scalarValueSchema>

export type GameValuePayload =
	| ScalarValue
	| ScalarValue[]
	| Record<string, ScalarValue | ScalarValue[]>

export const valuePayloadSchema: z.ZodType<GameValuePayload> = z.lazy(() =>
	z.union([
		scalarValueSchema,
		z.array(scalarValueSchema),
		z.record(z.string(), z.union([scalarValueSchema, z.array(scalarValueSchema)])),
	]),
)

export const valueDefinitionSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	type: valueTypeSchema,
	description: z.string().optional(),
	visibility: z.enum(['public', 'hidden']).default('public'),
	defaultValue: valuePayloadSchema.optional(),
	example: z.string().optional(),
})

export type GameValueDefinition = z.infer<typeof valueDefinitionSchema>

export const templateSchema = z.object({
	id: z.string(),
	title: z.string(),
	slug: z.string(),
	genre: z.string().optional(),
	setting: z.string().optional(),
	premise: z.string().optional(),
	safety: z.string().optional(),
	instructionBlocks: z.array(z.string()).default([]),
	valueDefinitions: z.array(valueDefinitionSchema),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type GameTemplate = z.infer<typeof templateSchema>

export const stepChangeSchema = z.object({
	valueId: z.string(),
	previous: valuePayloadSchema.optional(),
	next: valuePayloadSchema,
	reason: z.string().optional(),
})

export type GameValueChange = z.infer<typeof stepChangeSchema>

export const stepSchema = z.object({
	id: z.string(),
	playerAction: z.string(),
	narrative: z.string(),
	stateChanges: z.array(stepChangeSchema).default([]),
	playerOptions: z.array(z.string()).default([]),
	createdAt: z.string(),
})

export type GameStep = z.infer<typeof stepSchema>

export const saveSchema = z.object({
	id: z.string(),
	templateId: z.string(),
	title: z.string(),
	summary: z.string().optional(),
	values: z.record(z.string(), valuePayloadSchema),
	history: z.array(stepSchema),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type GameSave = z.infer<typeof saveSchema>

export type PromptPacket = {
	system: string
	user: string
}
