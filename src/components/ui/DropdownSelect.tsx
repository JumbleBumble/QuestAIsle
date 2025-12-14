import { ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as Select from '@radix-ui/react-select'
import { availableChatModels } from '../../utils/models'

type DropdownSelectProps = {
	value: string
	onValueChange: (value: string) => void
	options?: string[]
	placeholder?: string
	disabled?: boolean
}

export function DropdownSelect({
	value,
	onValueChange,
	options,
	placeholder = 'Pick a model',
	disabled,
}: DropdownSelectProps) {
	const dropdownOptions = options ?? availableChatModels

	return (
		<Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
			<Select.Trigger className="mt-1 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm focus:border-purple-400 focus:outline-none disabled:opacity-50">
				<Select.Value placeholder={placeholder} />
				<Select.Icon>
					<ChevronDown className="h-4 w-4" />
				</Select.Icon>
			</Select.Trigger>

			<AnimatePresence>
				<Select.Portal>
					<Select.Content asChild position="popper" sideOffset={8}>
						<motion.div
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							transition={{ duration: 0.12 }}
							className="z-50 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl shadow-black/50"
						>
							<Select.ScrollUpButton className="flex items-center justify-center rounded-xl py-1 text-white/70 data-[disabled]:opacity-30">
								<ChevronUp className="h-4 w-4" />
							</Select.ScrollUpButton>

							<Select.Viewport className="max-h-72 overflow-y-auto p-1">
								{dropdownOptions.map((option) => (
									<Select.Item
										key={option}
										value={option}
										className="group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-white outline-none data-[highlighted]:bg-white/10"
									>
										<Select.ItemText>{option}</Select.ItemText>
										<Select.ItemIndicator>•</Select.ItemIndicator>
									</Select.Item>
								))}
							</Select.Viewport>

							<Select.ScrollDownButton className="flex items-center justify-center rounded-xl py-1 text-white/70 data-[disabled]:opacity-30">
								<ChevronDown className="h-4 w-4" />
							</Select.ScrollDownButton>
						</motion.div>
					</Select.Content>
				</Select.Portal>
			</AnimatePresence>
		</Select.Root>
	)
}
