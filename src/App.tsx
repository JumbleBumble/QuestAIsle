import { useMemo } from 'react'
import { TemplatePanel } from './components/TemplatePanel'
import { SavePanel } from './components/SavePanel'
import { SessionPanel } from './components/SessionPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useTemplatesQuery } from './hooks/useTemplateQueries'
import { useSavesQuery } from './hooks/useSaveQueries'
import { useGameStore } from './state/useGameStore'
import { useSettingsQuery } from './hooks/useSettings'

function App() {
  const templatesQuery = useTemplatesQuery()
  const settingsQuery = useSettingsQuery()
  const activeTemplateSlug = useGameStore((state) => state.activeTemplateSlug)
  const activeSaveId = useGameStore((state) => state.activeSaveId)

  const activeTemplate = useMemo(() => {
    const templates = templatesQuery.data ?? []
    if (!templates.length) {
      return undefined
    }
    return templates.find((template) => template.slug === activeTemplateSlug) ?? templates[0]
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
        <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-indigo-600/40 to-purple-600/40 p-8 shadow-2xl shadow-purple-400/30">
          <p className="text-xs uppercase tracking-[0.4em] text-white/80">QuestAIsle Forge</p>
          <h1 className="mt-4 text-4xl font-bold">Craft cinematic RPGs fueled by OpenAI</h1>
          <p className="mt-3 text-base text-white/80">
            Design reusable templates, resume any run in seconds, and give the AI a structured sheet of game values
            to keep continuity flawless.
          </p>

          <div className="mt-6 grid gap-4 text-sm text-white/70 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-white">Structured prompts</div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-white">Save slots auto-sync</div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-white">Tailwind-native UI</div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <SettingsPanel />
            <TemplatePanel />
            <SavePanel template={activeTemplate} templates={templatesQuery.data} />
          </div>
          <SessionPanel template={activeTemplate} save={activeSave} settings={settingsQuery.data} />
        </div>
      </div>
    </div>
  )
}

export default App
