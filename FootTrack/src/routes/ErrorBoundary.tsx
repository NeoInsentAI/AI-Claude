import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Last-resort catch for render-time errors, including a lazy route chunk failing to load
 * (the realistic case: a tab left open across a deploy tries to fetch RecordPage's chunk
 * after the old content-hashed file is gone from the server). Without this, either case
 * is a permanently blank screen with console-only diagnostics.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <h1>Something went wrong</h1>
          <p>Reload to continue — if this keeps happening, the app may have updated while this tab was open.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
