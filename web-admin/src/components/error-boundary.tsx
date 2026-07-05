import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Root error boundary (blueprint §10: "root Error Boundary"). Catches
// render-time exceptions React's own error handling would otherwise crash
// the whole app on — API/query errors are handled separately per-page via
// TanStack Query's own error state, not this boundary.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error:', error, info.componentStack)
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Something went wrong
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Please reload the page. If the problem persists, contact support.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
