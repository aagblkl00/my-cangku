import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

type DialogRequest = {
  kind: 'alert' | 'confirm' | 'prompt'
  title: string
  message: string
  defaultValue?: string
  confirmLabel?: string
  danger?: boolean
  resolve: (value: boolean | string | null) => void
}

type DialogApi = {
  alert: (message: string, title?: string) => Promise<void>
  confirm: (message: string, options?: { title?: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>
  prompt: (message: string, defaultValue?: string, options?: { title?: string; confirmLabel?: string }) => Promise<string | null>
}

const DialogContext = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogRequest | null>(null)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const open = useCallback((request: Omit<DialogRequest, 'resolve'>) => new Promise<boolean | string | null>((resolve) => {
    setValue(request.defaultValue || '')
    setDialog({ ...request, resolve })
    window.setTimeout(() => inputRef.current?.select(), 40)
  }), [])

  const api = useMemo<DialogApi>(() => ({
    alert: async (message, title = '操作提示') => { await open({ kind: 'alert', title, message }) },
    confirm: async (message, options = {}) => Boolean(await open({ kind: 'confirm', title: options.title || '确认操作', message, confirmLabel: options.confirmLabel || '确认', danger: options.danger })),
    prompt: async (message, defaultValue = '', options = {}) => {
      const result = await open({ kind: 'prompt', title: options.title || '填写信息', message, defaultValue, confirmLabel: options.confirmLabel || '继续' })
      return typeof result === 'string' ? result : null
    },
  }), [open])

  const close = (result: boolean | string | null) => {
    dialog?.resolve(result)
    setDialog(null)
  }

  return <DialogContext.Provider value={api}>
    {children}
    {dialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(dialog.kind === 'alert' ? true : null) }}>
      <section className="commercial-modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header>
          <span className={`modal-icon ${dialog.danger ? 'danger' : ''}`}>{dialog.danger ? <AlertTriangle size={17}/> : dialog.kind === 'alert' ? <Info size={17}/> : <CheckCircle2 size={17}/>}</span>
          <div><small>LODESTAR</small><h2 id="dialog-title">{dialog.title}</h2></div>
          <button className="icon-button" onClick={() => close(dialog.kind === 'alert' ? true : null)} title="关闭" aria-label="关闭弹层"><X size={16}/></button>
        </header>
        <p>{dialog.message}</p>
        {dialog.kind === 'prompt' && <input ref={inputRef} autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) close(value.trim()) }} />}
        <footer>
          {dialog.kind !== 'alert' && <button className="outline-btn" onClick={() => close(null)}>取消</button>}
          <button className={`toolbar-btn ${dialog.danger ? 'danger-fill' : 'primary'}`} disabled={dialog.kind === 'prompt' && !value.trim()} onClick={() => close(dialog.kind === 'prompt' ? value.trim() : true)}>{dialog.kind === 'alert' ? '知道了' : dialog.confirmLabel}</button>
        </footer>
      </section>
    </div>}
  </DialogContext.Provider>
}

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialog must be used inside DialogProvider')
  return context
}
