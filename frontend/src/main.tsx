import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import App from './App'
import './styles.css'
import './klein-refinement.css'
import './refined-desktop.css'
import { DialogProvider } from './ui/overlays'

const splashMode = new URLSearchParams(window.location.search).get('splash') === '1'
if (splashMode) document.documentElement.classList.add('splash-mode')

function SplashScreen() {
  return <main className="splash-screen" aria-label="Lodestar 正在启动">
    <img className="splash-wallpaper" src="/brand/lodestar-wallpaper.png" alt=""/>
    <div className="splash-brand"><img src="/brand/lodestar-icon.png" alt=""/><div><strong>Lodestar</strong><span>AI TESTING STUDIO</span></div></div>
    <div className="splash-footer"><div><strong>INITIALIZING WORKSPACE</strong><span>LOCAL INTELLIGENCE · TEST OPERATIONS</span></div><div className="splash-progress" aria-hidden="true"><i/></div></div>
  </main>
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Lodestar UI crashed', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-error">
      <AlertTriangle size={28}/>
      <small>LODESTAR RECOVERY</small>
      <h1>工作台遇到界面异常</h1>
      <p>自动化数据仍保存在本地服务中。刷新界面即可重新载入，不会删除项目、流程或执行证据。</p>
      <code>{this.state.error.message}</code>
      <button className="toolbar-btn primary" onClick={() => window.location.reload()}><RefreshCw size={14}/>重新载入工作台</button>
    </main>
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(splashMode
  ? <React.StrictMode><SplashScreen/></React.StrictMode>
  : <React.StrictMode><AppErrorBoundary><DialogProvider><App /></DialogProvider></AppErrorBoundary></React.StrictMode>,
)
