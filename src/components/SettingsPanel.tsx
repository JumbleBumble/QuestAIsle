import { useEffect } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, useReducedMotion } from 'framer-motion'
import { useSettingsQuery, useSettingsSaver } from '../hooks/useSettings'
import { DropdownSelect } from './ui/DropdownSelect'

const formSchema = z.object({
	openaiApiKey: z.string().optional(),
	openaiModel: z.string().min(3, 'Model is required'),
	memoryTurnCount: z.number().int().min(1).max(10),
})

type SettingsFormValues = z.infer<typeof formSchema>

export function SettingsPanel() {
	const reduceMotion = useReducedMotion()
	const { data: settings } = useSettingsQuery()
	const saver = useSettingsSaver()
	const form = useForm<SettingsFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			openaiApiKey: '',
			openaiModel: 'gpt-4.1-mini',
			memoryTurnCount: 4,
		},
	})

	useEffect(() => {
		if (settings) {
			form.reset({
				openaiApiKey: settings.openaiApiKey ?? '',
				openaiModel: settings.openaiModel ?? 'gpt-4.1-mini',
				memoryTurnCount: settings.memoryTurnCount ?? 4,
			})
		}
	}, [settings, form])

	const handleSubmit = form.handleSubmit(async (values) => {
		await saver.mutateAsync(values)
	})

	const currentModel = form.watch('openaiModel') ?? 'gpt-4.1-mini'

	return (
		<motion.section
			initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 12 }}
			animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
			transition={{ duration: 0.22, ease: 'easeOut' }}
			className="rounded-3xl border border-white/10 bg-linear-to-br from-slate-900 to-slate-950 p-5 text-white"
		>
			<header className="flex items-center justify-between">
				<div>
					<p className="text-xs uppercase tracking-[0.4em] text-white/70">
						API Access
					</p>
					<h2 className="text-xl font-semibold">OpenAI Settings</h2>
				</div>
				<Lock className="h-5 w-5 text-white/70" />
			</header>

			<form onSubmit={handleSubmit} className="mt-4 space-y-4">
				<label className="block text-sm">
					<span className="text-xs uppercase tracking-[0.3em] text-white/60">
						API Key
					</span>
					<input
						type="password"
						placeholder="sk-..."
						{...form.register('openaiApiKey')}
						className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm focus:border-purple-400 focus:outline-none"
					/>
				</label>

				<label className="block text-sm">
					<span className="text-xs uppercase tracking-[0.3em] text-white/60">
						Model
					</span>
					<DropdownSelect
						value={currentModel}
						onValueChange={(value: string) =>
							form.setValue('openaiModel', value, {
								shouldDirty: true,
								shouldValidate: true,
							})
						}
					/>
				</label>

				<label className="block text-sm">
					<span className="text-xs uppercase tracking-[0.3em] text-white/60">
						Memory Window
					</span>
					<input
						type="number"
						min={1}
						max={10}
						step={1}
						{...form.register('memoryTurnCount', {
							valueAsNumber: true,
						})}
						className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm focus:border-purple-400 focus:outline-none"
					/>
					<p className="mt-1 text-xs text-white/60">
						Number of previous turns provided to the AI (1-10).
						Higher numbers help long memory but increase prompt
						size.
					</p>
				</label>

				<p className="text-xs text-white/60">
					Stored locally via Tauri secure storage. Required to
					advance adventures.
				</p>

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
					className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
				>
					{saver.isPending ? 'Saving…' : 'Save Settings'}
					<RefreshCw className="h-4 w-4" />
				</motion.button>
			</form>
		</motion.section>
	)
}
