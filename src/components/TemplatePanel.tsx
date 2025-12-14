import { useEffect, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { motion } from 'framer-motion'
import { Sparkles, PlusCircle, Trash2 } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useTemplatesQuery, useTemplateSaver, useTemplateRemover } from '../hooks/useTemplateQueries'
import { GameValueDefinition, valueTypeSchema } from '../types/game'
import { TemplateDraft } from '../data/templates'
import { useGameStore } from '../state/useGameStore'
import { useSettingsQuery } from '../hooks/useSettings'
import { generateTemplateFromPrompt, TemplateSuggestion } from '../utils/openai'

const valueDefinitionFormSchema = z.object({
	id: z.string().min(1, 'Provide a value id'),
	label: z.string().min(2, 'Label is required'),
	type: valueTypeSchema,
	description: z.string().optional(),
	defaultValue: z.string().optional(),
})

type ValueDefinitionForm = z.infer<typeof valueDefinitionFormSchema>

const templateFormSchema = z.object({
	title: z.string().min(3, 'Template title is required'),
	premise: z.string().optional(),
	genre: z.string().optional(),
	setting: z.string().optional(),
	safety: z.string().optional(),
	instructions: z.string().optional(),
	values: z.array(valueDefinitionFormSchema).min(1, 'Track at least one value'),
})

type TemplateFormValues = z.infer<typeof templateFormSchema>

const defaultValues: TemplateFormValues = {
	title: 'Neon Heist',
	premise: 'Lead a crew of synth-runners across a techno-noir metropolis.',
	genre: 'Sci-Fi Heist',
	setting: 'Night City – neon canyons, rogue AIs, and megacorps.',
	safety: 'No graphic gore. Keep stakes thrilling yet heroic.',
	instructions: 'Balance tension with player agency. Offer cinematic cliffhangers.',
	values: [
		{ id: 'health', label: 'Crew Vitality', type: 'integer', description: '0 = incapacitated, 10 = peak shape', defaultValue: '8' },
		{ id: 'credits', label: 'Crew Credits', type: 'number', description: 'Liquid funds for bribes and gear', defaultValue: '1200' },
		{ id: 'heat', label: 'Wanted Heat', type: 'integer', description: 'Represents police attention', defaultValue: '2' },
		{ id: 'inventory', label: 'Inventory', type: 'array', description: 'Key items currently held', defaultValue: '["Mono-blade", "EMP charge"]' },
	],
}

