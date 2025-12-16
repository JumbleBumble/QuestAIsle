import { useEffect, useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Sparkles, PlusCircle, Trash2 } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import {
	useTemplatesQuery,
	useTemplateSaver,
	useTemplateRemover,
} from '../hooks/useTemplateQueries'
import {
	GameTemplate,
	GameValueDefinition,
	valuePayloadSchema,
	valueTypeSchema,
} from '../types/game'
import { TemplateDraft } from '../data/templates'
import { useGameStore } from '../state/useGameStore'
import { useSettingsQuery } from '../hooks/useSettings'
import {
	generateTemplateFromPrompt,
	TemplateSuggestion as BaseTemplateSuggestion,
} from '../utils/openai'

type TemplateSuggestion = BaseTemplateSuggestion & { rollMode: boolean }
import { ToggleSwitch } from './ui/ToggleSwitch'

const optionalFiniteNumber = z
	.union([z.number().finite(), z.nan()])
	.transform((value) => (Number.isNaN(value) ? undefined : value))
	.optional()

const optionalPositiveInt = z
	.union([z.number().int().positive(), z.nan()])
	.transform((value) => (Number.isNaN(value) ? undefined : value))
	.optional()

const valueDefinitionFormSchema = z.object({
	id: z.string().min(1, 'Provide a value id'),
	label: z.string().min(2, 'Label is required'),
	type: valueTypeSchema,
	description: z.string().optional(),
	defaultValue: z.string().optional(),
	min: optionalFiniteNumber,
	max: optionalFiniteNumber,
	maxLength: optionalPositiveInt,
})

type ValueDefinitionForm = z.infer<typeof valueDefinitionFormSchema>

const templateFormSchema = z.object({
       title: z.string().min(3, 'Template title is required'),
       premise: z.string().optional(),
       genre: z.string().optional(),
       setting: z.string().optional(),
       safety: z.string().optional(),
       instructions: z.string().optional(),
       rollMode: z.boolean().default(false),
       values: z
	       .array(valueDefinitionFormSchema)
	       .min(1, 'Track at least one value'),
})

type TemplateFormValues = z.infer<typeof templateFormSchema>

const defaultValues: TemplateFormValues = {
       title: 'Neon Heist',
       premise: 'Lead a crew of synth-runners across a techno-noir metropolis.',
       genre: 'Sci-Fi Heist',
       setting: 'Night City – neon canyons, rogue AIs, and megacorps.',
       safety: 'No graphic gore. Keep stakes thrilling yet heroic.',
       instructions:
	       'Balance tension with player agency. Offer cinematic cliffhangers.',
       rollMode: false,
       values: [
	       {
		       id: 'health',
		       label: 'Crew Vitality',
		       type: 'integer',
		       description: '0 = incapacitated, 10 = peak shape',
		       defaultValue: '8',
		       min: 0,
		       max: 10,
	       },
	       {
		       id: 'credits',
		       label: 'Crew Credits',
		       type: 'number',
		       description: 'Liquid funds for bribes and gear',
		       defaultValue: '1200',
	       },
	       {
		       id: 'heat',
		       label: 'Wanted Heat',
		       type: 'integer',
		       description: 'Represents police attention',
		       defaultValue: '2',
		       min: 0,
	       },
	       {
		       id: 'inventory',
		       label: 'Inventory',
		       type: 'array',
		       description: 'Key items currently held',
		       defaultValue: '["Mono-blade", "EMP charge"]',
		       maxLength: 12,
	       },
       ],
}

const PREMISE_PREVIEW_MAX_LEN = 180

function truncateText(value: string, maxLen: number) {
	const trimmed = value.trim()
	if (trimmed.length <= maxLen) {
		return trimmed
	}
	if (maxLen <= 1) {
		return '…'
	}
	return `${trimmed.slice(0, maxLen - 1).trimEnd()}…`
}

