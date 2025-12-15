import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { TemplatePanel } from './components/TemplatePanel'
import { SavePanel } from './components/SavePanel'
import { SessionPanel } from './components/SessionPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useTemplatesQuery } from './hooks/useTemplateQueries'
import { useSavesQuery } from './hooks/useSaveQueries'
import { useGameStore } from './state/useGameStore'
import { useSettingsQuery } from './hooks/useSettings'

function App() {
	const reduceMotion = useReducedMotion()
	const templatesQuery = useTemplatesQuery()
	const settingsQuery = useSettingsQuery()
	const activeTemplateSlug = useGameStore(
		(state) => state.activeTemplateSlug
	)
	const activeSaveId = useGameStore((state) => state.activeSaveId)

	const activeTemplate = useMemo(() => {
		const templates = templatesQuery.data ?? []
		if (!templates.length) {
			return undefined
		}
		return (
			templates.find(
				(template) => template.slug === activeTemplateSlug
			) ?? templates[0]
		)
	}, [templatesQuery.data, activeTemplateSlug])

	const savesQuery = useSavesQuery(activeTemplate ? activeTemplate.id : null)
	const activeSave = useMemo(() => {
		const saves = savesQuery.data ?? []
		if (!saves.length) {
			return undefined
		}
		return saves.find((save) => save.id === activeSaveId) ?? saves[0]
	}, [savesQuery.data, activeSaveId])

	return (
		<div className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
				<motion.div
					initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{
						duration: 0.2,
						ease: 'easeOut',
						delay: 0.05,
					}}
					className="grid gap-6 lg:grid-cols-[360px_1fr]"
				>
					<motion.div
						initial={
							reduceMotion
								? { opacity: 1 }
								: { opacity: 0, x: -10 }
						}
						animate={
							reduceMotion
								? { opacity: 1 }
								: { opacity: 1, x: 0 }
						}
						transition={{
							duration: 0.25,
							ease: 'easeOut',
							delay: 0.08,
						}}
						className="space-y-6"
					>
						<SettingsPanel />
						<TemplatePanel />
						<SavePanel
							template={activeTemplate}
							templates={templatesQuery.data}
						/>
					</motion.div>

					<motion.div
						initial={
							reduceMotion
								? { opacity: 1 }
								: { opacity: 0, x: 10 }
						}
						animate={
							reduceMotion
								? { opacity: 1 }
								: { opacity: 1, x: 0 }
						}
						transition={{
							duration: 0.25,
							ease: 'easeOut',
							delay: 0.1,
						}}
					>
						<SessionPanel
							template={activeTemplate}
							save={activeSave}
							settings={settingsQuery.data}
						/>
					</motion.div>
				</motion.div>
			</div>
		</div>
	)
}

export default App