function parseDefaultValue(def: ValueDefinitionForm): GameValueDefinition['defaultValue'] {
	if (!def.defaultValue?.length) {
		return undefined
	}
	const raw = def.defaultValue.trim()
	try {
		switch (def.type) {
			case 'integer':
				return Number.parseInt(raw, 10)
			case 'float':
			case 'number':
				return Number.parseFloat(raw)
			case 'boolean':
				return raw === 'true'
			case 'array':
				return JSON.parse(raw)
			case 'object':
				return JSON.parse(raw)
			default:
				return raw
		}
	} catch (error) {
		console.warn('Unable to parse default for value definition', def, error)
		return raw
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

function suggestionToFormValues(suggestion: TemplateSuggestion): TemplateFormValues {
	return {
		title: suggestion.title,
		premise: suggestion.premise ?? '',
		genre: suggestion.genre ?? '',
		setting: suggestion.setting ?? '',
		safety: suggestion.safety ?? '',
		instructions: suggestion.instructionBlocks?.join('\n\n') ?? '',
		values: suggestion.values.map((value) => ({
			id: value.id,
			label: value.label,
			type: value.type,
			description: value.description ?? '',
			defaultValue: stringifyDefaultValue(value.defaultValue),
		})),
	}
}

export function TemplatePanel() {
	const templatesQuery = useTemplatesQuery()
	const saver = useTemplateSaver()
	const remover = useTemplateRemover()
	const activeTemplateSlug = useGameStore((state) => state.activeTemplateSlug)
	const setActiveTemplate = useGameStore((state) => state.setActiveTemplate)
	const { data: settings } = useSettingsQuery()
	const [aiPrompt, setAiPrompt] = useState('Create a mythic desert odyssey about solar-powered caravans')

	const form = useForm<TemplateFormValues>({ resolver: zodResolver(templateFormSchema), defaultValues })
	const { fields, append, remove } = useFieldArray({ control: form.control, name: 'values' })

	const hasApiKey = Boolean(settings?.openaiApiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY)

	const generator = useMutation({
		mutationFn: (promptText: string) =>
			generateTemplateFromPrompt({ prompt: promptText, apiKey: settings?.openaiApiKey, model: settings?.openaiModel }),
	})

	useEffect(() => {
		if (!templatesQuery.data?.length) {
			return
		}
		if (!activeTemplateSlug) {
			setActiveTemplate(templatesQuery.data[0].slug)
		}
	}, [templatesQuery.data, activeTemplateSlug, setActiveTemplate])

	const handleGenerateTemplate = async () => {
		const prompt = aiPrompt.trim()
		if (!prompt) {
			return
		}
		try {
			const suggestion = await generator.mutateAsync(prompt)
			form.reset(suggestionToFormValues(suggestion))
			setAiPrompt('')
		} catch (error) {
			//handled via mutation state
		}
	}

	const handleSubmit = form.handleSubmit(async (values) => {
		const draft: TemplateDraft = {
			title: values.title,
			premise: values.premise,
			genre: values.genre,
			setting: values.setting,
			safety: values.safety,
			instructionBlocks: values.instructions?.split('\n\n').map((block) => block.trim()).filter(Boolean),
			valueDefinitions: values.values.map((value) => ({
				id: value.id,
				label: value.label,
				type: value.type,
				description: value.description,
				visibility: 'public',
				defaultValue: parseDefaultValue(value),
			})),
		}

		const created = await saver.mutateAsync({ draft })
		setActiveTemplate(created.slug)
		form.reset(defaultValues)
	})

	const templates = templatesQuery.data ?? []

	return (
		<section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-purple-500/10 backdrop-blur">
			<header className="flex items-center justify-between">
				<div>
					<p className="text-sm uppercase tracking-[0.2em] text-purple-300">Stories</p>
					<h2 className="text-2xl font-semibold text-white">Template Library</h2>
				</div>
				<Sparkles className="h-6 w-6 text-purple-200" />
			</header>

			<Tabs.Root defaultValue="manage" className="mt-6">
				<Tabs.List className="grid grid-cols-2 rounded-full bg-white/10 p-1 text-sm text-white">
					<Tabs.Trigger value="manage" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-gray-900">
						Active Templates
					</Tabs.Trigger>
					<Tabs.Trigger value="create" className="rounded-full px-4 py-2 data-[state=active]:bg-white data-[state=active]:text-gray-900">
						Create Template
					</Tabs.Trigger>
				</Tabs.List>

				<Tabs.Content value="manage" className="mt-6 space-y-4">
					{templatesQuery.isLoading && <p className="text-sm text-purple-100/70">Loading templates…</p>}
					{!templates.length && !templatesQuery.isLoading && (
						<p className="text-sm text-purple-100/70">No templates yet. Create one to begin.</p>
					)}
					<div className="grid gap-4 md:grid-cols-2">
						{templates.map((template) => (
							<motion.div
								key={template.slug}
								onClick={() => setActiveTemplate(template.slug)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
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
									<h3 className="text-lg font-semibold">{template.title}</h3>
									<button
										onClick={(event) => {
											event.stopPropagation()
											remover.mutate(template.slug)
											if (activeTemplateSlug === template.slug) {
												setActiveTemplate(null)
											}
										}}
										className="text-xs text-red-200 hover:text-red-100"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								</div>
								<p className="mt-1 text-sm text-purple-100/70">{template.premise ?? 'Player-driven narrative'}</p>
								<div className="mt-3 flex flex-wrap gap-2 text-xs text-purple-100/70">
									<span className="rounded-full bg-purple-500/20 px-2 py-1">{template.genre ?? 'Any Genre'}</span>
									<span className="rounded-full bg-purple-500/20 px-2 py-1">{template.valueDefinitions.length} values</span>
								</div>
							</motion.div>
						))}
					</div>
				</Tabs.Content>

				<Tabs.Content value="create" className="mt-6">
					<div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-purple-100">
						<div className="flex items-center justify-between">
							<p className="text-xs uppercase tracking-[0.3em] text-purple-300">AI Lorewright</p>
							<Sparkles className="h-4 w-4 text-purple-200" />
						</div>
						<p className="mt-1 text-xs text-purple-200/80">Describe the vibe and let the AI draft a full template. Edit anything before saving.</p>
						<textarea
							value={aiPrompt}
							onChange={(event) => setAiPrompt(event.currentTarget.value)}
							rows={3}
							placeholder="Neo-noir couriers chasing a ghost train..."
							className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
						/>
						<div className="mt-3 flex flex-wrap items-center gap-3">
							<button
								type="button"
								disabled={!hasApiKey || generator.isPending || !aiPrompt.trim()}
								onClick={handleGenerateTemplate}
								className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{generator.isPending ? 'Weaving template…' : 'Generate with AI'}
								<Sparkles className="h-3 w-3" />
							</button>
							<p className="text-xs text-purple-200/70">
								{hasApiKey ? 'Uses your OpenAI settings to fill every field.' : 'Add your OpenAI API key in Settings to enable AI drafting.'}
							</p>
						</div>
						{generator.isError && (
							<p className="mt-2 text-xs text-rose-200">
								{generator.error instanceof Error ? generator.error.message : 'Template generation failed.'}
							</p>
						)}
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							{['title', 'genre', 'setting', 'premise', 'safety'].map((field) => (
								<label key={field} className="text-sm text-purple-100">
									<span className="mb-1 block capitalize tracking-wide text-xs text-purple-200">{field}</span>
									{field === 'premise' || field === 'safety' ? (
										<textarea
											{...form.register(field as keyof TemplateFormValues)}
											rows={3}
											className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
									) : (
										<input
											{...form.register(field as keyof TemplateFormValues)}
											className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
									)}
								</label>
							))}
						</div>

						<label className="block text-sm text-purple-100">
							<span className="mb-1 block text-xs uppercase tracking-[0.3em] text-purple-200">Playstyle Instructions</span>
							<textarea
								{...form.register('instructions')}
								rows={4}
								className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white focus:border-purple-400 focus:outline-none"
							/>
						</label>

						<div>
							<div className="flex items-center justify-between text-sm text-purple-100">
								<p className="uppercase tracking-[0.2em] text-xs text-purple-300">Tracked Values</p>
								<button
									type="button"
									onClick={() =>
										append({ id: `value-${fields.length + 1}`, label: 'New Value', type: 'string', defaultValue: '' })
									}
									className="flex items-center gap-1 text-xs text-purple-200 hover:text-white"
								>
									<PlusCircle className="h-4 w-4" /> Add value
								</button>
							</div>

							<div className="mt-3 space-y-3">
								{fields.map((field, index) => (
									<div key={field.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
										<div className="flex flex-wrap items-center gap-3">
											<input
												{...form.register(`values.${index}.id`)}
												placeholder="value_id"
												className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
											/>
											<input
												{...form.register(`values.${index}.label`)}
												placeholder="Display label"
												className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
											/>
											<select
												{...form.register(`values.${index}.type`)}
												className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
											>
												{valueTypeSchema.options.map((option) => (
													<option key={option} value={option} className="bg-slate-900">
														{option}
													</option>
												))}
											</select>
											<button type="button" onClick={() => remove(index)} className="text-xs text-red-300">
												Remove
											</button>
										</div>
										<input
											{...form.register(`values.${index}.description`)}
											placeholder="Narrative guidance"
											className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
										<input
											{...form.register(`values.${index}.defaultValue`)}
											placeholder="Default (numbers, JSON arrays/objects, etc.)"
											className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none"
										/>
									</div>
								))}
							</div>
						</div>

						<button
							type="submit"
							disabled={saver.isPending}
							className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-3 font-semibold text-white shadow-lg shadow-purple-500/30"
						>
							<Sparkles className="h-4 w-4" /> Save Template
						</button>
					</form>
				</Tabs.Content>
			</Tabs.Root>
		</section>
	)
}
