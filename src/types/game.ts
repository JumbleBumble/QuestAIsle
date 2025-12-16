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

export const valueDefinitionSchema = z
	.object({
		id: z.string().min(1),
		label: z.string().min(1),
		type: valueTypeSchema,
		description: z.string().optional(),
		visibility: z.enum(['public', 'hidden']).default('public'),
		defaultValue: valuePayloadSchema.optional(),
		min: z.number().finite().optional(),
		max: z.number().finite().optional(),
		maxLength: z.number().int().positive().optional(),
		example: z.string().optional(),
	})
	.superRefine((def, ctx) => {
		const isNumeric =
			def.type === 'integer' ||
			def.type === 'float' ||
			def.type === 'number'
		const isArray = def.type === 'array'

		if (!isNumeric && (def.min !== undefined || def.max !== undefined)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['min'],
				message:
					'min/max are only valid for integer/float/number values',
			})
		}

		if (!isArray && def.maxLength !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['maxLength'],
				message: 'maxLength is only valid for array values',
			})
		}

		if (isNumeric) {
			if (def.type === 'integer') {
				if (def.min !== undefined && !Number.isInteger(def.min)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['min'],
						message: 'Integer min must be a whole number',
					})
				}
				if (def.max !== undefined && !Number.isInteger(def.max)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: ['max'],
						message: 'Integer max must be a whole number',
					})
				}
			}

			if (
				def.min !== undefined &&
				def.max !== undefined &&
				def.min > def.max
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['min'],
					message: 'min cannot be greater than max',
				})
			}
		}
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
	rollMode: z.boolean().optional().default(false),
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
	d20Roll: z.number().int().min(1).max(20).optional(),
})

export type GameStep = z.infer<typeof stepSchema>

export const memoryEntrySchema = z.object({
	id: z.string().min(1),
	text: z.string().min(1),
	tags: z.array(z.string()).default([]),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type GameMemoryEntry = z.infer<typeof memoryEntrySchema>

export const saveSchema = z.object({
	id: z.string(),
	templateId: z.string(),
	title: z.string(),
	summary: z.string().optional(),
	lastMemoryOverviewAtHistoryLen: z.number().int().nonnegative().default(0),
	sessionValueDefinitions: z.array(valueDefinitionSchema).default([]),
	values: z.record(z.string(), valuePayloadSchema),
	memories: z.array(memoryEntrySchema).default([]),
	history: z.array(stepSchema),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type GameSave = z.infer<typeof saveSchema>

export type PromptPacket = {
	system: string
	user: string
}
