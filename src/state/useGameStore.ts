import { create } from 'zustand'

export type GameStoreState = {
	activeTemplateSlug: string | null
	activeSaveId: string | null
	playerAction: string
	isAdvancing: boolean
}

export type GameStoreActions = {
	setActiveTemplate: (slug: string | null) => void
	setActiveSave: (id: string | null) => void
	setPlayerAction: (value: string) => void
	setAdvancing: (value: boolean) => void
}

const initialState: GameStoreState = {
	activeTemplateSlug: null,
	activeSaveId: null,
	playerAction: '',
	isAdvancing: false,
}

export const useGameStore = create<GameStoreState & GameStoreActions>((set) => ({
	...initialState,
	setActiveTemplate: (slug) => set({ activeTemplateSlug: slug }),
	setActiveSave: (id) => set({ activeSaveId: id }),
	setPlayerAction: (value) => set({ playerAction: value }),
	setAdvancing: (value) => set({ isAdvancing: value }),
}))
