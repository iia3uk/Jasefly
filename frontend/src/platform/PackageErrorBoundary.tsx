import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  slug?: string
  label?: string
  /** Optional so createElement(Boundary, props, child) typechecks under React 18. */
  children?: ReactNode
}

type State = { error: Error | null }

export class PackageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[PackageErrorBoundary]', this.props.slug ?? 'module', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6">
          <h2 className="text-lg font-semibold text-red-200">
            Ошибка модуля{this.props.label ? `: ${this.props.label}` : ''}
          </h2>
          <p className="mt-2 text-sm text-red-300/90">{this.state.error.message}</p>
          {this.props.slug && (
            <p className="mt-1 text-xs text-zinc-500">Модуль: {this.props.slug}</p>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
