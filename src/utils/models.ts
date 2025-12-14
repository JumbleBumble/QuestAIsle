import type { ChatModel } from 'openai/resources/shared'

const preferredModels: ChatModel[] = [
	'gpt-5.1-chat-latest',
	'gpt-5.1',
	'gpt-5',
	'gpt-5-mini',
	'gpt-5-nano',
	'gpt-4.1-mini',
	'gpt-4.1',
	'gpt-4o-mini',
	'gpt-4o',
	'gpt-4-turbo',
	'gpt-4',
	'gpt-3.5-turbo',
]

const legacyModels = ['gpt-4-turbo-2024-04-09', 'gpt-4-0125-preview', 'gpt-4-vision-preview', 'gpt-4-0613', 'gpt-4-32k']

export const availableChatModels: string[] = Array.from(new Set([...preferredModels, ...legacyModels]))

export function isKnownModel(model?: string | null) {
	if (!model) {
		return false
	}
	return availableChatModels.includes(model)
}
