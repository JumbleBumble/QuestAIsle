import { motion, useReducedMotion } from 'framer-motion'

export type ToggleSwitchProps = {
	checked: boolean
	onCheckedChange: (checked: boolean) => void
	disabled?: boolean
	label?: string
	className?: string
}

export function ToggleSwitch(props: ToggleSwitchProps) {
	const reduceMotion = useReducedMotion()
	const { checked, onCheckedChange, disabled, label, className } = props

	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			disabled={disabled}
			onClick={() => {
				if (disabled) return
				onCheckedChange(!checked)
			}}
			className={
				`relative inline-flex h-6 w-11 items-center rounded-full border border-white/10 bg-white/10 px-0.5 transition focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:cursor-not-allowed disabled:opacity-50 ` +
				(className ?? '')
			}
		>
			<motion.span
				aria-hidden
				initial={false}
				animate={
					reduceMotion
						? { opacity: 1 }
						: { opacity: checked ? 1 : 0 }
				}
				transition={{ duration: 0.18, ease: 'easeOut' }}
				className="absolute inset-0 rounded-full bg-linear-to-r from-purple-500 to-indigo-500"
				style={{ pointerEvents: 'none' }}
			/>
			<motion.span
				layout
				transition={
					reduceMotion
						? { duration: 0 }
						: { type: 'spring', stiffness: 420, damping: 30 }
				}
				className={
					`relative z-10 h-4 w-4 rounded-full border border-white/20 bg-white shadow-sm ` +
					(checked ? 'translate-x-5.5' : 'translate-x-0')
				}
			/>
		</button>
	)
}