function parseDefaultValue(
	def: ValueDefinitionForm
): GameValueDefinition['defaultValue'] {
	if (!def.defaultValue?.length) {
		return undefined
	}
	const raw = def.defaultValue.trim()
	try {
		switch (def.type) {
			case 'integer':
				if (!raw.length) {
					return undefined
				}
				{
					const candidate = Number(raw)
					if (!Number.isFinite(candidate)) {
						return undefined
					}
					return Math.trunc(candidate)
				}
			case 'float':
			case 'number':
				if (!raw.length) {
					return undefined
				}
				{
					const candidate = Number(raw)
					return Number.isFinite(candidate) ? candidate : undefined
				}
			case 'boolean': {
				const normalized = raw.toLowerCase()
				if (['true', '1', 'yes', 'on'].includes(normalized)) {
					return true
				}
				if (['false', '0', 'no', 'off'].includes(normalized)) {
					return false
				}
				return undefined
			}
			case 'array':
			case 'object': {
				const parsed = JSON.parse(raw)
				const validated = valuePayloadSchema.safeParse(parsed)
				return validated.success ? validated.data : undefined
			}
			default:
				return raw
		}
	} catch (error) {
		console.warn(
			'Unable to parse default for value definition',
			def,
			error
		)
		return undefined
	}
}

function stringifyDefaultValue(value: GameValueDefinition['defaultValue']) {
	if (value === undefined || value === null) {
		return ''
	}
	if (typeof value === 'string') {
		return value
	}
	try {
		return JSON.stringify(value)
	} catch (error) {
		return String(value)
	}
}

function suggestionToFormValues(
       suggestion: TemplateSuggestion
): TemplateFormValues {
       return {
	       title: suggestion.title,
	       premise: suggestion.premise ?? '',
	       genre: suggestion.genre ?? '',
	       setting: suggestion.setting ?? '',
	       safety: suggestion.safety ?? '',
	       instructions: suggestion.instructionBlocks?.join('\n\n') ?? '',
	       rollMode: suggestion.rollMode === undefined ? false : suggestion.rollMode,
	       values: suggestion.values.map((value) => ({
		       id: value.id,
		       label: value.label,
		       type: value.type,
		       description: value.description ?? '',
		       defaultValue: stringifyDefaultValue(value.defaultValue),
		       min: value.min,
		       max: value.max,
		       maxLength: value.maxLength,
	       })),
       }
}

function templateToFormValues(
       template: GameTemplate,
       options?: { asCopy?: boolean }
): TemplateFormValues {
       const asCopy = options?.asCopy ?? true
       return {
	       title: asCopy ? `${template.title} (Copy)` : template.title,
	       premise: template.premise ?? '',
	       genre: template.genre ?? '',
	       setting: template.setting ?? '',
	       safety: template.safety ?? '',
	       instructions: template.instructionBlocks?.join('\n\n') ?? '',
	       rollMode: template.rollMode === undefined ? false : template.rollMode,
	       values: template.valueDefinitions.map((value) => ({
		       id: value.id,
		       label: value.label,
		       type: value.type,
		       description: value.description ?? '',
		       defaultValue: stringifyDefaultValue(value.defaultValue),
		       min: value.min,
		       max: value.max,
		       maxLength: value.maxLength,
	       })),
       }
}

