import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const fieldClasses =
  'field-control w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-600 dark:disabled:bg-gray-800'

function FieldShell({
  label,
  error,
  htmlFor,
  icon,
  children,
}: {
  label?: ReactNode
  error?: string
  htmlFor?: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-gray-400">
            {icon}
          </span>
        ) : null}
        {children}
      </div>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode
  error?: string
  icon?: ReactNode
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, icon, className = '', id, ...props }, ref) => (
    <FieldShell label={label} error={error} htmlFor={id} icon={icon}>
      <input
        ref={ref}
        id={id}
        className={`${fieldClasses} ${icon ? 'ps-9' : ''} ${className}`}
        {...props}
      />
    </FieldShell>
  ),
)
TextInput.displayName = 'TextInput'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className = '', id, children, ...props }, ref) => (
    <FieldShell label={label} error={error} htmlFor={id}>
      <select ref={ref} id={id} className={`${fieldClasses} ${className}`} {...props}>
        {children}
      </select>
    </FieldShell>
  ),
)
Select.displayName = 'Select'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...props }, ref) => (
    <FieldShell label={label} error={error} htmlFor={id}>
      <textarea ref={ref} id={id} className={`${fieldClasses} ${className}`} {...props} />
    </FieldShell>
  ),
)
Textarea.displayName = 'Textarea'

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ label, className = '', id, ...props }, ref) => (
  <label htmlFor={id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className={`size-4 rounded border-gray-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30 dark:border-gray-600 dark:bg-gray-800 ${className}`}
      {...props}
    />
    {label}
  </label>
))
Checkbox.displayName = 'Checkbox'
