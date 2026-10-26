export const isTauriDesktop = '__TAURI_INTERNALS__' in window
const isDevServer = import.meta.env.DEV
const configuredOrigin = String(import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '')
export const serviceOrigin = configuredOrigin || (isTauriDesktop || isDevServer ? 'http://127.0.0.1:8765' : window.location.origin)
const API = `${serviceOrigin}/api`

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error('Lodestar 本地服务暂时不可达。请等待数秒后重试；若仍失败，请退出 Lodestar 后重新打开。')
  }
  if (!response.ok) {
    const body = await response.text()
    let message = body

    if (body) {
      try {
        const parsed = JSON.parse(body) as {
          detail?: string
          message?: string
          error?: string | { message?: string }
        }
        message = parsed.detail
          || parsed.message
          || (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message)
          || body
      } catch {
        // Non-JSON error bodies are already suitable for display.
      }
    }

    throw new Error(message || `请求失败 (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const wsUrl = `${serviceOrigin.replace(/^http/, 'ws')}/ws`