export function TemplatePanel() {
	const reduceMotion = useReducedMotion()
	const templatesQuery = useTemplatesQuery()
	const saver = useTemplateSaver()
	const remover = useTemplateRemover()
	const activeTemplateSlug = useGameStore(
		(state) => state.activeTemplateSlug
	)
	const setActiveTemplate = useGameStore((state) => state.setActiveTemplate)
	const { data: settings } = useSettingsQuery()
	const [activeTab, setActiveTab] = useState<'manage' | 'create'>('manage')
	const [aiMode, setAiMode] = useState<'new' | 'edit'>('new')
	const [aiPrompt, setAiPrompt] = useState(
		'Create a mythic desert odyssey about solar-powered caravans'
	)

	const form = useForm<TemplateFormValues>({
		resolver: zodResolver(templateFormSchema) as any,
		defaultValues,
	})
	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: 'values',
	})

	const hasApiKey = Boolean(
		settings?.openaiApiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY
	)

	const generator = useMutation({
		mutationFn: (params: {
			prompt: string
			mode: 'new' | 'edit'
			baseTemplate?: TemplateSuggestion
		}) =>
			generateTemplateFromPrompt({
				prompt: params.prompt,
				mode: params.mode,
				baseTemplate: params.baseTemplate,
				apiKey: settings?.openaiApiKey,
				model: settings?.openaiModel,
			}),
	})

	useEffect(() => {
		if (!templatesQuery.data?.length) {
			return
		}
		if (!activeTemplateSlug) {
			setActiveTemplate(templatesQuery.data[0].slug)
		}
	}, [templatesQuery.data, activeTemplateSlug, setActiveTemplate])

	const activeTemplate = useMemo(() => {
		if (!activeTemplateSlug) {
			return undefined
		}
		return templatesQuery.data?.find(
			(template) => template.slug === activeTemplateSlug
		)
	}, [activeTemplateSlug, templatesQuery.data])

	const handleEditTemplateAsCopy = (template: GameTemplate) => {
		setActiveTemplate(template.slug)
		form.reset(templateToFormValues(template, { asCopy: true }))
		setActiveTab('create')
	}

	const buildSuggestionContextFromForm = (): TemplateSuggestion => {
	       const values = form.getValues()
	       return {
		       title: values.title,
		       premise: values.premise ?? '',
		       genre: values.genre ?? '',
		       setting: values.setting ?? '',
		       safety: values.safety ?? '',
		       instructionBlocks:
			       values.instructions
				       ?.split('\n\n')
				       .map((block) => block.trim())
				       .filter(Boolean) ?? [],
		       rollMode: values.rollMode === undefined ? false : values.rollMode,
		       values: (values.values ?? []).map((value) => {
			       const isNumeric =
				       value.type === 'integer' ||
				       value.type === 'float' ||
				       value.type === 'number'
			       const isArray = value.type === 'array'
			       return {
				       id: value.id,
				       label: value.label,
				       type: value.type,
				       description: value.description,
				       defaultValue: parseDefaultValue(value),
				       min:
					       isNumeric && Number.isFinite(value.min)
						       ? value.min
						       : undefined,
				       max:
					       isNumeric && Number.isFinite(value.max)
						       ? value.max
						       : undefined,
				       maxLength:
					       isArray && Number.isFinite(value.maxLength)
						       ? value.maxLength
						       : undefined,
			       }
		       }),
	       }
	}

	const handleGenerateTemplate = async () => {
	       const prompt = aiPrompt.trim()
	       if (!prompt) {
		       return
	       }
	       try {
		       const suggestion = await generator.mutateAsync({
			       prompt,
			       mode: aiMode,
			       baseTemplate:
				       aiMode === 'edit'
					       ? buildSuggestionContextFromForm()
					       : undefined,
		       })
		       form.reset(suggestionToFormValues({ ...suggestion, rollMode: typeof suggestion.rollMode === 'boolean' ? suggestion.rollMode : false }))
	       } catch (error) {
               
	       }
	}

	const handleSubmit = form.handleSubmit(async (values) => {
	       const draft: TemplateDraft = {
		       title: values.title,
		       premise: values.premise,
		       genre: values.genre,
		       setting: values.setting,
		       safety: values.safety,
		       instructionBlocks: values.instructions
			       ?.split('\n\n')
			       .map((block: string) => block.trim())
			       .filter(Boolean),
		       valueDefinitions: values.values.map(
			       (value: ValueDefinitionForm) => {
				       const isNumeric =
					       value.type === 'integer' ||
					       value.type === 'float' ||
					       value.type === 'number'
				       const isArray = value.type === 'array'
				       return {
					       id: value.id,
					       label: value.label,
					       type: value.type,
					       description: value.description,
					       visibility: 'public',
					       defaultValue: parseDefaultValue(value),
					       min:
						       isNumeric && Number.isFinite(value.min)
							       ? value.min
							       : undefined,
					       max:
						       isNumeric && Number.isFinite(value.max)
							       ? value.max
							       : undefined,
					       maxLength:
						       isArray && Number.isFinite(value.maxLength)
							       ? value.maxLength
							       : undefined,
				       }
			       }
		       ),
		       rollMode: values.rollMode ?? false,
	       }

	       const created = await saver.mutateAsync({ draft })
	       setActiveTemplate(created.slug)
	       form.reset(templateToFormValues(created, { asCopy: false }))
	       setActiveTab('manage')
	})

	const templates = templatesQuery.data ?? []

	return (
		<motion.section
			initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
			animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			transition={{ duration: 0.22, ease: 'easeOut' }}
			className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-purple-500/10 backdrop-blur"
		>
			<header className="flex items-center justify-between">
				<div>
					<p className="text-sm uppercase tracking-[0.2em] text-purple-300">
						Stories
					</p>
					<h2 className="text-2xl font-semibold text-white">
						Template Library
					</h2>
				</div>
				<motion.div
					aria-hidden
					whileHover={
						reduceMotion ? undefined : { scale: 1.06, rotate: 4 }
					}
					whileTap={reduceMotion ? undefined : { scale: 0.98 }}
				>
					<Sparkles className="h-6 w-6 text-purple-200" />
				</motion.div>
			</header>

			<Tabs.Root
				value={activeTab}
				onValueChange={(next) =>
					setActiveTab(next as 'manage' | 'create')
				}
				className="mt-6"
			>
				<Tabs.List className="grid grid-cols-2 rounded-full bg-white/10 p-1 text-sm text-white">
					<Tabs.Trigger
						value="manage"
						className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-gray-900"
					>
						Active Templates
					</Tabs.Trigger>
					<Tabs.Trigger
						value="create"
						className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-gray-900"
					>
						Create Template
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="manage" className="mt-6 space-y-4">
					{templatesQuery.isLoading && (
						<p className="text-sm text-purple-100/70">
							Loading templates…
						</p>
					)}
					{!templates.length && !templatesQuery.isLoading && (
						<p className="text-sm text-purple-100/70">
							No templates yet. Create one to begin.
						</p>
					)}
					<div className="max-h-[45vh] overflow-y-auto pr-2">
						<div className="grid gap-4">
							{templates.map((template) => (
								<motion.div
									key={template.slug}
									onClick={() =>
										setActiveTemplate(template.slug)
									}
									onKeyDown={(event) => {
										if (
											event.key === 'Enter' ||
											event.key === ' '
										) {
											event.preventDefault()
											setActiveTemplate(template.slug)
										}
									}}
									role="button"
									tabIndex={0}
									whileHover={{ scale: 1.01 }}
									whileTap={{ scale: 0.99 }}
									className={`rounded-2xl border px-4 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-purple-400 ${
										activeTemplateSlug === template.slug
											? 'border-purple-400/70 bg-purple-400/10 text-white'
											: 'border-white/10 bg-white/5 text-purple-100'
									}`}
								>
									<div className="flex items-center justify-between">
										<h3 className="text-lg font-semibold">
											{template.title}
										</h3>
										<div className="flex items-center gap-3">
											<motion.button
												type="button"
												onClick={(event) => {
													event.stopPropagation()
													handleEditTemplateAsCopy(
														template
													)
												}}
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.02 }
												}
												whileTap={
													reduceMotion
														? undefined
														: { scale: 0.98 }
												}
												className="text-xs text-purple-200 hover:text-white"
											>
												Edit
											</motion.button>
											<motion.button
												type="button"
												onClick={(event) => {
													event.stopPropagation()
													const wasActive =
														activeTemplateSlug ===
														template.slug
													remover.mutate(
														template.slug,
														{
															onSuccess: () => {
																if (
																	wasActive
																) {
																	setActiveTemplate(
																		null
																	)
																}
															},
														}
													)
												}}
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.05 }
												}
												whileTap={
													reduceMotion
														? undefined
														: { scale: 0.98 }
												}
												className="text-xs text-red-200 hover:text-red-100"
											>
												<Trash2 className="h-4 w-4" />
											</motion.button>
										</div>
									</div>
									<p className="mt-1 text-sm text-purple-100/70">
										{template.premise?.trim().length
											? truncateText(
													template.premise,
													PREMISE_PREVIEW_MAX_LEN
											  )
											: 'Player-driven narrative'}
									</p>
									<div className="mt-3 flex flex-wrap gap-2 text-xs text-purple-100/70">
										<span className="rounded-xl bg-purple-500/20 px-2 py-1">
											{template.genre ?? 'Any Genre'}
										</span>
										<span className="rounded-xl bg-purple-500/20 px-2 py-1">
											{template.valueDefinitions.length}{' '}
											values
										</span>
									</div>
								</motion.div>
							))}
						</div>
					</div>
				</Tabs.Content>

				<Tabs.Content value="create" className="mt-6">
					{activeTemplate && (
						<div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-purple-100">
							<p className="text-xs uppercase tracking-[0.3em] text-purple-300">
								Active Template
							</p>
							<div className="mt-1 flex flex-wrap items-center justify-between gap-3">
								<p className="text-sm text-purple-100/80">
									{activeTemplate.title}
								</p>
								<motion.button
									type="button"
									onClick={() =>
										handleEditTemplateAsCopy(
											activeTemplate
										)
									}
									whileHover={
										reduceMotion
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion
											? undefined
											: { scale: 0.99 }
									}
									className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
								>
									Edit active as new
								</motion.button>
							</div>
						</div>
					)}
					<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-purple-100">
						<div className="flex items-center justify-between">
							<p className="text-xs uppercase tracking-[0.3em] text-purple-300">
								AI Lorewright
							</p>
							<div className="flex items-center gap-2">
								<motion.button
									type="button"
									onClick={() =>
										setAiMode((mode) =>
											mode === 'new' ? 'edit' : 'new'
										)
									}
									whileHover={
										reduceMotion
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion
											? undefined
											: { scale: 0.98 }
									}
									className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/15"
									aria-label={
										aiMode === 'new'
											? 'AI mode: New template'
											: 'AI mode: Edit current template'
									}
								>
									<AnimatePresence
										mode="popLayout"
										initial={false}
									>
										<motion.span
											key={aiMode}
											initial={
												reduceMotion
													? { opacity: 1 }
													: { opacity: 0, y: -2 }
											}
											animate={{ opacity: 1, y: 0 }}
											exit={
												reduceMotion
													? { opacity: 0 }
													: { opacity: 0, y: 2 }
											}
											transition={{ duration: 0.15 }}
											className="inline-block"
										>
											{aiMode === 'new' ? 'New' : 'Edit'}
										</motion.span>
									</AnimatePresence>
								</motion.button>
								<Sparkles className="h-4 w-4 text-purple-200" />
							</div>
						</div>
						<p className="mt-1 text-xs text-purple-200/80">
							Describe the vibe and let the AI draft a full
							template. Edit anything before saving.
						</p>
						<textarea
							value={aiPrompt}
							onChange={(event) =>
								setAiPrompt(event.currentTarget.value)
							}
							rows={3}
							placeholder="Neo-noir couriers chasing a ghost train..."
							className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
						/>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<motion.button
								type="button"
								disabled={
									!hasApiKey ||
									generator.isPending ||
									!aiPrompt.trim()
								}
								onClick={handleGenerateTemplate}
								whileHover={
									reduceMotion ||
									!hasApiKey ||
									generator.isPending ||
									!aiPrompt.trim()
										? undefined
										: { scale: 1.02 }
								}
								whileTap={
									reduceMotion ||
									!hasApiKey ||
									generator.isPending ||
									!aiPrompt.trim()
										? undefined
										: { scale: 0.99 }
								}
								className="inline-flex items-center gap-2 rounded-2xl bg-linear-to-r from-fuchsia-500 to-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{generator.isPending
									? 'Weaving template…'
									: 'Generate with AI'}
								<Sparkles className="h-3 w-3" />
							</motion.button>
							<p className="text-xs text-purple-200/70">
								{hasApiKey
									? 'Uses your OpenAI settings to fill every field.'
									: 'Add your OpenAI API key in Settings to enable AI drafting.'}
							</p>
						</div>
						{generator.isError && (
							<p className="mt-2 text-xs text-rose-200">
								{generator.error instanceof Error
									? generator.error.message
									: 'Template generation failed.'}
							</p>
						)}
					</div>

					       <form onSubmit={handleSubmit} className="space-y-4">
						       <div className="flex items-center gap-3">
								<ToggleSwitch
									checked={form.watch('rollMode')}
									onCheckedChange={(checked) => form.setValue('rollMode', checked)}
									label="Enable D20 Roll Mode"
									size="lg"
								/>
							       <span className="text-purple-100 text-xs">If enabled, each turn will include a random D20 roll for the AI to use in resolving actions.</span>
						       </div>
						<div className="grid gap-4 md:grid-cols-2">
							{[
								'title',
								'genre',
								'setting',
								'premise',
								'safety',
							].map((field) => (
								<label
									key={field}
									className="text-sm text-purple-100"
								>
									<span className="mb-1 block capitalize tracking-wide text-xs text-purple-200">
										{field}
									</span>
									{field === 'premise' ||
									field === 'safety' ? (
										<textarea
											{...form.register(
												field as keyof TemplateFormValues
											)}
											rows={3}
											className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
									) : (
										<input
											{...form.register(
												field as keyof TemplateFormValues
											)}
											className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
									)}
								</label>
							))}
						</div>

						<label className="block text-sm text-purple-100">
							<span className="mb-1 block text-xs uppercase tracking-[0.3em] text-purple-200">
								Playstyle Instructions
							</span>
							<textarea
								{...form.register('instructions')}
								rows={4}
								className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white focus:border-purple-400 focus:outline-none"
							/>
						</label>

						<div>
							<div className="flex items-center justify-between text-sm text-purple-100">
								<p className="uppercase tracking-[0.2em] text-xs text-purple-300">
									Tracked Values
								</p>
								<motion.button
									type="button"
									onClick={() =>
										append({
											id: `value-${fields.length + 1}`,
											label: 'New Value',
											type: 'string',
											defaultValue: '',
											min: undefined,
											max: undefined,
											maxLength: undefined,
										})
									}
									whileHover={
										reduceMotion
											? undefined
											: { scale: 1.02 }
									}
									whileTap={
										reduceMotion
											? undefined
											: { scale: 0.99 }
									}
									className="flex items-center gap-1 text-xs text-purple-200 hover:text-white"
								>
									<PlusCircle className="h-4 w-4" /> Add
									value
								</motion.button>
							</div>

							<div className="mt-3 space-y-3">
								{fields.map((field, index) => (
									<div
										key={field.id}
										className="rounded-2xl border border-white/10 bg-black/20 p-4"
									>
										<div className="flex flex-wrap items-center gap-3">
											<input
												{...form.register(
													`values.${index}.id`
												)}
												placeholder="value_id"
												className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
											/>
											<input
												{...form.register(
													`values.${index}.label`
												)}
												placeholder="Display label"
												className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
											/>
											<select
												{...form.register(
													`values.${index}.type`
												)}
												className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
											>
												{valueTypeSchema.options.map(
													(option) => (
														<option
															key={option}
															value={option}
															className="bg-slate-900"
														>
															{option}
														</option>
													)
												)}
											</select>
											<motion.button
												type="button"
												onClick={() => remove(index)}
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.02 }
												}
												whileTap={
													reduceMotion
														? undefined
														: { scale: 0.98 }
												}
												className="text-xs text-red-300"
											>
												Remove
											</motion.button>
										</div>
										<input
											{...form.register(
												`values.${index}.description`
											)}
											placeholder="Narrative guidance"
											className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
										{(() => {
											const currentType = form.watch(
												`values.${index}.type`
											)
											if (currentType !== 'boolean') {
												return (
													<input
														{...form.register(
															`values.${index}.defaultValue`
														)}
														placeholder="Default (numbers, JSON arrays/objects, etc.)"
														className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
													/>
												)
											}

											const raw = form.watch(
												`values.${index}.defaultValue`
											)
											const checked =
												(raw ?? '')
													.toString()
													.trim()
													.toLowerCase() === 'true'

											return (
												<div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
													<p className="text-xs text-purple-100/80">
														Default
														<span className="ml-2 text-purple-200/70">
															{checked
																? 'true'
																: 'false'}
														</span>
													</p>
													<ToggleSwitch
														label="Toggle boolean default"
														checked={checked}
														onCheckedChange={(
															next
														) => {
															form.setValue(
																`values.${index}.defaultValue`,
																next
																	? 'true'
																	: 'false',
																{
																	shouldDirty:
																		true,
																	shouldTouch:
																		true,
																	shouldValidate:
																		true,
																}
															)
														}}
													/>
												</div>
											)
										})()}
										{(() => {
											const currentType = form.watch(
												`values.${index}.type`
											)
											const showNumeric =
												currentType === 'integer' ||
												currentType === 'float' ||
												currentType === 'number'
											const showArray =
												currentType === 'array'

											return (
												<div className="mt-3 flex flex-wrap gap-3">
													{showNumeric && (
														<>
															<input
																{...form.register(
																	`values.${index}.min`,
																	{
																		valueAsNumber:
																			true,
																	}
																)}
																type="number"
																placeholder="Min (optional)"
																className="w-40 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
															/>
															<input
																{...form.register(
																	`values.${index}.max`,
																	{
																		valueAsNumber:
																			true,
																	}
																)}
																type="number"
																placeholder="Max (optional)"
																className="w-40 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
															/>
														</>
													)}
													{showArray && (
														<input
															{...form.register(
																`values.${index}.maxLength`,
																{
																	valueAsNumber:
																		true,
																}
															)}
															type="number"
															placeholder="Max items (optional)"
															className="w-44 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
														/>
													)}
												</div>
											)
										})()}
									</div>
								))}
							</div>
						</div>

						<motion.button
							type="submit"
							disabled={saver.isPending}
							whileHover={
								reduceMotion || saver.isPending
									? undefined
									: { scale: 1.01 }
							}
							whileTap={
								reduceMotion || saver.isPending
									? undefined
									: { scale: 0.99 }
							}
							className="flex w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-purple-500 to-indigo-500 px-4 py-3 font-semibold text-white shadow-lg shadow-purple-500/30"
						>
							<Sparkles className="h-4 w-4" /> Save Template
						</motion.button>
					</form>
				</Tabs.Content>
			</Tabs.Root>
		</motion.section>
	)
}
