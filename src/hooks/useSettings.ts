import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { loadSettings, saveSettings, AppSettings } from '../data/settings'

export const settingsKey = ['app-settings'] as const

export function useSettingsQuery() {
	return useQuery({ queryKey: settingsKey, queryFn: loadSettings })
}

export function useSettingsSaver() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: (partial: Partial<AppSettings>) => saveSettings(partial),
		onSuccess: () => {
			client.invalidateQueries({ queryKey: settingsKey })
		},
	})
}
