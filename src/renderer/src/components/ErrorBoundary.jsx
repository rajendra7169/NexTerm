import { Component } from 'react'

// Catches render-phase errors so a single bad component (Editor, GitPanel, etc.)
// can't take down the entire window. Each window has its own React tree, so
// a crash here is also isolated PER window.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack)
  }
  reset = () => this.setState({ error: null })
  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="eb-icon">⚠</div>
          <div className="eb-title">Something went wrong</div>
          <div className="eb-detail">{String(this.state.error?.message || this.state.error)}</div>
          <div className="eb-actions">
            <button onClick={this.reset}>Try again</button>
            <button onClick={() => window.location.reload()}>Reload window</button>
          </div>
          <details className="eb-stack">
            <summary>Stack</summary>
            <pre>{String(this.state.error?.stack || '')}</pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}
