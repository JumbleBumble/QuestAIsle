import { GameSave, GameTemplate, GameValueDefinition } from '../types/game'

export function buildEffectiveTemplate(
	template: GameTemplate,
	save?: GameSave | null
): GameTemplate {
	const sessionDefs = save?.sessionValueDefinitions ?? []
	if (!sessionDefs.length) {
		return template
	}

	const baseIds = new Set(template.valueDefinitions.map((def) => def.id))
	const merged: GameValueDefinition[] = [...template.valueDefinitions]
	for (const def of sessionDefs) {
		if (baseIds.has(def.id)) {
			continue
		}
		merged.push(def)
		baseIds.add(def.id)
	}

	return { ...template, valueDefinitions: merged }
}
