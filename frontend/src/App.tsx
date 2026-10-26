import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Activity, AlertTriangle, AppWindow, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AtSign, Bot, Box, Braces, BrainCircuit, Bug, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, CircleStop, ClipboardList, Clock3, Cloud, Columns3, Command, Copy, Cpu, Database, Download, Eye, EyeOff, FilePlus2, FileSearch, FolderOpen, Gauge, GitBranch, History, ImagePlus, KeyRound, Layers3, Link2, MessageSquare, MoreHorizontal, PackagePlus, Palette, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pause, Pencil, Play, Plus, Radio, RefreshCw, Save, Search, SearchCheck, Send, Settings, ShieldAlert, ShieldCheck, SkipForward, Sparkles, Square, Target, TestTube2, Trash2, Type, WandSparkles, Wifi, WifiOff, Workflow, X, Zap } from 'lucide-react'
import { api, isTauriDesktop, serviceOrigin, wsUrl } from './api/client'
import { useDialog } from './ui/overlays'

type Project = { id: string; name: string; description: string }
type Environment = { id: string; name: string; base_url: string; variables: Record<string, string>; browser: string; read_only: boolean; allowed_hosts?: string[]; environment_kind?: 'local' | 'test' | 'staging' | 'production'; payment_mode?: 'disabled' | 'mock' | 'sandbox' }
type ElementAsset = { element_id: string; name: string; page_url?: string; page_title: string; locator_type: string; locator_value: string; fallback_locators?: { type: string; value: string }[]; health_status: string; last_verified_at?: string; usage_count: number }
type Step = { id: string; name: string; action: string; action_label?: string; element_id?: string; value?: string; expected?: string; timeout?: number; retries?: number; screenshot?: boolean; disabled?: boolean; risk?: 'read' | 'write' | 'destructive'; continue_on_failure?: boolean }
type Flow = { flow_id: string; name: string; description: string; project_id: string; environment_id?: string; engine: string; version?: number; steps: Step[]; variables: Record<string, string>; breakpoints?: number[] }
type Run = { run_id: string; flow_id: string; environment_id?: string; browser: string; status: string; started_at: string; ended_at: string; report_path: string; trace_path: string; error_message?: string; dataset_name?: string }
type TestCase = { case_id: string; project_id: string; title: string; module: string; priority: string; case_type: string; preconditions: string; steps?: string; test_data: string; expected: string; tags: string[]; status: string; automation_flow_id?: string; updated_at: string }
type RegressionPlan = { regression_plan_id: string; project_id: string; name: string; description: string; environment_id?: string; browser: string; stop_on_failure: boolean; updated_at?: string; cases: { case_id: string; title: string; priority: string; automation_flow_id?: string; enabled: number }[] }
type RegressionRun = { regression_run_id: string; regression_plan_id: string; status: string; started_at: string; ended_at: string; total_cases: number; passed_cases: number; failed_cases: number; skipped_cases: number; blocked_cases: number; report_path: string }
type RegressionCaseResult = { id: string; case_id: string; title: string; module: string; priority: string; status: string; error_message: string; run_id?: string; automation_flow_id?: string }
type CaseHistory = { execution_count: number; pass_count: number; fail_count: number; latest_run_at: string; latest_status: string; latest_error: string; history: { run_id: string; started_at: string; ended_at: string; environment_name: string; browser: string; status: string; duration_ms: number; error_message: string }[] }
type MissionVerdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'INCONCLUSIVE' | 'CANCELLED' | ''
type MissionScenario = { scenario_id: string; case_id: string; title: string; risk: string; status: string; verdict: MissionVerdict; run_id?: string; findings: { code?: string; layer?: string; status?: string; message: string }[]; verification_rules: { layer: string; rule: string }[]; reproduction_run_id?: string; reproduction_verdict?: MissionVerdict; failure_classification?: string; reproduction_confidence?: number; tapd_draft?: { title?: string; preconditions?: string; steps?: string; expected?: string; actual?: string } }
type MissionLedger = { ledger_id: string; scenario_id: string; source_step_no: number; source_text: string; actual_action: string; postcondition: string; status: string; evidence: { type: string; path: string }[] }
type MissionVerification = { verification_id: string; scenario_id: string; layer: string; status: string; rule_text: string; observed: string }
type MissionEvent = { event_id: number; event_type: string; phase: string; message: string; created_at: string }
type Mission = { mission_id: string; project_id: string; environment_id: string; objective: string; depth: 'quick' | 'standard' | 'deep' | 'custom'; status: string; verdict: MissionVerdict; progress: number; blocking_reason: string; created_at: string; started_at: string; ended_at: string; active?: boolean; scenarios?: MissionScenario[]; ledger?: MissionLedger[]; verifications?: MissionVerification[]; events?: MissionEvent[]; summary?: { total: number; passed: number; failed: number; blocked: number; inconclusive: number } }
type BrainRequirement = { requirement_id: string; title: string; module: string; source_type: string; source_name: string; status: string; current_version_id: string; current_version_no: number; latest_version_id: string; latest_version_no: number; latest_change_type: string; latest_review_status: string; latest_imported_at: string; pending_questions: string[] }
type BrainEntity = { entity_id: string; name: string; entity_type: string; description: string; status: string }
type BrainRelation = { relation_id: string; source_name: string; target_name: string; relation_type: string; description: string; status: string }
type BrainRule = { rule_id: string; module: string; title: string; rule_text: string; status: string; source_requirement_id: string; impacted_case_ids: string[] }
type BrainImpact = { impact_id: string; requirement_id: string; version_id: string; target_type: string; target_id: string; target_name: string; reason: string; risk: string; status: string }
type ProjectBrain = { project: Project; knowledge_version: string; summary: { requirements: number; pending_changes: number; entities: number; relations: number; active_rules: number; impacted_cases: number }; requirements: BrainRequirement[]; entities: BrainEntity[]; relations: BrainRelation[]; rules: BrainRule[]; impacts: BrainImpact[]; modules: { name: string; case_count: number; requirement_count: number; pending_changes: number }[] }
type ViewName = 'ai' | 'dashboard' | 'brain' | 'intelligence' | 'sessions' | 'suites' | 'cases' | 'flows' | 'regression' | 'elements' | 'runs' | 'legacyRuns' | 'environments' | 'defects' | 'ci' | 'settings'
type ActivityScope = 'explorer' | 'testing' | 'quality' | 'automation' | 'runs'
type BottomPanelTab = 'problems' | 'output' | 'debug'
type ThemeName = 'graphite' | 'obsidian' | 'frost' | 'pearl' | 'contrast'
type UiScale = '100' | '110' | '120'
type UiDensity = 'compact' | 'comfortable' | 'reading'
type AiBackgroundFit = 'cover' | 'contain'
type AppMenuName = 'file' | 'edit' | 'view' | 'run' | 'help'
type AiLaunch = { id: number; mode: AiPanelMode; prompt: string }
type CommandItem = { id: string; label: string; detail: string; category: string; icon: ReactNode; keywords?: string; run: () => void | Promise<void> }
type FlowVersion = { version_id: string; flow_id: string; version_no: number; label: string; source: string; created_at: string }
type HealingSuggestion = { suggestion_id: string; element_id: string; element_name: string; run_id: string; step_no: number; original_type: string; original_value: string; proposed_type: string; proposed_value: string; confidence: number; status: 'pending' | 'approved' | 'rejected'; screenshot_path?: string }
type PreflightFinding = { id: string; severity: 'error' | 'warning' | 'info'; title: string; detail: string; stepNo?: number }
type LocalRerunPlan = { from: number; to: number; reason: string; included: string[] }
type FlowDataSet = { id: string; name: string; variables: Record<string, string> }
type BatchRunState = { total: number; done: number; passed: number; failed: number; current: string; currentRunId: string; stopped: boolean; results: { datasetName: string; status: string; runId?: string }[] }
type TestSessionCase = { case_id: string; status: 'NOT_RUN' | 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIP'; note: string }
type TestSession = { id: string; name: string; mode: 'manual' | 'automated' | 'mixed' | 'exploratory'; environment: string; version: string; createdAt: string; status: 'DRAFT' | 'RUNNING' | 'COMPLETED'; cases: TestSessionCase[]; sourceSuiteId?: string; sourceSuiteName?: string; objective?: string; completedAt?: string }
type TestSuite = { id: string; name: string; kind: 'smoke' | 'regression' | 'acceptance' | 'exploratory'; version: string; description: string; caseIds: string[]; updatedAt: string }
type TestSessionLaunch = { id: number; suiteId: string; suiteName: string; version: string; objective: string; caseIds: string[]; mode: TestSession['mode']; environment: string }
type RegressionLaunch = { id: number; sessionName: string; caseIds: string[] }
type DiagnosticsSelfTest = { ok: boolean; duration_ms: number; checked_at: string; checks: { key: string; label: string; ok: boolean; detail: string; duration_ms: number }[] }
type LodestarMemory = { id: string; key: string; value: string; enabled: boolean }
type LodestarSkill = { id: string; name: string; filename: string; enabled: boolean; size: number }
type LodestarDesktopGrant = { id: string; name: string; path: string; read_only: boolean }
type LodestarDesktopEntry = { name: string; path: string; kind: 'file' | 'folder'; size: number }
type LodestarDesktopFile = { name: string; path: string; content: string; truncated: boolean }
type LodestarBackgroundState = { enabled: boolean; mime_type: string; version: string; path?: string }
type DefectDraft = { runId: string; title: string; preconditions: string; steps: string; expected: string; actual: string; status: 'draft' | 'reviewed'; missionId?: string; scenarioId?: string; classification?: string; confidence?: number }

const themeOptions: { id: ThemeName; label: string; detail: string }[] = [
  { id: 'graphite', label: '石墨', detail: '中性深色，适合长时间工作' },
  { id: 'obsidian', label: '曜石', detail: '深黑与翡翠强调色' },
  { id: 'frost', label: '霜白', detail: '冷静清晰的浅色界面' },
  { id: 'pearl', label: '云白', detail: '柔和中性的明亮主题' },
  { id: 'contrast', label: '墨影', detail: '沉静深灰，强化层级与文字辨识度' },
]

const labels: Record<string, string> = { open: '打开页面', click: '点击', fill: '输入', clear: '清空', select: '下拉选择', select_value: '按值选择', upload: '上传文件', wait: '等待', wait_url: '等待页面跳转', screenshot: '截图', assert_text: '校验文本', assert_equals: '校验文本相等', assert_value: '校验输入值', assert_attribute: '校验属性', assert_exists: '校验元素存在', assert_not_exists: '校验元素不存在', assert_visible: '校验元素可见', assert_not_visible: '校验元素不可见', assert_enabled: '校验元素可用', assert_url: '校验页面地址', assert_title: '校验页面标题', assert_count: '校验元素数量', hover: '悬停', press: '键盘操作' }
const storedAiPanelWidth = Number(window.localStorage.getItem('automation-studio.ai-panel-width'))
const initialAiPanelWidth = Number.isFinite(storedAiPanelWidth) && storedAiPanelWidth >= 360 && storedAiPanelWidth <= 620 ? storedAiPanelWidth : 430
const storedTheme = window.localStorage.getItem('automation-studio.theme') as ThemeName | null
const initialTheme: ThemeName = storedTheme && themeOptions.some((item) => item.id === storedTheme) ? storedTheme : 'graphite'
const storedUiScale = window.localStorage.getItem('automation-studio.ui-scale') as UiScale | null
const initialUiScale: UiScale = storedUiScale && ['100', '110', '120'].includes(storedUiScale) ? storedUiScale : '110'
const storedUiDensity = window.localStorage.getItem('automation-studio.ui-density') as UiDensity | null
const initialUiDensity: UiDensity = storedUiDensity && ['compact', 'comfortable', 'reading'].includes(storedUiDensity) ? storedUiDensity : 'reading'
const storedAiPanelOpen = window.localStorage.getItem('automation-studio.ai-panel-open')
const storedLeftSidebarOpen = window.localStorage.getItem('automation-studio.left-sidebar-open')
const AI_BACKGROUND_STORAGE = 'automation-studio.ai-background'
const AI_BACKGROUND_OPACITY_STORAGE = 'automation-studio.ai-background-opacity'
const AI_BACKGROUND_FIT_STORAGE = 'automation-studio.ai-background-fit'
const AI_CONFIG_STORAGE = 'automation-studio.ai-config'
const LOCAL_AI_BASE_URL = 'local://lodestar'
const LOCAL_AI_MODEL = 'lodestar-local'
const LEGACY_LOCAL_AI_URLS = new Set(['local://klein', 'builtin://klein', 'local'])
const isLocalAiConfig = (config: { base_url: string; api_key: string; model: string }) => config.base_url === LOCAL_AI_BASE_URL || LEGACY_LOCAL_AI_URLS.has(config.base_url)
const aiBackgroundUrl = (version: string) => `${serviceOrigin}/api/klein/appearance/background/image?v=${encodeURIComponent(version)}`
function loadStoredAiConfig() {
  try {
    const value = JSON.parse(window.localStorage.getItem(AI_CONFIG_STORAGE) || '{}') as { base_url?: string; api_key?: string; model?: string }
    const baseUrl = String(value.base_url || LOCAL_AI_BASE_URL)
    if (LEGACY_LOCAL_AI_URLS.has(baseUrl)) return { base_url: LOCAL_AI_BASE_URL, api_key: '', model: LOCAL_AI_MODEL }
    return { base_url: baseUrl, api_key: String(value.api_key || ''), model: String(value.model || LOCAL_AI_MODEL) }
  } catch {
    return { base_url: LOCAL_AI_BASE_URL, api_key: '', model: LOCAL_AI_MODEL }
  }
}
const viewLabels: Record<ViewName, string> = {
  ai: 'AI 工作台',
  dashboard: '工作台',
  brain: '项目智能中心',
  intelligence: '质量智能',
  sessions: '测试会话',
  suites: '测试套件',
  cases: '测试用例',
  flows: '自动化流程',
  regression: '回归测试',
  elements: '页面元素',
  runs: '执行中心',
  legacyRuns: '高级运行记录',
  environments: '测试环境',
  defects: '缺陷草稿',
  ci: '持续集成',
  settings: '设置',
}

function activityScopeForView(view: ViewName): ActivityScope {
  if (['sessions', 'suites', 'cases', 'regression'].includes(view)) return 'testing'
  if (['brain', 'intelligence', 'elements'].includes(view)) return 'quality'
  if (view === 'flows') return 'automation'
  if (view === 'runs' || view === 'legacyRuns') return 'runs'
  return 'explorer'
}

function dataSetStorageKey(flowId: string) { return `automation-studio.datasets.${flowId}` }
function loadFlowDataSets(flowId: string): FlowDataSet[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dataSetStorageKey(flowId)) || '[]') as FlowDataSet[]
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name && item?.variables && typeof item.variables === 'object') : []
  } catch { return [] }
}

function inspectFlow(flow: Flow | null, elements: ElementAsset[], environment?: Environment): PreflightFinding[] {
  if (!flow) return [{ id: 'missing-flow', severity: 'error', title: '尚未选择流程', detail: '选择流程后才能进行执行检查。' }]
  const findings: PreflightFinding[] = []
  if (!environment) findings.push({ id: 'missing-env', severity: 'error', title: '缺少执行环境', detail: '请为流程选择测试环境。' })
  else if (!environment.base_url) findings.push({ id: 'missing-base-url', severity: 'warning', title: '环境地址为空', detail: '包含相对地址或 ${base_url} 的步骤可能无法打开页面。' })
  if (!flow.steps.length) findings.push({ id: 'missing-steps', severity: 'error', title: '流程没有步骤', detail: '至少添加一个可执行步骤。' })
  const elementActions = new Set(['click', 'fill', 'clear', 'select', 'select_value', 'upload', 'hover', 'press', 'assert_text', 'assert_equals', 'assert_value', 'assert_attribute', 'assert_exists', 'assert_not_exists', 'assert_visible', 'assert_not_visible', 'assert_enabled', 'assert_count'])
  const knownVariables = new Set(['base_url', ...Object.keys(flow.variables || {}), ...Object.keys(environment?.variables || {})])
  const seenIds = new Set<string>()
  flow.steps.forEach((step, index) => {
    const stepNo = index + 1
    if (seenIds.has(step.id)) findings.push({ id: `duplicate-${stepNo}`, severity: 'error', title: '步骤 ID 重复', detail: `“${step.name}”与其他步骤使用了相同 ID。`, stepNo })
    seenIds.add(step.id)
    if (elementActions.has(step.action)) {
      const element = elements.find((item) => item.element_id === step.element_id)
      if (!step.element_id || !element) findings.push({ id: `element-${stepNo}`, severity: 'error', title: '页面元素未配置', detail: `“${step.name}”需要绑定有效页面元素。`, stepNo })
      else if (!element.locator_value) findings.push({ id: `locator-${stepNo}`, severity: 'error', title: '元素定位器为空', detail: `“${element.name}”没有可执行的主定位器。`, stepNo })
    }
    const source = `${step.value || ''}\n${step.expected || ''}`
    for (const match of source.matchAll(/\$\{([^}]+)\}/g)) if (!knownVariables.has(match[1])) findings.push({ id: `variable-${stepNo}-${match[1]}`, severity: 'warning', title: `变量 ${match[1]} 未定义`, detail: `步骤“${step.name}”执行时可能得到空值。`, stepNo })
    if (step.action === 'wait') findings.push({ id: `wait-${stepNo}`, severity: 'warning', title: '使用了固定等待', detail: `步骤“${step.name}”建议改成页面状态或元素断言。`, stepNo })
    if (environment?.read_only && step.risk && step.risk !== 'read') findings.push({ id: `risk-${stepNo}`, severity: 'error', title: '只读环境包含写入步骤', detail: `步骤“${step.name}”会被执行策略阻止。`, stepNo })
  })
  if (flow.steps.length && !flow.steps.some((step) => step.action.startsWith('assert'))) findings.push({ id: 'missing-assertion', severity: 'warning', title: '流程缺少结果断言', detail: '执行成功只能证明动作完成，无法证明业务结果正确。' })
  if (!findings.length) findings.push({ id: 'ready', severity: 'info', title: '执行检查通过', detail: '元素、变量、环境和断言均未发现明显问题。' })
  return findings
}

function planLocalRerun(flow: Flow | undefined, targetStepNo: number): LocalRerunPlan {
  if (!flow?.steps?.length) return { from: targetStepNo, to: targetStepNo, reason: '无法读取流程结构，仅验证目标步骤。', included: [] }
  const targetIndex = Math.max(0, Math.min(flow.steps.length - 1, targetStepNo - 1))
  let startIndex = targetIndex
  const lastOpen = flow.steps.slice(0, targetIndex + 1).map((step, index) => ({ step, index })).reverse().find(({ step }) => step.action === 'open')
  if (lastOpen) startIndex = lastOpen.index
  const authIndex = flow.steps.slice(0, targetIndex + 1).findIndex((step) => /登录|登陆|鉴权|认证|sign[ -]?in|log[ -]?in|auth/i.test(step.name))
  if (authIndex >= 0) {
    const authOpen = flow.steps.slice(0, authIndex + 1).map((step, index) => ({ step, index })).reverse().find(({ step }) => step.action === 'open')
    startIndex = Math.min(startIndex, authOpen?.index ?? authIndex)
  }
  const included = flow.steps.slice(startIndex, targetIndex + 1).map((step, index) => `${startIndex + index + 1}. ${step.name}`)
  const reason = startIndex === targetIndex
    ? '目标步骤不依赖可识别的页面打开或登录准备链。'
    : authIndex >= 0 ? '检测到登录/鉴权上下文，已包含必要准备步骤和最近页面入口。' : '已从最近的页面打开步骤恢复目标步骤所需上下文。'
  return { from: startIndex + 1, to: targetIndex + 1, reason, included }
}

async function runNativeWindowAction(action: 'minimize' | 'maximize' | 'close') {
  if (!isTauriDesktop) return
  const window = getCurrentWindow()
  if (action === 'minimize') await window.minimize()
  if (action === 'maximize') await window.toggleMaximize()
  if (action === 'close') await window.hide()
}

type DesktopMenuItem = { label: string; icon: ReactNode; shortcut?: string; disabled?: boolean; run: () => void | Promise<void> }
type LodestarContextMenuState = { x: number; y: number; editable: boolean; hasSelection: boolean }

function LodestarMark() {
  return <span className="klein-mark" aria-hidden="true"><img src="/brand/lodestar-icon.png" alt=""/></span>
}

function DesktopMenu({ name, label, open, items, onToggle, onClose }: { key?: string; name: AppMenuName; label: string; open: boolean; items: DesktopMenuItem[]; onToggle: (name: AppMenuName) => void; onClose: () => void }) {
  return <div className="desktop-menu">
    <button type="button" className={open ? 'active' : ''} onClick={() => onToggle(name)}>{label}</button>
    {open && <div className="desktop-menu-popup">{items.map((item) => <button type="button" key={item.label} disabled={item.disabled} onClick={() => { onClose(); void item.run() }}><span>{item.icon}</span><strong>{item.label}</strong>{item.shortcut && <kbd>{item.shortcut}</kbd>}</button>)}</div>}
  </div>
}

function App() {
  const dialog = useDialog()
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [elements, setElements] = useState<ElementAsset[]>([])
  const [flows, setFlows] = useState<Flow[]>([])
  const [flow, setFlow] = useState<Flow | null>(null)
  const [flowDirty, setFlowDirty] = useState(false)
  const [flowDataSets, setFlowDataSets] = useState<FlowDataSet[]>([])
  const [selectedDataSetId, setSelectedDataSetId] = useState('')
  const [dataSetDraft, setDataSetDraft] = useState('')
  const [showDataSets, setShowDataSets] = useState(false)
  const [batchRun, setBatchRun] = useState<BatchRunState | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [view, setView] = useState<ViewName>('ai')
  const [openViews, setOpenViews] = useState<ViewName[]>(['ai'])
  const [activityScope, setActivityScope] = useState<ActivityScope>('explorer')
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false)
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('problems')
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [selectedStep, setSelectedStep] = useState(0)
  const [stepQuery, setStepQuery] = useState('')
  const [connection, setConnection] = useState('连接中')
  const [toast, setToast] = useState('')
  const [running, setRunning] = useState<Run | null>(null)
  const [legacyRunId, setLegacyRunId] = useState('')
  const [environmentId, setEnvironmentId] = useState('')
  const [recordingId, setRecordingId] = useState('')
  const [recordingStatus, setRecordingStatus] = useState('未录制')
  const [cases, setCases] = useState<TestCase[]>([])
  const [plans, setPlans] = useState<RegressionPlan[]>([])
  const [regressionRuns, setRegressionRuns] = useState<RegressionRun[]>([])
  const [selectedRegressionRun, setSelectedRegressionRun] = useState<string>('')
  const [regressionCaseResults, setRegressionCaseResults] = useState<RegressionCaseResult[]>([])
  const [breakpoints, setBreakpoints] = useState<number[]>([])
  const [fromStep, setFromStep] = useState(1)
  const [toStep, setToStep] = useState<number | undefined>(undefined)
  const [showFlowVars, setShowFlowVars] = useState(false)
  const [aiConfig, setAiConfig] = useState<{ base_url: string; api_key: string; model: string }>(loadStoredAiConfig())
  const [autoBatch, setAutoBatch] = useState<{ done: number; total: number; failed: number; current: string } | null>(null)
  const [agentRun, setAgentRun] = useState<{ case_id: string; steps: { step_no: number; action: string; description: string }[]; status?: string } | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(storedAiPanelOpen !== 'false')
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(storedLeftSidebarOpen !== 'false')
  const [aiPanelWidth, setAiPanelWidth] = useState<number>(initialAiPanelWidth)
  const [commandOpen, setCommandOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(initialTheme)
  const [uiScale, setUiScale] = useState<UiScale>(initialUiScale)
  const [uiDensity, setUiDensity] = useState<UiDensity>(initialUiDensity)
  const [aiBackground, setAiBackground] = useState('')
  const [aiBackgroundOpacity, setAiBackgroundOpacity] = useState(Number(window.localStorage.getItem(AI_BACKGROUND_OPACITY_STORAGE) || '42'))
  const [aiBackgroundFit, setAiBackgroundFit] = useState<AiBackgroundFit>('cover')
  const [windowMaximized, setWindowMaximized] = useState(false)
  const [appMenuOpen, setAppMenuOpen] = useState<AppMenuName | null>(null)
  const [aiLaunch, setAiLaunch] = useState<AiLaunch | null>(null)
  const [sessionLaunch, setSessionLaunch] = useState<TestSessionLaunch | null>(null)
  const [regressionLaunch, setRegressionLaunch] = useState<RegressionLaunch | null>(null)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [flowHistoryOpen, setFlowHistoryOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [runMenuOpen, setRunMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<LodestarContextMenuState | null>(null)
  const [socketRestart, setSocketRestart] = useState(0)
  const [projectLoading, setProjectLoading] = useState(false)
  const projectRef = useRef<Project | null>(null)
  const previousViewRef = useRef<ViewName>('ai')
  const batchStopRef = useRef(false)
  const contextTargetRef = useRef<HTMLElement | null>(null)
  const initialRunId = new URLSearchParams(window.location.search).get('run') || ''

  const loadProject = async (p: Project) => {
    projectRef.current = p
    setProject(p)
    setProjectLoading(true)
    try {
      const [env, els, fs, cs, ps, rs, rrs] = await Promise.all([
        api<Environment[]>(`/projects/${p.id}/environments`),
        api<ElementAsset[]>(`/projects/${p.id}/elements`),
        api<Flow[]>(`/projects/${p.id}/flows`),
        api<TestCase[]>(`/projects/${p.id}/test-cases`),
        api<RegressionPlan[]>(`/projects/${p.id}/regression-plans`),
        api<Run[]>('/runs'),
        api<RegressionRun[]>('/regression-runs'),
      ])
      setEnvironments(env); setElements(els); setFlows(fs); setCases(cs); setPlans(ps); setRuns(rs); setRegressionRuns(rrs)
      setEnvironmentId(fs[0]?.environment_id || env[0]?.id || '')
      if (fs[0]) { const initial = await api<Flow>(`/flows/${fs[0].flow_id}`); setFlow(initial); setBreakpoints(initial.breakpoints || []) }
      else { setFlow(null); setBreakpoints([]) }
      setFlowDirty(false)
    } catch (error) {
      setToast(error instanceof Error ? `项目加载失败：${error.message}` : '项目加载失败')
    } finally {
      setProjectLoading(false)
    }
  }

  const createProject = async () => {
    const name = await dialog.prompt('为新的自动化空间命名。创建后将进入环境配置。', '我的 Web 自动化项目', { title: '创建项目', confirmLabel: '创建项目' })
    if (!name?.trim()) return
    try {
      const saved = await api<Project>('/projects', { method: 'POST', body: JSON.stringify({ name: name.trim(), description: '个人 Web 自动化工作台项目' }) })
      setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)])
      await loadProject(saved)
      setView('environments')
      setToast('项目已创建，请先配置测试环境')
    } catch (error) { setToast(error instanceof Error ? error.message : '创建项目失败') }
  }

  const removeProject = async (item: Project) => {
    if (!await dialog.confirm(`删除项目“${item.name}”后，它的环境、用例、流程和执行记录都会被删除，且无法恢复。`, { title: '删除项目', confirmLabel: '删除项目', danger: true })) return
    try {
      const result = await api<{ deleted: boolean }>(`/projects/${item.id}`, { method: 'DELETE' })
      if (!result.deleted) return
      setToast(`已删除项目“${item.name}”`)
      const items = await api<Project[]>('/projects')
      setProjects(items)
      if (project?.id === item.id && items[0]) await loadProject(items[0])
    } catch (error) { setToast(error instanceof Error ? error.message : '删除项目失败') }
  }

  const uploadAiBackground = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setToast('请选择 PNG、JPG 或 WebP 图片'); return }
    if (file.size > 15 * 1024 * 1024) { setToast('背景图片不能超过 15 MB'); return }
    const reader = new FileReader()
    reader.onerror = () => setToast('背景图片读取失败')
    reader.onload = () => {
      const image = new window.Image()
      image.onerror = () => setToast('背景图片无法解析')
      image.onload = async () => {
        const maxWidth = 1800
        const maxHeight = 1200
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) { setToast('背景图片处理失败'); return }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        let quality = .82
        let encoded = canvas.toDataURL('image/jpeg', quality)
        while (encoded.length > 3_200_000 && quality > .5) {
          quality -= .08
          encoded = canvas.toDataURL('image/jpeg', quality)
        }
        if (encoded.length > 4_000_000) { setToast('图片内容过于复杂，请换一张尺寸较小的图片'); return }
        try {
          const saved = await api<LodestarBackgroundState>('/klein/appearance/background', {
            method: 'POST',
            body: JSON.stringify({ content_base64: encoded.split(',', 2)[1], mime_type: 'image/jpeg' }),
          })
          setAiBackground(aiBackgroundUrl(saved.version))
          setAiBackgroundFit('cover')
          window.localStorage.removeItem(AI_BACKGROUND_STORAGE)
          setAiBackgroundOpacity((current) => current < 24 ? 42 : current)
          setToast('AI 对话背景已保存到 D 盘')
        } catch (error) {
          setToast(error instanceof Error ? error.message : '背景图片保存失败')
        }
      }
      image.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  }

  const clearAiBackground = async () => {
    try {
      await api<{ deleted: boolean }>('/klein/appearance/background', { method: 'DELETE' })
      setAiBackground('')
      window.localStorage.removeItem(AI_BACKGROUND_STORAGE)
      setToast('已清除 AI 对话背景')
    } catch (error) {
      setToast(error instanceof Error ? error.message : '背景图片清除失败')
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadAiBackground = async () => {
      const legacy = window.localStorage.getItem(AI_BACKGROUND_STORAGE) || ''
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          let state = await api<LodestarBackgroundState>('/klein/appearance/background')
          if (!state.enabled && legacy.startsWith('data:image/')) {
            const separator = legacy.indexOf(',')
            const mimeType = legacy.slice(5, legacy.indexOf(';'))
            if (separator > 0 && ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
              state = await api<LodestarBackgroundState>('/klein/appearance/background', {
                method: 'POST',
                body: JSON.stringify({ content_base64: legacy.slice(separator + 1), mime_type: mimeType }),
              })
            }
          }
          if (cancelled) return
          setAiBackground(state.enabled ? aiBackgroundUrl(state.version) : '')
          setAiBackgroundFit('cover')
          if (state.enabled || legacy) window.localStorage.removeItem(AI_BACKGROUND_STORAGE)
          return
        } catch {
          if (attempt < 4) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)))
        }
      }
      if (!cancelled) setAiBackground('')
    }
    void loadAiBackground()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const items = await api<Project[]>('/projects')
          if (cancelled) return
          setProjects(items)
          if (items[0]) await loadProject(items[0])
          return
        } catch (error) {
          if (attempt === 2 && !cancelled) setToast(error instanceof Error ? `本地服务未连接：${error.message}` : '本地服务未连接')
          await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)))
        }
      }
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let socket: WebSocket | null = null
    let retryTimer = 0
    let disposed = false
    let attempts = 0

    const connect = () => {
      if (disposed) return
      setConnection(attempts ? '正在重连' : '连接中')
      socket = new WebSocket(wsUrl)
      socket.onopen = () => { attempts = 0; setConnection('已连接') }
      socket.onerror = () => socket?.close()
      socket.onclose = () => {
        if (disposed) return
        attempts += 1
        setConnection('正在重连')
        retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempts - 1, 4), 15000))
      }
      socket.onmessage = (event) => {
        let message: { type: string; run_id?: string; recording_id?: string; status?: string; report_path?: string; trace_path?: string; step?: Step; element?: ElementAsset; error?: string; done?: number; total?: number; failed?: number; title?: string; case_id?: string; step_no?: number; action?: string; description?: string; reason?: string }
        try { message = JSON.parse(event.data) } catch { return }
      if (message.type === 'recording_started') { setRecordingStatus('录制中'); setToast('浏览器已打开，可以直接操作网页') }
      if (message.type === 'recording_error') { setRecordingStatus('录制失败'); setToast(message.error || '录制失败') }
      if (message.type === 'recording_finished') { setRecordingStatus('已完成'); setToast('录制已结束，请检查并保存流程') }
      if ((message.type === 'step_recorded' || message.type === 'step_updated') && message.step) {
        setFlow((current) => current ? { ...current, steps: message.type === 'step_updated' ? current.steps.map((item) => item.id === message.step?.id ? message.step : item) : [...current.steps, message.step as Step] } : current)
      }
      if (message.type === 'step_recorded' && message.element) setElements((items) => items.some((item) => item.element_id === message.element?.element_id) ? items : [message.element as ElementAsset, ...items])
      if (message.type === 'run_finished') {
        setRunning(null); setToast(message.status === 'PASS' ? '执行完成：全部通过' : `执行完成：${message.status}`)
        void api<Run[]>('/runs').then(setRuns)
      }
      if (message.type === 'run_state' && message.run_id) setRunning((current) => current?.run_id === message.run_id ? { ...current, status: message.status || current.status } : current)
      if (message.type === 'regression_finished') {
        setToast(message.status === 'PASS' ? '回归完成：全部通过' : `回归完成：${message.status}`)
        void api<RegressionRun[]>('/regression-runs').then(setRegressionRuns)
      }
    if (message.type === 'auto_generate_progress') {
        setAutoBatch({ done: message.done || 0, total: message.total || 0, failed: message.failed || 0, current: message.title || '' })
      }
      if (message.type === 'agent_step') setAgentRun((cur) => cur && cur.case_id === message.case_id ? { ...cur, steps: [...cur.steps, { step_no: message.step_no || 0, action: message.action || '', description: message.description || '' }] } : cur)
      if (message.type === 'agent_finished') setAgentRun((cur) => cur && cur.case_id === message.case_id ? { ...cur, status: message.status || 'FAIL' } : cur)
      if (message.type === 'auto_generate_finished') {
        setAutoBatch(null); setToast(`批量编译完成（失败 ${message.failed || 0} 条）。可到「执行中心」运行全部可执行用例`)
        if (projectRef.current) void loadProject(projectRef.current)
      }
      }
    }

    connect()
    return () => { disposed = true; window.clearTimeout(retryTimer); socket?.close() }
  }, [socketRestart])

  useEffect(() => { if (view === 'runs' || view === 'legacyRuns') void api<Run[]>('/runs').then(setRuns) }, [view])
  useEffect(() => { if (flow) setBreakpoints(flow.breakpoints || []) }, [flow?.flow_id])
  useEffect(() => {
    if (!flow?.flow_id) { setFlowDataSets([]); setSelectedDataSetId(''); setDataSetDraft(''); return }
    const next = loadFlowDataSets(flow.flow_id)
    setFlowDataSets(next)
    setSelectedDataSetId(next[0]?.id || '')
    setDataSetDraft(next[0] ? JSON.stringify(next[0].variables, null, 2) : '')
  }, [flow?.flow_id])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4500); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('automation-studio.theme', theme)
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.scale = uiScale
    window.localStorage.setItem('automation-studio.ui-scale', uiScale)
  }, [uiScale])
  useEffect(() => {
    document.documentElement.dataset.density = uiDensity
    window.localStorage.setItem('automation-studio.ui-density', uiDensity)
  }, [uiDensity])
  useEffect(() => {
    const backgroundStrength = Math.max(12, Math.min(85, aiBackgroundOpacity))
    document.documentElement.dataset.aiBackground = aiBackground ? 'custom' : 'none'
    document.documentElement.style.setProperty('--ai-background-image', aiBackground ? `url("${aiBackground}")` : 'none')
    document.documentElement.style.setProperty('--ai-background-opacity', String(backgroundStrength / 100))
    document.documentElement.style.setProperty('--ai-background-overlay', `${100 - backgroundStrength}%`)
    document.documentElement.style.setProperty('--ai-background-fit', aiBackgroundFit)
    window.localStorage.setItem(AI_BACKGROUND_OPACITY_STORAGE, String(aiBackgroundOpacity))
    window.localStorage.setItem(AI_BACKGROUND_FIT_STORAGE, aiBackgroundFit)
  }, [aiBackground, aiBackgroundOpacity, aiBackgroundFit])
  useEffect(() => {
    window.localStorage.setItem('automation-studio.ai-panel-open', String(aiPanelOpen))
  }, [aiPanelOpen])
  useEffect(() => {
    window.localStorage.setItem('automation-studio.left-sidebar-open', String(leftSidebarOpen))
  }, [leftSidebarOpen])
  useEffect(() => {
    window.localStorage.setItem(AI_CONFIG_STORAGE, JSON.stringify(aiConfig))
  }, [aiConfig])
  useEffect(() => {
    if (!isTauriDesktop) return
    const appWindow = getCurrentWindow()
    void appWindow.isMaximized().then(setWindowMaximized)
    const unlisten = appWindow.onResized(() => { void appWindow.isMaximized().then(setWindowMaximized) })
    return () => { void unlisten.then((stop) => stop()) }
  }, [])
  useEffect(() => {
    const previousView = previousViewRef.current
    setOpenViews((items) => items.includes(view) ? items : [...items, view])
    setActivityScope(activityScopeForView(view))
    if (view === 'settings') {
      setAiPanelOpen(false)
      setBottomPanelOpen(false)
    } else if (previousView === 'ai' && view !== 'ai') {
      setAiPanelOpen(false)
    }
    previousViewRef.current = view
  }, [view])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen((open) => !open) }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveFlow() }
      if (event.key === 'Escape') { setCommandOpen(false); setProjectMenuOpen(false); setRunMenuOpen(false); setThemeMenuOpen(false); setAppMenuOpen(null); setContextMenu(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  useEffect(() => {
    const hideContextMenu = () => setContextMenu(null)
    const closeContextMenu = (event: MouseEvent) => {
      if (event?.target instanceof Element && event.target.closest('.klein-context-menu')) return
      setContextMenu(null)
    }
    const openContextMenu = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('.klein-context-menu')) return
      event.preventDefault()
      const target = event.target instanceof HTMLElement ? event.target : null
      const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || Boolean(target?.isContentEditable)
      const hasSelection = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        ? Number(target.selectionEnd || 0) > Number(target.selectionStart || 0)
        : Boolean(window.getSelection()?.toString())
      contextTargetRef.current = target
      setContextMenu({
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 184)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - (editable ? 150 : 88))),
        editable,
        hasSelection,
      })
    }
    document.addEventListener('contextmenu', openContextMenu)
    document.addEventListener('mousedown', closeContextMenu)
    window.addEventListener('blur', hideContextMenu)
    window.addEventListener('resize', hideContextMenu)
    window.addEventListener('scroll', hideContextMenu, true)
    return () => {
      document.removeEventListener('contextmenu', openContextMenu)
      document.removeEventListener('mousedown', closeContextMenu)
      window.removeEventListener('blur', hideContextMenu)
      window.removeEventListener('resize', hideContextMenu)
      window.removeEventListener('scroll', hideContextMenu, true)
    }
  }, [])
  useEffect(() => {
    const closeAppMenus = (event: MouseEvent) => {
      if (event?.target instanceof Element && (event.target.closest('.desktop-menu') || event.target.closest('.project-switcher'))) return
      setAppMenuOpen(null)
      setProjectMenuOpen(false)
    }
    document.addEventListener('mousedown', closeAppMenus)
    return () => document.removeEventListener('mousedown', closeAppMenus)
  }, [])

  const selectedContextText = () => {
    const target = contextTargetRef.current
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target.value.slice(target.selectionStart || 0, target.selectionEnd || 0)
    }
    return window.getSelection()?.toString() || ''
  }
  const replaceContextSelection = (text: string) => {
    const target = contextTargetRef.current
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = target.selectionStart || 0
      const end = target.selectionEnd || start
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set
      setter?.call(target, `${target.value.slice(0, start)}${text}${target.value.slice(end)}`)
      target.dispatchEvent(new Event('input', { bubbles: true }))
      window.setTimeout(() => { target.focus(); target.setSelectionRange(start + text.length, start + text.length) }, 0)
    } else if (target?.isContentEditable) {
      target.focus()
      document.execCommand('insertText', false, text)
    }
  }
  const copyContextSelection = async (cut = false) => {
    const text = selectedContextText()
    if (text) await navigator.clipboard.writeText(text)
    if (cut && contextMenu?.editable) replaceContextSelection('')
    setContextMenu(null)
  }
  const pasteContextSelection = async () => {
    try { replaceContextSelection(await navigator.clipboard.readText()) }
    catch { setToast('无法读取剪贴板，请使用 Ctrl+V') }
    setContextMenu(null)
  }
  const selectContextTarget = () => {
    const target = contextTargetRef.current
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.select()
    else document.execCommand('selectAll')
    setContextMenu(null)
  }

  const activeEnvironment = environments.find((item) => item.id === environmentId) || environments[0]
  const preflightFindings = useMemo(() => inspectFlow(flow, elements, activeEnvironment), [flow, elements, activeEnvironment])
  const step = flow?.steps[selectedStep]
  const selectedCase = cases.find((item) => item.case_id === selectedCaseId) || null
  const incompleteCaseCount = useMemo(() => cases.filter((item) => !String(item.steps || '').trim() || !String(item.expected || '').trim()).length, [cases])
  const workbenchProblemCount = preflightFindings.filter((item) => item.severity !== 'info').length + incompleteCaseCount + (activeEnvironment ? 0 : 1)
  const normalizedStepQuery = stepQuery.trim().toLowerCase()
  const visibleStepIndexes = useMemo(() => (flow?.steps || []).map((item, index) => ({ item, index })).filter(({ item }) => !normalizedStepQuery || `${item.name} ${labels[item.action] || item.action} ${item.element_id || ''}`.toLowerCase().includes(normalizedStepQuery)), [flow?.steps, normalizedStepQuery])
  useEffect(() => {
    if (normalizedStepQuery && visibleStepIndexes.length && !visibleStepIndexes.some(({ index }) => index === selectedStep)) setSelectedStep(visibleStepIndexes[0].index)
  }, [normalizedStepQuery, visibleStepIndexes, selectedStep])
  const flowCount = useMemo(() => flows.length, [flows])

  const saveFlow = async () => {
    if (!flow || !project) return
    try {
      const saved = await api<Flow>('/flows', { method: 'POST', body: JSON.stringify({ ...flow, breakpoints }) })
      setFlow(saved); setBreakpoints(saved.breakpoints || []); setFlows((items) => [saved, ...items.filter((item) => item.flow_id !== saved.flow_id)]); setFlowDirty(false); setToast('流程已保存')
    } catch (error) { setToast(error instanceof Error ? `流程保存失败：${error.message}` : '流程保存失败') }
  }

  const persistDataSets = (next: FlowDataSet[]) => {
    if (!flow?.flow_id) return
    setFlowDataSets(next)
    window.localStorage.setItem(dataSetStorageKey(flow.flow_id), JSON.stringify(next))
  }

  const createDataSet = () => {
    if (!flow) return
    const next: FlowDataSet = { id: `dataset-${Date.now()}`, name: `数据集 ${flowDataSets.length + 1}`, variables: { username: '', password: '' } }
    persistDataSets([...flowDataSets, next])
    setSelectedDataSetId(next.id)
    setDataSetDraft(JSON.stringify(next.variables, null, 2))
    setShowDataSets(true)
    setToast('已创建数据集草稿，填写变量后即可运行')
  }

  const selectDataSet = (id: string) => {
    const next = flowDataSets.find((item) => item.id === id)
    setSelectedDataSetId(id)
    setDataSetDraft(next ? JSON.stringify(next.variables, null, 2) : '')
  }

  const saveDataSet = async () => {
    const current = flowDataSets.find((item) => item.id === selectedDataSetId)
    if (!current) return
    try {
      const variables = JSON.parse(dataSetDraft || '{}')
      if (!variables || Array.isArray(variables) || typeof variables !== 'object') throw new Error('变量必须是 JSON 对象')
      const next = flowDataSets.map((item) => item.id === current.id ? { ...item, variables } : item)
      persistDataSets(next)
      setToast(`数据集“${current.name}”已保存`)
    } catch (error) { setToast(error instanceof Error ? `数据集保存失败：${error.message}` : '数据集 JSON 格式无效') }
  }

  const renameDataSet = async () => {
    const current = flowDataSets.find((item) => item.id === selectedDataSetId)
    if (!current) return
    const name = await dialog.prompt('给这组运行数据命名，便于在执行记录中区分。', current.name, { title: '重命名数据集', confirmLabel: '保存名称' })
    if (!name?.trim()) return
    persistDataSets(flowDataSets.map((item) => item.id === current.id ? { ...item, name: name.trim() } : item))
    setToast('数据集名称已更新')
  }

  const deleteDataSet = async () => {
    const current = flowDataSets.find((item) => item.id === selectedDataSetId)
    if (!current || !await dialog.confirm(`删除数据集“${current.name}”？不会影响流程本身。`, { title: '删除数据集', confirmLabel: '删除数据集', danger: true })) return
    const next = flowDataSets.filter((item) => item.id !== current.id)
    persistDataSets(next)
    const replacement = next[0]
    setSelectedDataSetId(replacement?.id || '')
    setDataSetDraft(replacement ? JSON.stringify(replacement.variables, null, 2) : '')
  }

  const runFlow = async (range?: { from?: number; to?: number }) => {
    if (!flow) return
    if (batchActive) return setToast('批量执行进行中，请先停止或等待当前批量任务完成')
    const blockers = preflightFindings.filter((item) => item.severity === 'error')
    const warnings = preflightFindings.filter((item) => item.severity === 'warning')
    if (blockers.length) {
      setPreflightOpen(true)
      await dialog.alert(`发现 ${blockers.length} 个阻断项，请先完成静态检查中的修复。`, '流程暂不能执行')
      return
    }
    if (warnings.length && !await dialog.confirm(`静态检查发现 ${warnings.length} 个警告。可以继续执行，但建议先核对变量、等待和断言。`, { title: '确认带警告执行', confirmLabel: '继续执行' })) { setPreflightOpen(true); return }
    const start = range?.from || fromStep
    const end = range?.to ?? toStep
    try {
      const selectedDataSet = flowDataSets.find((item) => item.id === selectedDataSetId)
      const run = await api<Run>('/runs', { method: 'POST', body: JSON.stringify({ flow_id: flow.flow_id, environment_id: activeEnvironment?.id, browser: activeEnvironment?.browser || 'chromium', from_step: start, to_step: end, breakpoints, runtime_variables: selectedDataSet?.variables || {}, dataset_name: selectedDataSet?.name || '' }) })
      setRunning(run); setView('runs'); setToast('已启动执行，浏览器即将打开')
    } catch (error) { setToast(error instanceof Error ? `启动执行失败：${error.message}` : '启动执行失败') }
  }

  const waitForRun = async (runId: string): Promise<Run> => {
    for (let attempt = 0; attempt < 3600; attempt += 1) {
      const current = await api<Run>(`/runs/${runId}/status`)
      if (['PASS', 'FAIL', 'STOPPED', 'BLOCKED'].includes(current.status)) return current
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    }
    throw new Error('执行等待超时，已保留当前 Run 记录')
  }

  const stopBatchRun = async () => {
    if (!batchRun || batchRun.done >= batchRun.total || batchRun.stopped) return
    batchStopRef.current = true
    if (batchRun.currentRunId) {
      try { await api(`/runs/${batchRun.currentRunId}/stop`, { method: 'POST' }) } catch { /* 当前 Run 可能刚刚结束 */ }
    }
    setToast('正在停止批量执行，当前数据集结束后不会继续下一组')
  }

  const startBatchRun = async () => {
    if (!flow || !flowDataSets.length || (batchRun && !batchRun.stopped && batchRun.done < batchRun.total)) return
    const blockers = preflightFindings.filter((item) => item.severity === 'error')
    if (blockers.length) {
      setPreflightOpen(true)
      await dialog.alert(`发现 ${blockers.length} 个阻断项，请先完成静态检查。`, '批量执行暂不能开始')
      return
    }
    const warnings = preflightFindings.filter((item) => item.severity === 'warning')
    if (warnings.length && !await dialog.confirm(`静态检查发现 ${warnings.length} 个警告，将连续执行 ${flowDataSets.length} 组数据。`, { title: '确认批量执行', confirmLabel: '开始批量执行' })) return
    if (!await dialog.confirm(`将按顺序执行 ${flowDataSets.length} 组数据，每组会生成独立 Run。`, { title: '批量执行数据集', confirmLabel: '开始执行' })) return
    batchStopRef.current = false
    const datasets = [...flowDataSets]
    const results: BatchRunState['results'] = []
    let passed = 0
    let failed = 0
    setBatchRun({ total: datasets.length, done: 0, passed: 0, failed: 0, current: '', currentRunId: '', stopped: false, results: [] })
    for (let index = 0; index < datasets.length; index += 1) {
      const dataset = datasets[index]
      if (batchStopRef.current) break
      setBatchRun((current) => current ? { ...current, current: dataset.name, currentRunId: '', stopped: false } : current)
      try {
        const run = await api<Run>('/runs', { method: 'POST', body: JSON.stringify({ flow_id: flow.flow_id, environment_id: activeEnvironment?.id, browser: activeEnvironment?.browser || 'chromium', from_step: fromStep, to_step: toStep, breakpoints, runtime_variables: dataset.variables, dataset_name: dataset.name }) })
        setRunning(run)
        setBatchRun((current) => current ? { ...current, currentRunId: run.run_id } : current)
        const finished = await waitForRun(run.run_id)
        setRunning(null)
        if (finished.status === 'PASS') passed += 1
        else failed += 1
        results.push({ datasetName: dataset.name, status: finished.status, runId: finished.run_id })
        setRuns((items) => [finished, ...items.filter((item) => item.run_id !== finished.run_id)])
        setBatchRun((current) => current ? { ...current, done: index + 1, passed, failed, currentRunId: '', results: [...results] } : current)
      } catch (error) {
        failed += 1
        results.push({ datasetName: dataset.name, status: 'ERROR' })
        setBatchRun((current) => current ? { ...current, done: index + 1, passed, failed, currentRunId: '', results: [...results] } : current)
        setToast(error instanceof Error ? `${dataset.name} 执行失败：${error.message}` : `${dataset.name} 执行失败`)
      }
    }
    const stopped = batchStopRef.current
    setBatchRun((current) => current ? { ...current, current: '', currentRunId: '', stopped, done: results.length, passed, failed, results: [...results] } : current)
    setRunning(null)
    setToast(stopped ? `批量执行已停止：完成 ${results.length}/${datasets.length} 组` : `批量执行完成：通过 ${passed}，失败 ${failed}`)
  }

  const runEvidenceStep = async (flowId: string, selectedEnvironmentId: string | undefined, browser: string, from: number, to: number) => {
    try {
      const run = await api<Run>('/runs', { method: 'POST', body: JSON.stringify({ flow_id: flowId, environment_id: selectedEnvironmentId || null, browser, from_step: from, to_step: to, breakpoints: [] }) })
      setRunning(run); setView('runs'); setToast(`已启动步骤 ${from}-${to} 智能局部验证`)
    } catch (error) { setToast(error instanceof Error ? `局部验证启动失败：${error.message}` : '局部验证启动失败') }
  }

  const applyAiFlowPatch = async (patch: AiFlowPatch) => {
    if (!flow) throw new Error('请先选择需要修改的自动化流程')
    await api(`/flows/${flow.flow_id}/checkpoints`, { method: 'POST', body: JSON.stringify({ source: 'ai', label: 'AI 修改前' }) })
    const nextSteps = patch.steps.map((item, index) => ({ ...item, id: item.id || `step-ai-${Date.now()}-${index}` }))
    setFlow({ ...flow, steps: nextSteps }); setFlowDirty(true)
    setSelectedStep(Math.min(selectedStep, Math.max(0, nextSteps.length - 1)))
    setView('flows')
    setToast('AI 修改已应用到编辑器，检查后保存流程')
  }

  const startRecording = async () => {
    if (!project || !flow) return setToast('请先选择项目和流程')
    const defaultUrl = `${activeEnvironment?.base_url || 'http://127.0.0.1:3000'}/login`
    const url = await dialog.prompt('输入浏览器开始录制时打开的页面地址。', defaultUrl, { title: '开始录制', confirmLabel: '打开并录制' })
    if (!url) return
    try {
      const result = await api<{ recording_id: string }>('/recordings', { method: 'POST', body: JSON.stringify({ project_id: project.id, url, flow_id: flow.flow_id }) })
      setRecordingId(result.recording_id); setRecordingStatus('启动中'); setToast('正在启动浏览器录制')
    } catch (error) { setToast(error instanceof Error ? error.message : '录制启动失败') }
  }

  const stopRecording = async () => {
    if (!recordingId || !project || !flow) return setToast('当前没有进行中的录制')
    try {
      const result = await api<{ steps: Step[]; elements: ElementAsset[] }>(`/recordings/${recordingId}/stop?project_id=${encodeURIComponent(project.id)}&flow_id=${encodeURIComponent(flow.flow_id)}`, { method: 'POST' })
      setFlow({ ...flow, steps: result.steps }); setFlowDirty(true); setElements((items) => { const merged = [...items]; result.elements.forEach((item) => { const index = merged.findIndex((old) => old.element_id === item.element_id); if (index >= 0) merged[index] = item; else merged.unshift(item) }); return merged })
      setRecordingId(''); setRecordingStatus('已完成'); setToast(`录制完成：${result.steps.length} 个步骤，${result.elements.length} 个元素`)
    } catch (error) { setToast(error instanceof Error ? error.message : '停止录制失败') }
  }

  const createFlow = async () => {
    if (!project) return
    const saved = await api<Flow>('/flows', { method: 'POST', body: JSON.stringify({ project_id: project.id, name: '新自动化流程', description: '可视化 Web 自动化流程', steps: [] }) })
    setFlow(saved); setBreakpoints([]); setFlows((items) => [saved, ...items]); setSelectedStep(0); setFlowDirty(false); setStepQuery(''); setToast('已创建新流程')
  }

  const copyFlow = async () => {
    if (!flow || !project) return
    const copied = await api<Flow>('/flows', { method: 'POST', body: JSON.stringify({ ...flow, flow_id: '', name: `${flow.name}（副本）`, project_id: project.id }) })
    setFlows((items) => [copied, ...items]); setFlow(copied); setBreakpoints(copied.breakpoints || []); setFlowDirty(false); setToast('流程副本已创建')
  }

  const deleteFlow = async () => {
    if (!flow || !await dialog.confirm(`流程“${flow.name}”及其步骤将被永久删除，历史执行证据不会受影响。`, { title: '删除自动化流程', confirmLabel: '删除流程', danger: true })) return
    try { await api(`/flows/${flow.flow_id}`, { method: 'DELETE' }); const next = flows.filter((item) => item.flow_id !== flow.flow_id); setFlows(next); setFlow(next[0] ? await api<Flow>(`/flows/${next[0].flow_id}`) : null); setFlowDirty(false); setToast('流程已删除') } catch (error) { setToast(error instanceof Error ? error.message : '流程删除失败') }
  }

  const addStep = () => {
    if (!flow) return
    const next: Step = { id: `step-${Date.now()}`, name: '新测试步骤', action: 'click', element_id: '', value: '', expected: '', timeout: 15000, retries: 0, screenshot: false, disabled: false, risk: 'read', continue_on_failure: false }
    setFlow({ ...flow, steps: [...flow.steps, next] }); setSelectedStep(flow.steps.length); setFlowDirty(true)
  }

  const deleteStep = () => {
    if (!flow || !step) return
    const steps = flow.steps.filter((_, index) => index !== selectedStep)
    setFlow({ ...flow, steps }); setSelectedStep(Math.max(0, Math.min(selectedStep, steps.length - 1))); setFlowDirty(true)
  }

  const duplicateStep = () => {
    if (!flow || !step) return
    const copy = { ...step, id: `step-${Date.now()}`, name: `${step.name}（副本）` }
    const steps = [...flow.steps.slice(0, selectedStep + 1), copy, ...flow.steps.slice(selectedStep + 1)]
    setFlow({ ...flow, steps }); setSelectedStep(selectedStep + 1); setFlowDirty(true)
  }

  const updateStep = (patch: Partial<Step>) => {
    if (!flow) return
    const steps = flow.steps.map((item, index) => index === selectedStep ? { ...item, ...patch } : item)
    setFlow({ ...flow, steps }); setFlowDirty(true)
  }

  const moveStep = (from: number, to: number) => {
    if (!flow || from === to || to < 0 || to >= flow.steps.length) return
    const steps = [...flow.steps]
    const [moved] = steps.splice(from, 1)
    steps.splice(to, 0, moved)
    setFlow({ ...flow, steps }); setFlowDirty(true)
    setSelectedStep(to)
  }

  const aiGenerateFlow = async (caseId: string) => {
    if (!aiConfig.base_url || !aiConfig.model) return setToast('请先到「设置」填写 AI 接口、密钥和模型')
    setToast('AI 生成中，请稍候…')
    try {
      const result = await api<{ flow: Flow; steps: Step[] }>(`/test-cases/${caseId}/generate-flow`, { method: 'POST', body: JSON.stringify({ base_url: aiConfig.base_url, api_key: aiConfig.api_key, model: aiConfig.model }) })
      setFlow(result.flow); setFlows((items) => [result.flow, ...items.filter((item) => item.flow_id !== result.flow.flow_id)]); setBreakpoints([]); setSelectedStep(0); setView('flows')
      setToast(`已生成草稿「${result.flow.name}」，请到流程里审核定位器`)
    } catch (error) { setToast(error instanceof Error ? error.message : 'AI生成失败') }
  }

  const agentRunCase = async (caseId: string) => {
    if (!aiConfig.base_url || !aiConfig.model) return setToast('请先到「设置」填写 AI 接口和模型')
    setAgentRun({ case_id: caseId, steps: [] })
    try {
      await api(`/test-cases/${caseId}/agent-run`, { method: 'POST', body: JSON.stringify({ base_url: aiConfig.base_url, api_key: aiConfig.api_key, model: aiConfig.model }) })
    } catch (error) { setToast(error instanceof Error ? error.message : '智能执行启动失败'); setAgentRun(null) }
  }

  const autoGenerateBatch = async () => {
    if (!project) return
    if (!aiConfig.base_url || !aiConfig.model) return setToast('请先到「设置」填写 AI 接口和模型')
    if (!await dialog.confirm('将为当前项目所有未绑定流程的用例生成可执行草稿。任务可能持续数分钟，期间可继续浏览其他页面。', { title: '批量生成自动化流程', confirmLabel: '开始生成' })) return
    setAutoBatch({ done: 0, total: 0, failed: 0, current: '' })
    try {
      await api(`/projects/${project.id}/auto-generate-batch`, { method: 'POST', body: JSON.stringify({ base_url: aiConfig.base_url, api_key: aiConfig.api_key, model: aiConfig.model }) })
    } catch (error) { setToast(error instanceof Error ? error.message : '批量生成启动失败'); setAutoBatch(null) }
  }

  const selectFlowById = async (flowId: string) => {
    if (flowDirty && !await dialog.confirm('当前流程有未保存的修改，切换后这些修改会丢失。是否继续？', { title: '放弃未保存修改', confirmLabel: '继续切换', danger: true })) return
    const next = await api<Flow>(`/flows/${flowId}`)
    setFlow(next); setSelectedStep(0); setEnvironmentId(next.environment_id || ''); setFlowDirty(false)
  }

  const batchActive = Boolean(batchRun && !batchRun.stopped && batchRun.done < batchRun.total)
  const runningActive = Boolean(running && ['RUNNING', 'PAUSED', 'STOPPING'].includes(running.status))
  const pauseOrResumeRun = async () => {
    if (!running) return setToast('暂无运行中的任务')
    const data = await api<{ status: string }>(`/runs/${running.run_id}/${running.status === 'PAUSED' ? 'resume' : 'pause'}`, { method: 'POST' })
    setRunning((current) => current ? { ...current, status: data.status } : current)
  }
  const stopRun = async () => {
    if (!running) return setToast('暂无运行中的任务')
    await api(`/runs/${running.run_id}/stop`, { method: 'POST' })
    setRunning((current) => current ? { ...current, status: 'STOPPING' } : current)
    setToast('正在安全停止，已采集的浏览器证据会保留')
  }

  const nav: { key: ViewName; label: string; icon: ComponentType<{ size?: number }>; count?: number }[] = [
    { key: 'ai', label: 'AI 工作台', icon: Sparkles },
    { key: 'brain', label: '项目智能中心', icon: BrainCircuit },
    { key: 'cases', label: '测试资产', icon: ClipboardList, count: cases.length },
    { key: 'runs', label: '执行中心', icon: Play, count: runs.length },
    { key: 'defects', label: '缺陷草稿', icon: Bug, count: runs.filter((item) => item.status === 'FAIL').length },
    { key: 'ci', label: '持续集成', icon: GitBranch },
    { key: 'settings', label: '设置', icon: Settings },
  ]
  const closeEditorView = (target: ViewName) => {
    if (target === 'ai') return
    setOpenViews((items) => {
      const targetIndex = items.indexOf(target)
      const nextItems = items.filter((item) => item !== target)
      if (view === target) setView(nextItems[Math.max(0, targetIndex - 1)] || 'ai')
      return nextItems.length ? nextItems : ['ai']
    })
  }

  const commands: CommandItem[] = [
    ...nav.map((item) => ({ id: `view-${item.key}`, label: `打开${item.label}`, detail: '导航到工作区', category: '导航', icon: <item.icon size={15}/>, keywords: item.key, run: () => setView(item.key) })),
    { id: 'import-cases', label: '导入测试用例', detail: '进入测试资产并自动检查执行准备度', category: '测试', icon: <FilePlus2 size={15}/>, run: () => setView('cases') },
    { id: 'run-center', label: '打开执行中心', detail: activeEnvironment?.name || '请先配置执行环境', category: '执行', icon: <Play size={15}/>, run: () => setView('runs') },
    { id: 'legacy-runs', label: '打开高级运行记录', detail: '查看底层 Playwright Run、Trace 与定位修复', category: '高级', icon: <History size={15}/>, run: () => setView('legacyRuns') },
    { id: 'test-suites', label: '打开测试套件', detail: '组织冒烟、回归、验收和探索式范围', category: '测试', icon: <Layers3 size={15}/>, run: () => setView('suites') },
    { id: 'test-sessions', label: '打开测试会话', detail: '执行人工、自动化、混合和探索式测试', category: '测试', icon: <ClipboardList size={15}/>, run: () => setView('sessions') },
    { id: 'regression', label: '打开回归测试', detail: '管理回归计划、失败重跑和历史结果', category: '测试', icon: <Radio size={15}/>, run: () => setView('regression') },
    { id: 'automation-flows', label: '打开自动化流程', detail: '编辑、调试和运行 Playwright 流程', category: '高级', icon: <Workflow size={15}/>, run: () => setView('flows') },
    { id: 'element-assets', label: '打开元素资产', detail: '维护定位器、健康度和自愈记录', category: '高级', icon: <Target size={15}/>, run: () => setView('elements') },
    { id: 'quality-intelligence', label: '打开质量智能', detail: '查看覆盖、稳定性、风险和失败趋势', category: '分析', icon: <Activity size={15}/>, run: () => setView('intelligence') },
    { id: 'test-environments', label: '打开测试环境', detail: '配置地址、浏览器、变量和安全门禁', category: '设置', icon: <ShieldCheck size={15}/>, run: () => setView('environments') },
    { id: 'defect-center', label: '审核缺陷草稿', detail: '根据真实失败生成 TAPD 五字段', category: '缺陷', icon: <Bug size={15}/>, run: () => setView('defects') },
    { id: 'ai', label: '打开 Lodestar', detail: '分析用例、执行证据与失败原因', category: 'AI', icon: <Sparkles size={15}/>, run: () => setView('ai') },
    ...cases.slice(0, 12).map((item) => ({ id: `case-${item.case_id}`, label: item.title, detail: `${item.case_id} · ${item.module || '未分组'}`, category: '用例', icon: <TestTube2 size={15}/>, keywords: `${item.case_id} ${(item.tags || []).join(' ')}`, run: () => setView('cases') })),
  ]

  const desktopMenus: { name: AppMenuName; label: string; items: DesktopMenuItem[] }[] = [
    { name: 'file', label: '文件(F)', items: [
      { label: '新建项目', icon: <Plus size={14}/>, run: createProject },
      { label: '导入测试用例', icon: <FilePlus2 size={14}/>, run: () => setView('cases') },
      { label: '打开持续集成', icon: <GitBranch size={14}/>, run: () => setView('ci') },
    ] },
    { name: 'edit', label: '编辑(E)', items: [
      { label: '打开命令中心', icon: <Command size={14}/>, shortcut: 'Ctrl+K', run: () => setCommandOpen(true) },
      { label: '首选项', icon: <Settings size={14}/>, run: () => setView('settings') },
    ] },
    { name: 'view', label: '视图(V)', items: [
      { label: 'AI 工作台', icon: <Sparkles size={14}/>, run: () => setView('ai') },
      { label: '测试资产', icon: <ClipboardList size={14}/>, run: () => setView('cases') },
      { label: '执行中心', icon: <Play size={14}/>, run: () => setView('runs') },
      { label: '缺陷草稿', icon: <Bug size={14}/>, run: () => setView('defects') },
    ] },
    { name: 'run', label: '运行(R)', items: [
      { label: '导入并执行', icon: <Play size={14}/>, run: () => setView('cases') },
      { label: '查看执行记录', icon: <History size={14}/>, run: () => setView('runs') },
      { label: '配置 CI 门禁', icon: <GitBranch size={14}/>, run: () => setView('ci') },
    ] },
    { name: 'help', label: '帮助(H)', items: [
      { label: '设置与诊断', icon: <Activity size={14}/>, run: () => setView('settings') },
      { label: '关于 Lodestar', icon: <CircleDot size={14}/>, run: () => setToast('Lodestar 1.0.0') },
    ] },
  ]

  return <div className="studio-shell">
    <header className="toolbar native-titlebar" data-tauri-drag-region>
      <button className="klein-brand" onClick={() => setView('ai')} title="返回 Lodestar AI 工作台"><LodestarMark/><strong>Lodestar</strong><i className={connection === '已连接' ? 'online' : ''}/></button>
      <button type="button" className="icon-button sidebar-visibility-toggle" onClick={() => setLeftSidebarOpen((open) => !open)} aria-label={leftSidebarOpen ? '收起左侧导航' : '展开左侧导航'} title={leftSidebarOpen ? '收起左侧导航' : '展开左侧导航'}>{leftSidebarOpen ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}</button>
      <nav className="desktop-menu-strip" aria-label="应用菜单">{desktopMenus.map((menu) => <DesktopMenu key={menu.name} {...menu} open={appMenuOpen === menu.name} onToggle={(name) => setAppMenuOpen((current) => current === name ? null : name)} onClose={() => setAppMenuOpen(null)}/>)}</nav>
      <button className="command-trigger" onClick={() => setCommandOpen(true)}><Search size={14}/><span>搜索用例、执行或命令</span><kbd>Ctrl K</kbd></button>
      <div className="toolbar-right">
        <div className="theme-switcher">
          <button className={`icon-button ${themeMenuOpen ? 'active' : ''}`} title="外观与字号" aria-label="外观与字号" aria-expanded={themeMenuOpen} onClick={() => setThemeMenuOpen((open) => !open)}><Palette size={16}/></button>
          {themeMenuOpen && <button type="button" className="theme-menu-dismiss" aria-label="关闭外观面板" onClick={() => setThemeMenuOpen(false)}/>} 
          {themeMenuOpen && <div className="theme-menu" role="dialog" aria-label="外观与字号">
            <header className="theme-menu-head"><div><small>APPEARANCE</small><strong>工作台外观</strong></div><span>{themeOptions.find((item) => item.id === theme)?.label}</span></header>
            <section className="theme-menu-section"><div className="theme-menu-label"><Palette size={13}/><span>主题</span></div><div className="theme-option-grid">{themeOptions.map((item) => <button type="button" key={item.id} className={theme === item.id ? 'selected' : ''} onClick={() => setTheme(item.id)} title={item.detail}><span className={`theme-swatch ${item.id}`}><i/><i/><i/></span><span><strong>{item.label}</strong><small>{item.detail}</small></span>{theme === item.id && <Check size={14}/>}</button>)}</div></section>
            <div className="theme-compact-controls">
              <section className="theme-menu-section"><div className="theme-menu-label"><Type size={13}/><span>字号</span><strong>{uiScale}%</strong></div><div className="ui-scale-options">{(['100', '110', '120'] as UiScale[]).map((scale) => <button type="button" key={scale} className={uiScale === scale ? 'selected' : ''} onClick={() => setUiScale(scale)}>{scale === '100' ? '标准' : scale === '110' ? '舒适' : '大字'}</button>)}</div></section>
              <section className="theme-menu-section"><div className="theme-menu-label"><Columns3 size={13}/><span>密度</span><strong>{uiDensity === 'compact' ? '紧凑' : uiDensity === 'reading' ? '阅读' : '标准'}</strong></div><div className="ui-density-options">{([{ id: 'compact', label: '紧凑' }, { id: 'comfortable', label: '标准' }, { id: 'reading', label: '阅读' }] as { id: UiDensity; label: string }[]).map((item) => <button type="button" key={item.id} className={uiDensity === item.id ? 'selected' : ''} onClick={() => setUiDensity(item.id)}>{item.label}</button>)}</div></section>
            </div>
            <section className="theme-menu-section wallpaper-section"><div className="theme-menu-label"><ImagePlus size={13}/><span>全局壁纸</span><strong>{aiBackground ? `${aiBackgroundOpacity}%` : '未设置'}</strong></div><div className={`ai-background-control ${aiBackground ? 'has-image' : ''}`} style={aiBackground ? { backgroundImage: `linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.28)), url("${aiBackground}")` } : undefined}><div><strong>{aiBackground ? '壁纸已启用' : '选择工作台壁纸'}</strong><small>{aiBackground ? '全局自适应显示，文件保存在 D 盘。' : '支持 PNG、JPEG 与 WebP。'}</small></div><label><ImagePlus size={13}/>{aiBackground ? '更换' : '选择'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { uploadAiBackground(event.target.files?.[0]); event.currentTarget.value = '' }}/></label>{aiBackground && <button type="button" className="ai-background-clear" onClick={() => void clearAiBackground()}><X size={13}/>清除</button>}</div>{aiBackground && <div className="wallpaper-inline-controls"><div className="ai-background-fit" aria-label="背景适应方式"><span>显示</span><strong>全屏自适应</strong></div><label className="ai-background-opacity"><span>强度</span><input type="range" min="12" max="85" step="1" value={aiBackgroundOpacity} onChange={(event) => setAiBackgroundOpacity(Number(event.target.value))}/><strong>{aiBackgroundOpacity}%</strong></label></div>}</section>
          </div>}
        </div>
        {view !== 'settings' && <button className={`toolbar-btn ai-panel-toggle ${view === 'ai' || aiPanelOpen ? 'active' : ''}`} onClick={() => view === 'ai' ? undefined : setAiPanelOpen((open) => { const next = !open; if (next && window.innerWidth < 1500) setLeftSidebarOpen(false); return next })} aria-label={view === 'ai' ? 'AI 工作台' : aiPanelOpen ? '收起 AI 协作台' : '展开 AI 协作台'} title={view === 'ai' ? 'AI 工作台' : aiPanelOpen ? '收起 AI 协作台' : '展开 AI 协作台'}>{view !== 'ai' && aiPanelOpen ? <PanelRightClose size={14}/> : view !== 'ai' ? <PanelRightOpen size={14}/> : <Sparkles size={14}/>}<span>{view === 'ai' ? 'AI 工作台' : aiPanelOpen ? '收起 AI' : '展开 AI'}</span></button>}
        <button className="icon-button" title="更多工作台操作" onClick={() => setCommandOpen(true)}><MoreHorizontal size={17}/></button>
        {isTauriDesktop && <div className="native-window-controls">
          <button type="button" onClick={() => void runNativeWindowAction('minimize')} title="最小化" aria-label="最小化"><span className="window-glyph minimize"/></button>
          <button type="button" onClick={() => void runNativeWindowAction('maximize')} title={windowMaximized ? '还原' : '最大化'} aria-label={windowMaximized ? '还原' : '最大化'}><span className={`window-glyph ${windowMaximized ? 'restore' : 'maximize'}`}/></button>
          <button type="button" className="close" onClick={() => void runNativeWindowAction('close')} title="隐藏到系统托盘" aria-label="隐藏到系统托盘"><span className="window-glyph close"/></button>
        </div>}
      </div>
    </header>
    <div className={`workspace studio-workbench view-${view} ${view === 'ai' ? 'ai-home' : ''} ${aiPanelOpen && view !== 'settings' ? 'ai-open' : ''} ${leftSidebarOpen ? '' : 'left-sidebar-collapsed'} ${view === 'settings' ? 'settings-mode' : ''} ${bottomPanelOpen ? 'bottom-panel-open' : ''}`}>
      <aside className="product-sidebar">
        <header className="product-sidebar-head"><LodestarMark/><div><strong>Lodestar</strong></div></header>
        <div className="project-switcher"><button className="project-chip" onClick={() => setProjectMenuOpen((open) => !open)} aria-expanded={projectMenuOpen}><span className="project-dot">{project?.name.slice(0, 1) || 'P'}</span><div><strong>{project?.name || '选择项目'}</strong><small>{activeEnvironment?.base_url || '未配置环境地址'}</small></div><ChevronDown size={14}/></button>{projectMenuOpen && <div className="context-menu project-menu"><div className="context-menu-label">切换项目</div>{projects.map((item) => <div key={item.id} className={`project-menu-row ${project?.id === item.id ? 'selected' : ''}`}><button className="project-menu-select" onClick={() => { setProjectMenuOpen(false); void loadProject(item) }}><span className="project-menu-mark">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.description || '测试项目'}</small></span>{project?.id === item.id && <Check size={14}/>}</button><button className="project-menu-delete" title="删除项目" aria-label={`删除项目 ${item.name}`} onClick={() => { setProjectMenuOpen(false); void removeProject(item) }}><Trash2 size={14}/></button></div>)}<div className="context-menu-separator"/><button onClick={() => { setProjectMenuOpen(false); void createProject() }}><Plus size={14}/><span><strong>创建新项目</strong><small>独立环境、测试资产与执行空间</small></span></button></div>}</div>
        <nav className="klein-core-nav" aria-label="Lodestar 核心工作区">
          {nav.slice(0, 5).map(({ key, label, icon: Icon, count }) => <button key={key} className={`product-nav-item ${view === key ? 'active' : ''}`} onClick={() => setView(key)}><span className="nav-icon"><Icon size={17}/></span><span>{label}</span>{typeof count === 'number' && <em>{count}</em>}</button>)}
        </nav>
        <section className="pipeline-summary">
          <header><span>测试闭环</span><i className={connection === '已连接' ? 'online' : ''}/></header>
          <div><strong>{cases.filter((item) => String(item.steps || '').trim() && String(item.expected || '').trim()).length}</strong><span>可执行</span></div>
          <div><strong>{runs.filter((item) => item.status === 'FAIL').length}</strong><span>失败待审</span></div>
          <div><strong>{incompleteCaseCount}</strong><span>待补全</span></div>
        </section>
        <div className="product-sidebar-spacer"/>
        {nav.slice(5).map(({ key, label, icon: Icon }) => <button key={key} className={`product-nav-item product-settings ${view === key ? 'active' : ''}`} onClick={() => setView(key)}><span className="nav-icon"><Icon size={17}/></span><span>{label}</span></button>)}
      </aside>
      {view !== 'ai' && <section className="editor-group">
        {view !== 'settings' && <nav className="editor-tabs" aria-label="已打开编辑器">
          {openViews.filter((item) => item !== 'ai').map((item) => { const navItem = nav.find((entry) => entry.key === item); const Icon = navItem?.icon || AppWindow; return <button type="button" key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}><Icon size={13}/><span>{viewLabels[item]}</span>{item === 'flows' && flowDirty && <i title="有未保存的修改"/>}<em role="button" tabIndex={0} aria-label={`关闭 ${viewLabels[item]}`} onClick={(event) => { event.stopPropagation(); closeEditorView(item) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); closeEditorView(item) } }}><X size={12}/></em></button> })}
          <span className="editor-tabs-spacer"/><button type="button" className="editor-more" onClick={() => setCommandOpen(true)} title="显示所有编辑器" aria-label="显示所有编辑器"><MoreHorizontal size={15}/></button>
        </nav>}
        <main className="main-panel">
        {view === 'dashboard' && <CommandDeck project={project} flow={flow} runs={runs} environments={environments} flows={flows} cases={cases} elements={elements} onNavigate={setView} />}
        {view !== 'settings' && <RuntimeBanner />}
        {view === 'dashboard' && <DashboardView project={project} flow={flow} flows={flows} cases={cases} plans={plans} runs={runs} elements={elements} environments={environments} onNavigate={setView} onCreateProject={() => void createProject()} />}
        {view === 'brain' && <ProjectBrainView projectId={project?.id || ''} onNavigate={setView}/>} 
        {view === 'intelligence' && <TestingIntelligenceView cases={cases} flows={flows} runs={runs} elements={elements} environments={environments} onNavigate={setView} />}
        {view === 'sessions' && <TestSessionsView projectId={project?.id || ''} cases={cases} environments={environments} launch={sessionLaunch} onNavigate={setView} onOpenRegression={(sessionName, caseIds) => { setRegressionLaunch({ id: Date.now(), sessionName, caseIds }); setView('regression') }} onOpenAi={(prompt) => { setAiPanelOpen(true); setAiLaunch({ id: Date.now(), mode: 'plan', prompt }) }} />}
        {view === 'suites' && <TestSuitesView projectId={project?.id || ''} cases={cases} environments={environments} onOpenAi={(prompt) => { setAiPanelOpen(true); setAiLaunch({ id: Date.now(), mode: 'plan', prompt }) }} onNavigate={setView} onStartSession={(suite) => { setSessionLaunch({ id: Date.now(), suiteId: suite.id, suiteName: suite.name, version: suite.version, objective: suite.description, caseIds: suite.caseIds, mode: suite.kind === 'exploratory' ? 'exploratory' : 'mixed', environment: environments[0]?.name || '' }); setView('sessions') }} />}
        {view === 'cases' && <CasesCenterView projectId={project?.id || ''} cases={cases} flows={flows} onChanged={(next) => setCases(next)} onAiGenerate={(id) => void aiGenerateFlow(id)} autoBatch={autoBatch} onAutoGenerateBatch={() => void autoGenerateBatch()} agentRun={agentRun} onAgentRun={(id) => void agentRunCase(id)} onSelectedCaseChange={(item) => setSelectedCaseId(item?.case_id || '')} onNavigate={setView} />}
        {view === 'defects' && <DefectDraftsView projectId={project?.id || ''} runs={runs} flows={flows} cases={cases} onOpenEvidence={() => setView('runs')} onOpenAi={(prompt) => { setAiPanelOpen(true); setAiLaunch({ id: Date.now(), mode: 'diagnose', prompt }) }}/>} 
        {view === 'ci' && <CiWorkspace project={project} cases={cases} environments={environments} runs={runs} onNavigate={setView}/>} 
        {view === 'regression' && <RegressionCenterView projectId={project?.id || ''} plans={plans} cases={cases} environments={environments} runs={regressionRuns} selectedRun={selectedRegressionRun} caseResults={regressionCaseResults} launch={regressionLaunch} onNavigate={setView} onSelectRun={async (id) => { setSelectedRegressionRun(id); if (id) setRegressionCaseResults(await api<RegressionCaseResult[]>(`/regression-runs/${id}/cases`)); else setRegressionCaseResults([]) }} onPlansChanged={setPlans} onRunsChanged={setRegressionRuns} />}
        {view === 'flows' && <><div className="panel-header"><div><div className="eyebrow">流程编辑器 / {flow?.engine || 'Playwright'} · {recordingStatus}</div><select className="flow-select" value={flow?.flow_id || ''} onChange={(event) => { if (event.target.value) void selectFlowById(event.target.value) }}><option value="">选择自动化流程</option>{flows.map((item) => <option key={item.flow_id} value={item.flow_id}>{item.name}</option>)}</select><h1>{flow?.name || '自动化流程'} {flowDirty && <span className="unsaved-badge">未保存</span>}</h1><p>{flow?.description || '录制、编辑并执行你的 Web 自动化流程'}{projectLoading ? ' · 正在加载项目…' : ''}</p></div><div className="header-actions"><button className={`preflight-trigger ${preflightFindings.some((item) => item.severity === 'error') ? 'blocked' : preflightFindings.some((item) => item.severity === 'warning') ? 'warning' : 'ready'}`} disabled={!flow} onClick={() => setPreflightOpen((open) => !open)} title="执行前静态检查" aria-label={`执行前静态检查，${preflightFindings.filter((item) => item.severity !== 'info').length || 0} 个问题`}><ShieldCheck size={15}/><span>{preflightFindings.filter((item) => item.severity !== 'info').length || '通过'}</span></button><button className="icon-button" disabled={!flow} onClick={() => setFlowHistoryOpen(true)} title="流程版本历史" aria-label="流程版本历史"><History size={16}/></button><button onClick={() => void createFlow()} className="outline-btn">＋ 新建流程</button><button onClick={() => void saveFlow()} className="outline-btn" disabled={!flow || !flowDirty}>保存流程</button></div></div>
          {preflightOpen && <PreflightPanel findings={preflightFindings} onClose={() => setPreflightOpen(false)} onSelectStep={(stepNo) => { setSelectedStep(stepNo - 1); setPreflightOpen(false) }} />}
          <div className="editor-toolbar"><span className="step-count">步骤 <b>{flow?.steps.length || 0}</b>{stepQuery && <small> · 匹配 {visibleStepIndexes.length}</small>}</span><label className="step-search"><Search size={13}/><input value={stepQuery} onChange={(event) => setStepQuery(event.target.value)} placeholder="筛选步骤…" aria-label="筛选流程步骤"/>{stepQuery && <button type="button" onClick={() => setStepQuery('')} aria-label="清除筛选"><X size={12}/></button>}</label><button onClick={addStep}>＋ 添加步骤</button><button onClick={duplicateStep} disabled={!step}>复制步骤</button><button onClick={() => void deleteFlow()} disabled={!flow}>删除流程</button><button onClick={deleteStep} disabled={!step}>删除步骤</button><span className="toolbar-divider"/><label className="range-control">从 <input type="number" min="1" value={fromStep} onChange={(e) => setFromStep(Number(e.target.value) || 1)}/></label><label className="range-control">到 <input type="number" min="1" placeholder="末尾" value={toStep || ''} onChange={(e) => setToStep(e.target.value ? Number(e.target.value) : undefined)}/></label><button onClick={() => { if (!step) return; const no = selectedStep + 1; setBreakpoints((items) => items.includes(no) ? items.filter((item) => item !== no) : [...items, no]); setToast(breakpoints.includes(no) ? '已取消断点' : `已在第 ${no} 步设置断点`) }} className="muted-btn">{step && breakpoints.includes(selectedStep + 1) ? '🔴 取消断点' : '◌ 设置断点'}</button><span className="breakpoint-summary">断点 {breakpoints.length}</span></div>
          <div className="flow-editor"><div className="step-list">{visibleStepIndexes.map(({ item, index }) => <button key={item.id} draggable className={`step-row ${selectedStep === index ? 'selected' : ''} ${item.disabled ? 'disabled' : ''}`} onClick={() => setSelectedStep(index)} onDragStart={(event) => event.dataTransfer.setData('text/step-index', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const from = Number(event.dataTransfer.getData('text/step-index')); if (Number.isInteger(from)) moveStep(from, index) }}><span className="drag">⠿</span><span className="step-number">{String(index + 1).padStart(2, '0')}</span><span className="step-icon">{item.action === 'click' ? '↗' : item.action === 'fill' ? '⌨' : item.action === 'open' ? '↳' : item.action.startsWith('assert') ? '✓' : '◌'}</span><span className="step-main"><strong>{item.name}</strong><small>{labels[item.action] || item.action}{item.element_id ? ` · ${item.element_id}` : ''}</small></span><span className="step-state">{item.disabled ? '已禁用' : '就绪'}</span></button>)}{flow?.steps.length === 0 && <div className="editor-empty"><div className="empty-orbit">＋</div><h3>还没有自动化步骤</h3><p>开始录制或点击“添加步骤”创建第一步</p></div>}{flow?.steps.length > 0 && !visibleStepIndexes.length && <div className="editor-empty"><div className="empty-orbit"><Search size={18}/></div><h3>没有匹配的步骤</h3><p>尝试搜索步骤名称、动作或元素编号</p></div>}</div><div className="timeline-canvas">{step ? <><div className="timeline-heading"><span>步骤 {String(selectedStep + 1).padStart(2, '0')}</span><strong>{step.name || '未命名步骤'}</strong><span className={`step-badge ${step.disabled ? 'disabled' : ''}`}>{step.disabled ? '已禁用' : labels[step.action] || step.action}</span></div><div className="step-form-grid"><label>步骤名称<input value={step.name} onChange={(e) => updateStep({ name: e.target.value })}/></label><label>动作<select value={step.action} onChange={(e) => updateStep({ action: e.target.value })}>{Object.entries(labels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label><label>页面元素<select value={step.element_id || ''} onChange={(e) => updateStep({ element_id: e.target.value })}><option value="">无需元素</option>{elements.map((item) => <option key={item.element_id} value={item.element_id}>{item.name}</option>)}</select></label><label className="wide-field">输入值 / 断言期望<textarea value={step.action.startsWith('assert') ? (step.expected || '') : (step.value || '')} onChange={(e) => step.action.startsWith('assert') ? updateStep({ expected: e.target.value }) : updateStep({ value: e.target.value })} placeholder="支持 ${变量名}"/></label><label>超时（毫秒）<input type="number" min="100" value={step.timeout || 15000} onChange={(e) => updateStep({ timeout: Number(e.target.value) })}/></label><label>重试次数<input type="number" min="0" max="5" value={step.retries || 0} onChange={(e) => updateStep({ retries: Number(e.target.value) })}/></label></div><div className="step-options"><label><input type="checkbox" checked={Boolean(step.screenshot)} onChange={(e) => updateStep({ screenshot: e.target.checked })}/>失败/成功截图</label><label><input type="checkbox" checked={Boolean(step.disabled)} onChange={(e) => updateStep({ disabled: e.target.checked })}/>禁用此步骤</label><button className="outline-btn" onClick={() => running ? void api(`/runs/${running.run_id}/step`, { method: 'POST' }) : setToast('请先执行并暂停流程')}>执行当前步骤</button></div></> : <div className="editor-empty"><div className="empty-orbit">✦</div><h3>选择一个步骤</h3><p>从左侧时间线选择步骤，在这里编辑动作、元素和断言</p></div>}</div></div>
          {showFlowVars && flow && <div className="case-editor"><div className="section-title">{'流程变量（保存流程后执行生效）'} <button className="small-link" onClick={() => setShowFlowVars(false)}>关闭</button></div><textarea style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: 12 }} defaultValue={JSON.stringify(flow.variables || {}, null, 2)} onBlur={(event) => { try { const parsed = JSON.parse(event.target.value || '{}'); setFlow({ ...flow, variables: parsed }); setToast('流程变量已更新，保存流程后生效') } catch { setToast('流程变量 JSON 格式无效') } }} /></div>}
          {showDataSets && flow && <div className="case-editor dataset-editor"><div className="section-title"><span>测试数据集</span><small>运行时变量会覆盖同名环境变量</small><button className="small-link" onClick={() => setShowDataSets(false)}>关闭</button></div><div className="dataset-layout"><div className="dataset-list">{flowDataSets.map((item) => <button key={item.id} className={selectedDataSetId === item.id ? 'selected' : ''} onClick={() => selectDataSet(item.id)}><strong>{item.name}</strong><small>{Object.keys(item.variables).length} 个变量</small></button>)}{!flowDataSets.length && <span className="dataset-empty">还没有数据集</span>}</div><div className="dataset-form">{selectedDataSetId ? <><div className="dataset-form-head"><strong>{flowDataSets.find((item) => item.id === selectedDataSetId)?.name}</strong><div><button className="small-link" onClick={() => void renameDataSet()}>重命名</button><button className="small-link danger-link" onClick={() => void deleteDataSet()}>删除</button></div></div><textarea value={dataSetDraft} onChange={(event) => setDataSetDraft(event.target.value)} placeholder={'{"username":"tester","password":"***"}'} spellCheck={false}/><footer><span>JSON 对象 · 支持 ${'{变量名}'}</span><div className="dataset-actions"><button className="outline-btn" disabled={Boolean(batchRun && !batchRun.stopped && batchRun.done < batchRun.total)} onClick={() => void startBatchRun()}>批量执行全部</button><button className="toolbar-btn primary" onClick={() => void saveDataSet()}>保存数据</button></div></footer></> : <div className="dataset-empty large">创建一组数据后，运行流程时可选择它</div>}</div></div></div>}
          {batchRun && <section className={`batch-run-card ${batchRun.stopped ? 'stopped' : batchRun.done >= batchRun.total ? 'complete' : ''}`}><header><div><span>DATASET BATCH RUN</span><strong>{batchRun.done >= batchRun.total ? (batchRun.stopped ? '批量执行已停止' : '批量执行完成') : '正在批量执行数据集'}</strong></div><div className="batch-run-count"><b>{batchRun.done}</b> / {batchRun.total}</div></header><div className="batch-progress"><i style={{ width: `${batchRun.total ? Math.round(batchRun.done / batchRun.total * 100) : 0}%` }}/></div><div className="batch-run-meta"><span>通过 <strong className="pass-text">{batchRun.passed}</strong></span><span>失败 <strong className="fail-text">{batchRun.failed}</strong></span><span>{batchRun.current ? `当前：${batchRun.current}` : batchRun.done >= batchRun.total ? '已完成' : '等待中'}</span>{batchRun.done < batchRun.total && !batchRun.stopped && <button className="outline-btn danger-outline" onClick={() => void stopBatchRun()}>停止批量执行</button>}</div>{batchRun.results.length > 0 && <div className="batch-results">{batchRun.results.map((item) => <span key={`${item.datasetName}-${item.runId || item.status}`} className={item.status === 'PASS' ? 'pass' : 'fail'}>{item.datasetName} · {item.status}</span>)}</div>}</section>}
          <div className="debug-dock"><button className="muted-btn" onClick={() => setShowFlowVars((visible) => !visible)}>{'流程变量'}</button><button className={`muted-btn ${showDataSets ? 'active' : ''}`} onClick={() => setShowDataSets((visible) => !visible)}>测试数据{flowDataSets.length ? ` · ${flowDataSets.length}` : ''}</button>{flow && <button className="muted-btn" onClick={createDataSet}>＋ 新建数据集</button>}{flowDataSets.length > 0 && <label className="dataset-selector">本次运行<select value={selectedDataSetId} onChange={(event) => selectDataSet(event.target.value)}><option value="">使用环境变量</option>{flowDataSets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<span>调试范围</span><button className="muted-btn" disabled={!step} onClick={() => step && void runFlow({ from: selectedStep + 1 })}>从当前步骤执行</button><button className="muted-btn" disabled={!step} onClick={() => step && void runFlow({ from: 1, to: selectedStep + 1 })}>执行到此步骤</button><button className="muted-btn" disabled={!breakpoints.length} onClick={() => { setBreakpoints([]); setFlow((current) => current ? { ...current, breakpoints: [] } : current); setToast('已清除全部断点') }}>清除断点</button><span>断点 {breakpoints.length} 个</span><span>步骤：{breakpoints.length ? breakpoints.join('、') : '无'}</span></div>
          {step && <div className="policy-dock"><span>执行策略</span><label>风险<select value={step.risk || 'read'} onChange={(event) => updateStep({ risk: event.target.value as Step['risk'] })}><option value="read">只读</option><option value="write">写入</option><option value="destructive">危险</option></select></label><label><input type="checkbox" checked={Boolean(step.continue_on_failure)} onChange={(event) => updateStep({ continue_on_failure: event.target.checked })}/> 失败后继续</label><label><input type="checkbox" checked={Boolean(step.screenshot)} onChange={(event) => updateStep({ screenshot: event.target.checked })}/> 截图</label></div>}
          <div className="console"><div className="console-tabs"><button type="button" className="active" onClick={() => { setBottomPanelTab('output'); setBottomPanelOpen(true) }}>输出</button><button type="button" onClick={() => { setBottomPanelTab('problems'); setBottomPanelOpen(true) }}>问题 <i>{workbenchProblemCount}</i></button><button type="button" onClick={() => { setBottomPanelTab('debug'); setBottomPanelOpen(true) }}>调试状态</button><span className="console-status">{running ? '● 执行中' : '● 就绪'}</span></div><div className="console-body"><span className="prompt">$</span><span> Lodestar 已就绪 · {flow?.steps.length || 0} 个步骤 · {activeEnvironment?.name || '未配置环境'}</span><button type="button" className="small-link" onClick={() => { setBottomPanelTab('output'); setBottomPanelOpen(true) }}>打开面板</button></div></div></>}
        {view === 'elements' && <ElementsView elements={elements} projectId={project?.id || ''} onChanged={setElements} />}
        {view === 'runs' && <MissionCenterView projectId={project?.id || ''} cases={cases} environments={environments} onOpenRun={(runId) => { setLegacyRunId(runId); setView('legacyRuns') }} onConfigureEnvironment={() => setView('environments')} onOpenDefects={() => setView('defects')}/>} 
        {view === 'legacyRuns' && <RunsCenterView projectId={project?.id || ''} cases={cases} runs={runs} running={running} flows={flows} environments={environments} initialRunId={legacyRunId || initialRunId} onAiDiagnose={(prompt) => { setAiPanelOpen(true); setAiLaunch({ id: Date.now(), mode: 'diagnose', prompt }) }} onRunRange={runEvidenceStep} onOpenDefects={() => setView('defects')} onConfigureEnvironment={() => setView('environments')} onHealingResolved={() => project ? void api<ElementAsset[]>(`/projects/${project.id}/elements`).then(setElements) : undefined} />}
        {view === 'environments' && <EnvironmentsView projectId={project?.id || ''} environments={environments} onChanged={setEnvironments} />}
        {view === 'settings' && <SettingsWorkspace aiConfig={aiConfig} onAiConfigChange={setAiConfig} theme={theme} onThemeChange={setTheme} uiScale={uiScale} onUiScaleChange={setUiScale} uiDensity={uiDensity} onUiDensityChange={setUiDensity} projectId={project?.id || ''} projectCount={projects.length} caseCount={cases.length} flowCount={flows.length} runCount={runs.length} planCount={plans.length} onOpenEnvironments={() => setView('environments')} onOpenAi={(prompt) => { setAiLaunch({ id: Date.now(), mode: 'chat', prompt }); setView('ai') }} onImported={async () => { const items = await api<Project[]>('/projects'); setProjects(items); if (items[0]) await loadProject(items[0]) }} />}
        </main>
        {bottomPanelOpen && <section className="bottom-panel" aria-label="底部面板">
          <header className="bottom-panel-tabs">
            {(['problems', 'output', 'debug'] as BottomPanelTab[]).map((item) => <button type="button" key={item} className={bottomPanelTab === item ? 'active' : ''} onClick={() => setBottomPanelTab(item)}>{item === 'problems' ? <>问题 <em>{workbenchProblemCount}</em></> : item === 'output' ? '输出' : '调试控制台'}</button>)}
            <span/><button type="button" onClick={() => setBottomPanelOpen(false)} title="关闭面板" aria-label="关闭面板"><X size={14}/></button>
          </header>
          <div className="bottom-panel-body">
            {bottomPanelTab === 'problems' && <div className="problems-view">
              {!activeEnvironment && <button type="button" onClick={() => setView('environments')}><AlertTriangle size={14}/><span><strong>当前项目没有可用测试环境</strong><small>配置环境地址、浏览器和安全策略后才能稳定执行。</small></span><em>环境</em></button>}
              {preflightFindings.filter((item) => item.severity !== 'info').map((item) => <button type="button" key={item.id} onClick={() => { if (item.stepNo) { setView('flows'); setSelectedStep(item.stepNo - 1) } }}><AlertTriangle size={14}/><span><strong>{item.title}</strong><small>{item.detail}</small></span><em>{item.stepNo ? `步骤 ${item.stepNo}` : '流程'}</em></button>)}
              {incompleteCaseCount > 0 && <button type="button" onClick={() => setView('cases')}><TestTube2 size={14}/><span><strong>{incompleteCaseCount} 条用例定义不完整</strong><small>操作步骤或预期结果缺失，会影响人工执行和 AI 理解。</small></span><em>测试用例</em></button>}
              {workbenchProblemCount === 0 && <div className="bottom-empty"><CheckCircle2 size={18}/><span>未检测到工作区问题</span></div>}
            </div>}
            {bottomPanelTab === 'output' && <div className="output-view"><p><span>[workspace]</span> 项目 {project?.name || '未选择'} 已加载</p><p><span>[service]</span> 实时服务 {connection}</p><p><span>[assets]</span> {cases.length} 条用例 · {flows.length} 条流程 · {runs.length} 次执行</p><p><span>[latest]</span> {toast || (runs[0] ? `${runs[0].status} · ${runs[0].run_id}` : '等待执行任务')}</p></div>}
            {bottomPanelTab === 'debug' && <div className="debug-console-view"><div><span>运行状态</span><strong>{running?.status || 'IDLE'}</strong></div><div><span>当前流程</span><strong>{flow?.name || '未选择'}</strong></div><div><span>调试范围</span><strong>{fromStep} → {toStep || flow?.steps.length || 0}</strong></div><div><span>断点</span><strong>{breakpoints.length ? breakpoints.join('、') : '无'}</strong></div></div>}
          </div>
        </section>}
      </section>}
      {view === 'flows' && <aside className="inspector"><div className="inspector-head"><span>检查器</span><span className="inspector-dots">•••</span></div>{step ? <><div className="inspector-section"><label>步骤名称</label><input value={step.name} onChange={(event) => updateStep({ name: event.target.value })}/></div><div className="inspector-section"><label>动作</label><select value={step.action} onChange={(event) => updateStep({ action: event.target.value })}>{Object.entries(labels).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div><div className="inspector-section"><label>页面元素 <button type="button" className="small-link" onClick={() => setView('elements')}>管理元素</button></label><select value={step.element_id || ''} onChange={(event) => updateStep({ element_id: event.target.value })}><option value="">选择页面元素</option>{elements.map((item) => <option key={item.element_id} value={item.element_id}>{item.name}</option>)}</select></div><div className="inspector-section"><label>输入值 / 期望值</label><textarea value={step.expected || step.value || ''} onChange={(event) => updateStep({ value: event.target.value, expected: step.action.startsWith('assert') ? event.target.value : step.expected })} placeholder="支持 ${变量名}"/></div><div className="inspector-grid"><div><label>超时</label><input type="number" value={step.timeout || 15000} onChange={(event) => updateStep({ timeout: Number(event.target.value) })}/></div><div><label>重试</label><input type="number" value={step.retries || 0} onChange={(event) => updateStep({ retries: Number(event.target.value) })}/></div></div><div className="toggle-line"><span>失败截图</span><button className={`toggle ${step.screenshot ? 'on' : ''}`} onClick={() => updateStep({ screenshot: !step.screenshot })}><span/></button></div><div className="toggle-line"><span>禁用步骤</span><button className={`toggle ${step.disabled ? 'on' : ''}`} onClick={() => updateStep({ disabled: !step.disabled })}><span/></button></div></> : <div className="inspector-placeholder">选择一个步骤查看属性</div>}</aside>}
      {view === 'flows' && <FlowVersionDrawer open={flowHistoryOpen} flow={flow} onClose={() => setFlowHistoryOpen(false)} onRestored={(restored) => { setFlow(restored); setBreakpoints(restored.breakpoints || []); setFlows((items) => [restored, ...items.filter((item) => item.flow_id !== restored.flow_id)]); setToast('历史版本已恢复为当前流程') }} />}
      <AiChatPanel visible={view === 'ai' || (aiPanelOpen && view !== 'settings')} homeMode={view === 'ai'} width={aiPanelWidth} onWidthChange={(next) => { setAiPanelWidth(next); window.localStorage.setItem('automation-studio.ai-panel-width', String(next)) }} aiConfig={aiConfig} launch={aiLaunch} currentFlow={flow} onApplyFlowPatch={applyAiFlowPatch} context={{ project: project?.name, view, editor: { active: viewLabels[view], open: openViews.map((item) => viewLabels[item]) }, flow: flow ? { id: flow.flow_id, name: flow.name, steps: flow.steps.length, dirty: flowDirty } : null, selectedStep: step ? { number: selectedStep + 1, name: step.name, action: step.action } : null, selectedCase: selectedCase ? { id: selectedCase.case_id, title: selectedCase.title, module: selectedCase.module, priority: selectedCase.priority, steps: selectedCase.steps || '', expected: selectedCase.expected || '', automationFlowId: selectedCase.automation_flow_id || '' } : null, environment: activeEnvironment ? { name: activeEnvironment.name, base_url: activeEnvironment.base_url, read_only: activeEnvironment.read_only } : null, recentRun: runs[0] ? { id: runs[0].run_id, status: runs[0].status, error: runs[0].error_message || '' } : null, problems: { total: workbenchProblemCount, flow: preflightFindings.filter((item) => item.severity !== 'info').map((item) => ({ severity: item.severity, title: item.title, detail: item.detail, step: item.stepNo })), incompleteCases: incompleteCaseCount }, stats: { cases: cases.length, flows: flows.length, runs: runs.length, plans: plans.length } }} onClose={() => setAiPanelOpen(false)} onOpenSettings={() => { setAiPanelOpen(false); setView('settings') }} onAction={async (action) => { if (action.action === 'navigate' && action.target) setView(action.target as typeof view); if (action.action === 'select_step' && action.step && flow) { setView('flows'); setSelectedStep(Math.max(0, Math.min(flow.steps.length - 1, action.step - 1))) } if (action.action === 'save_flow') await saveFlow(); if (action.action === 'run_flow') await runFlow() }} />
    </div>
    {toast && <div className={`toast ${/失败|错误|未启动|无效/.test(toast) ? 'error' : ''}`} role="status"><span className="toast-icon">{/失败|错误|未启动|无效/.test(toast) ? <Bug size={16}/> : <Check size={16}/>}</span><div><strong>{/失败|错误|未启动|无效/.test(toast) ? '操作未完成' : '操作完成'}</strong><p>{toast}</p></div><button className="icon-button" onClick={() => setToast('')} title="关闭"><X size={14}/></button></div>}
    <CommandPalette open={commandOpen} items={commands} onClose={() => setCommandOpen(false)} />
    {contextMenu && <div className="klein-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label="Lodestar 右键菜单">
      <button type="button" disabled={!contextMenu.hasSelection} onClick={() => void copyContextSelection()}><span>复制</span><kbd>Ctrl+C</kbd></button>
      {contextMenu.editable && <button type="button" disabled={!contextMenu.hasSelection} onClick={() => void copyContextSelection(true)}><span>剪切</span><kbd>Ctrl+X</kbd></button>}
      {contextMenu.editable && <button type="button" onClick={() => void pasteContextSelection()}><span>粘贴</span><kbd>Ctrl+V</kbd></button>}
      <div/>
      <button type="button" onClick={selectContextTarget}><span>全选</span><kbd>Ctrl+A</kbd></button>
    </div>}
  </div>
}

function CommandPalette({ open, items, onClose }: { open: boolean; items: CommandItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const normalized = query.trim().toLowerCase()
  const visible = items.filter((item) => !normalized || `${item.label} ${item.detail} ${item.category} ${item.keywords || ''}`.toLowerCase().includes(normalized)).slice(0, 24)

  useEffect(() => {
    if (!open) return
    setQuery(''); setActiveIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  if (!open) return null
  const execute = (item: CommandItem) => { onClose(); void item.run() }

  return <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="命令中心">
      <header><Search size={17}/><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, visible.length - 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) } if (event.key === 'Enter' && visible[activeIndex]) execute(visible[activeIndex]); if (event.key === 'Escape') onClose() }} placeholder="输入命令，或搜索流程、用例、元素..."/><kbd>ESC</kbd></header>
      <div className="command-results">{visible.map((item, index) => <button key={item.id} className={activeIndex === index ? 'active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(item)}><span className="command-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><em>{item.category}</em></button>)}{!visible.length && <div className="command-empty"><Search size={22}/><strong>没有匹配的命令或资产</strong><span>可搜索名称、编号、模块、标签或定位器</span></div>}</div>
      <footer><span><kbd>↑↓</kbd>选择</span><span><kbd>Enter</kbd>执行</span><span><kbd>Esc</kbd>关闭</span><em>{visible.length} 个结果</em></footer>
    </section>
  </div>
}

function FlowVersionDrawer({ open, flow, onClose, onRestored }: { open: boolean; flow: Flow | null; onClose: () => void; onRestored: (flow: Flow) => void }) {
  const dialog = useDialog()
  const [versions, setVersions] = useState<FlowVersion[]>([])
  const [busyId, setBusyId] = useState('')
  useEffect(() => {
    if (!open || !flow) return
    void api<FlowVersion[]>(`/flows/${flow.flow_id}/versions`).then(setVersions).catch(() => setVersions([]))
  }, [open, flow?.flow_id])
  if (!open) return null
  const restore = async (version: FlowVersion) => {
    if (!await dialog.confirm(`将当前流程恢复到版本 ${version.version_no}。恢复前会自动保留当前状态。`, { title: '恢复流程版本', confirmLabel: '确认恢复' })) return
    setBusyId(version.version_id)
    try {
      const restored = await api<Flow>(`/flow-versions/${version.version_id}/restore`, { method: 'POST' })
      onRestored(restored); onClose()
    } finally { setBusyId('') }
  }
  const sourceLabel: Record<string, string> = { ai: 'AI 修改', restore: '历史恢复', manual: '手动保存' }
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <aside className="flow-version-drawer" aria-label="流程版本历史">
      <header><div><small>FLOW HISTORY</small><strong>版本历史</strong><span>{flow?.name || '当前流程'}</span></div><button className="icon-button" onClick={onClose} title="关闭版本历史"><X size={16}/></button></header>
      <div className="flow-version-current"><GitBranch size={15}/><div><small>当前版本</small><strong>v{flow?.version || 1}</strong></div><span>自动保留修改前快照</span></div>
      <div className="flow-version-list">{versions.map((version) => <article key={version.version_id}><span className="version-node">v{version.version_no}</span><div><strong>{version.label || `版本 ${version.version_no}`}</strong><small>{sourceLabel[version.source] || version.source} · {new Date(version.created_at).toLocaleString('zh-CN')}</small></div><button disabled={Boolean(busyId)} onClick={() => void restore(version)} title={`恢复版本 ${version.version_no}`}><RefreshCw size={13}/>{busyId === version.version_id ? '恢复中' : '恢复'}</button></article>)}{!versions.length && <div className="drawer-empty"><History size={22}/><strong>还没有历史版本</strong><span>保存修改或应用 AI Diff 后会生成快照</span></div>}</div>
      <footer><ShieldCheck size={13}/>恢复不会删除后续版本</footer>
    </aside>
  </div>
}

function PreflightPanel({ findings, onClose, onSelectStep }: { findings: PreflightFinding[]; onClose: () => void; onSelectStep: (stepNo: number) => void }) {
  const errors = findings.filter((item) => item.severity === 'error').length
  const warnings = findings.filter((item) => item.severity === 'warning').length
  return <section className="preflight-panel">
    <header><div><span><ShieldCheck size={14}/>执行前静态检查</span><strong>{errors ? `${errors} 个阻断项` : warnings ? `${warnings} 个警告` : '流程可以执行'}</strong></div><button className="icon-button" onClick={onClose} title="关闭静态检查"><X size={14}/></button></header>
    <div className="preflight-summary"><span className="error"><Bug size={13}/>{errors} 阻断</span><span className="warning"><AlertTriangle size={13}/>{warnings} 警告</span><span><SearchCheck size={13}/>{findings.length - errors - warnings} 通过</span></div>
    <div className="preflight-findings">{findings.map((finding) => <button key={finding.id} className={finding.severity} onClick={() => finding.stepNo && onSelectStep(finding.stepNo)} disabled={!finding.stepNo}><span>{finding.severity === 'error' ? <Bug size={14}/> : finding.severity === 'warning' ? <AlertTriangle size={14}/> : <CheckCircle2 size={14}/>}</span><div><strong>{finding.title}</strong><small>{finding.detail}</small></div>{finding.stepNo && <em>步骤 {finding.stepNo}<ChevronRight size={12}/></em>}</button>)}</div>
    <footer><ShieldCheck size={12}/>检查只分析当前编辑器内容，不修改或执行流程</footer>
  </section>
}

type AiPanelMode = 'chat' | 'plan' | 'build' | 'diagnose'
type AiUiAction = { action: string; target?: string; step?: number }
type AiPlanStatus = 'pending' | 'active' | 'done' | 'skipped'
type AiPlanItem = { id: string; title: string; detail: string; risk: 'low' | 'medium' | 'high'; status: AiPlanStatus }
type AiTaskPlan = { title: string; objective: string; items: AiPlanItem[] }
type AiFlowPatch = { summary: string; steps: Step[]; applied?: boolean }
type AiQuickTask = { title: string; detail: string; prompt: string; mode: AiPanelMode; icon: ComponentType<{ size?: number }>; draft?: boolean }
type AiRuntime = { source: 'external' | 'local'; provider: string; model: string; api_kind: string; base_url: string; duration_ms: number; fallback: boolean; error?: string }
type AiRuntimePhase = 'unverified' | 'connecting' | 'external' | 'local' | 'fallback' | 'error' | 'stopped'
type AiRuntimeState = { phase: AiRuntimePhase; runtime?: AiRuntime; detail?: string }
type AiMessage = { role: 'user' | 'assistant'; text: string; createdAt: number; plan?: AiTaskPlan; patch?: AiFlowPatch; error?: boolean; runtime?: AiRuntime; mode?: AiPanelMode }
type AiSession = { id: string; title: string; project: string; createdAt: number; updatedAt: number; messages: AiMessage[] }

function aiRuntimeState(runtime?: AiRuntime): AiRuntimeState {
  if (!runtime) return { phase: 'unverified' }
  if (runtime.fallback) return { phase: 'fallback', runtime, detail: runtime.error }
  return runtime.source === 'external' ? { phase: 'external', runtime } : { phase: 'local', runtime }
}

const AI_SESSION_STORAGE = 'automation-studio.ai-sessions'
const AI_ACTIVE_SESSION_STORAGE = 'automation-studio.ai-active-session'

function normalizeAiErrorText(value: string) {
  let text = String(value || '').trim()
  for (let index = 0; index < 3 && text.startsWith('{'); index += 1) {
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown; error?: unknown }
      const nestedError = parsed.error && typeof parsed.error === 'object'
        ? (parsed.error as { message?: unknown }).message
        : parsed.error
      const next = parsed.detail ?? parsed.message ?? nestedError
      if (typeof next !== 'string' || !next.trim() || next.trim() === text) break
      text = next.trim()
    } catch { break }
  }
  return text.replace(/^(?:AI\s*对话失败[：:]\s*){2,}/, 'AI 对话失败：')
}

function normalizeAiBrandText(value: string) {
  return String(value || '').replace(/Klein/gi, 'Lodestar')
}

function normalizeAiRuntime(runtime?: AiRuntime) {
  if (!runtime) return runtime
  const model = /^(?:klein-local|lodestar-local)$/i.test(runtime.model) ? LOCAL_AI_MODEL : runtime.model
  return { ...runtime, provider: normalizeAiBrandText(runtime.provider), model }
}

function isAiErrorText(value: string) {
  const text = normalizeAiErrorText(value)
  return /^(?:AI\s*对话失败|AI服务响应超时|AI服务请求失败|请求失败|模型连接失败)/.test(text)
}

function loadAiSessions(): AiSession[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(AI_SESSION_STORAGE) || '[]') as AiSession[]
    if (!Array.isArray(parsed)) return []
    // Remove the old desktop-listing fixture that was accidentally left in some local profiles.
    // User-created conversations remain untouched, including other desktop analysis sessions.
    const cleaned = parsed.filter((item) => {
      if (!item?.id || !Array.isArray(item.messages)) return false
      const firstUserMessage = item.messages.find((message) => message.role === 'user')?.text?.trim() || ''
      const hasDesktopFixtureReply = item.messages.some((message) => message.role === 'assistant' && message.text.includes('当前桌面可读取项目'))
      return !(firstUserMessage === '我的桌面有哪些文件？' && hasDesktopFixtureReply)
    })
    if (cleaned.length !== parsed.length) window.localStorage.setItem(AI_SESSION_STORAGE, JSON.stringify(cleaned))
    return cleaned.slice(0, 20).map((session) => ({
      ...session,
      messages: session.messages.map((message) => {
        if (message.role !== 'assistant') return message
        const text = normalizeAiBrandText(normalizeAiErrorText(message.text))
        return { ...message, text, runtime: normalizeAiRuntime(message.runtime), error: message.error ?? isAiErrorText(text) }
      }),
    }))
  } catch { return [] }
}

function aiSessionId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `ai-${Date.now()}`
}

function downloadMarkdown(content: string, title: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) || 'AI回复'}.md`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}

function taskPlanMarkdown(plan?: AiTaskPlan) {
  if (!plan) return ''
  return [`### ${plan.title}`, '', plan.objective, '', ...plan.items.map((item) => `- [${item.status === 'done' ? 'x' : ' '}] ${item.title}（${item.risk === 'high' ? '高风险' : item.risk === 'low' ? '低风险' : '中风险'}）\n  ${item.detail}`), ''].join('\n')
}

function StudioAiGlyph() {
  return <span className="studio-ai-glyph" aria-hidden="true"><img src="/brand/lodestar-icon.png" alt=""/></span>
}

function AiChatPanel({ visible, homeMode, width, onWidthChange, aiConfig, launch, currentFlow, onApplyFlowPatch, context, onClose, onOpenSettings, onAction }: { visible: boolean; homeMode?: boolean; width: number; onWidthChange: (width: number) => void; aiConfig: { base_url: string; api_key: string; model: string }; launch: AiLaunch | null; currentFlow: Flow | null; onApplyFlowPatch: (patch: AiFlowPatch) => Promise<void>; context: Record<string, unknown>; onClose: () => void; onOpenSettings: () => void; onAction: (action: AiUiAction) => Promise<void> }) {
  const storedSessionsRef = useRef(loadAiSessions())
  const storedActiveSession = window.localStorage.getItem(AI_ACTIVE_SESSION_STORAGE) || ''
  const initialActiveSession = storedSessionsRef.current.find((item) => item.id === storedActiveSession) || storedSessionsRef.current[0]
  const initialRuntime = [...(initialActiveSession?.messages || [])].reverse().find((item) => item.role === 'assistant' && item.runtime)?.runtime
  const [sessions, setSessions] = useState<AiSession[]>(storedSessionsRef.current)
  const [activeSessionId, setActiveSessionId] = useState(initialActiveSession?.id || '')
  const [messages, setMessages] = useState<AiMessage[]>(initialActiveSession?.messages || [])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<AiPanelMode>('chat')
  const [pendingActions, setPendingActions] = useState<AiUiAction[]>([])
  const [contextOpen, setContextOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null)
  const [configurationNotice, setConfigurationNotice] = useState('')
  const [runtimeState, setRuntimeState] = useState<AiRuntimeState>(aiRuntimeState(initialRuntime))
  const endRef = useRef<HTMLDivElement | null>(null)
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const localAi = isLocalAiConfig(aiConfig)
  const configurationProblem = localAi ? '' : (!aiConfig.api_key ? '未配置 API Key' : !aiConfig.base_url ? '未配置模型接口地址' : !aiConfig.model ? '未选择 AI 模型' : '')
  const configured = localAi || !configurationProblem
  const actionLabels: Record<string, string> = { navigate: '切换工作区', select_step: '选择流程步骤', save_flow: '保存当前流程', run_flow: '执行当前流程' }
  const currentView = String(context.view || 'dashboard') as ViewName
  const flowContext = context.flow as { name?: string; steps?: number } | null
  const stepContext = context.selectedStep as { number?: number; name?: string; action?: string } | null
  const caseContext = context.selectedCase as { id?: string; title?: string; module?: string; priority?: string; steps?: string; expected?: string } | null
  const problemContext = context.problems as { total?: number; incompleteCases?: number } | null
  const editorContext = context.editor as { active?: string; open?: string[] } | null
  const runContext = context.recentRun as { id?: string; status?: string; error?: string } | null
  const projectName = String(context.project || '未命名项目')
  const activeSession = sessions.find((item) => item.id === activeSessionId)
  const modeMeta = {
    chat: { label: '问答', title: '智能协作', placeholder: '输入问题，或引用当前工作区继续分析' },
    plan: { label: '规划', title: '任务规划', placeholder: '描述目标，AI 将先拆解计划、风险和验收标准' },
    build: { label: '编辑', title: '安全编辑', placeholder: '描述要生成或优化的自动化流程，修改会先进入 Diff 审阅' },
    diagnose: { label: '诊断', title: '证据诊断', placeholder: '让 AI 结合问题、用例和最近运行证据分析根因' },
  } as const
  const quickTasks: AiQuickTask[] = mode === 'chat' ? [
    { title: '需求洞察', detail: '识别业务路径、风险与测试边界', prompt: '请分析下面的需求，提取核心流程、风险、边界条件和可执行测试点：\n\n', mode: 'chat', icon: FileSearch, draft: true },
    { title: '用例审计', detail: '发现覆盖缺口、歧义与不可执行项', prompt: '请审查下面的测试用例，指出漏测、重复、歧义和不可执行项，并给出修订结果：\n\n', mode: 'chat', icon: SearchCheck, draft: true },
    { title: '失败归因', detail: '基于证据排序根因与验证路径', prompt: '请分析下面的失败现象或证据，区分已确认事实与推断，按可能性给出根因和验证步骤：\n\n', mode: 'diagnose', icon: Bug, draft: true },
    { title: '通用协作', detail: '知识问答、代码、写作、翻译与分析', prompt: '', mode: 'chat', icon: MessageSquare, draft: true },
  ] : [
    { title: '规划自动化任务', detail: '拆解目标、风险与执行顺序', prompt: '为当前自动化目标创建一份可以逐项推进的任务计划，优先处理高风险和阻塞项。', mode: 'plan', icon: ClipboardList },
    { title: '生成流程草稿', detail: '补齐步骤、断言与测试数据', prompt: '基于当前页面上下文，为我生成一条结构清晰的自动化流程草稿，包含必要断言和异常路径。', mode: 'build', icon: Workflow },
    { title: '定位器体检', detail: '发现脆弱选择器与等待问题', prompt: '检查当前流程的元素定位和等待策略，指出不稳定点，并给出更可靠的 Playwright 方案。', mode: 'diagnose', icon: SearchCheck },
    { title: '分析最近失败', detail: '给出根因排序与修复步骤', prompt: '分析最近一次自动化执行失败，按可能性排序根因，并给出可以直接操作的排查和修复步骤。', mode: 'diagnose', icon: Bug },
  ]

  useEffect(() => {
    if (!launch) return
    setMode(launch.mode)
    setInput(launch.prompt)
    setHistoryOpen(false)
  }, [launch?.id])

  useEffect(() => {
    window.localStorage.setItem(AI_SESSION_STORAGE, JSON.stringify(sessions.slice(0, 20)))
  }, [sessions])
  useEffect(() => {
    if (activeSessionId) window.localStorage.setItem(AI_ACTIVE_SESSION_STORAGE, activeSessionId)
    else window.localStorage.removeItem(AI_ACTIVE_SESSION_STORAGE)
  }, [activeSessionId])
  useEffect(() => {
    if (!activeSessionId) return
    setSessions((items) => items.map((item) => item.id === activeSessionId ? {
      ...item,
      title: item.title === '新对话' ? (messages.find((message) => message.role === 'user')?.text.trim().slice(0, 28) || item.title) : item.title,
      updatedAt: Date.now(),
      messages,
    } : item).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20))
  }, [activeSessionId, messages])

  useEffect(() => {
    const messageViewport = endRef.current?.parentElement
    if (!messages.length && !busy && !pendingActions.length) {
      messageViewport?.scrollTo({ top: 0 })
      return
    }
    messageViewport?.scrollTo({ top: messageViewport.scrollHeight, behavior: 'smooth' })
  }, [messages, busy, pendingActions])
  useEffect(() => { if (configured) setConfigurationNotice('') }, [configured])
  useEffect(() => {
    const textarea = composerInputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(132, Math.max(42, textarea.scrollHeight))}px`
  }, [input])
  useEffect(() => {
    setRuntimeState(localAi
      ? { phase: 'local', runtime: { source: 'local', provider: 'Lodestar Local', model: LOCAL_AI_MODEL, api_kind: 'local', base_url: LOCAL_AI_BASE_URL, duration_ms: 0, fallback: false } }
      : { phase: 'unverified' })
  }, [aiConfig.base_url, aiConfig.model, localAi])

  const ensureActiveSession = () => {
    if (activeSessionId) return activeSessionId
    const now = Date.now()
    const next: AiSession = { id: aiSessionId(), title: '新对话', project: projectName, createdAt: now, updatedAt: now, messages: [] }
    setSessions((items) => [next, ...items].slice(0, 20))
    setActiveSessionId(next.id)
    return next.id
  }

  const newConversation = () => {
    abortRef.current?.abort()
    setActiveSessionId('')
    setMessages([])
    setPendingActions([])
    setInput('')
    setCopiedMessage(null)
    setHistoryOpen(false)
    setRuntimeState(localAi
      ? { phase: 'local', runtime: { source: 'local', provider: 'Lodestar Local', model: LOCAL_AI_MODEL, api_kind: 'local', base_url: LOCAL_AI_BASE_URL, duration_ms: 0, fallback: false } }
      : { phase: 'unverified' })
  }

  const openSession = (session: AiSession) => {
    abortRef.current?.abort()
    setActiveSessionId(session.id)
    setMessages(session.messages)
    setPendingActions([])
    setInput('')
    setHistoryOpen(false)
    setRuntimeState(aiRuntimeState([...session.messages].reverse().find((item) => item.role === 'assistant' && item.runtime)?.runtime))
  }

  const deleteSession = (sessionId: string) => {
    const remaining = sessions.filter((item) => item.id !== sessionId)
    setSessions(remaining)
    if (sessionId === activeSessionId) {
      const next = remaining[0]
      setActiveSessionId(next?.id || '')
      setMessages(next?.messages || [])
      setPendingActions([])
    }
  }

  const exportConversation = (session = activeSession) => {
    if (!session?.messages.length) return
    const content = [`# ${session.title}`, '', `项目：${session.project}`, ''].concat(session.messages.flatMap((message) => [`## ${message.role === 'user' ? '你' : '自动化助手'}`, '', message.text, '', taskPlanMarkdown(message.plan)])).join('\n')
    downloadMarkdown(content, session.title)
  }

  const beginResize = (event: { preventDefault: () => void; clientX: number }) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    const move = (moveEvent: MouseEvent) => onWidthChange(Math.max(360, Math.min(620, startWidth + startX - moveEvent.clientX)))
    const stop = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', stop) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }

  const send = async (override?: string, modeOverride?: AiPanelMode) => {
    const message = (override ?? input).trim()
    if (!message || busy) return
    if (!configured) {
      setConfigurationNotice(`${configurationProblem}。内容已保留，完成配置后可直接发送。`)
      return
    }
    setConfigurationNotice('')
    const history = messages.slice(-8).map(({ role, text }) => ({ role, text }))
    const controller = new AbortController()
    const activeMode = modeOverride || mode
    const modeGuide = activeMode === 'plan'
      ? '以任务规划模式回答。先给出简洁判断，再在回复末尾单独输出 AUTOMATION_STUDIO_PLAN: 后接 JSON 对象，格式为 {"title":"计划标题","objective":"目标","items":[{"title":"任务","detail":"验收标准","risk":"low|medium|high"}]}，任务数控制在 3 到 8 项，不要声称任务已经执行。'
      : activeMode === 'build' ? '以自动化流程构建模式回答，优先给出可执行步骤、定位器和断言。如果建议修改当前流程，请在回复末尾单独输出 AUTOMATION_STUDIO_FLOW_PATCH: 后接 JSON 对象，格式为 {"summary":"修改摘要","steps":[{"id":"可选","name":"步骤名称","action":"open|click|fill|clear|select|select_value|upload|wait|wait_url|screenshot|assert_text|assert_equals|assert_value|assert_attribute|assert_exists|assert_not_exists|assert_visible|assert_not_visible|assert_enabled|assert_url|assert_title|assert_count|hover|press","element_id":"可选","value":"可选","expected":"可选","timeout":15000,"retries":0,"screenshot":true}]}。必须输出完整的新步骤数组，不要声称已经应用。' : activeMode === 'diagnose' ? '以自动化失败诊断模式回答，优先分析证据、根因和修复顺序，明确区分已确认事实与推断。' : '直接回答用户问题。优先理解最近对话，可以处理数学、写作、翻译、代码、知识问答和测试问题；只有用户明确涉及当前工作区时才引用测试上下文。'
    abortRef.current = controller
    setRuntimeState({ phase: 'connecting' })
    ensureActiveSession()
    setInput('')
    setPendingActions([])
    setMessages((items) => [...items, { role: 'user', text: message, createdAt: Date.now() }])
    setBusy(true)
    try {
      const result = await api<{ answer: string; runtime: AiRuntime }>('/ai/chat', { method: 'POST', signal: controller.signal, body: JSON.stringify({ ...aiConfig, mode: activeMode, message, context: { ...context, responseGuide: modeGuide }, history }) })
      const raw = result.answer || '已完成'
      let text = raw
      let patch: AiFlowPatch | undefined
      const patchMarker = /\n?AUTOMATION_STUDIO_FLOW_PATCH:\s*(\{[\s\S]*\})\s*$/
      const patchMatch = text.match(patchMarker)
      if (patchMatch) {
        try {
          const parsed = JSON.parse(patchMatch[1]) as { summary?: string; steps?: Step[] }
          const steps = Array.isArray(parsed.steps) ? parsed.steps.filter((item) => item && item.name && item.action).slice(0, 100) : []
          if (steps.length) patch = { summary: String(parsed.summary || 'AI 建议的流程修改'), steps }
          text = text.replace(patchMarker, '').trim()
        } catch { /* keep the textual answer when flow patch parsing fails */ }
      }
      const marker = /\n?AUTOMATION_STUDIO_ACTIONS:\s*(\[[\s\S]*\])\s*$/
      const match = text.match(marker)
      text = text.replace(marker, '').trim()
      let plan: AiTaskPlan | undefined
      const planMarker = /\n?AUTOMATION_STUDIO_PLAN:\s*(\{[\s\S]*\})\s*$/
      const planMatch = text.match(planMarker)
      if (planMatch) {
        try {
          const parsed = JSON.parse(planMatch[1]) as { title?: string; objective?: string; items?: { title?: string; detail?: string; risk?: string }[] }
          const items = (parsed.items || []).filter((item) => item.title).slice(0, 8).map((item, index) => ({ id: `plan-${Date.now()}-${index}`, title: String(item.title), detail: String(item.detail || '完成后检查结果'), risk: ['low', 'medium', 'high'].includes(String(item.risk)) ? item.risk as AiPlanItem['risk'] : 'medium', status: 'pending' as AiPlanStatus }))
          if (items.length) plan = { title: String(parsed.title || '自动化任务计划'), objective: String(parsed.objective || message), items }
          text = text.replace(planMarker, '').trim()
        } catch { /* keep the textual answer when structured plan parsing fails */ }
      }
      if (match) {
        try {
          const requested = JSON.parse(match[1]) as Record<string, unknown>[]
          const checked = await api<{ actions: AiUiAction[] }>('/ai/ui-actions', { method: 'POST', body: JSON.stringify({ actions: requested }) })
          setPendingActions(checked.actions)
          text = text || `已准备 ${checked.actions.length} 个自动化操作，请确认后执行。`
        } catch (error) {
          text += `\n\n操作建议未加载：${error instanceof Error ? error.message : '指令无效'}`
        }
      }
      text = normalizeAiBrandText(text)
      const responseRuntime = normalizeAiRuntime(result.runtime) as AiRuntime
      setRuntimeState(aiRuntimeState(responseRuntime))
      setMessages((items) => [...items, { role: 'assistant', text, createdAt: Date.now(), plan, patch, runtime: responseRuntime, mode: activeMode }])
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError'
      const text = normalizeAiErrorText(aborted ? '已停止本次回复。' : error instanceof Error ? error.message : 'AI 对话失败')
      setRuntimeState({ phase: aborted ? 'stopped' : 'error', detail: text })
      setMessages((items) => [...items, { role: 'assistant', text, createdAt: Date.now(), error: !aborted, mode: activeMode }])
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  const executePending = async () => {
    if (!pendingActions.length || busy) return
    const actions = [...pendingActions]
    setBusy(true)
    try {
      for (const action of actions) await onAction(action)
      setPendingActions([])
      setMessages((items) => [...items, { role: 'assistant', text: `已执行 ${actions.length} 个已确认操作。`, createdAt: Date.now() }])
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', text: `操作执行失败：${error instanceof Error ? error.message : '未知错误'}`, createdAt: Date.now() }])
    } finally {
      setBusy(false)
    }
  }

  const stopReply = () => abortRef.current?.abort()
  const selectQuickTask = (task: AiQuickTask) => {
    setMode(task.mode)
    if (task.draft) { setInput(task.prompt); return }
    void send(task.prompt, task.mode)
  }
  const copyMessage = async (text: string, index: number) => { await navigator.clipboard.writeText(text); setCopiedMessage(index); window.setTimeout(() => setCopiedMessage(null), 1600) }
  const refineMessage = (text: string) => { setInput(`继续优化这份结果，保留有效内容，并把下面部分变成更可执行的自动化方案：\n\n${text.slice(0, 1200)}`) }
  const updatePlanItem = (messageIndex: number, itemId: string, status: AiPlanStatus) => setMessages((items) => items.map((message, index) => index !== messageIndex || !message.plan ? message : { ...message, plan: { ...message.plan, items: message.plan.items.map((item) => item.id === itemId ? { ...item, status } : item) } }))
  const applyPatch = async (messageIndex: number, patch: AiFlowPatch) => {
    setBusy(true)
    try {
      await onApplyFlowPatch(patch)
      setMessages((items) => items.map((message, index) => index === messageIndex && message.patch ? { ...message, patch: { ...message.patch, applied: true } } : message))
    } finally { setBusy(false) }
  }
  const dismissPatch = (messageIndex: number) => setMessages((items) => items.map((message, index) => index === messageIndex ? { ...message, patch: undefined } : message))
  const workingSetCount = [viewLabels[currentView] || currentView, flowContext?.name, stepContext?.number, caseContext?.id, problemContext?.total].filter(Boolean).length
  const sessionTitle = activeSession?.title || messages.find((message) => message.role === 'user')?.text.trim().slice(0, 32) || '新对话'
  const ModeIcon = mode === 'chat' ? MessageSquare : mode === 'plan' ? ClipboardList : mode === 'build' ? Workflow : SearchCheck
  const runtimeLabel = runtimeState.phase === 'connecting' ? '正在连接模型'
    : runtimeState.phase === 'external' ? `${runtimeState.runtime?.model || '外部模型'} · 已响应`
    : runtimeState.phase === 'local' ? 'Lodestar Local · 本地模式'
    : runtimeState.phase === 'fallback' ? '外部模型失败 · 已降级'
    : runtimeState.phase === 'error' ? '模型连接失败'
    : runtimeState.phase === 'stopped' ? '本次回复已停止'
    : configured ? '模型尚未验证' : 'AI 未配置'
  const runtimeTitle = runtimeState.runtime
    ? `${runtimeState.runtime.provider} · ${runtimeState.runtime.api_kind}${runtimeState.runtime.duration_ms ? ` · ${runtimeState.runtime.duration_ms} ms` : ''}${runtimeState.detail ? `\n${runtimeState.detail}` : ''}`
    : runtimeState.detail || runtimeLabel

  return <aside aria-hidden={!visible} className={`ai-workbench ${homeMode ? 'home-mode' : 'docked-mode'} ${focused ? 'focused' : ''} ${visible ? '' : 'is-hidden'}`} style={homeMode ? undefined : { width }}>
    {!homeMode && <div className="ai-resize-handle" onMouseDown={beginResize}/>} 
    <nav className="ai-activity-bar" aria-label="AI 自动化模式">
      <div className="ai-activity-mark"><Sparkles size={18}/></div>
      <button type="button" className={mode === 'chat' ? 'active' : ''} onClick={() => setMode('chat')} aria-label="问答模式" title="问答模式"><MessageSquare size={18}/></button>
      <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')} aria-label="任务规划模式" title="任务规划模式"><ClipboardList size={18}/></button>
      <button type="button" className={mode === 'build' ? 'active' : ''} onClick={() => setMode('build')} aria-label="流程构建模式" title="流程构建模式"><Workflow size={18}/></button>
      <button type="button" className={mode === 'diagnose' ? 'active' : ''} onClick={() => setMode('diagnose')} aria-label="失败诊断模式" title="失败诊断模式"><SearchCheck size={18}/></button>
      <div className="ai-activity-spacer"/>
      <button type="button" onClick={onOpenSettings} aria-label="AI 模型设置" title="AI 模型设置"><Settings size={18}/></button>
      {!homeMode && <button type="button" onClick={onClose} aria-label="关闭 AI 自动化侧栏" title="关闭侧栏"><PanelRightClose size={18}/></button>}
    </nav>
    <div className="ai-sidebar-body">
      <header className="ai-sidebar-head">
        <div className="ai-title-group"><span className="ai-title-mark"><LodestarMark/></span><div><strong>Lodestar</strong></div><span className={`ai-runtime-dot ${runtimeState.phase}`} title={runtimeTitle}/></div>
        <div className="ai-head-actions">
          <button type="button" onClick={() => setHistoryOpen((open) => !open)} className={historyOpen ? 'active' : ''} aria-label="AI 会话历史" title="会话历史"><History size={16}/></button>
          <button type="button" onClick={newConversation} aria-label="新建对话" title="新建对话"><FilePlus2 size={16}/></button>
          {!homeMode && <button type="button" onClick={() => setFocused((value) => !value)} aria-label={focused ? '退出 AI 专注模式' : '在中央打开 AI'} title={focused ? '退出专注模式' : '在中央打开'}>{focused ? <PanelRightClose size={16}/> : <PanelRightOpen size={16}/>}</button>}
          {!homeMode && <button type="button" onClick={onClose} aria-label="关闭 AI 自动化侧栏" title="关闭侧栏"><X size={16}/></button>}
        </div>
      </header>
      {historyOpen && <section className="ai-history-drawer" aria-label="AI 会话历史">
        <header><div><small>LOCAL HISTORY</small><strong>会话历史</strong></div><div><button type="button" disabled={!activeSession?.messages.length} onClick={() => exportConversation()} title="导出当前会话" aria-label="导出当前会话"><Download size={15}/></button><button type="button" onClick={newConversation} title="新建对话" aria-label="新建对话"><Plus size={15}/></button><button type="button" onClick={() => setHistoryOpen(false)} title="关闭历史" aria-label="关闭历史"><X size={15}/></button></div></header>
        <div className="ai-history-list">{sessions.length ? sessions.map((session) => <button type="button" key={session.id} className={session.id === activeSessionId ? 'active' : ''} onClick={() => openSession(session)}><span><MessageSquare size={14}/></span><div><strong>{session.title}</strong><small>{session.project} · {session.messages.length} 条消息</small></div><time>{new Date(session.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</time><i role="button" tabIndex={0} aria-label={`删除会话 ${session.title}`} title="删除会话" onClick={(event) => { event.stopPropagation(); deleteSession(session.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); deleteSession(session.id) } }}><Trash2 size={13}/></i></button>) : <div className="ai-history-empty"><History size={22}/><strong>还没有历史会话</strong><span>第一次提问后会自动保存在本机</span></div>}</div>
        <footer><ShieldCheck size={13}/><span>最多保留 20 个本地会话</span></footer>
      </section>}
      <div className="ai-session-bar">
        <button type="button" className="ai-session-back" onClick={() => setHistoryOpen(true)} title="返回会话列表" aria-label="返回会话列表"><ArrowLeft size={15}/></button>
        <div className="ai-session-copy"><strong>{sessionTitle}</strong><span><ModeIcon size={11}/>{modeMeta[mode].title}</span></div>
        <button type="button" className={`ai-evidence-trigger ${contextOpen ? 'active' : ''}`} onClick={() => setContextOpen((open) => !open)} title="查看当前上下文"><AtSign size={13}/><span>上下文</span><em>{workingSetCount}</em><ChevronDown size={12}/></button>
      </div>
      <div className={`ai-context-shell ${contextOpen ? 'expanded' : ''}`} aria-hidden={!contextOpen}>
        <div className="ai-context-summary"><span>当前上下文</span><strong>{workingSetCount} 项</strong></div>
        <div className="ai-context-bar" title={`${viewLabels[currentView] || currentView}${context.project ? ` · ${String(context.project)}` : ''}`}>
          <span><AppWindow size={12}/>{viewLabels[currentView] || currentView}</span>
          {flowContext?.name && <span><Workflow size={12}/>{flowContext.name}</span>}
          {stepContext?.number && <span><Play size={12}/>步骤 {stepContext.number}</span>}
          {caseContext?.id && <span><TestTube2 size={12}/>{caseContext.id}</span>}
          {Boolean(problemContext?.total) && <span className="problem"><AlertTriangle size={12}/>{problemContext?.total} 问题</span>}
          {runContext?.status && <span><Activity size={12}/>{runContext.status}</span>}
        </div>
        <button type="button" className="ai-context-close" onClick={() => setContextOpen(false)} title="关闭上下文" aria-label="关闭上下文"><X size={13}/></button>
      </div>
      <div className="ai-chat-messages">
        {!messages.length && <div className="ai-command-center">
          <div className="ai-welcome"><StudioAiGlyph/><strong>{mode === 'chat' ? '有什么可以帮你？' : mode === 'build' ? '在变更落地前看清影响' : mode === 'diagnose' ? '从失败信号定位真实根因' : caseContext?.id ? `为 ${caseContext.id} 建立验证路径` : '把目标编排成可执行验证'}</strong>{!configured && <button type="button" className="ai-welcome-config" onClick={onOpenSettings}><KeyRound size={13}/><span>{configurationProblem}</span><em>配置模型</em><ChevronRight size={13}/></button>}</div>
          <div className="ai-quick-grid">{quickTasks.map((task) => <button type="button" key={task.title} title={task.detail} onClick={() => selectQuickTask(task)}><span><strong>{task.title}</strong></span></button>)}</div>
        </div>}
        {messages.map((item, index) => {
          const displayText = item.role === 'assistant' ? normalizeAiBrandText(normalizeAiErrorText(item.text)) : item.text
          const isError = item.role === 'assistant' && (item.error || (!item.runtime?.fallback && isAiErrorText(displayText)))
          const retryText = [...messages.slice(0, index)].reverse().find((message) => message.role === 'user')?.text || ''
          return <article key={`${item.role}-${index}`} className={`ai-chat-message ${item.role}${isError ? ' error' : ''}`}>
            {item.role === 'assistant' && <span className="ai-assistant-mark">{isError ? <AlertTriangle size={14}/> : <img src="/brand/lodestar-icon.png" alt=""/>}</span>}
            <div className="ai-message-body">
              {item.role === 'assistant' && <header className="ai-message-meta"><strong>Lodestar</strong>{item.runtime && <span className={`ai-message-runtime ${item.runtime.fallback ? 'fallback' : item.runtime.source}`} title={`${item.runtime.provider} · ${item.runtime.api_kind} · ${item.runtime.duration_ms} ms`}><span>{item.runtime.fallback ? '本地降级' : item.runtime.model}</span><em>{item.runtime.duration_ms < 1000 ? `${item.runtime.duration_ms} ms` : `${(item.runtime.duration_ms / 1000).toFixed(1)} s`}</em></span>}</header>}
              <AiMessageContent text={displayText}/>
              {item.plan && <AiTaskPlanView plan={item.plan} onStatusChange={(itemId, status) => updatePlanItem(index, itemId, status)}/>}
              {item.patch && <AiFlowPatchReview currentFlow={currentFlow} patch={item.patch} busy={busy} onApply={(acceptedPatch) => void applyPatch(index, acceptedPatch)} onDismiss={() => dismissPatch(index)}/>} 
              {item.role === 'assistant' && (isError ? <footer className="ai-error-tools"><button type="button" disabled={!retryText || busy} onClick={() => void send(retryText)}><RefreshCw size={13}/><span>重试</span></button><button type="button" onClick={onOpenSettings}><Settings size={13}/><span>模型设置</span></button></footer> : <><footer className="ai-message-tools"><button onClick={() => void copyMessage(`${displayText}${item.plan ? `\n\n${taskPlanMarkdown(item.plan)}` : ''}`, index)} title={copiedMessage === index ? '已复制' : '复制回复'} aria-label={copiedMessage === index ? '已复制' : '复制回复'}>{copiedMessage === index ? <Check size={14}/> : <Copy size={14}/>}</button><button onClick={() => refineMessage(displayText)} title="基于此回复继续优化" aria-label="继续优化"><RefreshCw size={14}/></button><button onClick={() => downloadMarkdown(`${displayText}${item.plan ? `\n\n${taskPlanMarkdown(item.plan)}` : ''}`, 'Lodestar回复')} title="导出 Markdown" aria-label="导出 Markdown"><Download size={14}/></button></footer>{item.runtime?.fallback && <footer className="ai-error-tools"><span title={item.runtime.error || '外部模型暂时不可用'}>外部模型暂时不可用，已由本地 AI 回答</span><button type="button" disabled={!retryText || busy} onClick={() => void send(retryText)}><RefreshCw size={13}/><span>重试外部模型</span></button><button type="button" onClick={onOpenSettings}><Settings size={13}/><span>模型设置</span></button></footer>}</>)}
            </div>
          </article>
        })}
        {busy && <div className="ai-chat-message assistant"><div className="ai-message-body thinking"><header className="ai-message-meta"><strong>Lodestar</strong></header><p className="ai-thinking"><i/><i/><i/>正在思考</p></div></div>}
        {pendingActions.length > 0 && <div className="ai-action-review">
          <div className="ai-action-title"><ShieldCheck size={16}/><div><strong>待确认操作</strong><small>AI 不会自动执行流程</small></div></div>
          {pendingActions.map((action, index) => <div className="ai-action-row" key={`${action.action}-${index}`}><span>{index + 1}</span><div><strong>{actionLabels[action.action] || action.action}</strong><small>{action.target ? viewLabels[action.target] || action.target : action.step ? `步骤 ${action.step}` : action.action === 'run_flow' ? '将启动浏览器执行' : '当前自动化流程'}</small></div>{action.action === 'run_flow' && <em>执行</em>}</div>)}
          <div className="ai-action-buttons"><button type="button" onClick={() => setPendingActions([])}>取消</button><button type="button" className="confirm" onClick={() => void executePending()}><Play size={14}/>确认执行</button></div>
        </div>}
        <div ref={endRef}/>
      </div>
      <div className="ai-chat-composer">
        <div className={`ai-composer-surface ${configurationNotice ? 'has-notice' : ''}`}>
          <textarea ref={composerInputRef} rows={1} value={input} placeholder={modeMeta[mode].placeholder} onChange={(event) => { setInput(event.target.value); if (configurationNotice) setConfigurationNotice('') }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }}/>
          {configurationNotice && <div className="ai-config-notice" role="status" aria-live="polite"><KeyRound size={14}/><span>{configurationNotice}</span><button type="button" onClick={onOpenSettings}>配置 AI<ChevronRight size={12}/></button></div>}
          <div className="ai-composer-footer">
            <div className="ai-composer-tools">
              <button type="button" className="ai-context-add" onClick={() => setContextOpen(true)} title="查看当前上下文"><AtSign size={13}/><span>上下文</span><em>{workingSetCount}</em></button>
              <label className="ai-mode-select" title={modeMeta[mode].title}><ModeIcon size={13}/><select value={mode} onChange={(event) => setMode(event.target.value as AiPanelMode)} aria-label="Lodestar 工作模式"><option value="chat">问答</option><option value="plan">规划</option><option value="build">编辑</option><option value="diagnose">诊断</option></select><ChevronDown size={11}/></label>
            </div>
            <div className="ai-composer-runtime">
              {['connecting', 'fallback', 'error', 'stopped'].includes(runtimeState.phase) && <span className={`ai-model-status ${runtimeState.phase}`} title={runtimeTitle}><i/><span>{runtimeLabel}</span></span>}
              {pendingActions.length > 0 && <span className="ai-pending-count"><ShieldCheck size={11}/>{pendingActions.length}</span>}
              {busy ? <button type="button" className="ai-send-button stop" onClick={stopReply} aria-label="停止回复" title="停止回复"><Square size={14}/></button> : <button type="button" className="ai-send-button" disabled={!input.trim()} onClick={() => void send()} aria-label="发送" title={configured ? '发送' : '发送并检查 AI 配置'}><Send size={15}/></button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  </aside>
}

function renderAiInline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code className="ai-inline-code" key={index}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>
    return part
  })
}

function cleanAiDisplayMarkup(text: string) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string) => `> 图片引用：${alt.trim() || '未命名图片'}`)
    .replace(/<\/?(?:font|span|div|p|strong|em|u|mark|section|article|header|footer|table|thead|tbody|tr|td|th)[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function AiMessageContent({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g).filter(Boolean)
  return <div className="ai-message-content">{blocks.map((block, index) => {
    if (block.startsWith('```')) {
      const language = block.match(/^```([^\n]*)/)?.[1]?.trim() || '代码'
      const code = block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim()
      return <section className="ai-code-block" key={index}><header><span>{language}</span><button type="button" title="复制代码" aria-label="复制代码" onClick={() => void navigator.clipboard.writeText(code)}><Copy size={12}/>复制</button></header><pre><code>{code}</code></pre></section>
    }
    const normalizedBlock = cleanAiDisplayMarkup(block)
    const lines = normalizedBlock.split('\n').filter((line, lineIndex, values) => line.trim() || (lineIndex > 0 && values[lineIndex - 1]?.trim()))
    return <div key={index}>{lines.map((line, lineIndex) => {
      const clean = line.trim()
      if (/^#{1,3}\s/.test(clean)) return <h4 key={lineIndex}>{renderAiInline(clean.replace(/^#{1,3}\s*/, ''))}</h4>
      if (/^>\s?/.test(clean)) return <aside className="ai-message-callout" key={lineIndex}><AlertTriangle size={13}/><span>{renderAiInline(clean.replace(/^>\s?/, ''))}</span></aside>
      if (/^[-*]\s+\[[ xX]\]\s/.test(clean)) { const checked = /^[-*]\s+\[[xX]\]/.test(clean); return <p className={`ai-check-line ${checked ? 'checked' : ''}`} key={lineIndex}><span>{checked ? <Check size={11}/> : ''}</span><span>{renderAiInline(clean.replace(/^[-*]\s+\[[ xX]\]\s*/, ''))}</span></p> }
      if (/^[-*]\s/.test(clean)) return <p className="ai-list-line" key={lineIndex}><span>•</span><span>{renderAiInline(clean.replace(/^[-*]\s*/, ''))}</span></p>
      if (/^\d+[.)]\s/.test(clean)) return <p className="ai-list-line numbered" key={lineIndex}><span>{clean.match(/^\d+/)?.[0]}</span><span>{renderAiInline(clean.replace(/^\d+[.)]\s*/, ''))}</span></p>
      return clean ? <p key={lineIndex}>{renderAiInline(line)}</p> : <span className="ai-paragraph-gap" key={lineIndex}/>
    })}</div>
  })}</div>
}

function AiTaskPlanView({ plan, onStatusChange }: { plan: AiTaskPlan; onStatusChange: (itemId: string, status: AiPlanStatus) => void }) {
  const completed = plan.items.filter((item) => item.status === 'done' || item.status === 'skipped').length
  const active = plan.items.find((item) => item.status === 'active')
  const advance = () => {
    if (active) onStatusChange(active.id, 'done')
    const next = plan.items.find((item) => item.status === 'pending')
    if (next) onStatusChange(next.id, 'active')
  }
  return <section className="ai-task-plan">
    <header><div><span><Target size={13}/>任务计划</span><strong>{plan.title}</strong><small>{plan.objective}</small></div><em>{completed}/{plan.items.length}</em></header>
    <div className="ai-plan-progress"><i style={{ width: `${plan.items.length ? completed / plan.items.length * 100 : 0}%` }}/></div>
    <div className="ai-plan-items">{plan.items.map((item, index) => <div className={`ai-plan-item ${item.status}`} key={item.id}>
      <button type="button" aria-label={`切换任务状态 ${item.title}`} onClick={() => onStatusChange(item.id, item.status === 'done' ? 'pending' : 'done')}>{item.status === 'done' ? <Check size={13}/> : item.status === 'skipped' ? <SkipForward size={12}/> : index + 1}</button>
      <div><strong>{item.title}</strong><small>{item.detail}</small></div><span className={`risk ${item.risk}`}>{item.risk === 'high' ? '高风险' : item.risk === 'low' ? '低风险' : '中风险'}</span>
      {item.status === 'pending' && <button type="button" className="ai-plan-skip" onClick={() => onStatusChange(item.id, 'skipped')} title="跳过"><SkipForward size={12}/></button>}
    </div>)}</div>
    <footer><span><ShieldCheck size={12}/>任务状态只在本机更新</span><button type="button" onClick={advance} disabled={completed === plan.items.length}>{active ? <><CheckCircle2 size={13}/>完成并继续</> : <><Play size={13}/>开始第一项</>}</button></footer>
  </section>
}

function AiFlowPatchReview({ currentFlow, patch, busy, onApply, onDismiss }: { currentFlow: Flow | null; patch: AiFlowPatch; busy: boolean; onApply: (patch: AiFlowPatch) => void; onDismiss: () => void }) {
  const previous = currentFlow?.steps || []
  const [proposedSteps, setProposedSteps] = useState(patch.steps)
  const [accepted, setAccepted] = useState<Record<number, boolean>>({})
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  useEffect(() => { setProposedSteps(patch.steps); setAccepted({}); setEditingIndex(null) }, [patch.steps])
  const rows = Array.from({ length: Math.max(previous.length, proposedSteps.length) }, (_, index) => {
    const before = previous[index]
    const after = proposedSteps[index]
    const state = !before ? 'added' : !after ? 'removed' : JSON.stringify(before) === JSON.stringify(after) ? 'same' : 'changed'
    return { before, after, state, index }
  })
  const changed = rows.filter((row) => row.state !== 'same').length
  const selected = (index: number) => accepted[index] !== false
  const composedSteps = rows.flatMap((row) => {
    if (row.state === 'same') return row.before ? [row.before] : []
    const value = selected(row.index) ? row.after : row.before
    return value ? [value] : []
  })
  const applySelected = () => {
    onApply({ ...patch, steps: composedSteps })
  }
  const updateProposed = (index: number, changes: Partial<Step>) => setProposedSteps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  return <section className={`ai-flow-patch ${patch.applied ? 'applied' : ''}`}>
    <header><div><span><GitBranch size={13}/>逐步变更审阅</span><strong>{patch.summary}</strong><small>{currentFlow ? `${currentFlow.name} · ${changed} 处变化 · 将保留 ${composedSteps.length} 步` : '尚未选择流程，无法应用'}</small></div><em>{patch.applied ? '已应用' : '待确认'}</em></header>
    <div className="ai-diff-legend"><span className="added">新增</span><span className="changed">修改</span><span className="removed">删除</span><small>完整步骤替换预览</small></div>
    <div className="ai-diff-list">{rows.map((row) => <div className={`ai-diff-item ${row.state} ${selected(row.index) ? 'accepted' : 'rejected'}`} key={row.index}>
      <div className="ai-diff-row"><span>{String(row.index + 1).padStart(2, '0')}</span><div><small>{row.before ? `${labels[row.before.action] || row.before.action} · ${row.before.name}` : '无原步骤'}</small><strong>{row.after ? `${labels[row.after.action] || row.after.action} · ${row.after.name}` : '删除此步骤'}</strong></div>{row.state !== 'same' ? <div className="ai-diff-actions"><button type="button" className={selected(row.index) ? 'active' : ''} onClick={() => setAccepted((value) => ({ ...value, [row.index]: true }))} title="接受此项"><Check size={11}/></button><button type="button" className={!selected(row.index) ? 'active reject' : ''} onClick={() => setAccepted((value) => ({ ...value, [row.index]: false }))} title="拒绝此项"><X size={11}/></button>{row.after && <button type="button" className={editingIndex === row.index ? 'active' : ''} onClick={() => setEditingIndex(editingIndex === row.index ? null : row.index)} title="编辑建议步骤"><Pencil size={11}/></button>}</div> : <em>=</em>}</div>
      {editingIndex === row.index && row.after && <div className="ai-diff-editor"><label>步骤名称<input value={row.after.name} onChange={(event) => updateProposed(row.index, { name: event.target.value })}/></label><label>动作<select value={row.after.action} onChange={(event) => updateProposed(row.index, { action: event.target.value })}>{Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="wide">输入值 / 期望<textarea value={row.after.action.startsWith('assert') ? row.after.expected || '' : row.after.value || ''} onChange={(event) => row.after && updateProposed(row.index, row.after.action.startsWith('assert') ? { expected: event.target.value } : { value: event.target.value })}/></label></div>}
    </div>)}</div>
    <footer><span><ShieldCheck size={12}/>{patch.applied ? '已进入编辑器，仍需手动保存' : `已接受 ${rows.filter((row) => row.state !== 'same' && selected(row.index)).length}/${changed} 项，应用前创建检查点`}</span>{!patch.applied && <div><button type="button" onClick={onDismiss} disabled={busy}>取消全部</button><button type="button" className="confirm" onClick={applySelected} disabled={busy || !currentFlow || !composedSteps.length}><Check size={13}/>应用已接受项</button></div>}</footer>
  </section>
}

function RuntimeBanner() {
  const [state, setState] = useState<{ browser_status?: string; version?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const refresh = () => api<typeof state>('/health').then(setState).catch(() => setMessage('本地服务未连接'))
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (!state || state.browser_status === 'ready') return
    const timer = window.setInterval(() => void refresh(), 2500)
    return () => window.clearInterval(timer)
  }, [state?.browser_status])
  if (message) return <div className="runtime-banner warning"><span>{message}</span></div>
  if (!state || state.browser_status === 'ready') return null
  const initialize = async () => {
    setBusy(true); setMessage('正在初始化 Chromium 浏览器组件…')
    try { await api('/runtime/browser/init', { method: 'POST' }); await refresh(); setMessage('') }
    catch (error) { setMessage(error instanceof Error ? error.message : '浏览器组件初始化失败') }
    finally { setBusy(false) }
  }
  return <div className="runtime-banner warning"><div><strong>浏览器组件未完成初始化</strong><small>首次使用录制或执行前，请先完成 Chromium 初始化。</small></div><button className="outline-btn" disabled={busy} onClick={() => void initialize()}>{busy ? '初始化中…' : '初始化浏览器'}</button>{message && <span>{message}</span>}</div>
}

function ElementsView({ elements, projectId, onChanged }: { elements: ElementAsset[]; projectId: string; onChanged: (items: ElementAsset[]) => void }) {
  const dialog = useDialog()
  const empty: ElementAsset = { element_id: '', name: '', page_url: '', page_title: '', locator_type: 'css', locator_value: '', health_status: '未验证', usage_count: 0 }
  const [editing, setEditing] = useState<ElementAsset | null>(null)
  const [query, setQuery] = useState('')
  const visible = elements.filter((item) => !query || `${item.name} ${item.element_id} ${item.locator_value}`.toLowerCase().includes(query.toLowerCase()))
  const save = async () => { if (!editing?.name.trim() || !editing.locator_value.trim()) return void await dialog.alert('请填写元素名称和定位值后再保存。', '信息不完整'); const item = await api<ElementAsset>('/elements', { method: 'POST', body: JSON.stringify({ ...editing, project_id: projectId }) }); onChanged([item, ...elements.filter((old) => old.element_id !== item.element_id)]); setEditing(null) }
  const verify = async (item: ElementAsset) => { try { const result = await api<ElementAsset>(`/elements/${item.element_id}/verify`, { method: 'POST' }); onChanged(elements.map((old) => old.element_id === result.element_id ? result : old)) } catch (error) { await dialog.alert(error instanceof Error ? error.message : '验证失败', '元素验证失败') } }
  const remove = async (item: ElementAsset) => { if (!await dialog.confirm(`删除元素“${item.name}”后，引用它的流程步骤可能无法执行。`, { title: '删除页面元素', confirmLabel: '删除元素', danger: true })) return; try { await api(`/elements/${item.element_id}`, { method: 'DELETE' }); onChanged(elements.filter((old) => old.element_id !== item.element_id)) } catch (error) { await dialog.alert(error instanceof Error ? error.message : '删除失败', '删除失败') } }
  return <div className="content-view"><div className="panel-header"><div><div className="eyebrow">资产库 / Element Repository</div><h1>页面元素</h1><p>定位器集中维护，流程步骤只引用元素编号；修改定位器会影响所有引用流程</p></div><div className="header-actions"><button className="outline-btn" onClick={() => setEditing({ ...empty })}>＋ 新增元素</button></div></div>{editing && <div className="case-editor element-editor"><input placeholder="元素名称，例如：登录按钮" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}/><input placeholder="页面地址（用于验证）" value={editing.page_url || ''} onChange={(e) => setEditing({ ...editing, page_url: e.target.value })}/><select value={editing.locator_type} onChange={(e) => setEditing({ ...editing, locator_type: e.target.value })}><option value="testid">testid</option><option value="role">role</option><option value="label">label</option><option value="placeholder">placeholder</option><option value="name">name</option><option value="css">CSS</option></select><input placeholder="定位值" value={editing.locator_value} onChange={(e) => setEditing({ ...editing, locator_value: e.target.value })}/><div className="case-editor-actions"><button className="outline-btn" onClick={() => setEditing(null)}>取消</button><button className="toolbar-btn primary" onClick={() => void save()}>保存元素</button></div></div>}<div className="case-filter"><input placeholder="搜索元素名称、编号或定位值" value={query} onChange={(e) => setQuery(e.target.value)}/><span>{visible.length} 个元素</span></div><div className="asset-table"><div className="asset-header"><span>元素</span><span>页面</span><span>定位器</span><span>健康状态</span><span>操作</span></div>{visible.map((item) => <div className="asset-row" key={item.element_id}><strong>{item.name}<small>{item.element_id}</small></strong><span>{item.page_title || item.page_url || '未记录'}</span><code>{item.locator_type}={item.locator_value}</code><span className="health">{item.health_status}</span><span className="row-actions"><button onClick={() => setEditing({ ...item })}>编辑</button><button onClick={() => void verify(item)}>验证</button><button onClick={() => void remove(item)}>删除</button></span></div>)}</div>{!visible.length && <div className="empty-state">暂无页面元素</div>}</div>
}

type RunStepResult = Record<string, unknown>
type DiagnosisFinding = { title: string; detail: string; confidence: number; kind: 'locator' | 'timeout' | 'network' | 'assertion' | 'runtime'; evidence: string }

function safeEvidence(value: unknown, limit: number) {
  return String(value || '无')
    .replace(/(authorization|api[_-]?key|access[_-]?token|token|password)(["'\s:=]+)[^\s,;]+/gi, '$1$2***')
    .slice(0, limit)
}

function prettyEvidenceJson(value: unknown) {
  try { return JSON.stringify(JSON.parse(String(value || '{}')), null, 2) }
  catch { return String(value || '无定位器证据') }
}

function buildDiagnosis(run: Run, steps: RunStepResult[]): DiagnosisFinding[] {
  const failures = steps.filter((item) => ['FAIL', 'BLOCKED'].includes(String(item.status)))
  if (!failures.length) return [{ title: '未发现失败步骤', detail: '当前证据中没有失败或阻塞步骤，可将本次运行作为后续对比基线。', confidence: 100, kind: 'runtime', evidence: `${steps.length} 个步骤已检查` }]
  const source = failures.map((item) => `${item.error_message || ''}\n${item.message || ''}\n${item.console_summary || ''}\n${item.network_summary || ''}`).join('\n').toLowerCase()
  const first = failures[0]
  const stepLabel = `步骤 ${first.step_no || '-'} · ${first.name || '未命名步骤'}`
  const findings: DiagnosisFinding[] = []
  if (/locator|selector|strict|element|not found|找不到|未找到|不可见|detached/.test(source)) findings.push({ title: '元素定位器可能已经失效', detail: '优先检查页面结构、元素可见性与等待条件，避免依赖易变层级选择器。', confidence: 92, kind: 'locator', evidence: stepLabel })
  if (/timeout|timed out|超时|waiting for/.test(source)) findings.push({ title: '页面状态或等待策略不稳定', detail: '失败包含等待超时信号，建议对关键页面状态使用显式断言，并检查环境响应耗时。', confidence: 88, kind: 'timeout', evidence: `${stepLabel} · ${first.duration_ms || 0} ms` })
  if (failures.some((item) => String(item.network_summary || '').trim()) || /net::|http \d{3}|request failed|network/.test(source)) findings.push({ title: '网络请求异常影响了执行', detail: '检查失败请求、接口状态码和环境连通性，再判断是否需要增加重试。', confidence: 84, kind: 'network', evidence: String(first.network_summary || '运行记录包含失败请求').split('\n')[0].slice(0, 160) })
  if (/assert|expected|expect|断言|期望/.test(source)) findings.push({ title: '实际结果与断言期望不一致', detail: '先确认产品行为是否发生变更，再更新断言内容；不要直接放宽校验条件。', confidence: 90, kind: 'assertion', evidence: stepLabel })
  if (!findings.length) findings.push({ title: '需要结合截图和 Trace 继续定位', detail: '已有失败事实，但错误文本不足以唯一确认根因。建议检查失败截图、Console 与前后步骤状态。', confidence: 64, kind: 'runtime', evidence: String(first.error_message || run.error_message || stepLabel).slice(0, 180) })
  return findings.sort((a, b) => b.confidence - a.confidence).slice(0, 4)
}

const missionPhases = [
  { id: 'PLANNING', label: '规划' },
  { id: 'PREFLIGHT', label: '前置检查' },
  { id: 'DATA_PREPARATION', label: '数据准备' },
  { id: 'EXECUTING', label: '执行' },
  { id: 'VERIFYING', label: '独立验证' },
  { id: 'FAILURE_REPRODUCTION', label: '失败复现' },
  { id: 'DATA_CLEANUP', label: '数据清理' },
  { id: 'REPORT_COMPLETE', label: '报告' },
]

const missionStatusLabel = (value: string) => ({ PASS: '通过', FAIL: '失败', BLOCKED: '阻塞', INCONCLUSIVE: '证据不足', CANCELLED: '已取消', PLANNING: '规划中', PREFLIGHT: '待启动', DATA_PREPARATION: '准备数据', EXECUTING: '执行中', VERIFYING: '验证中', FAILURE_REPRODUCTION: '复现中', DATA_CLEANUP: '清理中', REPORT_COMPLETE: '已完成', PENDING: '等待', RUNNING: '执行中', COMPLETED: '已完成' }[value] || value)

function MissionCenterView({ projectId, cases, environments, onOpenRun, onConfigureEnvironment, onOpenDefects }: { projectId: string; cases: TestCase[]; environments: Environment[]; onOpenRun: (runId: string) => void; onConfigureEnvironment: () => void; onOpenDefects: () => void }) {
  const [missions, setMissions] = useState<Mission[]>([])
  const [mission, setMission] = useState<Mission | null>(null)
  const [objective, setObjective] = useState('')
  const [depth, setDepth] = useState<Mission['depth']>('standard')
  const [environmentId, setEnvironmentId] = useState('')
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refreshList = async () => {
    if (!projectId) return
    const items = await api<Mission[]>(`/projects/${projectId}/missions`)
    setMissions(items)
    return items
  }
  const openMission = async (missionId: string) => {
    const item = await api<Mission>(`/missions/${missionId}`)
    setMission(item)
    const firstAttention = item.scenarios?.find((entry) => entry.verdict && entry.verdict !== 'PASS') || item.scenarios?.[0]
    setSelectedScenarioId((current) => item.scenarios?.some((entry) => entry.scenario_id === current) ? current : firstAttention?.scenario_id || '')
    return item
  }

  useEffect(() => {
    setEnvironmentId(environments[0]?.id || '')
  }, [projectId, environments[0]?.id])
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const items = await refreshList()
        if (!cancelled && items?.[0]) await openMission(items[0].mission_id)
        if (!cancelled && !items?.length) setMission(null)
      } catch (error) { if (!cancelled) setMessage(error instanceof Error ? error.message : '任务加载失败') }
    }
    void load()
    return () => { cancelled = true }
  }, [projectId])
  useEffect(() => {
    if (!mission || mission.status === 'PREFLIGHT' || mission.status === 'REPORT_COMPLETE') return
    const timer = window.setInterval(() => {
      void openMission(mission.mission_id).then((updated) => {
        if (updated.status === 'REPORT_COMPLETE') void refreshList()
      }).catch((error) => setMessage(error instanceof Error ? error.message : '任务状态刷新失败'))
    }, 1200)
    return () => window.clearInterval(timer)
  }, [mission?.mission_id, mission?.status])

  const createAndStart = async () => {
    if (!objective.trim()) return setMessage('先输入要测试的目标')
    if (!environmentId) return setMessage('先选择一个测试环境')
    setBusy(true); setMessage('')
    try {
      const created = await api<Mission>('/missions', { method: 'POST', body: JSON.stringify({ project_id: projectId, environment_id: environmentId, objective: objective.trim(), depth, time_budget_minutes: depth === 'quick' ? 15 : depth === 'deep' ? 90 : 30 }) })
      setMission(created); setSelectedScenarioId(created.scenarios?.[0]?.scenario_id || '')
      await refreshList()
      if (created.blocking_reason) {
        setMessage(created.blocking_reason)
        return
      }
      await api<Mission>(`/missions/${created.mission_id}/start`, { method: 'POST' })
      await openMission(created.mission_id)
    } catch (error) { setMessage(error instanceof Error ? error.message : '自主测试启动失败') }
    finally { setBusy(false) }
  }
  const startExisting = async () => {
    if (!mission) return
    setBusy(true); setMessage('')
    try {
      await api<Mission>(`/missions/${mission.mission_id}/start`, { method: 'POST' })
      await openMission(mission.mission_id)
    } catch (error) { setMessage(error instanceof Error ? error.message : '任务启动失败') }
    finally { setBusy(false) }
  }
  const stop = async () => {
    if (!mission) return
    try {
      await api(`/missions/${mission.mission_id}/stop`, { method: 'POST', body: JSON.stringify({ reason: '用户在执行中心停止任务' }) })
      setMessage('正在安全停止，已产生的证据会保留')
    } catch (error) { setMessage(error instanceof Error ? error.message : '停止失败') }
  }

  const phaseIndex = mission ? missionPhases.findIndex((item) => item.id === mission.status) : -1
  const selectedScenario = mission?.scenarios?.find((item) => item.scenario_id === selectedScenarioId) || mission?.scenarios?.[0]
  const ledger = (mission?.ledger || []).filter((item) => item.scenario_id === selectedScenario?.scenario_id)
  const verifications = (mission?.verifications || []).filter((item) => item.scenario_id === selectedScenario?.scenario_id)
  const active = Boolean(mission && !['PREFLIGHT', 'REPORT_COMPLETE'].includes(mission.status))

  return <div className="mission-center content-view">
    <header className="mission-heading">
      <div><div className="eyebrow">AUTONOMOUS TESTING</div><h1>执行中心</h1><p>告诉 Lodestar 测什么，场景、执行、验证与证据统一进入一个 Mission。</p></div>
      <button className="outline-btn" onClick={() => { setMission(null); setObjective(''); setMessage('') }}><Plus size={14}/>新任务</button>
    </header>

    <section className="mission-composer">
      <textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="例如：验证商品创建的必填、边界和重复提交，失败时保留证据"/>
      <div className="mission-composer-controls">
        <div className="mission-depth" aria-label="测试深度">{([{ id: 'quick', label: '快速' }, { id: 'standard', label: '标准' }, { id: 'deep', label: '深度' }] as { id: Mission['depth']; label: string }[]).map((item) => <button key={item.id} className={depth === item.id ? 'active' : ''} onClick={() => setDepth(item.id)}>{item.label}</button>)}</div>
        <select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)}><option value="">选择测试环境</option>{environments.filter((item) => item.environment_kind !== 'production').map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_url || '未配置地址'}</option>)}</select>
        <span className="mission-scope"><TestTube2 size={13}/>{cases.length} 条资产可参与规划</span>
        <button className="toolbar-btn primary mission-start" disabled={busy || !projectId || !environments.length} onClick={() => void createAndStart()}><Play size={14}/>{busy ? '正在准备…' : '开始自主测试'}</button>
      </div>
      {!environments.length && <button className="mission-inline-alert" onClick={onConfigureEnvironment}><AlertTriangle size={14}/>尚未配置测试环境，前往设置</button>}
      {message && <div className="mission-message"><AlertTriangle size={14}/><span>{message}</span></div>}
    </section>

    {mission ? <>
      <section className="mission-command-line">
        <div><small>MISSION</small><strong>{mission.mission_id}</strong><span>{mission.objective}</span></div>
        <div className="mission-command-actions"><span className={`mission-verdict ${(mission.verdict || mission.status).toLowerCase()}`}>{missionStatusLabel(mission.verdict || mission.status)}</span>{mission.status === 'PREFLIGHT' && <button className="toolbar-btn primary" disabled={busy || Boolean(mission.blocking_reason)} onClick={() => void startExisting()}><Play size={13}/>启动</button>}{active && <button className="outline-btn danger-outline" onClick={() => void stop()}><CircleStop size={13}/>停止</button>}</div>
      </section>
      <section className="mission-phase-rail" aria-label="任务阶段">
        {missionPhases.map((item, index) => <div key={item.id} className={`${index < phaseIndex || mission.status === 'REPORT_COMPLETE' ? 'done' : ''} ${index === phaseIndex ? 'active' : ''}`}><span>{index < phaseIndex || mission.status === 'REPORT_COMPLETE' ? <Check size={12}/> : index + 1}</span><strong>{item.label}</strong></div>)}
        <i style={{ width: `${Math.max(0, Math.min(100, mission.progress || 0))}%` }}/>
      </section>
      <div className="mission-workspace">
        <section className="mission-scenarios">
          <header><div><strong>场景与裁决</strong><small>执行 AI 无最终通过权</small></div><span>{mission.summary?.total || mission.scenarios?.length || 0} 场景</span></header>
          <div className="mission-scenario-list">{mission.scenarios?.map((item, index) => <button key={item.scenario_id} className={selectedScenario?.scenario_id === item.scenario_id ? 'selected' : ''} onClick={() => setSelectedScenarioId(item.scenario_id)}><span className="mission-scenario-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.case_id || 'AI 场景'} · {item.risk}</small></span><em className={(item.verdict || item.status).toLowerCase()}>{missionStatusLabel(item.verdict || item.status)}</em></button>)}</div>
        </section>
        <section className="mission-inspection">
          {selectedScenario ? <>
            <header><div><small>SELECTED SCENARIO</small><h2>{selectedScenario.title}</h2></div>{selectedScenario.run_id && <button className="outline-btn" onClick={() => onOpenRun(selectedScenario.run_id || '')}><Eye size={13}/>查看原始证据</button>}</header>
            {selectedScenario.findings?.length > 0 && <div className="mission-findings">{selectedScenario.findings.map((item, index) => <div key={`${item.code || item.layer}-${index}`}><AlertTriangle size={14}/><span><strong>{item.code || item.layer || '验证发现'}</strong><small>{item.message}</small></span></div>)}</div>}
            {selectedScenario.reproduction_run_id && <div className="mission-reproduction"><div><span>FAILURE REPRODUCTION</span><strong>{selectedScenario.failure_classification === 'PRODUCT_DEFECT_CANDIDATE' ? '稳定复现 · 产品缺陷候选' : selectedScenario.failure_classification === 'FLAKY' ? '复现通过 · Flaky 候选' : '复现完成 · 需要复核'}</strong><small>置信度 {selectedScenario.reproduction_confidence || 0}% · 裁决 {missionStatusLabel(selectedScenario.reproduction_verdict || '')}</small></div><button className="outline-btn" onClick={() => onOpenRun(selectedScenario.reproduction_run_id || '')}><Eye size={13}/>查看复现证据</button></div>}
            {selectedScenario.tapd_draft?.title && <div className="mission-tapd-draft"><header><div><span>TAPD DRAFT</span><strong>五字段草稿已生成，提交前必须审核</strong></div><button className="outline-btn" onClick={onOpenDefects}><Bug size={13}/>进入缺陷中心</button></header><p><b>标题</b>{selectedScenario.tapd_draft.title}</p><p><b>实际结果</b>{selectedScenario.tapd_draft.actual}</p></div>}
            <div className="mission-subhead"><strong>独立验证</strong><span>{verifications.length} 个通道</span></div>
            <div className="mission-verification-grid">{verifications.length ? verifications.map((item) => <div key={item.verification_id}><span className={item.status.toLowerCase()}>{missionStatusLabel(item.status)}</span><strong>{item.layer.toUpperCase()}</strong><p>{item.rule_text}</p><small>{item.observed}</small></div>) : <div className="mission-empty-line">任务执行后显示 UI、API、数据和业务验证结果</div>}</div>
            <div className="mission-subhead"><strong>覆盖账本</strong><span>{ledger.filter((item) => item.status === 'PASS').length}/{ledger.length} 已闭合</span></div>
            <div className="mission-ledger">{ledger.length ? ledger.map((item) => <div key={item.ledger_id}><span className={`ledger-state ${item.status.toLowerCase()}`}>{item.status === 'PASS' ? <Check size={12}/> : <AlertTriangle size={12}/>}</span><strong>{item.source_step_no}. {item.source_text}</strong><p>{item.actual_action}</p><small>{item.postcondition} · {item.evidence.length} 份证据</small></div>) : <div className="mission-empty-line">尚未产生步骤账本；没有执行、验证或证据的步骤不会判为通过</div>}</div>
          </> : <div className="mission-empty-detail"><Target size={24}/><strong>选择一个场景</strong><span>查看执行动作、后置验证与证据映射</span></div>}
        </section>
        <aside className="mission-history">
          <header><strong>任务历史</strong><button onClick={() => void refreshList()} title="刷新" aria-label="刷新任务"><RefreshCw size={13}/></button></header>
          {missions.map((item) => <button key={item.mission_id} className={mission.mission_id === item.mission_id ? 'active' : ''} onClick={() => void openMission(item.mission_id)}><span><strong>{item.objective}</strong><small>{new Date(item.created_at).toLocaleString('zh-CN')}</small></span><em className={(item.verdict || item.status).toLowerCase()}>{missionStatusLabel(item.verdict || item.status)}</em></button>)}
          <div className="mission-history-actions"><button onClick={onOpenDefects}><Bug size={13}/>缺陷中心</button></div>
        </aside>
      </div>
    </> : <section className="mission-empty"><Target size={28}/><strong>创建第一个自主测试任务</strong><p>默认只展示失败、阻塞、证据不足和风险；高级脚本与定位器不会出现在日常流程里。</p></section>}
  </div>
}

function RunsCenterView({ projectId, cases, runs, running, flows, environments, initialRunId, onAiDiagnose, onRunRange, onOpenDefects, onConfigureEnvironment, onHealingResolved }: { projectId: string; cases: TestCase[]; runs: Run[]; running: Run | null; flows: Flow[]; environments: Environment[]; initialRunId?: string; onAiDiagnose: (prompt: string) => void; onRunRange: (flowId: string, environmentId: string | undefined, browser: string, from: number, to: number) => Promise<void>; onOpenDefects: () => void; onConfigureEnvironment: () => void; onHealingResolved: () => void }) {
  const dialog = useDialog()
  const [selected, setSelected] = useState<Run | null>(null)
  const [stepResults, setStepResults] = useState<RunStepResult[]>([])
  const [selectedEvidenceStep, setSelectedEvidenceStep] = useState(0)
  const [healingSuggestions, setHealingSuggestions] = useState<HealingSuggestion[]>([])
  const [healingBusy, setHealingBusy] = useState('')
  const [tracePhase, setTracePhase] = useState<'before' | 'after'>('after')
  const [compareRun, setCompareRun] = useState<Run | null>(null)
  const [compareSteps, setCompareSteps] = useState<RunStepResult[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [tab, setTab] = useState('联动证据')
  const [batchEnvironmentId, setBatchEnvironmentId] = useState(environments[0]?.id || '')
  const [batchStopOnFailure, setBatchStopOnFailure] = useState(false)
  const [batchExecution, setBatchExecution] = useState<RegressionRun | null>(null)
  const [batchCaseResults, setBatchCaseResults] = useState<RegressionCaseResult[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchMessage, setBatchMessage] = useState('')
  const definitionReadyCases = cases.filter((item) => String(item.steps || '').trim() && String(item.expected || '').trim())
  const executableCases = definitionReadyCases.filter((item) => item.automation_flow_id && flows.some((flow) => flow.flow_id === item.automation_flow_id))
  const compilePendingCount = definitionReadyCases.filter((item) => !item.automation_flow_id).length
  const incompleteCount = cases.filter((item) => !String(item.steps || '').trim() || !String(item.expected || '').trim()).length
  const staleFlowCount = definitionReadyCases.filter((item) => item.automation_flow_id && !flows.some((flow) => flow.flow_id === item.automation_flow_id)).length
  const batchCompletedCount = batchCaseResults.filter((item) => ['PASS', 'FAIL', 'SKIP', 'BLOCKED'].includes(item.status)).length
  const batchActive = Boolean(batchBusy || batchExecution?.status === 'RUNNING' || batchExecution?.status === 'STOPPING')
  const visibleRuns = runs.filter((run) => (!status || run.status === status) && (!query || `${run.run_id} ${run.flow_id}`.toLowerCase().includes(query.toLowerCase())))
  const comparableRuns = selected ? runs.filter((item) => item.run_id !== selected.run_id && item.flow_id === selected.flow_id && item.status !== 'RUNNING') : []
  const findings = selected ? buildDiagnosis(selected, stepResults) : []
  const openDetails = async (run: Run) => {
    const baseline = runs.find((item) => item.run_id !== run.run_id && item.flow_id === run.flow_id && item.status === 'PASS') || null
    const [currentSteps, baselineSteps, suggestions] = await Promise.all([api<RunStepResult[]>(`/runs/${run.run_id}/steps`), baseline ? api<RunStepResult[]>(`/runs/${baseline.run_id}/steps`) : Promise.resolve([]), api<HealingSuggestion[]>(`/runs/${run.run_id}/healing-suggestions`)])
    const initialStep = currentSteps.find((item) => ['FAIL', 'BLOCKED'].includes(String(item.status))) || currentSteps[0]
    setSelected(run); setStepResults(currentSteps); setSelectedEvidenceStep(Number(initialStep?.step_no || 0)); setHealingSuggestions(suggestions); setCompareRun(baseline); setCompareSteps(baselineSteps); setTab('联动证据')
  }
  useEffect(() => {
    if (!environments.length) { setBatchEnvironmentId(''); return }
    if (!environments.some((item) => item.id === batchEnvironmentId)) setBatchEnvironmentId(environments[0].id)
  }, [environments, batchEnvironmentId])
  useEffect(() => {
    const runId = batchExecution?.regression_run_id
    if (!runId || !['RUNNING', 'STOPPING'].includes(batchExecution.status)) return
    let disposed = false
    let timer = 0
    const poll = async () => {
      try {
        const snapshot = await api<RegressionRun & { cases?: RegressionCaseResult[] }>(`/regression-runs/${runId}/status`)
        if (disposed) return
        setBatchExecution(snapshot)
        setBatchCaseResults(snapshot.cases || [])
        if (['RUNNING', 'STOPPING'].includes(snapshot.status)) timer = window.setTimeout(() => void poll(), 900)
        else {
          setBatchBusy(false)
          setBatchMessage(snapshot.status === 'PASS' ? '全部可执行用例已通过，证据已归档。' : `批量执行结束：${snapshot.failed_cases} 条失败，${snapshot.blocked_cases} 条阻塞。失败项已进入缺陷草稿。`)
        }
      } catch (error) {
        if (!disposed) {
          setBatchBusy(false)
          setBatchMessage(error instanceof Error ? `读取批量执行状态失败：${error.message}` : '读取批量执行状态失败')
        }
      }
    }
    timer = window.setTimeout(() => void poll(), 650)
    return () => { disposed = true; window.clearTimeout(timer) }
  }, [batchExecution?.regression_run_id, batchExecution?.status])
  const startProjectRun = async () => {
    if (!projectId) { await dialog.alert('请先选择一个项目。', '无法开始执行'); return }
    const environment = environments.find((item) => item.id === batchEnvironmentId)
    if (!environment) { await dialog.alert('请先选择执行环境。', '执行环境未配置'); return }
    if (!String(environment.base_url || '').trim()) { await dialog.alert('当前环境没有 Base URL。请到设置中补充地址后再执行。', '执行环境不完整'); return }
    if (!executableCases.length) { await dialog.alert('没有同时满足“步骤完整、预期完整、执行包有效”的用例。请先在测试资产中补全并批量编译。', '没有可执行用例'); return }
    const blocked = cases.length - executableCases.length
    if (!await dialog.confirm(`将使用“${environment.name}”按顺序执行 ${executableCases.length} 条用例，并为每条用例保存截图、日志和 Trace。${blocked ? `另有 ${blocked} 条不满足执行条件，本次不会运行。` : ''}`, { title: '运行全部可执行用例', confirmLabel: '开始执行' })) return
    setBatchBusy(true)
    setBatchMessage('正在创建受控执行计划…')
    setBatchCaseResults([])
    try {
      const plan = await api<RegressionPlan>('/regression-plans', {
        method: 'POST',
        body: JSON.stringify({
          regression_plan_id: `klein-auto-${projectId}`,
          project_id: projectId,
          name: 'Lodestar 自动执行',
          description: '由执行中心根据当前可执行测试资产自动生成',
          environment_id: environment.id,
          browser: environment.browser || 'chromium',
          stop_on_failure: batchStopOnFailure,
          cases: executableCases.map((item) => ({ case_id: item.case_id, enabled: true })),
        }),
      })
      const started = await api<RegressionRun>(`/regression-plans/${plan.regression_plan_id}/runs`, { method: 'POST' })
      setBatchExecution(started)
      setBatchMessage(`批量执行已启动：${started.regression_run_id}`)
    } catch (error) {
      setBatchBusy(false)
      setBatchMessage(error instanceof Error ? `启动失败：${error.message}` : '批量执行启动失败')
    }
  }
  const stopProjectRun = async () => {
    if (!batchExecution || !batchActive) return
    try {
      await api(`/regression-runs/${batchExecution.regression_run_id}/stop`, { method: 'POST' })
      setBatchExecution((current) => current ? { ...current, status: 'STOPPING' } : current)
      setBatchMessage('正在停止，已完成用例及证据会保留。')
    } catch (error) { setBatchMessage(error instanceof Error ? error.message : '停止失败') }
  }
  const openBatchEvidence = async (result: RegressionCaseResult) => {
    if (!result.run_id) return
    const target = runs.find((item) => item.run_id === result.run_id) || await api<Run>(`/runs/${result.run_id}/status`)
    await openDetails(target)
  }
  const selectComparison = async (runId: string) => {
    const target = runs.find((item) => item.run_id === runId) || null
    setCompareRun(target)
    setCompareSteps(target ? await api<RunStepResult[]>(`/runs/${target.run_id}/steps`) : [])
  }
  useEffect(() => { if (initialRunId) { const target = runs.find((item) => item.run_id === initialRunId); if (target) void openDetails(target) } }, [initialRunId, runs.length])
  const artifact = (runId: string, path: unknown) => { const value = String(path || '').replaceAll('\\', '/'); const marker = `runs/${runId}/`; const index = value.indexOf(marker); return index >= 0 ? `${serviceOrigin}/artifacts/${runId}/${value.slice(index + marker.length)}` : '' }
  const traceUrl = selected ? `${serviceOrigin}/artifacts/${selected.run_id}/trace/trace.zip` : ''
  const comparisonRows = Array.from(new Set([...stepResults, ...compareSteps].map((item) => Number(item.step_no)))).filter(Number.isFinite).sort((a, b) => a - b).map((stepNo) => ({ stepNo, current: stepResults.find((item) => Number(item.step_no) === stepNo), baseline: compareSteps.find((item) => Number(item.step_no) === stepNo) }))
  const prepareAiDiagnosis = () => {
    if (!selected) return
    const failedEvidence = stepResults.filter((item) => String(item.status) !== 'PASS').slice(0, 4).map((item) => `步骤${item.step_no || '-'} ${item.name || '未命名步骤'} [${item.status || '未知'}]\n错误：${safeEvidence(item.error_message || item.message, 900)}\nConsole：${safeEvidence(item.console_summary, 1200)}\nNetwork：${safeEvidence(item.network_summary, 700)}\n定位器：${safeEvidence(item.locator_json, 500)}`).join('\n\n')
    onAiDiagnose(`请深度分析运行 ${selected.run_id} 的失败证据。请区分已确认事实、推测根因和建议验证动作，并按优先级给出修复方案。\n\n${failedEvidence || `运行状态：${selected.status}\n错误：${selected.error_message || '无详细错误'}`}`)
  }
  const decideHealing = async (suggestion: HealingSuggestion, decision: 'approve' | 'reject') => {
    if (decision === 'approve' && !await dialog.confirm(`将“${suggestion.element_name}”的主定位器更新为 ${suggestion.proposed_type}: ${suggestion.proposed_value}，原定位器会保留为备用。`, { title: '批准定位器自愈', confirmLabel: '批准并更新' })) return
    setHealingBusy(suggestion.suggestion_id)
    try {
      const result = await api<HealingSuggestion>(`/healing-suggestions/${suggestion.suggestion_id}/${decision}`, { method: 'POST' })
      setHealingSuggestions((items) => items.map((item) => item.suggestion_id === result.suggestion_id ? { ...item, status: result.status } : item))
      onHealingResolved()
    } finally { setHealingBusy('') }
  }
  const currentEvidence = stepResults.find((item) => Number(item.step_no) === selectedEvidenceStep) || stepResults[0]
  const currentSuggestion = healingSuggestions.find((item) => item.step_no === Number(currentEvidence?.step_no))
  const selectedFlow = selected ? flows.find((item) => item.flow_id === selected.flow_id) : undefined
  const smartRerun = async (stepNo: number) => {
    if (!selected) return
    let flowForPlan = selectedFlow
    if (!flowForPlan?.steps?.length) {
      try { flowForPlan = await api<Flow>(`/flows/${selected.flow_id}`) } catch { /* fallback to the selected step only */ }
    }
    const plan = planLocalRerun(flowForPlan, stepNo)
    const detail = plan.included.length ? `\n\n将执行：\n${plan.included.join('\n')}` : ''
    if (!await dialog.confirm(`${plan.reason}${detail}`, { title: `智能局部重跑 · 步骤 ${plan.from}-${plan.to}`, confirmLabel: '确认启动' })) return
    await onRunRange(selected.flow_id, selected.environment_id, selected.browser, plan.from, plan.to)
  }
  return <div className="content-view runs-center execution-hub"><div className="panel-header"><div><div className="eyebrow">EXECUTION CONTROL</div><h1>执行中心</h1><p>统一运行导入用例，实时查看步骤状态，并把失败证据送入缺陷草稿。</p></div><div className="header-actions"><span className="execution-live"><i className={batchActive || running ? 'busy' : ''}/>{batchActive || running ? '正在执行' : '执行器就绪'}</span></div></div>
    <section className="project-run-console" aria-label="项目批量执行">
      <div className="project-run-readiness"><div><span>测试资产</span><strong>{cases.length}</strong><small>当前项目</small></div><div className="ready"><span>可执行</span><strong>{executableCases.length}</strong><small>定义与执行包有效</small></div><div className={compilePendingCount ? 'warning' : ''}><span>待编译</span><strong>{compilePendingCount}</strong><small>字段完整，尚无执行包</small></div><div className={incompleteCount + staleFlowCount ? 'blocked' : ''}><span>已阻断</span><strong>{incompleteCount + staleFlowCount}</strong><small>缺字段或执行包失效</small></div></div>
      <div className="project-run-controls"><label><span>执行环境</span><select value={batchEnvironmentId} onChange={(event) => setBatchEnvironmentId(event.target.value)} disabled={batchActive}><option value="">请选择环境</option>{environments.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_url || '未配置地址'}</option>)}</select></label><button className="outline-btn project-run-configure" onClick={onConfigureEnvironment} disabled={batchActive} title="配置执行环境"><Settings size={14}/>环境</button><label className="project-run-stop-policy"><input type="checkbox" checked={batchStopOnFailure} onChange={(event) => setBatchStopOnFailure(event.target.checked)} disabled={batchActive}/><span><strong>失败即停止</strong><small>保留已完成结果，其余标记跳过</small></span></label><button className="toolbar-btn primary project-run-start" disabled={batchActive || !executableCases.length} onClick={() => void startProjectRun()}>{batchActive ? <RefreshCw className="spin" size={14}/> : <Play size={14}/>} {batchActive ? '执行中' : `运行全部 ${executableCases.length || ''}`}</button>{batchActive && <button className="outline-btn danger-outline" onClick={() => void stopProjectRun()}><CircleStop size={14}/>停止</button>}</div>
      {batchExecution && <div className={`project-run-progress ${String(batchExecution.status).toLowerCase()}`}><header><div><span>{batchExecution.regression_run_id}</span><strong>{batchExecution.status === 'RUNNING' ? '正在执行测试资产' : batchExecution.status === 'PASS' ? '批量执行通过' : batchExecution.status === 'STOPPING' ? '正在安全停止' : '批量执行已结束'}</strong></div><b>{batchCompletedCount} / {batchExecution.total_cases}</b></header><div className="project-run-progress-track"><i style={{ width: `${batchExecution.total_cases ? Math.round(batchCompletedCount / batchExecution.total_cases * 100) : 0}%` }}/></div><div className="project-run-result-list">{batchCaseResults.map((item) => <button key={item.id} disabled={!item.run_id} onClick={() => void openBatchEvidence(item)}><span className={`run-state-dot ${item.status.toLowerCase()}`}/><strong>{item.case_id} · {item.title}</strong><em>{item.status === 'PASS' ? '通过' : item.status === 'FAIL' ? '失败' : item.status}</em>{item.run_id && <Eye size={12}/>}</button>)}</div></div>}
      <footer className="project-run-message"><span>{batchMessage || (executableCases.length ? '执行前会再次确认环境、范围和证据策略。' : '请先到测试资产补全用例并批量编译。')}</span>{batchExecution && batchExecution.failed_cases > 0 && !batchActive && <button onClick={onOpenDefects}><Bug size={13}/>审核缺陷草稿</button>}</footer>
    </section>
    {running && <div className="running-card"><span className="pulse"/><div><strong>{running.status === 'PAUSED' ? '已暂停' : running.status === 'STOPPING' ? '正在停止' : '正在执行'}</strong><small>{running.run_id} · {running.browser}</small></div><span className="running-label">{running.status}</span></div>}
    <div className="run-filters"><input placeholder="搜索 Run ID 或流程 ID" value={query} onChange={(e) => setQuery(e.target.value)}/><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部状态</option><option value="PASS">通过</option><option value="FAIL">失败</option><option value="STOPPED">已停止</option><option value="PAUSED">已暂停</option></select><span>{visibleRuns.length} 条记录</span></div>
    <div className="run-table"><div className="asset-header"><span>执行编号</span><span>流程</span><span>环境</span><span>浏览器</span><span>状态</span><span>报告</span></div>{visibleRuns.map((run) => <div className={`asset-row ${selected?.run_id === run.run_id ? 'selected' : ''}`} key={run.run_id}><strong>{run.run_id}</strong><span>{flows.find((item) => item.flow_id === run.flow_id)?.name || run.flow_id}</span><span>{environments.find((item) => item.id === run.environment_id)?.name || '未配置'}</span><span>{run.browser}</span><span className={`status ${run.status.toLowerCase()}`}>{run.status === 'PASS' ? '通过' : run.status === 'FAIL' ? '失败' : run.status}</span><span className="row-actions">{run.report_path ? <a href={`${serviceOrigin}/artifacts/${run.run_id}/report.html`} target="_blank" rel="noreferrer">HTML报告</a> : '执行中'}<button onClick={() => void openDetails(run)}>分析证据</button></span></div>)}</div>
    {selected && <section className="run-detail evidence-workbench">
      <header className="evidence-workbench-head"><div><small>EVIDENCE WORKBENCH</small><strong>{selected.run_id}</strong><span>{flows.find((item) => item.flow_id === selected.flow_id)?.name || selected.flow_id}{selected.dataset_name ? ` · 数据集：${selected.dataset_name}` : ''}</span></div><div><span className={`status ${selected.status.toLowerCase()}`}>{selected.status}</span><button className="icon-button" onClick={() => setSelected(null)} title="关闭证据工作台" aria-label="关闭证据工作台"><X size={15}/></button></div></header>
      <div className="run-insight-bar"><span><FileSearch size={14}/><strong>{stepResults.length}</strong> 个步骤</span><span><AlertTriangle size={14}/><strong>{stepResults.filter((item) => String(item.status) !== 'PASS').length}</strong> 个异常</span><span><Clock3 size={14}/><strong>{stepResults.reduce((sum, item) => sum + Number(item.duration_ms || 0), 0)}</strong> ms</span><span><Columns3 size={14}/><strong>{compareRun ? '已连接' : '缺少'}</strong> 对比基线</span></div>
      <div className="detail-tabs evidence-tabs">{['联动证据','智能诊断','运行对比','概览','定位器','截图','DOM','Console','Network','Trace','日志'].map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>
      {tab === '联动证据' && <div className="linked-evidence">
        <aside className="linked-step-list">
          <header><span>动作时间线</span><small>{stepResults.length} 个步骤</small></header>
          {stepResults.map((item) => <button key={String(item.run_step_id || item.step_no)} className={Number(item.step_no) === Number(currentEvidence?.step_no) ? 'active' : ''} onClick={() => setSelectedEvidenceStep(Number(item.step_no))}><span className={`evidence-step-status ${String(item.status).toLowerCase()}`}>{String(item.step_no).padStart(2, '0')}</span><div><strong>{String(item.name || '未命名步骤')}</strong><small>{labels[String(item.action || '')] || String(item.action || '')} · {String(item.duration_ms || 0)} ms</small></div><em>{item.status === 'PASS' ? '通过' : item.status === 'FAIL' ? '失败' : String(item.status)}</em></button>)}
        </aside>
        <section className="linked-evidence-detail">{currentEvidence ? <>
          <header><div><small>STEP {String(currentEvidence.step_no).padStart(2, '0')}</small><strong>{String(currentEvidence.name || '未命名步骤')}</strong><span>{String(currentEvidence.page_title || currentEvidence.page_url || '未记录页面信息')}</span></div><div className="evidence-step-actions"><span className={`status ${String(currentEvidence.status).toLowerCase()}`}>{currentEvidence.status === 'PASS' ? '通过' : currentEvidence.status === 'FAIL' ? '失败' : String(currentEvidence.status)}</span><button disabled={Boolean(running)} onClick={() => void smartRerun(Number(currentEvidence.step_no))}><RefreshCw size={12}/>智能局部重跑</button></div></header>
          <div className="linked-evidence-grid">
            <div className="evidence-preview">{artifact(selected.run_id, currentEvidence.screenshot_path) ? <img src={artifact(selected.run_id, currentEvidence.screenshot_path)} alt={`步骤 ${String(currentEvidence.step_no)} 截图`}/> : <div><Eye size={22}/><span>此步骤没有截图证据</span></div>}</div>
            <div className="evidence-facts"><article><span>错误与结果</span><pre>{String(currentEvidence.error_message || currentEvidence.message || '步骤执行通过')}</pre></article><article><span>命中定位器</span><pre>{prettyEvidenceJson(currentEvidence.locator_json)}</pre></article></div>
          </div>
          {currentSuggestion && <article className={`healing-review ${currentSuggestion.status}`}>
            <header><div><span><WandSparkles size={14}/>定位器自愈建议</span><strong>{currentSuggestion.element_name}</strong></div><em>{currentSuggestion.status === 'pending' ? `${currentSuggestion.confidence}% 置信` : currentSuggestion.status === 'approved' ? '已批准' : '已拒绝'}</em></header>
            <div className="healing-locators"><div><small>原定位器</small><code>{currentSuggestion.original_type}: {currentSuggestion.original_value}</code></div><ArrowRight size={15}/><div><small>候选定位器</small><code>{currentSuggestion.proposed_type}: {currentSuggestion.proposed_value}</code></div></div>
            <footer><span><ShieldCheck size={12}/>不会静默覆盖元素资产</span>{currentSuggestion.status === 'pending' ? <div><button disabled={Boolean(healingBusy)} onClick={() => void decideHealing(currentSuggestion, 'reject')}>拒绝</button><button className="confirm" disabled={Boolean(healingBusy)} onClick={() => void decideHealing(currentSuggestion, 'approve')}><Check size={13}/>批准</button></div> : currentSuggestion.status === 'approved' ? <button className="verify" disabled={Boolean(running)} onClick={() => void smartRerun(currentSuggestion.step_no)}><Play size={13}/>智能验证修复</button> : <span>建议已归档</span>}</footer>
          </article>}
          <div className="evidence-detail-columns"><article><header>Console</header><pre>{String(currentEvidence.console_summary || '无 Console 消息')}</pre></article><article><header>Network</header><pre>{String(currentEvidence.network_summary || '无失败请求')}</pre></article></div>
          <footer className="evidence-file-links">{artifact(selected.run_id, currentEvidence.dom_snapshot_path) && <a href={artifact(selected.run_id, currentEvidence.dom_snapshot_path)} target="_blank" rel="noreferrer"><Braces size={13}/>DOM 快照</a>}{artifact(selected.run_id, currentEvidence.log_path) && <a href={artifact(selected.run_id, currentEvidence.log_path)} target="_blank" rel="noreferrer"><FileSearch size={13}/>步骤日志</a>}<span>智能重跑会先分析依赖并展示执行范围，确认后才启动</span></footer>
        </> : <div className="linked-evidence-empty"><FileSearch size={24}/><strong>没有可联动的步骤证据</strong></div>}</section>
      </div>}
      {tab === '智能诊断' && <div className="diagnosis-panel"><header><div><span><Sparkles size={14}/>智能根因排序</span><small>基于当前已采集证据，不等同于最终定因</small></div><button className="toolbar-btn primary" onClick={prepareAiDiagnosis}><Sparkles size={14}/>交给 AI 深度分析</button></header><div className="diagnosis-grid">{findings.map((finding, index) => <article key={`${finding.kind}-${index}`} className={finding.kind}><div className="diagnosis-rank">{index + 1}</div><div><header><strong>{finding.title}</strong><em>{finding.confidence}% 置信</em></header><p>{finding.detail}</p><small><FileSearch size={12}/>{finding.evidence}</small></div></article>)}</div><footer><ShieldCheck size={13}/>建议先核对排名最高的证据，再修改流程或断言。</footer></div>}
      {tab === '运行对比' && <div className="run-compare-panel"><header><div><span>当前运行</span><strong>{selected.run_id}</strong></div><ArrowRight size={16}/><label><span>对比基线</span><select value={compareRun?.run_id || ''} onChange={(event) => void selectComparison(event.target.value)}><option value="">选择同流程运行</option>{comparableRuns.map((run) => <option value={run.run_id} key={run.run_id}>{run.status === 'PASS' ? '通过基线' : `${run.status} 参考`} · {run.run_id}</option>)}</select></label></header>{compareRun ? <div className="compare-table"><div className="compare-row compare-head"><span>步骤</span><span>当前状态</span><span>基线状态</span><span>耗时变化</span><span>判断</span></div>{comparisonRows.map(({ stepNo, current, baseline }) => { const delta = Number(current?.duration_ms || 0) - Number(baseline?.duration_ms || 0); const changed = String(current?.status || '缺失') !== String(baseline?.status || '缺失'); return <div className={`compare-row ${changed ? 'changed' : ''}`} key={stepNo}><strong>{String(stepNo).padStart(2, '0')} · {String(current?.name || baseline?.name || '')}</strong><span className={`status ${String(current?.status || '').toLowerCase()}`}>{String(current?.status || '缺失')}</span><span className={`status ${String(baseline?.status || '').toLowerCase()}`}>{String(baseline?.status || '缺失')}</span><span className={delta > 0 ? 'slower' : ''}>{delta > 0 ? '+' : ''}{delta} ms</span><em>{changed ? '状态变化' : delta > 1000 ? '明显变慢' : '一致'}</em></div>})}</div> : <div className="compare-empty"><Columns3 size={22}/><strong>尚未选择对比运行</strong><span>{comparableRuns.length ? '没有自动匹配到成功基线，可在上方选择一条参考运行' : '完成一次同流程运行后即可进行步骤级差异分析'}</span></div>}</div>}
      {tab === 'Trace' && <div className="trace-studio">
        <aside className="trace-timeline"><header><span>TRACE TIMELINE</span><small>{stepResults.length} actions</small></header>{stepResults.map((item) => <button key={String(item.run_step_id || item.step_no)} className={Number(item.step_no) === Number(currentEvidence?.step_no) ? 'active' : ''} onClick={() => { setSelectedEvidenceStep(Number(item.step_no)); setTracePhase('after') }}><span className={`trace-dot ${String(item.status).toLowerCase()}`}/><div><strong>{String(item.name || '未命名步骤')}</strong><small>{labels[String(item.action || '')] || String(item.action || '')}</small></div><time>{String(item.duration_ms || 0)} ms</time></button>)}</aside>
        <section className="trace-inspector">{currentEvidence ? <><header><div><small>ACTION {String(currentEvidence.step_no).padStart(2, '0')}</small><strong>{String(currentEvidence.name || '未命名步骤')}</strong><span>{String(currentEvidence.page_url || '未记录页面地址')}</span></div><div className="trace-head-actions">{selected.trace_path && <a href={traceUrl} target="_blank" rel="noreferrer"><Download size={12}/>trace.zip</a>}<button onClick={() => window.open(`https://trace.playwright.dev/?trace=${encodeURIComponent(traceUrl)}`, '_blank', 'noopener,noreferrer')} disabled={!selected.trace_path}><AppWindow size={12}/>官方 Viewer</button></div></header>
          <div className="trace-phase-tabs"><button className={tracePhase === 'before' ? 'active' : ''} onClick={() => setTracePhase('before')}>Before</button><span><ArrowRight size={13}/>{labels[String(currentEvidence.action || '')] || String(currentEvidence.action || 'Action')}</span><button className={tracePhase === 'after' ? 'active' : ''} onClick={() => setTracePhase('after')}>After</button></div>
          <div className="trace-stage">{artifact(selected.run_id, tracePhase === 'before' ? currentEvidence.before_screenshot_path : currentEvidence.after_screenshot_path || currentEvidence.screenshot_path) ? <img src={artifact(selected.run_id, tracePhase === 'before' ? currentEvidence.before_screenshot_path : currentEvidence.after_screenshot_path || currentEvidence.screenshot_path)} alt={`${tracePhase} step ${String(currentEvidence.step_no)}`}/> : <div><Eye size={25}/><strong>{tracePhase === 'before' ? '该历史步骤没有 Before 截图' : '该步骤没有 After 截图'}</strong><span>新执行会自动采集动作前后画面</span></div>}</div>
          <div className="trace-filmstrip">{stepResults.map((item) => { const thumb = artifact(selected.run_id, item.after_screenshot_path || item.screenshot_path); return <button key={String(item.run_step_id || item.step_no)} className={Number(item.step_no) === Number(currentEvidence.step_no) ? 'active' : ''} onClick={() => setSelectedEvidenceStep(Number(item.step_no))}>{thumb ? <img src={thumb} alt=""/> : <span><Eye size={13}/></span>}<em>{String(item.step_no).padStart(2, '0')}</em></button> })}</div>
          <div className="trace-data-grid"><article><header>Action</header><pre>{prettyEvidenceJson(currentEvidence.action_spec_json)}</pre></article><article><header>Locator</header><pre>{prettyEvidenceJson(currentEvidence.locator_json)}</pre></article><article><header>Console</header><pre>{String(currentEvidence.console_summary || '无 Console 消息')}</pre></article><article><header>Network</header><pre>{String(currentEvidence.network_summary || '无失败请求')}</pre></article></div>
        </> : <div className="linked-evidence-empty"><Activity size={24}/><strong>没有可展示的 Trace 步骤</strong></div>}</section>
      </div>}
      {!['联动证据','智能诊断','运行对比','Trace'].includes(tab) && <div className="detail-timeline">{stepResults.map((item) => { const screenshot = artifact(selected.run_id, item.screenshot_path); const log = artifact(selected.run_id, item.log_path); const dom = artifact(selected.run_id, item.dom_snapshot_path); const show = tab === '概览' || (tab === '定位器' && item.locator_json) || (tab === '截图' && screenshot) || (tab === 'DOM' && dom) || (tab === 'Console' && item.console_summary) || (tab === 'Network' && item.network_summary) || (tab === '日志' && log); return show ? <details className="run-step-detail" open={tab !== '概览'} key={String(item.run_step_id || item.step_no)}><summary><span>{String(item.step_no).padStart(2, '0')}</span><strong>{String(item.name || '')}</strong><span className={`status ${String(item.status).toLowerCase()}`}>{item.status === 'PASS' ? '通过' : item.status === 'FAIL' ? '失败' : String(item.status)}</span><span>{String(item.duration_ms || 0)} ms</span></summary><div className="evidence-links"><span>{String(item.page_url || '')}</span>{screenshot && <a href={screenshot} target="_blank" rel="noreferrer">截图</a>}{log && <a href={log} target="_blank" rel="noreferrer">日志</a>}{dom && <a href={dom} target="_blank" rel="noreferrer">DOM</a>}</div><pre className="error-detail">{tab === '定位器' ? String(item.locator_json || '无定位器') : tab === 'Console' ? String(item.console_summary || '无 Console 消息') : tab === 'Network' ? String(item.network_summary || '无失败请求') : String(item.error_message || item.message || '步骤通过')}</pre></details> : null })}</div>}
    </section>}
    {!visibleRuns.length && !running && <div className="empty-state">暂无匹配的执行记录</div>}
  </div>
}

const DEFECT_DRAFT_STORAGE = 'klein.defect-drafts.v2'

function loadDefectDrafts(): DefectDraft[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(DEFECT_DRAFT_STORAGE) || '[]')
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

function buildDefectDraft(run: Run, flows: Flow[], cases: TestCase[]): DefectDraft {
  const linkedCase = cases.find((item) => item.automation_flow_id === run.flow_id)
  const linkedFlow = flows.find((item) => item.flow_id === run.flow_id)
  const moduleName = linkedCase?.module?.trim() || '未分类模块'
  const scenario = linkedCase?.title?.trim() || linkedFlow?.name?.trim() || '自动化测试场景'
  const error = String(run.error_message || '执行结果与预期不一致').trim()
  return {
    runId: run.run_id,
    title: `【${moduleName}】${scenario}执行结果异常`,
    preconditions: linkedCase?.preconditions?.trim() || '待根据原始用例补充前置条件',
    steps: linkedCase?.steps?.trim() || linkedFlow?.steps?.map((step, index) => `${index + 1}. ${step.name}`).join('\n') || '待根据实际执行轨迹整理操作步骤',
    expected: linkedCase?.expected?.trim() || '待补充明确、可验证的预期结果',
    actual: `${error}\n\n执行编号：${run.run_id}\n浏览器：${run.browser || '未记录'}\n执行时间：${run.ended_at || run.started_at || '未记录'}`,
    status: 'draft',
  }
}

function DefectDraftsView({ projectId, runs, flows, cases, onOpenEvidence, onOpenAi }: { projectId: string; runs: Run[]; flows: Flow[]; cases: TestCase[]; onOpenEvidence: () => void; onOpenAi: (prompt: string) => void }) {
  const failedRuns = runs.filter((item) => item.status === 'FAIL')
  const [drafts, setDrafts] = useState<DefectDraft[]>(loadDefectDrafts())
  const [selectedId, setSelectedId] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    setDrafts((current) => {
      const known = new Set(current.map((item) => item.runId))
      const additions = failedRuns.filter((run) => !known.has(run.run_id)).map((run) => buildDefectDraft(run, flows, cases))
      return additions.length ? [...additions, ...current] : current
    })
  }, [runs, flows, cases])
  useEffect(() => {
    if (!projectId) return
    void api<DefectDraft[]>(`/projects/${projectId}/mission-defect-drafts`).then((missionDrafts) => {
      setDrafts((current) => {
        const saved = new Map(current.map((item) => [item.runId, item]))
        const additions = missionDrafts.filter((item) => !saved.has(item.runId))
        return additions.length ? [...additions, ...current] : current
      })
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'Mission 缺陷草稿加载失败'))
  }, [projectId])
  useEffect(() => { window.localStorage.setItem(DEFECT_DRAFT_STORAGE, JSON.stringify(drafts)) }, [drafts])
  useEffect(() => { if (!selectedId && drafts[0]) setSelectedId(drafts[0].runId) }, [drafts, selectedId])
  const selected = drafts.find((item) => item.runId === selectedId) || drafts[0]
  const update = (field: keyof DefectDraft, value: string) => setDrafts((items) => items.map((item) => item.runId === selected?.runId ? { ...item, [field]: value } : item))
  const copyDraft = async () => {
    if (!selected) return
    const text = `缺陷标题\n${selected.title}\n\n【前置条件】\n${selected.preconditions}\n\n【操作步骤】\n${selected.steps}\n\n【预期结果】\n${selected.expected}\n\n【实际结果】\n${selected.actual}`
    try { await navigator.clipboard.writeText(text); setMessage('五项内容已复制，可直接粘贴到 TAPD') } catch { setMessage('系统未授予剪贴板权限，请手动选择内容') }
  }
  const markReviewed = () => {
    if (!selected) return
    setDrafts((items) => items.map((item) => item.runId === selected.runId ? { ...item, status: 'reviewed' } : item))
    setMessage('草稿已完成审核')
  }
  return <div className="content-view defect-center-v2">
    <div className="panel-header"><div><div className="eyebrow">DEFECT REVIEW</div><h1>缺陷草稿</h1><p>只根据真实用例和执行证据生成 TAPD 需要的五项内容，其他字段不做推断。</p></div><div className="header-actions"><button className="outline-btn" onClick={onOpenEvidence}><History size={14}/>查看执行证据</button></div></div>
    <section className="defect-metrics"><article><span>失败执行</span><strong>{failedRuns.length}</strong><small>来自真实执行记录</small></article><article><span>待审核</span><strong>{drafts.filter((item) => item.status === 'draft').length}</strong><small>提交前必须人工确认</small></article><article><span>已审核</span><strong>{drafts.filter((item) => item.status === 'reviewed').length}</strong><small>可复制到 TAPD</small></article></section>
    <div className="defect-workbench">
      <aside className="defect-queue"><header><div><span>失败队列</span><strong>{drafts.length} 条</strong></div></header>{drafts.map((item) => <button key={item.runId} className={selected?.runId === item.runId ? 'active' : ''} onClick={() => { setSelectedId(item.runId); setMessage('') }}><span className={`defect-state ${item.status}`}>{item.status === 'reviewed' ? <Check size={13}/> : <Bug size={13}/>}</span><div><strong>{item.title}</strong><small>{item.runId}</small></div><ChevronRight size={14}/></button>)}{!drafts.length && <div className="defect-empty"><CheckCircle2 size={22}/><strong>没有失败执行</strong><span>失败用例会自动进入这里。</span></div>}</aside>
      <section className="defect-editor">{selected ? <><header><div><small>TAPD DRAFT · {selected.runId}</small><strong>五字段审核</strong></div><span className={`draft-badge ${selected.status}`}>{selected.status === 'reviewed' ? '已审核' : '待审核'}</span></header><div className="defect-fields"><label className="wide"><span>缺陷标题</span><input value={selected.title} onChange={(event) => update('title', event.target.value)}/></label><label><span>前置条件</span><textarea value={selected.preconditions} onChange={(event) => update('preconditions', event.target.value)}/></label><label><span>操作步骤</span><textarea value={selected.steps} onChange={(event) => update('steps', event.target.value)}/></label><label><span>预期结果</span><textarea value={selected.expected} onChange={(event) => update('expected', event.target.value)}/></label><label><span>实际结果</span><textarea value={selected.actual} onChange={(event) => update('actual', event.target.value)}/></label></div><footer><span><ShieldCheck size={13}/>内容保存在本机，提交 TAPD 前不会外发。</span><div><button className="outline-btn" onClick={() => onOpenAi(`请审核运行 ${selected.runId} 的缺陷草稿，只优化缺陷标题、前置条件、操作步骤、预期结果、实际结果，不要补充没有证据的内容。`)}><Sparkles size={14}/>让 Lodestar 审核</button><button className="outline-btn" onClick={() => void copyDraft()}><Copy size={14}/>复制五项</button><button className="toolbar-btn primary" onClick={markReviewed}><Check size={14}/>完成审核</button></div></footer>{message && <div className="defect-message">{message}</div>}</> : <div className="defect-empty large"><Bug size={26}/><strong>暂无缺陷草稿</strong><span>执行失败后会根据用例和证据自动生成。</span></div>}</section>
    </div>
  </div>
}

function CiWorkspace({ project, cases, environments, runs, onNavigate }: { project: Project | null; cases: TestCase[]; environments: Environment[]; runs: Run[]; onNavigate: (view: ViewName) => void }) {
  const storageKey = `klein.ci.${project?.id || 'default'}`
  const initial = (() => { try { return JSON.parse(window.localStorage.getItem(storageKey) || '{}') } catch { return {} } })()
  const [provider, setProvider] = useState(initial.provider || 'Jenkins')
  const [trigger, setTrigger] = useState(initial.trigger || '提交代码后')
  const [environment, setEnvironment] = useState(initial.environment || environments[0]?.id || '')
  const [gate, setGate] = useState(initial.gate !== false)
  const [message, setMessage] = useState('')
  const readyCases = cases.filter((item) => String(item.steps || '').trim() && String(item.expected || '').trim() && item.automation_flow_id)
  const command = `"D:\\AutomationStudio客户端\\app\\lodestar-sidecar.exe" --data-dir "D:\\AutomationStudio客户端\\data" project-run --project ${project?.id || '<project-id>'}${environment ? ` --env ${environment}` : ''} --headless --junit "D:\\测试报告\\Lodestar_CI_JUnit.xml"`
  const persist = () => {
    window.localStorage.setItem(storageKey, JSON.stringify({ provider, trigger, environment, gate }))
    setMessage('CI 配置已保存到当前项目')
  }
  return <div className="content-view ci-center-v2"><div className="panel-header"><div><div className="eyebrow">CONTINUOUS TESTING</div><h1>持续集成</h1><p>让可执行用例跟随构建自动运行，用统一退出码和 JUnit 报告控制发布门禁。</p></div><div className="header-actions"><button className="toolbar-btn primary" onClick={persist}><Save size={14}/>保存配置</button></div></div>
    <section className="ci-overview"><div><span>当前项目</span><strong>{project?.name || '未选择项目'}</strong></div><div><span>可执行用例</span><strong>{readyCases.length} / {cases.length}</strong></div><div><span>执行环境</span><strong>{environments.length}</strong></div><div><span>最近运行</span><strong>{runs[0]?.status || '暂无'}</strong></div></section>
    <div className="ci-layout"><section className="ci-config"><header><GitBranch size={17}/><div><strong>流水线配置</strong><span>项目级配置</span></div></header><div className="ci-form"><label><span>CI 平台</span><select value={provider} onChange={(event) => setProvider(event.target.value)}><option>Jenkins</option><option>GitLab CI</option><option>GitHub Actions</option><option>本地命令行</option></select></label><label><span>触发方式</span><select value={trigger} onChange={(event) => setTrigger(event.target.value)}><option>提交代码后</option><option>合并请求时</option><option>定时夜间回归</option><option>手动触发</option></select></label><label className="wide"><span>执行环境</span><select value={environment} onChange={(event) => setEnvironment(event.target.value)}><option value="">请选择执行环境</option>{environments.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.base_url || '未配置地址'}</option>)}</select></label><label className="ci-switch wide"><span><strong>失败阻断构建</strong><small>存在失败用例时返回非零退出码</small></span><input type="checkbox" checked={gate} onChange={(event) => setGate(event.target.checked)}/></label></div>{message && <div className="ci-message">{message}</div>}</section>
      <section className="ci-command"><header><Command size={17}/><div><strong>运行命令</strong><span>{provider}</span></div></header><pre>{command}</pre><div className="ci-command-actions"><button className="outline-btn" onClick={() => void navigator.clipboard.writeText(command).then(() => setMessage('命令已复制')).catch(() => setMessage('无法访问剪贴板'))}><Copy size={14}/>复制命令</button><button className="outline-btn" onClick={() => onNavigate('cases')}><ClipboardList size={14}/>检查执行资格</button></div><div className="ci-contract"><span><b>0</b>全部通过</span><span><b>1</b>用例失败</span><span><b>2</b>阻塞或配置问题</span></div></section>
    </div><section className="ci-flow"><header><span>PIPELINE FLOW</span><strong>持续测试链路</strong></header><div><span><GitBranch size={15}/></span><strong>代码变更</strong><ChevronRight size={14}/><span><ClipboardList size={15}/></span><strong>选择用例</strong><ChevronRight size={14}/><span><Play size={15}/></span><strong>自动执行</strong><ChevronRight size={14}/><span><Bug size={15}/></span><strong>缺陷草稿</strong></div></section>
  </div>
}

function ProjectBrainView({ projectId, onNavigate }: { projectId: string; onNavigate: (view: ViewName) => void }) {
  const [brain, setBrain] = useState<ProjectBrain | null>(null)
  const [loading, setLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedRequirementId, setSelectedRequirementId] = useState('')
  const [draft, setDraft] = useState({ title: '', module: '', source_name: '', content: '' })

  const loadBrain = async () => {
    if (!projectId) { setBrain(null); return }
    setLoading(true)
    try {
      const value = await api<ProjectBrain>(`/projects/${projectId}/brain`)
      setBrain(value)
      setSelectedRequirementId((current) => current || value.requirements[0]?.requirement_id || '')
      if (!value.requirements.length) setImportOpen(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '项目知识加载失败')
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadBrain() }, [projectId])

  const importRequirement = async () => {
    if (!draft.title.trim() || !draft.content.trim()) { setMessage('请填写需求标题和正文'); return }
    setSaving(true); setMessage('')
    try {
      const result = await api<{ import_result: 'NEW' | 'UPDATED' | 'DUPLICATE'; requirement: BrainRequirement; affected_cases: { case_id: string }[]; detected: { entities: number; relations: number; rules: number; questions: number } }>(`/projects/${projectId}/brain/requirements`, {
        method: 'POST',
        body: JSON.stringify({ ...draft, source_type: 'text' }),
      })
      const resultLabel = result.import_result === 'NEW' ? '已建立首个有效版本' : result.import_result === 'UPDATED' ? '已生成待确认变更' : '资料重复，未创建新版本'
      setMessage(`${resultLabel} · 影响 ${result.affected_cases.length} 条用例 · 识别 ${result.detected.rules} 条规则`)
      setSelectedRequirementId(result.requirement.requirement_id)
      if (result.import_result !== 'DUPLICATE') {
        setDraft({ title: '', module: '', source_name: '', content: '' })
        setImportOpen(false)
      }
      await loadBrain()
    } catch (error) { setMessage(error instanceof Error ? error.message : '需求导入失败') }
    finally { setSaving(false) }
  }

  const reviewVersion = async (versionId: string, decision: 'activate' | 'reject') => {
    try {
      await api(`/requirement-versions/${versionId}/review`, { method: 'PUT', body: JSON.stringify({ decision }) })
      setMessage(decision === 'activate' ? '新版本已设为当前有效需求' : '变更版本已拒绝，当前规则保持不变')
      await loadBrain()
    } catch (error) { setMessage(error instanceof Error ? error.message : '版本审核失败') }
  }

  if (!projectId) return <div className="brain-empty-page"><BrainCircuit size={28}/><strong>尚未选择项目</strong></div>
  const selected = brain?.requirements.find((item) => item.requirement_id === selectedRequirementId) || brain?.requirements[0]
  const pending = brain?.requirements.filter((item) => item.status === 'pending_review') || []
  const selectedImpacts = selected ? brain?.impacts.filter((item) => item.requirement_id === selected.requirement_id && item.status !== 'rejected' && item.target_type === 'test_case') : []

  return <div className="project-brain-view">
    <div className="panel-header brain-header"><div><div className="eyebrow">PROJECT INTELLIGENCE / {brain?.knowledge_version || 'K0'}</div><h1>项目智能中心</h1><p>{brain?.project.name || '项目知识正在初始化'}</p></div><div className="header-actions"><button className="outline-btn" onClick={() => void loadBrain()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''}/>刷新</button><button className="toolbar-btn primary" onClick={() => setImportOpen((open) => !open)}><FilePlus2 size={14}/>{importOpen ? '收起导入' : '导入需求'}</button></div></div>

    <section className="brain-ledger">
      <div><span>知识版本</span><strong>{brain?.knowledge_version || 'K0'}</strong><small>版本化事实账本</small></div>
      <div><span>有效需求</span><strong>{brain?.summary.requirements || 0}</strong><small>{brain?.summary.pending_changes || 0} 项待确认</small></div>
      <div><span>业务对象</span><strong>{brain?.summary.entities || 0}</strong><small>{brain?.summary.relations || 0} 条关系</small></div>
      <div><span>有效规则</span><strong>{brain?.summary.active_rules || 0}</strong><small>旧规则保留追溯</small></div>
      <div><span>影响用例</span><strong>{brain?.summary.impacted_cases || 0}</strong><small>按需求范围计算</small></div>
    </section>

    {importOpen && <section className="brain-import-dock">
      <header><div><span>REQUIREMENT INGEST</span><strong>导入需求版本</strong></div><span>新模块直接输入名称，不受一期范围限制</span></header>
      <div className="brain-import-fields"><label>需求标题<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：商品库新增商品规则"/></label><label>所属模块<input value={draft.module} onChange={(event) => setDraft({ ...draft, module: event.target.value })} placeholder="支持任意新模块"/></label><label>来源名称<input value={draft.source_name} onChange={(event) => setDraft({ ...draft, source_name: event.target.value })} placeholder="文档、链接或版本名称"/></label></div>
      <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="粘贴需求正文、规则或业务关系，例如：商品 → SKU → 订单"/>
      <footer><span>系统会保留旧版本，变更内容进入审核队列</span><button className="toolbar-btn primary" onClick={() => void importRequirement()} disabled={saving}>{saving ? <RefreshCw size={14} className="spin"/> : <Database size={14}/>}写入项目大脑</button></footer>
    </section>}

    {message && <div className="brain-message"><CheckCircle2 size={14}/><span>{message}</span><button onClick={() => setMessage('')} aria-label="关闭"><X size={13}/></button></div>}

    <div className="brain-workbench">
      <section className="brain-requirements"><header><div><span>REQUIREMENTS</span><strong>需求版本</strong></div><b>{brain?.requirements.length || 0}</b></header><div className="brain-requirement-list">{brain?.requirements.map((item) => <button key={item.requirement_id} className={selected?.requirement_id === item.requirement_id ? 'active' : ''} onClick={() => setSelectedRequirementId(item.requirement_id)}><span className={`brain-state ${item.status === 'pending_review' ? 'pending' : 'active'}`}/><div><strong>{item.title}</strong><small>{item.module || '未分组'} · 当前 v{item.current_version_no || 0}{item.latest_version_no > item.current_version_no ? ` · 待审 v${item.latest_version_no}` : ''}</small></div><ChevronRight size={13}/></button>)}{!brain?.requirements.length && <div className="brain-panel-empty">暂无需求版本</div>}</div></section>

      <section className="brain-knowledge"><header><div><span>DOMAIN GRAPH</span><strong>业务对象与关系</strong></div><b>{brain?.summary.relations || 0}</b></header><div className="brain-entity-cloud">{brain?.entities.slice(0, 18).map((item) => <button key={item.entity_id} className={item.status === 'pending_review' ? 'pending' : ''} title={item.description || item.entity_type} onClick={() => setMessage(`${item.name}：${item.description || (item.entity_type === 'module' ? '业务模块' : '业务对象')}`)}><Box size={13}/><span>{item.name}</span><small>{item.entity_type === 'module' ? '模块' : '对象'}</small></button>)}{!brain?.entities.length && <div className="brain-panel-empty">导入包含业务链路的需求后生成对象关系</div>}</div><div className="brain-relation-list">{brain?.relations.slice(0, 12).map((item) => <div key={item.relation_id}><strong>{item.source_name}</strong><span>{item.relation_type === 'flows_to' ? '流向' : item.relation_type}</span><ChevronRight size={12}/><strong>{item.target_name}</strong></div>)}</div></section>

      <section className="brain-review"><header><div><span>REVIEW QUEUE</span><strong>口径与变更确认</strong></div><b>{pending.length}</b></header>{pending.length ? <div className="brain-review-list">{pending.map((item) => <article key={item.requirement_id}><div><span>v{item.current_version_no} → v{item.latest_version_no}</span><strong>{item.title}</strong><small>{item.module || '未分组'} · {item.pending_questions.length ? `${item.pending_questions.length} 项待确认口径` : '需求内容发生变化'}</small></div><footer><button className="outline-btn danger-outline" onClick={() => void reviewVersion(item.latest_version_id, 'reject')}>拒绝</button><button className="toolbar-btn primary" onClick={() => void reviewVersion(item.latest_version_id, 'activate')}><Check size={13}/>设为有效</button></footer></article>)}</div> : <div className="brain-review-clear"><CheckCircle2 size={20}/><strong>没有待确认变更</strong><small>当前知识版本保持一致</small></div>}</section>
    </div>

    <div className="brain-detail-grid">
      <section className="brain-rule-table"><header><div><span>BUSINESS RULES</span><strong>{selected ? selected.title : '当前有效规则'}</strong></div><button className="small-link" onClick={() => onNavigate('cases')}>打开测试资产</button></header><div className="brain-rule-head"><span>模块</span><span>规则</span><span>状态</span><span>关联用例</span></div>{brain?.rules.filter((rule) => !selected || rule.source_requirement_id === selected.requirement_id).slice(0, 12).map((rule) => <div className="brain-rule-row" key={rule.rule_id}><span>{rule.module || '全项目'}</span><strong>{rule.rule_text}</strong><em className={rule.status}>{rule.status === 'active' ? '有效' : rule.status === 'pending_review' ? '待确认' : '历史'}</em><span>{rule.impacted_case_ids.length}</span></div>)}{brain && !brain.rules.filter((rule) => !selected || rule.source_requirement_id === selected.requirement_id).length && <div className="brain-panel-empty">当前需求未识别到明确规则</div>}</section>
      <section className="brain-module-map"><header><div><span>IMPACT SCOPE</span><strong>模块与回归影响</strong></div><button className="small-link" onClick={() => onNavigate('runs')}>进入执行中心</button></header>{brain?.modules.map((item) => <div key={item.name}><span><strong>{item.name}</strong><small>{item.requirement_count} 份需求 · {item.case_count} 条用例</small></span><b className={item.pending_changes ? 'pending' : ''}>{item.pending_changes ? `${item.pending_changes} 变更` : '稳定'}</b></div>)}{selectedImpacts && selectedImpacts.length > 0 && <footer>当前选择影响 {selectedImpacts.length} 条测试用例</footer>}</section>
    </div>
  </div>
}

function TestingIntelligenceView({ cases, flows, runs, elements, environments, onNavigate }: { cases: TestCase[]; flows: Flow[]; runs: Run[]; elements: ElementAsset[]; environments: Environment[]; onNavigate: (view: ViewName) => void }) {
  const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'flaky'>('all')
  const flowRows = flows.map((flow) => {
    const related = runs.filter((run) => run.flow_id === flow.flow_id)
    const passed = related.filter((run) => run.status === 'PASS').length
    const failed = related.filter((run) => run.status === 'FAIL').length
    const flaky = passed > 0 && failed > 0
    const neverRun = related.length === 0
    const risk = neverRun ? 92 : flaky ? 86 : failed > 0 ? 72 : 28
    const linkedCases = cases.filter((item) => item.automation_flow_id === flow.flow_id).length
    return { flow, related, passed, failed, flaky, neverRun, risk, linkedCases }
  }).sort((a, b) => b.risk - a.risk)
  const visibleRows = flowRows.filter((item) => riskFilter === 'all' || (riskFilter === 'high' ? item.risk >= 70 : item.flaky))
  const passed = runs.filter((item) => item.status === 'PASS').length
  const failed = runs.filter((item) => item.status === 'FAIL').length
  const finished = passed + failed
  const automated = cases.filter((item) => item.automation_flow_id).length
  const coverage = cases.length ? Math.round(automated / cases.length * 100) : 0
  const healthyElements = elements.filter((item) => ['健康', 'HEALTHY', 'PASS'].includes(item.health_status)).length
  const elementHealth = elements.length ? Math.round(healthyElements / elements.length * 100) : 0
  const passRate = finished ? Math.round(passed / finished * 100) : 0
  const gateOpen = Boolean(environments.length && coverage >= 80 && passRate >= 90 && elementHealth >= 80 && failed === 0)
  const clusters = Array.from(runs.filter((run) => run.status === 'FAIL').reduce((map, run) => { const key = (run.error_message || '未提供错误信息').replace(/\s+/g, ' ').slice(0, 64); map.set(key, (map.get(key) || 0) + 1); return map }, new Map<string, number>()).entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
  return <div className="content-view intelligence-view"><div className="panel-header intelligence-header"><div><div className="eyebrow">测试智能 / Quality Intelligence</div><h1>质量智能中心</h1><p>把执行结果转化为风险、稳定性和发布决策，而不是只保留一串 PASS / FAIL。</p></div><div className="header-actions"><button className="outline-btn" onClick={() => onNavigate('runs')}><History size={14}/>查看证据</button><button className="toolbar-btn primary" onClick={() => onNavigate('regression')}><Layers3 size={14}/>进入智能回归</button></div></div><section className={`quality-gate ${gateOpen ? 'open' : 'blocked'}`}><div className="gate-icon">{gateOpen ? <CheckCircle2 size={21}/> : <ShieldCheck size={21}/>}</div><div><span>RELEASE QUALITY GATE</span><strong>{gateOpen ? '当前版本可以发布' : '当前版本不建议发布'}</strong><p>{gateOpen ? '环境、覆盖率、执行通过率和元素健康均满足门禁。' : `需要处理 ${failed ? `${failed} 个失败执行` : '风险项'} 后再进入发布。`}</p></div><div className="gate-score"><strong>{Math.round((coverage + passRate + elementHealth) / 3)}<small>/100</small></strong><span>质量评分</span></div></section><div className="intelligence-kpis"><article><span>覆盖率</span><strong>{coverage}%</strong><small>{automated}/{cases.length || 0} 用例已自动化</small></article><article><span>执行稳定性</span><strong>{passRate}%</strong><small>{passed} 通过 · {failed} 失败</small></article><article><span>不稳定流程</span><strong>{flowRows.filter((item) => item.flaky).length}</strong><small>出现过 PASS / FAIL 混合结果</small></article><article><span>待验证流程</span><strong>{flowRows.filter((item) => item.neverRun).length}</strong><small>建议加入下一轮回归</small></article></div><div className="intelligence-columns"><section className="intelligence-panel"><header><div><span>RISK MAP</span><strong>流程风险地图</strong></div><div className="segmented"><button className={riskFilter === 'all' ? 'active' : ''} onClick={() => setRiskFilter('all')}>全部</button><button className={riskFilter === 'high' ? 'active' : ''} onClick={() => setRiskFilter('high')}>高风险</button><button className={riskFilter === 'flaky' ? 'active' : ''} onClick={() => setRiskFilter('flaky')}>不稳定</button></div></header><div className="risk-table"><div className="risk-head"><span>流程</span><span>风险</span><span>执行</span><span>关联用例</span><span/></div>{visibleRows.map((item) => <button className="risk-row" key={item.flow.flow_id} onClick={() => onNavigate('flows')}><span><strong>{item.flow.name}</strong><small>{item.neverRun ? '从未执行' : item.flaky ? '结果不稳定' : item.failed ? '最近有失败' : '运行稳定'}</small></span><span><i className={`risk-meter ${item.risk >= 70 ? 'high' : item.risk >= 50 ? 'medium' : 'low'}`}><b style={{ width: `${item.risk}%` }}/></i><em>{item.risk}</em></span><span>{item.passed} / {item.failed}</span><span>{item.linkedCases}</span><ChevronRight size={14}/></button>)}{!visibleRows.length && <div className="intelligence-empty">没有符合当前筛选的流程风险。</div>}</div></section><section className="intelligence-panel failure-clusters"><header><div><span>FAILURE CLUSTERS</span><strong>失败根因聚类</strong></div><button className="small-link" onClick={() => onNavigate('runs')}>打开执行记录</button></header>{clusters.length ? clusters.map(([message, count]) => <button key={message} onClick={() => onNavigate('runs')}><span className="cluster-count">{count}</span><div><strong>{message}</strong><small>可疑同源失败 · 建议查看 Trace 和 DOM 证据</small></div><ChevronRight size={14}/></button>) : <div className="intelligence-empty"><CheckCircle2 size={18}/><strong>暂无失败聚类</strong><span>执行失败后会自动归并相似根因。</span></div>}</section></div><section className="intelligence-next"><div><span>RECOMMENDED NEXT MOVE</span><strong>把高风险流程纳入一次受控回归</strong><small>{flowRows.filter((item) => item.risk >= 70).length} 条流程需要优先验证，系统会保留每条 Run 的独立证据。</small></div><button className="toolbar-btn primary" onClick={() => onNavigate('regression')}><Layers3 size={14}/>编排回归集合</button></section></div>
}

function TestingLoopBar({ active, onNavigate }: { active: 'cases' | 'suites' | 'sessions' | 'regression'; onNavigate: (view: ViewName) => void }) {
  const stages: { key: 'cases' | 'suites' | 'sessions' | 'regression'; label: string; detail: string; icon: ComponentType<{ size?: number }> }[] = [
    { key: 'cases', label: '设计用例', detail: '定义验证目标', icon: TestTube2 },
    { key: 'suites', label: '组织套件', detail: '组合测试范围', icon: Layers3 },
    { key: 'sessions', label: '执行会话', detail: '记录真实结果', icon: ClipboardList },
    { key: 'regression', label: '固化回归', detail: '持续验证版本', icon: Radio },
  ]
  const currentIndex = stages.findIndex((item) => item.key === active)
  return <nav className="testing-loop-bar" aria-label="测试闭环"><div className="testing-loop-track"/>{stages.map((stage, index) => { const Icon = stage.icon; return <button type="button" key={stage.key} className={`${active === stage.key ? 'active' : ''} ${index < currentIndex ? 'done' : ''}`} onClick={() => onNavigate(stage.key)}><span className="testing-loop-node"><Icon size={14}/></span><span><strong>{stage.label}</strong><small>{stage.detail}</small></span></button> })}</nav>
}

function TestSessionsView({ projectId, cases, environments, launch, onNavigate, onOpenRegression, onOpenAi }: { projectId: string; cases: TestCase[]; environments: Environment[]; launch: TestSessionLaunch | null; onNavigate: (view: ViewName) => void; onOpenRegression: (sessionName: string, caseIds: string[]) => void; onOpenAi: (prompt: string) => void }) {
  const storageKey = `automation-studio.test-sessions.${projectId || 'local'}`
  const initialSessions: TestSession[] = (() => { try { const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] } })()
  const [sessions, setSessions] = useState<TestSession[]>(initialSessions)
  const [activeId, setActiveId] = useState('')
  // Seed the composer from a suite launch on first render; the effect below
  // keeps it synchronized when another suite starts a new session later.
  const [creating, setCreating] = useState(Boolean(launch))
  const [draftName, setDraftName] = useState(launch ? `${launch.suiteName} · 测试会话` : '')
  const [draftMode, setDraftMode] = useState<TestSession['mode']>(launch?.mode || 'mixed')
  const [draftVersion, setDraftVersion] = useState(launch?.version || '')
  const [draftEnvironment, setDraftEnvironment] = useState(launch?.environment || environments[0]?.name || '')
  const [draftCases, setDraftCases] = useState<string[]>(launch ? launch.caseIds.filter((id) => cases.some((item) => item.case_id === id)) : [])
  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(sessions)) }, [storageKey, sessions])
  useEffect(() => {
    if (!launch) return
    setCreating(true); setActiveId(''); setDraftName(`${launch.suiteName} · 测试会话`); setDraftVersion(launch.version); setDraftMode(launch.mode); setDraftEnvironment(launch.environment || environments[0]?.name || ''); setDraftCases(launch.caseIds.filter((id) => cases.some((item) => item.case_id === id)))
  }, [launch?.id])
  const active = sessions.find((item) => item.id === activeId) || sessions[0]
  const setActive = (next: TestSession) => setSessions((items) => items.map((item) => item.id === next.id ? next : item))
  const createSession = () => { if (!draftName.trim() || !draftCases.length) return; const next: TestSession = { id: `session-${Date.now()}`, name: draftName.trim(), mode: draftMode, environment: draftEnvironment, version: draftVersion.trim() || '未指定版本', createdAt: new Date().toISOString(), status: 'DRAFT', cases: draftCases.map((case_id) => ({ case_id, status: 'NOT_RUN', note: '' })), sourceSuiteId: launch?.suiteId, sourceSuiteName: launch?.suiteName, objective: launch?.objective }; setSessions((items) => [next, ...items]); setActiveId(next.id); setCreating(false); setDraftName(''); setDraftCases([]) }
  const updateCase = (caseId: string, patch: Partial<TestSessionCase>) => { if (!active || active.status === 'COMPLETED') return; setActive({ ...active, cases: active.cases.map((item) => item.case_id === caseId ? { ...item, ...patch } : item), status: 'RUNNING' }) }
  const startSession = () => { if (!active || active.status === 'COMPLETED') return; setActive({ ...active, status: 'RUNNING' }) }
  const markRemaining = (status: TestSessionCase['status']) => { if (!active || active.status === 'COMPLETED') return; setActive({ ...active, status: 'RUNNING', cases: active.cases.map((item) => item.status === 'NOT_RUN' ? { ...item, status } : item) }) }
  const completeSession = () => { if (!active || !active.cases.length || active.cases.some((item) => item.status === 'NOT_RUN')) return; setActive({ ...active, status: 'COMPLETED', completedAt: new Date().toISOString() }) }
  const statusLabel: Record<TestSessionCase['status'], string> = { NOT_RUN: '待执行', PASS: '通过', FAIL: '失败', BLOCKED: '阻塞', SKIP: '跳过' }
  const modeLabel: Record<TestSession['mode'], string> = { manual: '手工', automated: '自动化', mixed: '混合', exploratory: '探索式' }
  const done = active?.cases.filter((item) => item.status !== 'NOT_RUN').length || 0
  const passed = active?.cases.filter((item) => item.status === 'PASS').length || 0
  const failed = active?.cases.filter((item) => item.status === 'FAIL').length || 0
  const blocked = active?.cases.filter((item) => item.status === 'BLOCKED').length || 0
  const regressionIds = (active?.cases || []).filter((item) => ['FAIL', 'BLOCKED'].includes(item.status) && cases.find((testCase) => testCase.case_id === item.case_id)?.automation_flow_id).map((item) => item.case_id)
  const completed = active?.status === 'COMPLETED'
  const sessionAnalysis = active ? active.cases.map((item) => { const testCase = cases.find((candidate) => candidate.case_id === item.case_id); return `${item.case_id} ${testCase?.title || ''}：${statusLabel[item.status]}；${item.note || '无备注'}` }).join('\n') : ''
  return <div className="content-view sessions-view"><TestingLoopBar active="sessions" onNavigate={onNavigate}/><div className="panel-header sessions-header"><div><div className="eyebrow">测试会话 / Test Sessions</div><h1>测试会话控制台</h1><p>独立管理手工、自动化、混合和探索式测试，AI 在会话上下文中提供建议。</p></div><div className="header-actions"><button className="outline-btn" onClick={() => onOpenAi(`请基于当前项目的测试用例，设计一个覆盖关键风险的测试会话计划，包含目标、范围、顺序和退出标准。`)}><Sparkles size={14}/>AI 设计会话</button><button className="toolbar-btn primary" onClick={() => { setCreating(true); setDraftCases(cases.map((item) => item.case_id)) }}><Plus size={14}/>新建测试会话</button></div></div>{creating && <section className="session-creator"><div className="session-creator-head"><div><span>NEW TEST SESSION</span><strong>{launch ? `从「${launch.suiteName}」接入测试范围` : '定义一次有目标的测试'}</strong></div><button className="small-link" onClick={() => setCreating(false)}>取消</button></div><div className="session-creator-grid"><input placeholder="会话名称，例如：支付链路发布验收" value={draftName} onChange={(event) => setDraftName(event.target.value)}/><input placeholder="版本号，例如：2026.09.1" value={draftVersion} onChange={(event) => setDraftVersion(event.target.value)}/><select value={draftEnvironment} onChange={(event) => setDraftEnvironment(event.target.value)}><option value="">选择测试环境</option>{environments.map((item) => <option key={item.id}>{item.name}</option>)}</select></div><div className="session-mode-picker">{(['manual', 'automated', 'mixed', 'exploratory'] as TestSession['mode'][]).map((item) => <button key={item} className={draftMode === item ? 'active' : ''} onClick={() => setDraftMode(item)}><strong>{modeLabel[item]}</strong><small>{item === 'manual' ? '按步骤人工验证' : item === 'automated' ? '交给自动化执行器' : item === 'mixed' ? '手工与自动化协同' : '围绕风险自由探索'}</small></button>)}</div><div className="session-case-picker"><header><strong>选择测试范围</strong><span>{draftCases.length} / {cases.length} 条用例</span></header>{cases.map((item) => <label key={item.case_id}><input type="checkbox" checked={draftCases.includes(item.case_id)} onChange={(event) => setDraftCases((current) => event.target.checked ? [...current, item.case_id] : current.filter((id) => id !== item.case_id))}/><span><strong>{item.case_id}</strong>{item.title}</span><em>{item.priority}</em></label>)}</div><div className="session-creator-footer"><span>范围会从套件带入，仍可在创建前调整。</span><button className="toolbar-btn primary" disabled={!draftName.trim() || !draftCases.length} onClick={createSession}>创建测试会话</button></div></section>}{!active && !creating && <div className="session-empty"><ClipboardList size={26}/><strong>还没有测试会话</strong><span>创建一次测试会话，把范围、环境、结果和证据放在同一条可追溯链路上。</span><button className="toolbar-btn primary" onClick={() => { setCreating(true); setDraftCases(cases.map((item) => item.case_id)) }}><Plus size={14}/>创建第一条会话</button></div>}{active && !creating && <div className="session-workspace"><aside className="session-list"><header><span>SESSIONS</span><strong>{sessions.length} 个会话</strong></header>{sessions.map((item) => <button key={item.id} className={item.id === active.id ? 'active' : ''} onClick={() => setActiveId(item.id)}><span className={`session-status-dot ${item.status.toLowerCase()}`}/><div><strong>{item.name}</strong><small>{modeLabel[item.mode]} · {item.version}{item.sourceSuiteName ? ` · ${item.sourceSuiteName}` : ''}</small></div><em>{item.cases.length}</em></button>)}</aside><section className="session-detail"><header><div><span className="session-kicker">{modeLabel[active.mode]} TEST SESSION</span><h2>{active.name}</h2><p>{active.version} · {active.environment || '未指定环境'}{active.sourceSuiteName ? ` · 来源：${active.sourceSuiteName}` : ''} · 创建于 {new Date(active.createdAt).toLocaleString('zh-CN')}</p></div><div className="session-detail-actions"><button className="outline-btn" onClick={() => onOpenAi(`请分析测试会话“${active.name}”的执行记录：\n${sessionAnalysis}\n请按风险排序给出根因假设、需要人工核验的证据和下一步动作。`)}><Sparkles size={14}/>AI 分析</button>{active.status === 'DRAFT' && <button className="toolbar-btn primary" onClick={startSession}><Play size={14}/>开始会话</button>}{active.status === 'RUNNING' && <button className="toolbar-btn primary" disabled={done < active.cases.length} onClick={completeSession}><CheckCircle2 size={14}/>完成会话</button>}<span className={`session-state ${active.status.toLowerCase()}`}>{active.status === 'DRAFT' ? '草稿' : active.status === 'RUNNING' ? '执行中' : '已完成'}</span></div></header><div className="session-progress"><div><strong>{done}</strong><span>/ {active.cases.length} 已处理</span></div><div className="session-progress-track"><i style={{ width: `${active.cases.length ? done / active.cases.length * 100 : 0}%` }}/></div><div className="session-totals"><span className="pass">通过 {passed}</span><span className="fail">失败 {failed}</span><span className="blocked">阻塞 {blocked}</span><span>待处理 {Math.max(0, active.cases.length - done)}</span></div></div>{active.status !== 'COMPLETED' && <div className="session-bulk-actions"><span>批量处理未执行项</span><button className="outline-btn" onClick={() => markRemaining('SKIP')}>全部跳过</button><button className="outline-btn" onClick={() => markRemaining('BLOCKED')}>全部阻塞</button></div>}<div className="session-run-list">{active.cases.map((item) => { const testCase = cases.find((candidate) => candidate.case_id === item.case_id); return <article key={item.case_id}><div className="session-case-title"><strong>{item.case_id}</strong><span>{testCase?.title || '测试用例已删除'}</span><small>{testCase?.module || '未分组'}</small></div><select disabled={completed} value={item.status} onChange={(event) => updateCase(item.case_id, { status: event.target.value as TestSessionCase['status'] })}>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><input disabled={completed} placeholder="记录结果、观察或证据摘要" value={item.note} onChange={(event) => updateCase(item.case_id, { note: event.target.value })}/><button className="icon-button" title="让 AI 分析该用例" onClick={() => onOpenAi(`请分析测试用例 ${item.case_id}「${testCase?.title || ''}」的执行结果和备注：${item.note || '暂无备注'}，给出风险判断和后续动作。`)}><Sparkles size={14}/></button></article> })}</div>{completed && <section className={`session-completion ${failed || blocked ? 'attention' : 'clear'}`}><div><span>{failed || blocked ? 'FOLLOW-UP REQUIRED' : 'SESSION CLOSED'}</span><strong>{failed || blocked ? `发现 ${failed + blocked} 个需要跟进的结果` : '本轮测试已完成，结果可以进入回归基线'}</strong><small>{active.completedAt ? `完成于 ${new Date(active.completedAt).toLocaleString('zh-CN')}` : '结果已保存到本机'}</small></div><div className="session-completion-actions"><button className="outline-btn" onClick={() => onOpenAi(`请复核已完成测试会话“${active.name}”的结果：\n${sessionAnalysis}\n请输出结论、风险等级、人工复核清单和是否建议进入回归。`)}><Sparkles size={14}/>生成结论</button><button className="toolbar-btn primary" disabled={!regressionIds.length} title={regressionIds.length ? '带入失败或阻塞且已自动化的用例' : '没有可直接进入回归的自动化失败项'} onClick={() => onOpenRegression(active.name, regressionIds)}><Radio size={14}/>带入回归 {regressionIds.length || ''}</button></div></section>}</section></div>}</div>
}

function TestSuitesView({ projectId, cases, environments, onOpenAi, onNavigate, onStartSession }: { projectId: string; cases: TestCase[]; environments: Environment[]; onOpenAi: (prompt: string) => void; onNavigate: (view: ViewName) => void; onStartSession: (suite: TestSuite) => void }) {
  const dialog = useDialog()
  const storageKey = `automation-studio.test-suites.${projectId || 'local'}`
  const initialSuites: TestSuite[] = (() => { try { const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]'); return Array.isArray(parsed) ? parsed : [] } catch { return [] } })()
  const [suites, setSuites] = useState<TestSuite[]>(initialSuites)
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TestSuite['kind']>('regression')
  const [version, setVersion] = useState('')
  const [description, setDescription] = useState('')
  const [caseIds, setCaseIds] = useState<string[]>([])
  const kindLabel: Record<TestSuite['kind'], string> = { smoke: '冒烟', regression: '回归', acceptance: '验收', exploratory: '探索式' }
  useEffect(() => { window.localStorage.setItem(storageKey, JSON.stringify(suites)) }, [storageKey, suites])
  const selected = suites.find((item) => item.id === selectedId) || suites[0]
  const editingSuite = editing && selectedId ? suites.find((item) => item.id === selectedId) : undefined
  const beginCreate = () => { setEditing(true); setSelectedId(''); setName(''); setKind('regression'); setVersion(''); setDescription(''); setCaseIds([]) }
  const beginEdit = (suite: TestSuite) => { setEditing(true); setSelectedId(suite.id); setName(suite.name); setKind(suite.kind); setVersion(suite.version); setDescription(suite.description); setCaseIds(suite.caseIds) }
  const save = () => { if (!name.trim() || !caseIds.length) return; const next: TestSuite = { id: editingSuite?.id || `suite-${Date.now()}`, name: name.trim(), kind, version: version.trim() || '未指定版本', description: description.trim(), caseIds, updatedAt: new Date().toISOString() }; setSuites((items) => editingSuite ? items.map((item) => item.id === editingSuite.id ? next : item) : [next, ...items]); setSelectedId(next.id); setEditing(false) }
  const remove = async () => { if (!selected || !await dialog.confirm(`确定删除测试套件“${selected.name}”？用例本身不会被删除。`, { title: '删除测试套件', confirmLabel: '删除', danger: true })) return; setSuites((items) => items.filter((item) => item.id !== selected.id)); setSelectedId('') }
  return <div className="content-view suites-view"><TestingLoopBar active="suites" onNavigate={onNavigate}/><div className="panel-header"><div><div className="eyebrow">测试资产 / Test Suites</div><h1>测试套件</h1><p>独立组织手工、自动化和探索式用例，形成可复用的测试范围。</p></div><div className="header-actions"><button className="outline-btn" onClick={() => onOpenAi('请根据当前测试用例，建议适合本项目的冒烟、回归和验收测试套件划分。')}><Sparkles size={14}/>AI 设计套件</button><button className="toolbar-btn primary" onClick={beginCreate}><Plus size={14}/>新建测试套件</button></div></div>{editing && <section className="suite-editor"><header><div><span>SUITE DEFINITION</span><strong>{editingSuite ? '编辑测试套件' : '创建测试套件'}</strong></div><button className="small-link" onClick={() => setEditing(false)}>取消</button></header><div className="suite-editor-grid"><input placeholder="套件名称，例如：支付链路验收" value={name} onChange={(event) => setName(event.target.value)}/><select value={kind} onChange={(event) => setKind(event.target.value as TestSuite['kind'])}>{Object.entries(kindLabel).map(([key, label]) => <option key={key} value={key}>{label}测试</option>)}</select><input placeholder="目标版本，例如：2026.09" value={version} onChange={(event) => setVersion(event.target.value)}/><textarea placeholder="说明：这组测试要证明什么？" value={description} onChange={(event) => setDescription(event.target.value)}/></div><div className="suite-case-picker"><header><strong>测试范围</strong><span>{caseIds.length} / {cases.length} 条用例</span></header>{cases.map((item) => <label key={item.case_id}><input type="checkbox" checked={caseIds.includes(item.case_id)} onChange={(event) => setCaseIds((current) => event.target.checked ? [...current, item.case_id] : current.filter((id) => id !== item.case_id))}/><span><strong>{item.case_id}</strong>{item.title}</span><em>{item.priority}</em></label>)}</div><footer><span>套件独立于自动化流程；未绑定流程的手工用例也可以加入。</span><button className="toolbar-btn primary" disabled={!name.trim() || !caseIds.length} onClick={save}>保存测试套件</button></footer></section>}<div className="suite-workspace"><aside className="suite-list"><header><span>SUITES</span><strong>{suites.length} 个套件</strong></header>{suites.map((suite) => <button key={suite.id} className={suite.id === selected?.id ? 'active' : ''} onClick={() => setSelectedId(suite.id)}><span className="suite-kind">{kindLabel[suite.kind]}</span><div><strong>{suite.name}</strong><small>{suite.version} · {suite.caseIds.length} 条用例</small></div></button>)}{!suites.length && <div className="suite-list-empty">还没有测试套件</div>}</aside><section className="suite-detail">{selected ? <><header><div><span className="suite-kicker">{kindLabel[selected.kind]} TEST SUITE</span><h2>{selected.name}</h2><p>{selected.version} · 更新于 {new Date(selected.updatedAt).toLocaleString('zh-CN')}</p></div><div className="suite-detail-actions"><button className="outline-btn" onClick={() => beginEdit(selected)}>编辑</button><button className="outline-btn danger" onClick={() => void remove()}>删除</button></div></header><div className="suite-summary"><div><strong>{selected.caseIds.length}</strong><span>测试用例</span></div><div><strong>{selected.caseIds.filter((id) => cases.find((item) => item.case_id === id)?.automation_flow_id).length}</strong><span>可自动化</span></div><div><strong>{selected.caseIds.filter((id) => !cases.find((item) => item.case_id === id)?.automation_flow_id).length}</strong><span>手工执行</span></div><div className="suite-summary-action"><button className="toolbar-btn primary" onClick={() => onStartSession(selected)}><ClipboardList size={14}/>用此套件创建测试会话</button></div></div><p className="suite-description">{selected.description || '暂无套件说明。'}</p><div className="suite-cases">{selected.caseIds.map((id) => { const item = cases.find((candidate) => candidate.case_id === id); return <div key={id}><span>{id}</span><strong>{item?.title || '用例已删除'}</strong><small>{item?.automation_flow_id ? '自动化适配' : '手工执行'} · {item?.module || '未分组'}</small></div> })}</div></> : <div className="suite-empty"><Layers3 size={25}/><strong>选择或创建一个测试套件</strong><span>测试套件可以被多个测试会话复用。</span><button className="toolbar-btn primary" onClick={beginCreate}><Plus size={14}/>创建测试套件</button></div>}</section></div></div>
}

function CommandDeck({ project, flow, runs, environments, flows, cases, elements, onNavigate }: { project: Project | null; flow: Flow | null; runs: Run[]; environments: Environment[]; flows: Flow[]; cases: TestCase[]; elements: ElementAsset[]; onNavigate: (view: ViewName) => void }) {
  const passed = runs.filter((item) => item.status === 'PASS').length
  const finished = runs.filter((item) => ['PASS', 'FAIL'].includes(item.status)).length
  const automated = cases.filter((item) => item.automation_flow_id).length
  const coverage = cases.length ? Math.round(automated / cases.length * 100) : 0
  const healthy = elements.filter((item) => ['健康', 'HEALTHY', 'PASS'].includes(item.health_status)).length
  const elementHealth = elements.length ? Math.round(healthy / elements.length * 100) : 0
  const passRate = finished ? Math.round(passed / finished * 100) : 0
  const score = Math.round((coverage + passRate + elementHealth) / 3)
  const latest = runs[0]
  const status = latest?.status || 'READY'
  return <section className="command-deck"><div className="deck-ambient"/><div className="deck-main"><div className="deck-kicker"><span className="deck-signal"/>AUTOMATION COMMAND DECK<span className="deck-live">LIVE</span></div><h2>{flow?.name || '构建一条可持续演进的自动化链路'}</h2><p>{flow ? `${flow.steps.length} 个步骤正在受控，执行证据、版本和元素健康度已集中到当前工作区。` : '从真实业务场景开始，录制、验证并持续优化你的自动化资产。'}</p><div className="deck-chips"><span><Target size={12}/>{environments[0]?.name || '未选择环境'}</span><span><Workflow size={12}/>{flows.length} 条流程</span><span className={status === 'FAIL' ? 'warning' : 'ready'}><Activity size={12}/>{status === 'PASS' ? '最近执行通过' : status === 'FAIL' ? '最近执行失败' : '等待首次执行'}</span></div><div className="deck-actions"><button className="toolbar-btn primary" onClick={() => onNavigate('flows')}><Play size={14}/>{flow ? '继续构建' : '开始构建'}</button><button className="deck-link" onClick={() => onNavigate('runs')}><History size={14}/>查看证据链<ChevronRight size={13}/></button></div></div><div className="deck-score"><div className="score-orbit orbit-a"/><div className="score-orbit orbit-b"/><div className="score-core"><span>HEALTH SCORE</span><strong>{score}</strong><small>{score >= 80 ? '稳定运行' : score >= 50 ? '需要关注' : '尚未建立'}</small></div><i className="score-node node-one"/><i className="score-node node-two"/></div><div className="deck-stats"><div><span>最近运行</span><strong className={status === 'PASS' ? 'good' : status === 'FAIL' ? 'bad' : ''}>{status}</strong><small>{latest?.started_at || '尚无执行记录'}</small></div><div><span>覆盖率</span><strong>{coverage}%</strong><small>{automated}/{cases.length || 0} 条用例</small></div><div><span>元素健康</span><strong>{elementHealth}%</strong><small>{healthy}/{elements.length || 0} 已验证</small></div></div></section>
}

function DashboardView({ project, flow, flows, cases, plans, runs, elements, environments, onNavigate, onCreateProject }: { project: Project | null; flow: Flow | null; flows: Flow[]; cases: TestCase[]; plans: RegressionPlan[]; runs: Run[]; elements: ElementAsset[]; environments: Environment[]; onNavigate: (view: ViewName) => void; onCreateProject: () => void }) {
  const passed = runs.filter((item) => item.status === 'PASS').length
  const failed = runs.filter((item) => item.status === 'FAIL').length
  const automated = cases.filter((item) => item.automation_flow_id).length
  const coverage = cases.length ? Math.round(automated / cases.length * 100) : 0
  const passRate = passed + failed ? Math.round(passed / (passed + failed) * 100) : 0
  const healthyElements = elements.filter((item) => ['健康', 'HEALTHY', 'PASS'].includes(item.health_status)).length
  const elementHealth = elements.length ? Math.round(healthyElements / elements.length * 100) : 0
  const firstUse = !project || (cases.length === 0 && plans.length === 0 && runs.length === 0)
  const queue = [
    !environments.length ? { label: '配置首个测试环境', detail: '添加 Base URL、浏览器和安全白名单', view: 'environments' as ViewName, icon: <Database size={14}/> } : null,
    automated < cases.length ? { label: `自动化 ${cases.length - automated} 条未覆盖用例`, detail: '使用录制或 AI 生成可执行流程', view: 'cases' as ViewName, icon: <WandSparkles size={14}/> } : null,
    failed ? { label: `诊断 ${failed} 次失败执行`, detail: '查看截图、DOM、Console 与 Trace 证据', view: 'runs' as ViewName, icon: <Bug size={14}/> } : null,
    !plans.length ? { label: '建立持续回归计划', detail: '将稳定流程组合为一键回归集', view: 'regression' as ViewName, icon: <Layers3 size={14}/> } : null,
  ].filter(Boolean) as { label: string; detail: string; view: ViewName; icon: ReactNode }[]

  return <div className="content-view dashboard-view"><div className="panel-header"><div><div className="eyebrow">自动化控制中心 / Automation Operations</div><h1>{project?.name || '自动化测试工作台'}</h1><p>{flow ? `当前流程：${flow.name} · ${flow.steps?.length || 0} 个步骤` : '从测试用例或浏览器录制开始下一次自动化'}</p></div><div className="header-actions"><button className="outline-btn" onClick={() => onNavigate('runs')}><History size={14}/>执行记录</button><button className="toolbar-btn primary" onClick={() => onNavigate('flows')}><Workflow size={14}/>打开流程编辑器</button></div></div>{firstUse && <section className="quick-start"><div><span className="quick-start-kicker">首次使用</span><h2>建立第一条可审计的自动化链路</h2><p>项目、环境、流程和证据会作为独立资产持续保存。</p></div><div className="quick-start-steps"><div><b>1</b><span>创建项目</span></div><div><b>2</b><span>配置环境</span></div><div><b>3</b><span>录制流程</span></div><div><b>4</b><span>执行并审计</span></div></div><div className="quick-start-actions"><button className="toolbar-btn primary" onClick={onCreateProject}><Plus size={14}/>创建项目</button><button className="outline-btn" onClick={() => onNavigate('flows')}><Radio size={14}/>开始录制</button><button className="outline-btn" onClick={() => onNavigate('runs')}><History size={14}/>查看证据</button></div></section>}<div className="dashboard-grid commercial-metrics"><div className="dash-card"><span><TestTube2 size={13}/>自动化覆盖</span><strong>{coverage}%</strong><small>{automated} / {cases.length} 条用例已绑定</small></div><div className="dash-card"><span><Workflow size={13}/>可执行流程</span><strong>{flows.length}</strong><small>{flow ? `当前：${flow.name}` : '尚未选择流程'}</small></div><div className="dash-card"><span><Activity size={13}/>执行通过率</span><strong>{passRate}%</strong><small>通过 {passed} · 失败 {failed}</small></div><div className="dash-card"><span><SearchCheck size={13}/>元素健康度</span><strong>{elementHealth}%</strong><small>{healthyElements} / {elements.length} 个已验证</small></div></div><div className="operations-grid"><section className="operations-panel"><header><div><span>AUTOMATION HEALTH</span><strong>质量基线</strong></div><small>{coverage >= 80 && passRate >= 80 ? '状态稳定' : '需要关注'}</small></header><HealthRow label="用例覆盖" value={coverage} detail={`${automated}/${cases.length}`}/><HealthRow label="执行通过" value={passRate} detail={`${passed}/${passed + failed}`}/><HealthRow label="元素健康" value={elementHealth} detail={`${healthyElements}/${elements.length}`}/><footer><ShieldCheck size={13}/><span>只统计可追溯的流程、运行和元素验证结果</span></footer></section><section className="operations-panel action-queue"><header><div><span>NEXT BEST ACTION</span><strong>自动化待办</strong></div><small>{queue.length} 项</small></header>{queue.length ? queue.map((item) => <button key={item.label} onClick={() => onNavigate(item.view)}><span>{item.icon}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><ChevronDown size={14}/></button>) : <div className="queue-clear"><Check size={18}/><strong>自动化基线完整</strong><span>当前没有必须处理的配置缺口</span></div>}</section></div><section className="recent-runs"><header><div><span>RECENT ACTIVITY</span><strong>最近执行</strong></div><button className="small-link" onClick={() => onNavigate('runs')}>查看全部</button></header>{runs.slice(0, 5).map((item) => <button key={item.run_id} onClick={() => onNavigate('runs')}><span className={`run-state-dot ${item.status.toLowerCase()}`}/><strong>{flows.find((candidate) => candidate.flow_id === item.flow_id)?.name || item.flow_id}</strong><span>{item.browser}</span><span>{item.started_at || '未记录时间'}</span><em className={`status ${item.status.toLowerCase()}`}>{item.status}</em></button>)}{!runs.length && <div className="compact-empty"><Play size={16}/>执行一次流程后，这里会显示可追溯的运行记录</div>}</section></div>
}

function HealthRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="health-row"><div><span>{label}</span><strong>{value}%</strong><small>{detail}</small></div><div className="health-track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }}/></div></div>
}


function TestCasesView({ projectId, cases, flows, onChanged, onAiGenerate, autoBatch, onAutoGenerateBatch, onAgentRun, selectedCaseId, onSelectCase, editRequest }: { projectId: string; cases: TestCase[]; flows: Flow[]; onChanged: (items: TestCase[]) => void; onAiGenerate: (caseId: string) => void; autoBatch: { done: number; total: number; failed: number; current: string } | null; onAutoGenerateBatch: () => void; onAgentRun: (caseId: string) => void; selectedCaseId?: string; onSelectCase?: (caseId: string) => void; editRequest?: { caseId: string; token: number } }) {
  const dialog = useDialog()
  const empty: TestCase = { case_id: '', project_id: projectId, title: '', module: '', priority: 'P1', case_type: '回归测试', preconditions: '', steps: '', test_data: '', expected: '', tags: [], status: '未自动化', updated_at: '' }
  const [editing, setEditing] = useState<TestCase | null>(null)
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [automationFilter, setAutomationFilter] = useState('all')
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'overwrite'>('skip')
  const [importPreview, setImportPreview] = useState<{ rows: TestCase[]; errors: { row: number; errors: string[]; data?: Record<string, unknown> }[]; filename: string; headers: string[]; total: number; sourceBase64: string } | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const headerSelectAllRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cases.filter((item) => {
      const matchesQuery = !needle || `${item.case_id} ${item.title} ${item.module} ${item.steps || ''} ${item.expected}`.toLowerCase().includes(needle)
      const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter
      const matchesAutomation = automationFilter === 'all' || (automationFilter === 'automated' ? Boolean(item.automation_flow_id) : !item.automation_flow_id)
      return matchesQuery && matchesPriority && matchesAutomation
    })
  }, [cases, query, priorityFilter, automationFilter])
  const visibleIds = visible.map((item) => item.case_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
  const selectedCases = cases.filter((item) => selectedIds.includes(item.case_id))
  const hiddenSelectedCount = selectedIds.filter((id) => !visibleIds.includes(id)).length
  const hasFilters = Boolean(query.trim()) || priorityFilter !== 'all' || automationFilter !== 'all'
  const duplicateImportErrors = importPreview?.errors.filter((error) => error.errors.length > 0 && error.errors.every((message) => /已存在|重复/.test(message))) || []
  const invalidImportErrors = importPreview?.errors.filter((error) => !duplicateImportErrors.includes(error)) || []
  const definitionReadyCount = cases.filter((item) => String(item.steps || '').trim() && String(item.expected || '').trim()).length
  const compiledCount = cases.filter((item) => String(item.steps || '').trim() && String(item.expected || '').trim() && item.automation_flow_id && flows.some((flow) => flow.flow_id === item.automation_flow_id)).length
  const pendingCompileCount = Math.max(0, definitionReadyCount - compiledCount)
  const repairCount = Math.max(0, cases.length - definitionReadyCount)
  const completeness = (item: TestCase) => {
    const fields = [
      ['前置条件', item.preconditions],
      ['操作步骤', item.steps],
      ['测试数据', item.test_data],
      ['预期结果', item.expected],
    ] as const
    const missing = fields.filter(([, value]) => !String(value || '').trim()).map(([label]) => label)
    return { filled: fields.length - missing.length, total: fields.length, missing }
  }
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => cases.some((item) => item.case_id === id)))
  }, [cases])
  useEffect(() => {
    const indeterminate = selectedIds.length > 0 && !allVisibleSelected
    if (selectAllRef.current) selectAllRef.current.indeterminate = indeterminate
    if (headerSelectAllRef.current) headerSelectAllRef.current.indeterminate = indeterminate
  }, [selectedIds.length, allVisibleSelected])
  useEffect(() => {
    if (!editRequest) return
    const target = cases.find((item) => item.case_id === editRequest.caseId)
    if (target) setEditing({ ...target })
  }, [editRequest?.token])
  const save = async () => {
    if (!editing) return
    try {
      const saved = await api<TestCase>('/test-cases', { method: 'POST', body: JSON.stringify(editing) })
      onChanged([saved, ...cases.filter((item) => item.case_id !== saved.case_id)])
      setEditing(null)
      onSelectCase?.(saved.case_id)
      setImportMessage('用例已保存')
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : '保存失败', '用例保存失败')
    }
  }
  const remove = async (item: TestCase) => {
    if (!await dialog.confirm(`用例 ${item.case_id}“${item.title}”将被永久删除，关联的历史执行记录仍会保留。`, { title: '删除测试用例', confirmLabel: '删除用例', danger: true })) return
    try {
      await api(`/test-cases/${item.case_id}`, { method: 'DELETE' })
      onChanged(cases.filter((old) => old.case_id !== item.case_id))
      setSelectedIds((current) => current.filter((id) => id !== item.case_id))
      setImportMessage(`已删除 ${item.case_id}`)
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : '删除失败', '删除测试用例失败')
    }
  }
  const toggleAll = () => setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])))
  const toggleSelected = (caseId: string) => setSelectedIds((current) => current.includes(caseId) ? current.filter((id) => id !== caseId) : [...current, caseId])
  const bulkDelete = async () => {
    const hiddenWarning = hiddenSelectedCount ? `其中 ${hiddenSelectedCount} 条当前被筛选条件隐藏，也会一并删除。` : ''
    if (!selectedIds.length || !await dialog.confirm(`将删除选中的 ${selectedIds.length} 条用例。${hiddenWarning} 关联历史执行记录仍会保留。`, { title: '批量删除测试用例', confirmLabel: '删除选中用例', danger: true })) return
    setBulkBusy(true)
    try {
      const result = await api<{ deleted: number }>('/test-cases/batch-delete', { method: 'POST', body: JSON.stringify({ project_id: projectId, case_ids: selectedIds }) })
      onChanged(cases.filter((item) => !selectedIds.includes(item.case_id)))
      setSelectedIds([])
      setImportMessage(`批量删除完成：已删除 ${result.deleted} 条`)
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : '批量删除失败', '操作失败')
    } finally {
      setBulkBusy(false)
    }
  }
  const exportSelected = () => {
    if (!selectedCases.length) return
    const headers = ['用例编号', '用例名称', '模块', '优先级', '类型', '前置条件', '操作步骤', '测试数据', '预期结果', '自动化状态']
    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') }"`
    const lines = [headers, ...selectedCases.map((item) => [item.case_id, item.title, item.module, item.priority, item.case_type, item.preconditions, item.steps, item.test_data, item.expected, item.automation_flow_id ? '已自动化' : '未自动化'])].map((row) => row.map(csvCell).join(','))
    const url = URL.createObjectURL(new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `测试用例_选中_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setImportMessage(`已导出 ${selectedCases.length} 条用例`)
  }
  const importFile = async (file: File) => {
    setImportBusy(true)
    setImportMessage('正在读取并校验文件…')
    setImportPreview(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      const chunkSize = 0x8000
      for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
      const content = btoa(binary)
      const preview = await api<{ rows: TestCase[]; errors: { row: number; errors: string[]; data?: Record<string, unknown> }[]; headers?: string[]; total?: number }>('/test-cases/import/preview', { method: 'POST', body: JSON.stringify({ project_id: projectId, filename: file.name, content_base64: content, duplicate_strategy: duplicateStrategy }) })
      const total = preview.total ?? preview.rows.length + preview.errors.length
      setImportPreview({ ...preview, filename: file.name, headers: preview.headers || [], total, sourceBase64: content })
      setImportMessage(`已解析 ${total} 行，可导入 ${preview.rows.length} 行`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入解析失败'
      setImportMessage(message)
      await dialog.alert(message, '无法解析导入文件')
    } finally {
      setImportBusy(false)
    }
  }
  const confirmImport = async () => {
    if (!importPreview) return
    setImportBusy(true)
    try {
      const preferredCaseId = importPreview.rows[0]?.case_id
      const result = await api<{ imported: number; skipped?: number }>('/test-cases/import/confirm', { method: 'POST', body: JSON.stringify({ project_id: projectId, rows: importPreview.rows, duplicate_strategy: duplicateStrategy }) })
      const latest = await api<TestCase[]>(`/projects/${projectId}/test-cases`)
      onChanged(latest)
      setSelectedIds([])
      setImportPreview(null)
      resetFilters()
      const importedCase = latest.find((item) => item.case_id === preferredCaseId) || latest[0]
      if (importedCase) {
        onSelectCase?.(importedCase.case_id)
        window.setTimeout(() => document.getElementById(`case-row-${importedCase.case_id}`)?.scrollIntoView({ block: 'nearest' }), 0)
      }
      const ready = latest.filter((item) => String(item.steps || '').trim() && String(item.expected || '').trim()).length
      const incomplete = latest.length - ready
      setImportMessage(`导入完成：${duplicateStrategy === 'overwrite' ? '已写入' : '新增'} ${result.imported} 条${result.skipped ? `，跳过 ${result.skipped} 条` : ''}。自动检查：${ready} 条定义完整${incomplete ? `，${incomplete} 条需补全` : ''}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入保存失败'
      setImportMessage(message)
      await dialog.alert(message, '导入保存失败')
    } finally {
      setImportBusy(false)
    }
  }
  const changeDuplicateStrategy = async (strategy: 'skip' | 'overwrite') => {
    setDuplicateStrategy(strategy)
    if (!importPreview) return
    setImportBusy(true)
    try {
      const preview = await api<{ rows: TestCase[]; errors: { row: number; errors: string[]; data?: Record<string, unknown> }[]; headers?: string[]; total?: number }>('/test-cases/import/preview', { method: 'POST', body: JSON.stringify({ project_id: projectId, filename: importPreview.filename, content_base64: importPreview.sourceBase64, duplicate_strategy: strategy }) })
      setImportPreview((current) => current ? { ...current, ...preview, headers: preview.headers || current.headers, total: preview.total ?? preview.rows.length + preview.errors.length } : current)
      setImportMessage(`已按“${strategy === 'overwrite' ? '覆盖' : '跳过'}重复编号”重新校验`)
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : '重新校验失败', '导入策略更新失败')
    } finally {
      setImportBusy(false)
    }
  }
  const resetFilters = () => { setQuery(''); setPriorityFilter('all'); setAutomationFilter('all') }
  const fieldLabel: Record<string, string> = { case_id: '用例编号', title: '用例名称', module: '模块', priority: '优先级', case_type: '用例类型', preconditions: '前置条件', steps: '操作步骤', test_data: '测试数据', expected: '预期结果', tags: '标签' }
  const mapHeader = (header: string) => {
    const normalized = header.trim().toLowerCase().replace(/[\s_\-（）()]/g, '')
    if (/操作步骤|测试步骤|执行步骤|步骤|steps?|step/.test(normalized)) return '操作步骤'
    if (/预期|期望|expected|expect/.test(normalized)) return '预期结果'
    if (/前置|前提|precondition/.test(normalized)) return '前置条件'
    if (/测试数据|测试参数|数据|testdata|data/.test(normalized)) return '测试数据'
    if (/标题|名称|测试点|title|name/.test(normalized)) return '用例名称'
    if (/编号|用例id|caseid|id/.test(normalized)) return '用例编号'
    if (/模块|功能模块|module/.test(normalized)) return '模块'
    if (/优先级|级别|priority/.test(normalized)) return '优先级'
    if (/用例类型|测试类型|类型|casetype|type/.test(normalized)) return '用例类型'
    return fieldLabel[header] || '未识别'
  }
  return <div className="content-view cases-list-view">
    <div className="panel-header">
      <div><div className="eyebrow">TEST ASSETS</div><h1>测试资产</h1><p>导入用例后自动检查步骤、数据和预期结果，符合条件的用例可直接进入智能执行。</p></div>
      <div className="header-actions">
        <button className="outline-btn" onClick={() => onAutoGenerateBatch()} disabled={Boolean(autoBatch)}><Sparkles size={14}/>{autoBatch ? `编译中 ${autoBatch.done}/${autoBatch.total}` : '批量编译'}</button>
        <button className="outline-btn" onClick={() => setEditing({ ...empty })}><Plus size={14}/>新建用例</button>
        <label className="outline-btn file-btn"><FilePlus2 size={14}/>导入并检查<input type="file" accept=".xlsx,.xlsm,.csv,.json" disabled={importBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void importFile(file); e.currentTarget.value = '' }}/></label>
      </div>
    </div>
    <section className="asset-readiness-strip" aria-label="测试资产执行准备度"><div><span>01</span><strong>导入与检查</strong><small>{cases.length} 条测试资产</small></div><ChevronRight size={14}/><div className={repairCount ? 'attention' : 'complete'}><span>02</span><strong>定义完整</strong><small>{definitionReadyCount} 就绪 · {repairCount} 待补全</small></div><ChevronRight size={14}/><div className={pendingCompileCount ? 'attention' : compiledCount ? 'complete' : ''}><span>03</span><strong>执行编译</strong><small>{compiledCount} 可运行 · {pendingCompileCount} 待编译</small></div><ChevronRight size={14}/><div className={compiledCount ? 'complete' : ''}><span>04</span><strong>进入执行</strong><small>{compiledCount ? '执行中心已就绪' : '等待可执行用例'}</small></div></section>
    {editing && <section className="case-editor" aria-label="编辑测试用例">
      <div className="case-editor-heading"><div><span>CASE AUTHORING</span><strong>{editing.case_id ? '编辑测试用例' : '创建测试用例'}</strong></div><button className="icon-button" title="关闭编辑" aria-label="关闭编辑" onClick={() => setEditing(null)}><X size={15}/></button></div>
      <label className="case-field case-field-title">用例名称<input autoFocus placeholder="例如：登录失败时提示错误" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })}/></label>
      <label className="case-field">模块<input placeholder="例如：账号与权限" value={editing.module} onChange={(e) => setEditing({ ...editing, module: e.target.value })}/></label>
      <label className="case-field">优先级<select value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: e.target.value })}>{['P0','P1','P2','P3'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="case-field">用例类型<select value={editing.case_type} onChange={(e) => setEditing({ ...editing, case_type: e.target.value })}><option>冒烟测试</option><option>回归测试</option><option>功能测试</option><option>验收测试</option></select></label>
      <label className="case-field case-field-flow">关联自动化流程<select value={editing.automation_flow_id || ''} onChange={(e) => setEditing({ ...editing, automation_flow_id: e.target.value || undefined, status: e.target.value ? '已自动化' : '未自动化' })}><option value="">未绑定流程</option>{flows.map((item) => <option key={item.flow_id} value={item.flow_id}>{item.name}</option>)}</select></label>
      <label className="case-field case-field-textarea"><span>前置条件</span><textarea placeholder="执行前需要满足什么条件？" value={editing.preconditions || ''} onChange={(e) => setEditing({ ...editing, preconditions: e.target.value })}/></label>
      <label className="case-field case-field-textarea"><span>操作步骤 <small>也用于 AI 生成自动化流程</small></span><textarea placeholder="一行一个动作，例如：打开登录页\n输入用户名和密码\n点击登录" value={editing.steps || ''} onChange={(e) => setEditing({ ...editing, steps: e.target.value })}/></label>
      <label className="case-field case-field-textarea"><span>测试数据</span><textarea placeholder="账号、参数、边界值或数据准备说明" value={editing.test_data || ''} onChange={(e) => setEditing({ ...editing, test_data: e.target.value })}/></label>
      <label className="case-field case-field-textarea"><span>预期结果</span><textarea placeholder="完成步骤后应观察到的业务结果" value={editing.expected || ''} onChange={(e) => setEditing({ ...editing, expected: e.target.value })}/></label>
      <div className="case-editor-actions"><button className="outline-btn" onClick={() => setEditing(null)}>取消</button><button className="toolbar-btn primary" disabled={!editing.title.trim()} onClick={() => void save()}><Save size={14}/>保存用例</button></div>
    </section>}
    <div className="case-filter">
      <label className="case-filter-search"><Search size={14}/><input placeholder="搜索编号、名称、模块或步骤" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
      <div className="case-filter-controls"><select className="case-filter-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="按优先级筛选"><option value="all">全部优先级</option><option value="P0">P0 关键</option><option value="P1">P1 高</option><option value="P2">P2 中</option><option value="P3">P3 低</option></select><select className="case-filter-select" value={automationFilter} onChange={(e) => setAutomationFilter(e.target.value)} aria-label="按自动化状态筛选"><option value="all">全部状态</option><option value="automated">已自动化</option><option value="manual">待自动化</option></select>{hasFilters && <button className="small-link" onClick={resetFilters}><X size={13}/>清除筛选</button>}</div>
      <span className="case-filter-count"><strong>{visible.length}</strong> / {cases.length} 条用例</span>
    </div>
    <div className="case-bulk-toolbar" role="toolbar" aria-label="测试用例批量操作">
      <label className="case-select-all"><input ref={selectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={!visible.length}/><span>全选当前筛选</span></label>
      <strong>{selectedIds.length ? <>已选 {selectedIds.length} 条{hiddenSelectedCount > 0 && <small> · 当前不可见 {hiddenSelectedCount} 条</small>}</> : '选择用例后可批量导出或删除'}</strong>
      {selectedIds.length > 0 && <button className="small-link" onClick={() => setSelectedIds([])}><X size={13}/>清空选择</button>}
      <button className="outline-btn" disabled={!selectedCases.length} onClick={exportSelected}><Download size={14}/>导出选中</button>
      <button className="toolbar-btn danger" disabled={!selectedIds.length || bulkBusy} onClick={() => void bulkDelete()}><Trash2 size={14}/>{bulkBusy ? '删除中…' : `删除 ${selectedIds.length || ''}`}</button>
    </div>
    {importMessage && <div className="case-operation-message" role="status"><CircleDot size={13}/>{importMessage}</div>}
    <div className="asset-table case-table">
      <div className="asset-header"><span className="case-selection-cell"><input className="case-select-all" ref={headerSelectAllRef} type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={!visible.length} aria-label="全选当前筛选"/></span><span>编号 / 名称 / 模块</span><span>优先级</span><span>字段完整度</span><span>自动化</span><span>操作</span></div>
      {visible.map((item) => {
        const quality = completeness(item)
        const selected = selectedCaseId === item.case_id
        return <div id={`case-row-${item.case_id}`} className={`asset-row ${selected ? 'selected' : ''}`} key={item.case_id} role="row" tabIndex={0} aria-selected={selected} onClick={() => onSelectCase?.(item.case_id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCase?.(item.case_id) } }}>
          <span className="case-selection-cell"><input className="case-row-select" type="checkbox" checked={selectedIds.includes(item.case_id)} onChange={() => toggleSelected(item.case_id)} onClick={(event) => event.stopPropagation()} aria-label={`选择 ${item.case_id}`}/></span>
          <strong className="case-primary-cell"><span>{item.case_id}</span><small>{item.title}</small><em>{item.module || '未分类'}</em></strong>
          <span className={`priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
          <span className={`case-completeness ${quality.filled === quality.total ? 'complete' : 'incomplete'}`} title={quality.missing.length ? `缺少：${quality.missing.join('、')}` : '四项测试定义字段均已填写'}><b>{quality.filled}/{quality.total}</b><small>{quality.missing.length ? `缺 ${quality.missing.length} 项` : '已完整'}</small></span>
          <span className={item.automation_flow_id ? 'health' : 'muted'}>{item.automation_flow_id ? '已自动化' : '待自动化'}</span>
          <span className="row-actions"><button className="case-action-btn primary" title="AI 生成自动化流程" aria-label="AI 生成自动化流程" onClick={(event) => { event.stopPropagation(); onAiGenerate(item.case_id) }}><Sparkles size={13}/><span>AI</span></button><button className="case-action-btn" title="智能执行" aria-label="智能执行" onClick={(event) => { event.stopPropagation(); onAgentRun(item.case_id) }}><Play size={13}/><span>执行</span></button><button className="case-action-btn compact" title="编辑用例" aria-label="编辑用例" onClick={(event) => { event.stopPropagation(); setEditing({ ...item }) }}><Pencil size={13}/><span>编辑</span></button><button className="case-action-btn compact" title="复制用例" aria-label="复制用例" onClick={(event) => { event.stopPropagation(); setEditing({ ...item, case_id: '', title: `${item.title}（副本）` }) }}><Copy size={13}/><span>复制</span></button><button className="case-action-btn compact danger" title="删除用例" aria-label="删除用例" onClick={(event) => { event.stopPropagation(); void remove(item) }}><Trash2 size={13}/><span>删除</span></button></span>
        </div>
      })}
    </div>
    {!visible.length && <div className="empty-state case-list-empty"><Search size={18}/><strong>{cases.length ? '没有符合筛选条件的用例' : '暂无测试用例'}</strong><span>{cases.length ? '调整搜索或筛选条件后再试。' : '先新建用例或导入一份测试资产。'}</span></div>}
    {importPreview && <section className="import-preview" role="dialog" aria-modal="true" aria-label="导入预览">
      <div className="section-title"><div><span>IMPORT REVIEW</span><strong>导入审核 · {importPreview.filename}</strong><small>确认前检查字段映射、步骤和重复编号处理方式。</small></div><button className="icon-button" title="关闭导入预览" aria-label="关闭导入预览" onClick={() => setImportPreview(null)}><X size={16}/></button></div>
      <div className="import-preview-summary"><div><span>解析行</span><strong>{importPreview.total}</strong></div><div><span>可导入</span><strong className="good-text">{importPreview.rows.length}</strong></div><div><span>重复跳过</span><strong className={duplicateImportErrors.length ? 'warning-text' : 'good-text'}>{duplicateImportErrors.length}</strong></div><div><span>格式错误</span><strong className={invalidImportErrors.length ? 'bad-text' : 'good-text'}>{invalidImportErrors.length}</strong></div><div><span>缺少步骤</span><strong className={importPreview.rows.filter((item) => !String(item.steps || '').trim()).length ? 'warning-text' : 'good-text'}>{importPreview.rows.filter((item) => !String(item.steps || '').trim()).length}</strong></div></div>
      <div className="case-import-strategy import-review-strategy"><strong>重复编号处理</strong><label><input type="radio" name="duplicate-strategy" checked={duplicateStrategy === 'skip'} disabled={importBusy} onChange={() => void changeDuplicateStrategy('skip')}/>跳过已有用例</label><label><input type="radio" name="duplicate-strategy" checked={duplicateStrategy === 'overwrite'} disabled={importBusy} onChange={() => void changeDuplicateStrategy('overwrite')}/>覆盖已有用例</label><span>{duplicateStrategy === 'overwrite' ? '用于修复已导入但字段缺失的同编号用例' : '保留已有内容，只导入新编号'}</span></div>
      <div className="import-field-map"><div className="import-field-map-heading"><strong>字段映射</strong><span>系统已自动识别原始表头；“操作步骤 / 测试步骤 / Steps”都会写入同一个步骤字段。</span></div>{importPreview.headers.map((header) => <div className="import-mapping" key={header}><span>{header}</span><ChevronRight size={13}/><strong className={mapHeader(header) === '未识别' ? 'warning-text' : ''}>{mapHeader(header)}</strong></div>)}</div>
      <div className="import-preview-table"><header><span>行</span><span>用例</span><span>操作步骤</span><span>预期结果</span></header>{importPreview.rows.slice(0, 100).map((item, index) => <div className="import-preview-row" key={`${item.case_id || item.title}-${index}`}><span>{index + 2}</span><span><strong>{item.case_id || '自动生成编号'}</strong><small>{item.title}</small></span><span className={!String(item.steps || '').trim() ? 'warning-text' : ''} title={String(item.steps || '')}>{String(item.steps || '').trim() || '未映射到步骤字段'}</span><span title={String(item.expected || '')}>{String(item.expected || '').trim() || '未填写'}</span></div>)}{importPreview.rows.length > 100 && <div className="import-preview-more">仅展示前 100 行，确认导入不受影响。</div>}</div>
      {duplicateImportErrors.length > 0 && <div className="import-duplicate-note"><SkipForward size={15}/><span><strong>{duplicateImportErrors.length} 条重复编号将跳过</strong> 已有用例保持不变；切换为“覆盖已有用例”可重新校验并更新同编号记录。</span></div>}
      {invalidImportErrors.length > 0 && <div className="import-preview-errors">{invalidImportErrors.map((error) => <div key={error.row}><strong>第 {error.row} 行</strong><span>{error.errors.join('、')}</span></div>)}</div>}
      <div className="import-preview-footer"><span className="import-preview-note">{duplicateStrategy === 'overwrite' ? '重复编号将覆盖已有用例，可用于修复已导入但步骤为空的记录。' : '重复编号会跳过，原有用例不会被覆盖。'}</span><div className="case-editor-actions"><button className="outline-btn" onClick={() => setImportPreview(null)}>取消</button><button className="toolbar-btn primary" disabled={!importPreview.rows.length || importBusy} onClick={() => void confirmImport()}><Check size={14}/>{importBusy ? '导入中…' : `确认导入 ${importPreview.rows.length} 条`}</button></div></div>
    </section>}
  </div>
}

function AgentPanel({ agentRun }: { agentRun: { case_id: string; steps: { step_no: number; action: string; description: string }[]; status?: string } | null }) {
  if (!agentRun) return null
  return <section className="run-detail"><div className="section-title">智能执行{agentRun.status ? (agentRun.status === 'PASS' ? ' · 通过 ✔' : ' · 失败 ✘') : ' · 执行中…'}</div>{agentRun.steps.map((s) => <div className="timeline-row" key={s.step_no}><span>{s.step_no}</span><strong>{s.action}</strong><span>{s.description}</span></div>)}</section>
}

function CaseDetailField({ label, value, emptyMessage }: { label: string; value?: string; emptyMessage?: string }) {
  const content = String(value || '').trim()
  return <article className={`detail-field ${content ? 'filled' : 'empty'}`}><header><span>{label}</span>{!content && <em>待补充</em>}</header>{content ? <p>{content}</p> : <div className="detail-empty"><AlertTriangle size={16}/><strong>{emptyMessage || '尚未填写'}</strong></div>}</article>
}

function CasesCenterView({ projectId, cases, flows, onChanged, onAiGenerate, autoBatch, onAutoGenerateBatch, agentRun, onAgentRun, onSelectedCaseChange, onNavigate }: { projectId: string; cases: TestCase[]; flows: Flow[]; onChanged: (items: TestCase[]) => void; onAiGenerate: (caseId: string) => void; autoBatch: { done: number; total: number; failed: number; current: string } | null; onAutoGenerateBatch: () => void; agentRun: { case_id: string; steps: { step_no: number; action: string; description: string }[]; status?: string } | null; onAgentRun: (caseId: string) => void; onSelectedCaseChange?: (item: TestCase | null) => void; onNavigate: (view: ViewName) => void }) {
  const [selectedId, setSelectedId] = useState(cases[0]?.case_id || '')
  const [detailTab, setDetailTab] = useState<'definition' | 'stats' | 'history' | 'agent'>('definition')
  const [editRequest, setEditRequest] = useState<{ caseId: string; token: number } | undefined>(undefined)
  const [history, setHistory] = useState<CaseHistory | null>(null)
  const selected = cases.find((item) => item.case_id === selectedId) || cases[0]
  const flow = selected?.automation_flow_id ? flows.find((item) => item.flow_id === selected.automation_flow_id) : undefined
  const qualityFields = selected ? [selected.preconditions, selected.steps, selected.test_data, selected.expected].filter((item) => String(item || '').trim()).length : 0
  useEffect(() => {
    if (!cases.length) { setSelectedId(''); setHistory(null); return }
    if (!cases.some((item) => item.case_id === selectedId)) setSelectedId(cases[0].case_id)
  }, [cases, selectedId])
  useEffect(() => {
    if (!selected) { setHistory(null); return }
    setHistory(null)
    void api<CaseHistory>(`/test-cases/${selected.case_id}/history`).then(setHistory).catch(() => setHistory(null))
  }, [selected?.case_id])
  useEffect(() => { onSelectedCaseChange?.(selected || null) }, [selected?.case_id, onSelectedCaseChange])
  useEffect(() => {
    if (!agentRun?.case_id) return
    setSelectedId(agentRun.case_id)
    setDetailTab('agent')
  }, [agentRun?.case_id])
  return <div className="cases-center-layout"><TestingLoopBar active="cases" onNavigate={onNavigate}/>
    <TestCasesView projectId={projectId} cases={cases} flows={flows} onChanged={onChanged} onAiGenerate={onAiGenerate} autoBatch={autoBatch} onAutoGenerateBatch={onAutoGenerateBatch} onAgentRun={onAgentRun} selectedCaseId={selected?.case_id} onSelectCase={setSelectedId} editRequest={editRequest}/>
    <section className="case-detail-panel" aria-label="测试用例详情">
      {selected ? <>
        <header className="case-detail-header">
          <div><span className="case-detail-kicker">CASE WORKSPACE · 用例工作区</span><h2>{selected.title}</h2><p>{selected.case_id} · {selected.module || '未分类'} · {selected.priority} · {selected.case_type}</p></div>
          <div className="case-detail-actions"><span className={`case-detail-status ${qualityFields === 4 ? 'complete' : 'incomplete'}`}>{qualityFields}/4 定义字段</span><button className="icon-button" title="编辑当前用例" aria-label="编辑当前用例" onClick={() => setEditRequest({ caseId: selected.case_id, token: Date.now() })}><Pencil size={14}/></button><button className="outline-btn" onClick={() => onAiGenerate(selected.case_id)}><Sparkles size={14}/>AI 生成流程</button><button className="toolbar-btn primary" onClick={() => { setDetailTab('agent'); onAgentRun(selected.case_id) }}><Play size={14}/>智能执行</button></div>
        </header>
        <div className="case-detail-scroll">
        <div className="detail-grid"><div><span>用例编号</span><strong>{selected.case_id}</strong></div><div><span>自动化状态</span><strong className={selected.automation_flow_id ? 'health' : ''}>{selected.automation_flow_id ? '已自动化' : '待自动化'}</strong></div><div><span>关联流程</span><strong>{flow?.name || '未绑定流程'}</strong></div><div><span>最近状态</span><strong>{history?.latest_status || '尚无执行'}</strong></div><div><span>执行次数</span><strong>{history?.execution_count ?? '—'}</strong></div><div><span>字段完整度</span><strong>{qualityFields}/4</strong></div></div>
        <label className="detail-select"><span>当前用例</span><select value={selected.case_id} onChange={(event) => setSelectedId(event.target.value)}>{cases.map((item) => <option key={item.case_id} value={item.case_id}>{item.case_id} · {item.title}</option>)}</select></label>
        <nav className="case-detail-tabs" role="tablist" aria-label="用例详情视图"><button className={`case-detail-tab ${detailTab === 'definition' ? 'active' : ''}`} aria-selected={detailTab === 'definition'} onClick={() => setDetailTab('definition')}><ClipboardList size={14}/>测试定义<small>步骤与预期</small></button><button className={`case-detail-tab ${detailTab === 'stats' ? 'active' : ''}`} aria-selected={detailTab === 'stats'} onClick={() => setDetailTab('stats')}><Activity size={14}/>执行统计<small>通过率与风险</small></button><button className={`case-detail-tab ${detailTab === 'history' ? 'active' : ''}`} aria-selected={detailTab === 'history'} onClick={() => setDetailTab('history')}><History size={14}/>执行历史<small>每次证据</small></button><button className={`case-detail-tab ${detailTab === 'agent' ? 'active' : ''}`} aria-selected={detailTab === 'agent'} onClick={() => setDetailTab('agent')}><Bot size={14}/>智能执行<small>{agentRun?.case_id === selected.case_id ? agentRun.status || '执行中' : 'AI 编排'}</small></button></nav>
        {detailTab === 'definition' && <section className="case-detail-content" role="tabpanel"><div className="case-detail-intro"><strong>测试定义</strong><span>这里描述这条用例如何执行，以及完成后必须观察到什么结果。</span></div>{!String(selected.steps || '').trim() && <div className="detail-warning"><AlertTriangle size={15}/><span><strong>操作步骤为空。</strong> 可编辑当前用例补充步骤，或使用带“操作步骤 / 测试步骤 / Steps”表头的文件按相同编号覆盖导入。</span></div>}<div className="case-detail-text"><CaseDetailField label="前置条件" value={selected.preconditions} emptyMessage="执行前没有配置前置条件"/><CaseDetailField label="操作步骤" value={selected.steps} emptyMessage="尚未映射操作步骤"/><CaseDetailField label="测试数据" value={selected.test_data} emptyMessage="该用例没有测试数据说明"/><CaseDetailField label="预期结果" value={selected.expected} emptyMessage="尚未填写可验证的预期结果"/></div></section>}
        {detailTab === 'stats' && <section className="case-detail-content" role="tabpanel"><div className="case-detail-intro"><strong>执行统计</strong><span>把历史运行结果汇总成可判断的稳定性信号。</span></div><div className="history-summary"><div><span>执行次数</span><strong>{history?.execution_count ?? '—'}</strong></div><div><span>PASS</span><strong className="status pass">{history?.pass_count ?? '—'}</strong></div><div><span>FAIL</span><strong className="status fail">{history?.fail_count ?? '—'}</strong></div><div><span>最近状态</span><strong>{history?.latest_status || '暂无'}</strong></div><div><span>最近执行</span><strong>{history?.latest_run_at || '暂无'}</strong></div><div><span>最近失败原因</span><strong title={history?.latest_error || ''}>{history?.latest_error || '暂无'}</strong></div></div><div className="case-quality-grid"><div><span>优先级</span><strong>{selected.priority}</strong><small>{selected.priority === 'P0' ? '发布阻断级' : selected.priority === 'P1' ? '高风险路径' : '常规验证'}</small></div><div><span>自动化覆盖</span><strong>{selected.automation_flow_id ? '已绑定流程' : '手工用例'}</strong><small>{selected.automation_flow_id ? `${flow?.steps?.length || 0} 个可执行步骤` : '可在需要时由 AI 生成'}</small></div><div><span>稳定性信号</span><strong>{history && history.execution_count > 0 ? (history.fail_count ? '需要关注' : '稳定') : '尚无基线'}</strong><small>{history?.execution_count ? `失败 ${history.fail_count} 次` : '执行一次后生成基线'}</small></div></div></section>}
        {detailTab === 'history' && <section className="case-detail-content" role="tabpanel"><div className="case-detail-intro"><strong>执行历史</strong><span>查看每次运行的环境、状态和证据入口，定位失败不靠猜。</span></div><div className="history-list">{!history && <div className="detail-loading"><RefreshCw size={14}/>正在读取执行历史…</div>}{history?.history.map((item) => <div className="history-row" key={item.run_id}><strong>{item.run_id}</strong><span>{item.ended_at || item.started_at}</span><span>{item.environment_name || '未配置'} · {item.browser}</span><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span><span>{item.duration_ms} ms</span><button className="run-link" onClick={() => window.open(`${window.location.origin}/?run=${encodeURIComponent(item.run_id)}`, '_blank')}><Eye size={13}/>查看证据</button></div>)}{history && !history.history.length && <div className="detail-empty"><History size={18}/><strong>该用例还没有执行历史</strong><span>点击“智能执行”或在回归测试中运行它，结果会在这里沉淀。</span></div>}</div></section>}
        {detailTab === 'agent' && <section className="case-detail-content case-agent-content" role="tabpanel">{agentRun?.case_id === selected.case_id ? <AgentPanel agentRun={agentRun}/> : <div className="detail-empty"><Bot size={20}/><strong>尚未启动智能执行</strong><span>运行后会在这里展示 AI 拆解的步骤、实时状态和执行结果。</span><button className="toolbar-btn primary" onClick={() => onAgentRun(selected.case_id)}><Play size={14}/>开始智能执行</button></div>}</section>}
        </div>
      </> : <div className="empty-state"><ClipboardList size={20}/><strong>暂无测试用例</strong><span>先新建或导入一份测试资产。</span></div>}
    </section>
  </div>
}

function RegressionCenterView(props: { projectId: string; plans: RegressionPlan[]; cases: TestCase[]; environments: Environment[]; runs: RegressionRun[]; selectedRun: string; caseResults: RegressionCaseResult[]; launch: RegressionLaunch | null; onNavigate: (view: ViewName) => void; onSelectRun: (id: string) => Promise<void>; onPlansChanged: (items: RegressionPlan[]) => void; onRunsChanged: (items: RegressionRun[]) => void }) {
  const dialog = useDialog()
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const selectedPlan = props.plans.find((item) => item.regression_plan_id === selectedPlanId)
  const [editName, setEditName] = useState('')
  const edit = async () => { if (!selectedPlan || !editName.trim()) return; const saved = await api<RegressionPlan>('/regression-plans', { method: 'POST', body: JSON.stringify({ ...selectedPlan, name: editName }) }); props.onPlansChanged(props.plans.map((item) => item.regression_plan_id === saved.regression_plan_id ? saved : item)); setEditName('') }
  const copy = async () => { if (!selectedPlan) return; const copied = await api<RegressionPlan>('/regression-plans', { method: 'POST', body: JSON.stringify({ ...selectedPlan, regression_plan_id: '', name: `${selectedPlan.name}（副本）` }) }); props.onPlansChanged([copied, ...props.plans]) }
  const remove = async () => { if (!selectedPlan || !await dialog.confirm(`回归计划“${selectedPlan.name}”将被删除，历史回归结果不受影响。`, { title: '删除回归计划', confirmLabel: '删除计划', danger: true })) return; await api(`/regression-plans/${selectedPlan.regression_plan_id}`, { method: 'DELETE' }); props.onPlansChanged(props.plans.filter((item) => item.regression_plan_id !== selectedPlan.regression_plan_id)); setSelectedPlanId('') }
  const stop = async () => { const run = props.runs.find((item) => item.regression_run_id === props.selectedRun); if (!run || !await dialog.confirm('已完成的用例结果会保留，尚未执行的用例将标记为跳过。', { title: '停止当前回归', confirmLabel: '停止回归', danger: true })) return; try { await api(`/regression-runs/${run.regression_run_id}/stop`, { method: 'POST' }); props.onRunsChanged(props.runs.map((item) => item.regression_run_id === run.regression_run_id ? { ...item, status: 'STOPPING' } : item)) } catch (error) { await dialog.alert(error instanceof Error ? error.message : '停止回归失败', '停止失败') } }
  const currentRun = props.runs.find((item) => item.regression_run_id === props.selectedRun)
  return <div className="regression-center-layout"><TestingLoopBar active="regression" onNavigate={props.onNavigate}/><RegressionView {...props}/>{currentRun && <RegressionTimeline run={currentRun} cases={props.caseResults}/>} {props.selectedRun && currentRun?.status === 'RUNNING' && <div className="regression-stop"><span>当前回归正在执行</span><button className="toolbar-btn danger" onClick={() => void stop()}><CircleStop size={14}/>停止回归</button></div>}{props.plans.length > 0 && <section className="plan-management"><div className="section-title">计划管理</div><select value={selectedPlanId} onChange={(e) => { setSelectedPlanId(e.target.value); setEditName(props.plans.find((item) => item.regression_plan_id === e.target.value)?.name || '') }}><option value="">选择计划</option>{props.plans.map((item) => <option key={item.regression_plan_id} value={item.regression_plan_id}>{item.name}</option>)}</select><input placeholder="修改计划名称" value={editName} onChange={(e) => setEditName(e.target.value)}/><button className="outline-btn" disabled={!selectedPlan} onClick={() => void edit()}><Save size={14}/>保存</button><button className="outline-btn" disabled={!selectedPlan} onClick={() => void copy()}><Copy size={14}/>复制</button><button className="toolbar-btn danger" disabled={!selectedPlan} onClick={() => void remove()}><Trash2 size={14}/>删除</button></section>}{selectedPlan && <PlanEditor plan={selectedPlan} onSaved={(saved) => props.onPlansChanged(props.plans.map((item) => item.regression_plan_id === saved.regression_plan_id ? saved : item))}/>}</div>
}

function RegressionTimeline({ run, cases }: { run: RegressionRun; cases: RegressionCaseResult[] }) {
  const completed = cases.filter((item) => ['PASS', 'FAIL', 'SKIP', 'BLOCKED'].includes(item.status)).length
  const rate = run.total_cases ? Math.round((completed / run.total_cases) * 100) : 0
  return <section className="regression-timeline"><header><div><div className="section-title">实时回归</div><small>{run.regression_run_id}</small></div><strong>{rate}%</strong></header><div className="regression-progress"><strong>{completed} / {run.total_cases}</strong><span>已完成 · 剩余 {Math.max(0, run.total_cases - completed)}</span><div className="progress-track"><i style={{ width: `${rate}%` }}/></div></div><div className="regression-case-list">{cases.map((item) => <div className="regression-case-row" key={item.id}><div><strong>{item.case_id}</strong><span>{item.title}</span></div><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span><p>{item.error_message || '暂无失败信息'}</p>{item.run_id && <button className="run-link" onClick={() => window.open(`${window.location.origin}/?run=${encodeURIComponent(item.run_id)}`, '_blank')}><Eye size={13}/>查看证据</button>}</div>)}</div></section>
}

function PlanEditor({ plan, onSaved }: { plan: RegressionPlan; onSaved: (plan: RegressionPlan) => void }) {
  const [items, setItems] = useState(plan.cases)
  useEffect(() => setItems(plan.cases), [plan.regression_plan_id, plan.updated_at])
  const move = (index: number, offset: number) => { const target = index + offset; if (target < 0 || target >= items.length) return; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; setItems(next) }
  const save = async () => { const saved = await api<RegressionPlan>('/regression-plans', { method: 'POST', body: JSON.stringify({ ...plan, cases: items.map((item, index) => ({ case_id: item.case_id, enabled: Boolean(item.enabled), sort_order: index })) }) }); onSaved(saved) }
  return <section className="plan-editor"><header><div><div className="section-title">用例顺序</div><small>拖动或使用方向按钮调整回归执行顺序</small></div><button className="toolbar-btn primary" onClick={() => void save()}><Save size={14}/>保存排序</button></header>{items.map((item, index) => <div className="plan-case-row" draggable key={item.case_id} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const from = Number(event.dataTransfer.getData('text/plain')); if (Number.isInteger(from) && from !== index) { const next = [...items]; const [moved] = next.splice(from, 1); next.splice(index, 0, moved); setItems(next) } }}><span className="drag-handle">⠿</span><div><strong>{item.case_id}</strong><span>{item.title}</span></div><label><input type="checkbox" checked={Boolean(item.enabled)} onChange={(e) => setItems(items.map((old) => old.case_id === item.case_id ? { ...old, enabled: e.target.checked ? 1 : 0 } : old))}/> 启用</label><div className="plan-order-actions"><button className="icon-button" title="上移" aria-label={`上移 ${item.case_id}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={13}/></button><button className="icon-button" title="下移" aria-label={`下移 ${item.case_id}`} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={13}/></button></div></div>)}</section>
}

function RegressionView({ projectId, plans, cases, environments, runs, selectedRun, caseResults, launch, onSelectRun, onPlansChanged, onRunsChanged }: { projectId: string; plans: RegressionPlan[]; cases: TestCase[]; environments: Environment[]; runs: RegressionRun[]; selectedRun: string; caseResults: RegressionCaseResult[]; launch?: RegressionLaunch | null; onSelectRun: (id: string) => Promise<void>; onPlansChanged: (items: RegressionPlan[]) => void; onRunsChanged: (items: RegressionRun[]) => void }) {
  const dialog = useDialog()
  const [name, setName] = useState(''); const [environmentId, setEnvironmentId] = useState(environments[0]?.id || ''); const [selected, setSelected] = useState<string[]>([]); const [stopOnFailure, setStopOnFailure] = useState(false)
  const automated = cases.filter((item) => item.automation_flow_id)
  useEffect(() => { if (launch?.id) { setName(`${launch.sessionName} · 失败回归`); setSelected(launch.caseIds.filter((id) => automated.some((item) => item.case_id === id))) } }, [launch?.id])
  useEffect(() => { if (!selectedRun) return; let active = true; let timer = 0; const poll = async () => { try { const snapshot = await api<{ status: string; cases: RegressionCaseResult[] }>(`/regression-runs/${selectedRun}/status`); if (active) { onRunsChanged(await api<RegressionRun[]>('/regression-runs')); if (snapshot.cases) await onSelectRun(selectedRun); if (snapshot.status !== 'RUNNING' && timer) window.clearInterval(timer) } } catch { /* run may finish between polling requests */ } }; void poll(); timer = window.setInterval(() => void poll(), 900); return () => { active = false; window.clearInterval(timer) } }, [selectedRun])
  const save = async () => { if (!name.trim() || !selected.length) return void await dialog.alert('请输入计划名称，并至少选择一个已经绑定自动化流程的用例。', '计划信息不完整'); const plan = await api<RegressionPlan>('/regression-plans', { method: 'POST', body: JSON.stringify({ project_id: projectId, name, environment_id: environmentId || undefined, browser: 'chromium', stop_on_failure: stopOnFailure, cases: selected.map((case_id) => ({ case_id, enabled: true })) }) }); onPlansChanged([plan, ...plans.filter((item) => item.regression_plan_id !== plan.regression_plan_id)]); setName(''); setSelected([]) }
  const execute = async (plan: RegressionPlan) => { try { const started = await api<RegressionRun>(`/regression-plans/${plan.regression_plan_id}/runs`, { method: 'POST' }); onRunsChanged([started, ...runs.filter((item) => item.regression_run_id !== started.regression_run_id)]); await onSelectRun(started.regression_run_id) } catch (error) { await dialog.alert(error instanceof Error ? error.message : '执行回归失败', '回归启动失败') } }
  const rerun = async (run: RegressionRun) => { try { await api(`/regression-runs/${run.regression_run_id}/rerun-failed`, { method: 'POST' }); window.setTimeout(() => api<RegressionRun[]>('/regression-runs').then(onRunsChanged), 500) } catch (error) { await dialog.alert(error instanceof Error ? error.message : '失败重跑失败', '重跑启动失败') } }
  return <div className="content-view regression-workspace"><div className="panel-header"><div><div className="eyebrow">回归测试 / Regression</div><h1>回归计划</h1><p>按顺序执行已绑定自动化流程的测试用例，失败用例可独立重跑</p></div></div><div className="regression-create"><input placeholder="计划名称，例如：用户管理回归" value={name} onChange={(e) => setName(e.target.value)}/><select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}><option value="">选择环境</option>{environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><label><input type="checkbox" checked={stopOnFailure} onChange={(e) => setStopOnFailure(e.target.checked)}/> 失败后停止</label><button className="toolbar-btn primary" onClick={() => void save()}><Save size={14}/>保存计划</button></div><div className="case-picker regression-case-picker"><div className="asset-header"><span>选择自动化用例</span><span>模块</span><span>优先级</span><span>状态</span><span/></div>{automated.map((item) => <label className="asset-row" key={item.case_id}><span><input type="checkbox" checked={selected.includes(item.case_id)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.case_id] : selected.filter((id) => id !== item.case_id))}/> {item.case_id} {item.title}</span><span data-label="模块">{item.module}</span><span data-label="优先级">{item.priority}</span><span className="health" data-label="状态">已自动化</span><span/></label>)}</div><h3 className="section-title">已保存计划</h3><div className="asset-table regression-plan-table"><div className="asset-header"><span>计划</span><span>用例数</span><span>环境</span><span>状态</span><span>操作</span></div>{plans.map((plan) => <div className="asset-row" key={plan.regression_plan_id}><strong>{plan.name}<small>{plan.regression_plan_id}</small></strong><span data-label="用例">{plan.cases.length}</span><span data-label="环境">{environments.find((item) => item.id === plan.environment_id)?.name || '未配置'}</span><span data-label="状态" className="health">就绪</span><span className="row-actions"><button onClick={() => void execute(plan)} className="run-link"><Play size={13}/>执行</button></span></div>)}</div><h3 className="section-title">回归执行记录</h3><div className="asset-table regression-run-table"><div className="asset-header"><span>执行编号</span><span>计划</span><span>状态</span><span>结果</span><span>操作</span></div>{runs.map((run) => <div className="asset-row" key={run.regression_run_id}><strong>{run.regression_run_id}</strong><span data-label="计划">{run.regression_plan_id}</span><span data-label="状态" className={`status ${run.status.toLowerCase()}`}>{run.status === 'PASS' ? '通过' : run.status === 'FAIL' ? '失败' : run.status}</span><span data-label="结果">通过 {run.passed_cases} · 失败 {run.failed_cases} · 跳过 {run.skipped_cases}</span><span className="row-actions"><button onClick={() => void onSelectRun(run.regression_run_id)}><Eye size={13}/>明细</button>{run.failed_cases > 0 && <button onClick={() => void rerun(run)}><RefreshCw size={13}/>重跑</button>}{run.report_path && <a href={`${serviceOrigin}/artifacts/${run.regression_run_id}/report.html`} target="_blank" rel="noreferrer"><FileSearch size={13}/>报告</a>}</span></div>)}</div>{selectedRun && <div className="run-detail regression-run-detail"><div className="section-title">回归明细：{selectedRun}<button className="small-link" onClick={() => void onSelectRun('')}>关闭</button></div>{caseResults.map((item) => <div className="timeline-row" key={item.id}><span>{item.case_id}</span><strong>{item.title}</strong><span className={`status ${item.status.toLowerCase()}`}>{item.status === 'PASS' ? '通过' : item.status === 'FAIL' ? '失败' : item.status}</span><p>{item.error_message || '暂无失败信息'}</p>{item.run_id ? <a href={`${serviceOrigin}/artifacts/${item.run_id}/report.html`} target="_blank" rel="noreferrer"><FileSearch size={13}/>执行报告</a> : null}</div>)}</div>}</div>
}

function EnvironmentsView({ projectId, environments, onChanged }: { projectId: string; environments: Environment[]; onChanged: (items: Environment[]) => void }) {
  const dialog = useDialog()
  const [editing, setEditing] = useState<Environment | null>(null)
  const [variablesText, setVariablesText] = useState('{}')
  const [variablesError, setVariablesError] = useState('')
  const [busy, setBusy] = useState(false)
  const empty: Environment = { id: '', name: '', base_url: '', variables: {}, browser: 'chromium', read_only: true, allowed_hosts: [], environment_kind: 'test', payment_mode: 'disabled' }
  const openEditor = (item: Environment) => {
    setEditing({ ...item, allowed_hosts: [...(item.allowed_hosts || [])], variables: { ...(item.variables || {}) } })
    setVariablesText(JSON.stringify(item.variables || {}, null, 2))
    setVariablesError('')
  }
  const closeEditor = () => { setEditing(null); setVariablesText('{}'); setVariablesError('') }
  const updateVariables = (value: string) => {
    setVariablesText(value)
    try {
      const parsed = JSON.parse(value || '{}')
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('变量必须是 JSON 对象')
      setVariablesError('')
    } catch (error) {
      setVariablesError(error instanceof Error ? error.message : 'JSON 格式无效')
    }
  }
  const save = async () => {
    if (!editing?.name.trim()) { await dialog.alert('请填写环境名称', '无法保存环境'); return }
    let variables: Record<string, unknown>
    try {
      const parsed = JSON.parse(variablesText || '{}')
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('变量必须是 JSON 对象')
      variables = parsed as Record<string, unknown>
      setVariablesError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON 格式无效'
      setVariablesError(message)
      await dialog.alert(`环境变量 JSON 无法解析：${message}`, '无法保存环境')
      return
    }
    setBusy(true)
    try {
      const saved = await api<Environment>(editing.id ? `/environments/${editing.id}` : '/environments', {
        method: editing.id ? 'PUT' : 'POST',
        body: JSON.stringify({ ...editing, variables, project_id: projectId, allowed_hosts: editing.allowed_hosts || [] }),
      })
      onChanged([saved, ...environments.filter((item) => item.id !== saved.id)])
      closeEditor()
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : '环境保存失败', '环境保存失败')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (item: Environment) => {
    if (!await dialog.confirm(`测试环境“${item.name}”将被删除；仍被流程、计划或执行记录引用时系统会阻止操作。`, { title: '删除测试环境', confirmLabel: '删除环境', danger: true })) return
    try {
      await api(`/environments/${item.id}`, { method: 'DELETE' })
      onChanged(environments.filter((current) => current.id !== item.id))
      if (editing?.id === item.id) closeEditor()
    } catch (error) {
      await dialog.alert(error instanceof Error ? error.message : '环境删除失败', '无法删除环境')
    }
  }
  return <div className="content-view environment-workspace">
    <div className="panel-header"><div><div className="eyebrow">运行配置 / Environments</div><h1>测试环境</h1><p>环境身份和请求白名单由核心门禁校验，修改显示名称不能绕过安全策略</p></div><button className="outline-btn" onClick={() => openEditor(empty)}>＋ 新增环境</button></div>
    {editing && <div className="case-editor environment-editor">
      <div className="environment-editor-title"><div><strong>{editing.id ? '编辑测试环境' : '新增测试环境'}</strong><span>请求发出前检查实际 URL；生产和真实支付不可执行</span></div><span className="environment-gate-badge">CORE GATE</span></div>
      <label className="environment-field"><span>环境名称</span><input placeholder="例如：QA 测试环境" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}/></label>
      <label className="environment-field environment-field-wide"><span>Base URL</span><input placeholder="例如：http://127.0.0.1:3000" value={editing.base_url} onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}/></label>
      <label className="environment-field"><span>环境身份</span><select value={editing.environment_kind || 'test'} onChange={(e) => setEditing({ ...editing, environment_kind: e.target.value as Environment['environment_kind'] })}><option value="local">本地开发</option><option value="test">测试环境</option><option value="staging">预发布环境</option><option value="production">生产环境（禁止执行）</option></select></label>
      <label className="environment-field"><span>浏览器</span><select value={editing.browser} onChange={(e) => setEditing({ ...editing, browser: e.target.value })}><option value="chromium">Chromium</option><option value="firefox">Firefox（实验性）</option><option value="webkit">WebKit（实验性）</option></select></label>
      <label className="environment-field"><span>支付策略</span><select value={editing.payment_mode || 'disabled'} onChange={(e) => setEditing({ ...editing, payment_mode: e.target.value as Environment['payment_mode'] })}><option value="disabled">禁止支付</option><option value="mock">仅 Mock 支付</option><option value="sandbox">仅 Sandbox 支付</option></select></label>
      <label className="environment-field environment-field-hosts"><span>请求域名白名单</span><input placeholder="例如：qa.example.com, api-qa.example.com" value={(editing.allowed_hosts || []).join(',')} onChange={(e) => setEditing({ ...editing, allowed_hosts: e.target.value.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean) })}/><small>页面跳转、XHR、Fetch 和资源请求都受此名单约束</small></label>
      <label className="toggle-label environment-readonly"><input type="checkbox" checked={editing.read_only} onChange={(e) => setEditing({ ...editing, read_only: e.target.checked })}/><span><strong>只读模式</strong><small>阻止写入和删除动作</small></span></label>
      <div className="environment-json-field"><span>环境变量 JSON</span><textarea aria-invalid={Boolean(variablesError)} placeholder={'例如 {"username":"tester"}'} value={variablesText} onChange={(e) => updateVariables(e.target.value)}/>{variablesError && <small>{variablesError}</small>}</div>
      {editing.environment_kind === 'production' && <div className="environment-production-warning"><ShieldAlert size={16}/><span><strong>此环境只能登记，不能执行</strong><small>生产域名会在浏览器启动前和每次网络请求前被双重阻止。</small></span></div>}
      <div className="case-editor-actions"><button className="outline-btn" onClick={closeEditor}>取消</button><button className="toolbar-btn primary" disabled={busy || Boolean(variablesError)} onClick={() => void save()}>{busy ? '保存中…' : '保存环境'}</button></div>
    </div>}
    <div className="asset-table environment-table"><div className="asset-header"><span>环境</span><span>地址</span><span>浏览器</span><span>安全策略</span><span>操作</span></div>{environments.map((item) => <div className="asset-row" key={item.id}><strong>{item.name}<small>{item.id}</small></strong><span>{item.base_url || '未配置'}</span><span>{item.browser}</span><span><b className={`environment-kind ${item.environment_kind || 'test'}`}>{item.environment_kind === 'production' ? '禁止执行' : item.environment_kind === 'staging' ? '预发布' : item.environment_kind === 'local' ? '本地' : '测试'}</b>{item.read_only ? '只读' : '可写'} · {item.payment_mode === 'sandbox' ? 'Sandbox' : item.payment_mode === 'mock' ? 'Mock' : '支付关闭'} · {item.allowed_hosts?.length || 0} 域名</span><span className="row-actions"><button className="run-link" onClick={() => openEditor(item)}>编辑</button><button className="run-link danger-link" onClick={() => void remove(item)}>删除</button></span></div>)}</div>
    {!environments.length && <div className="empty-state">还没有测试环境，请先新增一个环境</div>}
  </div>
}

function ProjectPackageControls({ projectId, onImported }: { projectId: string; onImported: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const exportProject = async () => {
    if (!projectId) return
    setBusy(true)
    try {
      const response = await fetch(`${serviceOrigin}/api/projects/${projectId}/export`)
      if (!response.ok) throw new Error(await response.text())
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement('a')
      link.href = url; link.download = 'automationstudio-project.automationstudio'; link.click(); URL.revokeObjectURL(url); setMessage('项目包已导出，敏感变量已脱敏')
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败') } finally { setBusy(false) }
  }
  const importProject = async (file: File) => {
    setBusy(true)
    try {
      const reader = new FileReader(); reader.onload = async () => {
        try { const content = String(reader.result).split(',')[1] || ''; await api('/projects/import', { method: 'POST', body: JSON.stringify({ content_base64: content }) }); await onImported(); setMessage('项目包已导入并切换到最新项目'); setBusy(false) }
        catch (error) { setMessage(error instanceof Error ? error.message : '导入失败'); setBusy(false) }
      }; reader.onerror = () => { setMessage('项目包读取失败，请确认文件仍然可访问后重试'); setBusy(false) }; reader.readAsDataURL(file)
    } catch (error) { setMessage(error instanceof Error ? error.message : '导入失败'); setBusy(false) }
  }
  return <section className="settings-panel package-panel"><div className="settings-row"><div><strong>项目导入 / 导出</strong><small>导出当前项目的环境、页面元素、自动化流程、测试用例和回归计划；密码与 Token 自动脱敏。</small></div><div className="row-actions"><button className="outline-btn" disabled={!projectId || busy} onClick={() => void exportProject()}>导出项目包</button><label className="outline-btn file-btn">导入项目包<input type="file" accept=".automationstudio,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProject(file); event.currentTarget.value = '' }} /></label></div></div>{message && <div className="settings-message">{message}</div>}</section>
}

function LodestarCapabilitiesPanel({ onOpenAi }: { onOpenAi: (prompt: string) => void }) {
  const dialog = useDialog()
  const [memories, setMemories] = useState<LodestarMemory[]>([])
  const [skills, setSkills] = useState<LodestarSkill[]>([])
  const [grants, setGrants] = useState<LodestarDesktopGrant[]>([])
  const [desktopEntries, setDesktopEntries] = useState<LodestarDesktopEntry[]>([])
  const [desktopFile, setDesktopFile] = useState<LodestarDesktopFile | null>(null)
  const [desktopPath, setDesktopPath] = useState('')
  const [memoryKey, setMemoryKey] = useState('')
  const [memoryValue, setMemoryValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const refresh = async () => {
    const [nextMemories, nextSkills, nextGrants] = await Promise.all([
      api<LodestarMemory[]>('/klein/memories'),
      api<LodestarSkill[]>('/klein/skills'),
      api<LodestarDesktopGrant[]>('/klein/desktop/grants'),
    ])
    setMemories(nextMemories); setSkills(nextSkills); setGrants(nextGrants)
  }
  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : '能力中心加载失败')) }, [])
  const saveMemory = async () => {
    if (!memoryKey.trim() || !memoryValue.trim()) return
    setBusy(true)
    try {
      const saved = await api<LodestarMemory>('/klein/memories', { method: 'POST', body: JSON.stringify({ key: memoryKey, value: memoryValue }) })
      setMemories((items) => [saved, ...items.filter((item) => item.id !== saved.id && item.key !== saved.key)])
      setMemoryKey(''); setMemoryValue(''); setMessage('长期记忆已保存，后续对话会自动带入')
    } catch (error) { setMessage(error instanceof Error ? error.message : '记忆保存失败') } finally { setBusy(false) }
  }
  const removeMemory = async (item: LodestarMemory) => {
    if (!await dialog.confirm(`删除长期记忆“${item.key}”？`, { title: '删除长期记忆', confirmLabel: '删除', danger: true })) return
    await api(`/klein/memories/${item.id}`, { method: 'DELETE' }); setMemories((items) => items.filter((current) => current.id !== item.id))
  }
  const toggleMemory = async (item: LodestarMemory) => {
    const saved = await api<LodestarMemory>(`/klein/memories/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) })
    setMemories((items) => items.map((current) => current.id === saved.id ? saved : current))
    setMessage(saved.enabled ? `记忆“${saved.key}”已启用` : `记忆“${saved.key}”已暂停`)
  }
  const installSkill = (file?: File) => {
    if (!file) return
    setBusy(true); setMessage('正在安装 Skill…')
    const reader = new FileReader()
    reader.onerror = () => { setBusy(false); setMessage('Skill 文件读取失败') }
    reader.onload = async () => {
      try {
        const content = String(reader.result).split(',')[1] || ''
        const saved = await api<LodestarSkill>('/klein/skills/install', { method: 'POST', body: JSON.stringify({ filename: file.name, content_base64: content }) })
        setSkills((items) => [saved, ...items.filter((item) => item.id !== saved.id && item.name !== saved.name)])
        setMessage(`Skill“${saved.name}”已安装并启用`)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Skill 安装失败') } finally { setBusy(false) }
    }
    reader.readAsDataURL(file)
  }
  const toggleSkill = async (item: LodestarSkill) => {
    const saved = await api<LodestarSkill>(`/klein/skills/${item.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !item.enabled }) })
    setSkills((items) => items.map((current) => current.id === saved.id ? saved : current))
  }
  const removeSkill = async (item: LodestarSkill) => {
    if (!await dialog.confirm(`卸载 Skill“${item.name}”？`, { title: '卸载 Skill', confirmLabel: '卸载', danger: true })) return
    await api(`/klein/skills/${item.id}`, { method: 'DELETE' }); setSkills((items) => items.filter((current) => current.id !== item.id))
  }
  const grantDesktop = async () => {
    setBusy(true)
    try { const saved = await api<LodestarDesktopGrant>('/klein/desktop/grants/default', { method: 'POST' }); setGrants((items) => [saved, ...items.filter((item) => item.id !== saved.id)]); setMessage('Windows 桌面已授权为只读范围') }
    catch (error) { setMessage(error instanceof Error ? error.message : '桌面授权失败') } finally { setBusy(false) }
  }
  const revokeDesktop = async (item: LodestarDesktopGrant) => {
    if (!await dialog.confirm(`撤销“${item.name}”读取权限？`, { title: '撤销桌面授权', confirmLabel: '撤销', danger: true })) return
    await api(`/klein/desktop/grants/${item.id}`, { method: 'DELETE' }); setGrants((items) => items.filter((current) => current.id !== item.id)); setDesktopEntries([]); setDesktopFile(null); setDesktopPath('')
  }
  const scanDesktop = async (path = '') => {
    setBusy(true)
    try { const result = await api<{ path: string; entries: LodestarDesktopEntry[] }>('/klein/desktop/list', { method: 'POST', body: JSON.stringify({ path }) }); setDesktopPath(result.path); setDesktopEntries(result.entries); setDesktopFile(null); setMessage(`已读取 ${result.entries.length} 个项目`) }
    catch (error) { setMessage(error instanceof Error ? error.message : '桌面读取失败') } finally { setBusy(false) }
  }
  const previewDesktopFile = async (item: LodestarDesktopEntry) => {
    if (item.kind === 'folder') { await scanDesktop(item.path); return }
    setBusy(true); setMessage(`正在读取“${item.name}”…`)
    try {
      const result = await api<LodestarDesktopFile>('/klein/desktop/read', { method: 'POST', body: JSON.stringify({ path: item.path }) })
      setDesktopFile(result); setMessage(`已读取“${result.name}”`)
    } catch (error) { setDesktopFile(null); setMessage(error instanceof Error ? error.message : '文件读取失败') } finally { setBusy(false) }
  }
  return <div className="capability-settings-stack">
    <section className="settings-panel capability-panel"><header className="settings-section-head"><div className="settings-section-icon"><BrainCircuit size={17}/></div><div><strong>长期记忆</strong><small>可随时启停，自动进入后续对话</small></div><span className="settings-status ready"><i/>{memories.filter((item) => item.enabled).length}/{memories.length} 启用</span></header><div className="capability-memory-form"><input placeholder="记忆标题，例如：回答偏好" value={memoryKey} onChange={(event) => setMemoryKey(event.target.value)}/><textarea placeholder="希望 Lodestar 长期记住的内容" value={memoryValue} onChange={(event) => setMemoryValue(event.target.value)}/><button className="toolbar-btn primary" disabled={busy || !memoryKey.trim() || !memoryValue.trim()} onClick={() => void saveMemory()}><Save size={14}/>保存记忆</button></div><div className="capability-list">{memories.map((item) => <article key={item.id} className={!item.enabled ? 'disabled' : ''}><BrainCircuit size={15}/><div><strong>{item.key}</strong><small>{item.value}</small></div><button className={`toggle ${item.enabled ? 'on' : ''}`} aria-label={`${item.enabled ? '暂停' : '启用'}记忆 ${item.key}`} onClick={() => void toggleMemory(item)}><span/></button><button className="icon-button" title="删除记忆" aria-label={`删除记忆 ${item.key}`} onClick={() => void removeMemory(item)}><Trash2 size={14}/></button></article>)}{!memories.length && <div className="capability-empty">还没有长期记忆。也可以在对话中直接说“记住：……”</div>}</div></section>
    <section className="settings-panel capability-panel"><header className="settings-section-head"><div className="settings-section-icon neutral"><PackagePlus size={17}/></div><div><strong>Skill 中心</strong><small>安装、启停并注入 Lodestar 的回答上下文</small></div><label className="outline-btn file-btn"><PackagePlus size={14}/>安装 Skill<input type="file" accept=".md,.markdown,.json,.zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) installSkill(file); event.currentTarget.value = '' }}/></label></header><div className="capability-list">{skills.map((item) => <article key={item.id} className={!item.enabled ? 'disabled' : ''}><PackagePlus size={15}/><div><strong>{item.name}</strong><small>{item.filename} · {Math.max(1, Math.round(item.size / 1024))} KB</small></div><button className={`toggle ${item.enabled ? 'on' : ''}`} aria-label={`${item.enabled ? '停用' : '启用'} Skill ${item.name}`} onClick={() => void toggleSkill(item)}><span/></button><button className="icon-button" title="卸载 Skill" aria-label={`卸载 Skill ${item.name}`} onClick={() => void removeSkill(item)}><Trash2 size={14}/></button></article>)}{!skills.length && <div className="capability-empty">支持 Markdown、JSON 或包含 SKILL.md 的 ZIP Skill 包。</div>}</div></section>
    <section className="settings-panel capability-panel"><header className="settings-section-head"><div className="settings-section-icon neutral"><FolderOpen size={17}/></div><div><strong>桌面访问</strong><small>授权范围内浏览、预览并交给 Lodestar 分析</small></div>{grants.length ? <button className="outline-btn" disabled={busy} onClick={() => void scanDesktop(desktopPath)}><RefreshCw size={14}/>刷新</button> : <button className="toolbar-btn primary" disabled={busy} onClick={() => void grantDesktop()}><ShieldCheck size={14}/>授权桌面</button>}</header><div className="capability-list">{grants.map((item) => <article key={item.id}><FolderOpen size={15}/><div><strong>{item.name}</strong><small>{item.path} · 用户授权范围</small></div><button className="outline-btn compact" onClick={() => void revokeDesktop(item)}>撤销</button></article>)}{!grants.length && <div className="capability-empty">授权后可浏览桌面目录，并读取文本、代码、Markdown、CSV 与 JSON 文件。</div>}</div>{grants.length > 0 && <div className="desktop-browser-bar"><button type="button" className="icon-button" title="返回上级" aria-label="返回上级" disabled={!desktopPath || desktopPath === grants[0]?.path} onClick={() => void scanDesktop(desktopPath.replace(/[\\/][^\\/]+[\\/]?$/, ''))}><ArrowLeft size={14}/></button><div><small>当前位置</small><strong>{desktopPath || grants[0]?.path || 'Windows 桌面'}</strong></div>{!desktopEntries.length && <button className="outline-btn compact" disabled={busy} onClick={() => void scanDesktop()}><Search size={13}/>浏览</button>}</div>}{desktopEntries.length > 0 && <div className="desktop-scan-grid">{desktopEntries.slice(0, 60).map((item) => <button type="button" key={item.path} onClick={() => void previewDesktopFile(item)}><FolderOpen size={12}/><span>{item.name}</span><small>{item.kind === 'folder' ? '打开' : `${Math.max(1, Math.round(item.size / 1024))} KB`}</small></button>)}</div>}{desktopFile && <div className="desktop-file-preview"><header><div><strong>{desktopFile.name}</strong><small>{desktopFile.path}{desktopFile.truncated ? ' · 已截取部分内容' : ''}</small></div><button className="toolbar-btn primary" onClick={() => onOpenAi(`读取并分析桌面文件：${desktopFile.name}`)}><BrainCircuit size={14}/>交给 Lodestar</button><button className="icon-button" aria-label="关闭文件预览" onClick={() => setDesktopFile(null)}><X size={14}/></button></header><pre>{desktopFile.content}</pre></div>}</section>
    {message && <div className="settings-message">{message}</div>}
  </div>
}

type SettingsCategory = 'ai' | 'capabilities' | 'appearance' | 'execution' | 'data' | 'diagnostics'

function AppearanceSettingsPanel({ theme, onThemeChange, uiScale, onUiScaleChange, uiDensity, onUiDensityChange }: { theme: ThemeName; onThemeChange: (theme: ThemeName) => void; uiScale: UiScale; onUiScaleChange: (scale: UiScale) => void; uiDensity: UiDensity; onUiDensityChange: (density: UiDensity) => void }) {
  return <section className="settings-panel appearance-settings-panel">
    <header className="settings-section-head"><div className="settings-section-icon"><Palette size={17}/></div><div><strong>外观与可读性</strong><small>Appearance &amp; Readability</small></div></header>
    <div className="settings-block"><div className="settings-block-title"><strong>界面主题</strong><small>主题会同时应用到 AI、功能区、设置与底部面板</small></div><div className="settings-theme-grid">{themeOptions.map((item) => <button type="button" key={item.id} className={theme === item.id ? 'selected' : ''} onClick={() => onThemeChange(item.id)}><span className={`settings-theme-preview ${item.id}`}><i/><i/><i/></span><span><strong>{item.label}</strong><small>{item.detail}</small></span>{theme === item.id && <Check size={15}/>}</button>)}</div></div>
    <div className="settings-row preference-row"><div><strong>界面字号</strong><small>调整功能区、表格与 AI 回复的整体文字大小</small></div><div className="settings-segmented">{(['100', '110', '120'] as UiScale[]).map((item) => <button type="button" key={item} className={uiScale === item ? 'active' : ''} onClick={() => onUiScaleChange(item)}>{item === '100' ? '标准' : item === '110' ? '舒适' : '大字'}<small>{item}%</small></button>)}</div></div>
    <div className="settings-row preference-row"><div><strong>内容密度</strong><small>决定表格行距、信息间距与阅读节奏</small></div><div className="settings-segmented compact">{([{ id: 'compact', label: '紧凑' }, { id: 'comfortable', label: '标准' }, { id: 'reading', label: '阅读' }] as { id: UiDensity; label: string }[]).map((item) => <button type="button" key={item.id} className={uiDensity === item.id ? 'active' : ''} onClick={() => onUiDensityChange(item.id)}>{item.label}</button>)}</div></div>
  </section>
}

function DiagnosticsSettingsPanel({ projectCount, caseCount, flowCount, runCount, planCount, dataDir }: { projectCount: number; caseCount: number; flowCount: number; runCount: number; planCount: number; dataDir: string }) {
  const [result, setResult] = useState<DiagnosticsSelfTest | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const runSelfTest = async () => {
    setBusy(true)
    setMessage('正在检查数据库、客户端资源、本地 AI 和 Chromium…')
    try {
      const next = await api<DiagnosticsSelfTest>('/diagnostics/self-test', { method: 'POST' })
      setResult(next)
      setMessage(next.ok ? `完整自检通过，用时 ${next.duration_ms} ms` : '自检发现异常，请查看失败项目')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '完整自检失败')
    } finally {
      setBusy(false)
    }
  }
  return <section className="settings-panel diagnostics-settings-panel">
    <header className="settings-section-head"><div className="settings-section-icon"><Activity size={17}/></div><div><strong>工作区诊断</strong><small>Workspace Diagnostics</small></div><span className={`settings-status ${result?.ok ? 'ready' : result ? 'failed' : ''}`}><i/>{busy ? '检测中' : result ? result.ok ? '全部通过' : '发现异常' : '等待检测'}</span><button className="toolbar-btn primary diagnostics-run" disabled={busy} onClick={() => void runSelfTest()}><SearchCheck size={14}/>{busy ? '正在自检…' : '运行完整自检'}</button></header>
    <div className="diagnostics-metrics"><article><small>项目</small><strong>{projectCount}</strong></article><article><small>测试用例</small><strong>{caseCount}</strong></article><article><small>自动化流程</small><strong>{flowCount}</strong></article><article><small>回归计划</small><strong>{planCount}</strong></article><article><small>执行记录</small><strong>{runCount}</strong></article></div>
    {result && <div className="diagnostics-checks">{result.checks.map((item) => <article key={item.key} className={item.ok ? 'pass' : 'fail'}><span>{item.ok ? <CheckCircle2 size={15}/> : <AlertTriangle size={15}/>}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><em>{item.duration_ms} ms</em></article>)}</div>}
    {!result && <div className="diagnostics-empty"><SearchCheck size={22}/><div><strong>执行一次真实运行检查</strong><small>不会修改项目数据，也不会访问业务系统。</small></div></div>}
    <div className="settings-row"><div><strong>AI 与测试功能隔离</strong><small>模型连接异常不会阻止用例、套件、会话和自动化功能使用</small></div><span className="health">已启用</span></div>
    <div className="settings-row"><div><strong>数据驻留</strong><small>数据库、日志和执行证据保存在当前用户的本地数据目录</small></div><code>{dataDir || '本地数据目录'}</code></div>
    {message && <div className={`settings-message ${result && !result.ok ? 'error' : ''}`}>{message}</div>}
  </section>
}

function SettingsWorkspace({ aiConfig, onAiConfigChange, theme, onThemeChange, uiScale, onUiScaleChange, uiDensity, onUiDensityChange, projectId, projectCount, caseCount, flowCount, runCount, planCount, onOpenEnvironments, onOpenAi, onImported }: { aiConfig: { base_url: string; api_key: string; model: string }; onAiConfigChange: (config: { base_url: string; api_key: string; model: string }) => void; theme: ThemeName; onThemeChange: (theme: ThemeName) => void; uiScale: UiScale; onUiScaleChange: (scale: UiScale) => void; uiDensity: UiDensity; onUiDensityChange: (density: UiDensity) => void; projectId: string; projectCount: number; caseCount: number; flowCount: number; runCount: number; planCount: number; onOpenEnvironments: () => void; onOpenAi: (prompt: string) => void; onImported: () => Promise<void> }) {
  const [category, setCategory] = useState<SettingsCategory>('ai')
  const [query, setQuery] = useState('')
  const [runtimeDataDir, setRuntimeDataDir] = useState('')
  useEffect(() => {
    api<{ data_dir?: string }>('/health').then((result) => setRuntimeDataDir(result.data_dir || '')).catch(() => setRuntimeDataDir(''))
  }, [])
  const categories: { id: SettingsCategory; label: string; detail: string; icon: ComponentType<{ size?: number }> }[] = [
    { id: 'ai', label: 'AI 与模型', detail: '连接、模型与权限', icon: Sparkles },
    { id: 'capabilities', label: 'Lodestar 能力', detail: '记忆、Skill 与桌面', icon: BrainCircuit },
    { id: 'appearance', label: '外观', detail: '主题、字号与密度', icon: Palette },
    { id: 'execution', label: '执行与安全', detail: '浏览器与运行策略', icon: ShieldCheck },
    { id: 'data', label: '数据与迁移', detail: '导入、导出与目录', icon: Database },
    { id: 'diagnostics', label: '诊断', detail: '工作区健康状态', icon: Activity },
  ]
  const normalizedQuery = query.trim().toLowerCase()
  const visibleCategories = categories.filter((item) => !normalizedQuery || `${item.label} ${item.detail}`.toLowerCase().includes(normalizedQuery))
  const activeCategory = visibleCategories.some((item) => item.id === category) ? category : visibleCategories[0]?.id || category
  const activeMeta = categories.find((item) => item.id === activeCategory) || categories[0]
  const ActiveMetaIcon = activeMeta.icon
  return <div className="content-view settings-workspace">
    <header className="settings-workspace-head"><div><div className="eyebrow">工作台设置</div><h1>设置</h1><p>模型、外观、执行策略和本地数据都在一个独立工作区中管理</p></div><div className="settings-head-meta"><span><ShieldCheck size={14}/>本机配置</span><span><Database size={14}/>本地驻留</span></div></header>
    <div className="settings-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置"/><kbd>Ctrl ,</kbd></div>
    <div className="settings-workspace-body"><nav className="settings-category-nav" aria-label="设置分类">{visibleCategories.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={activeCategory === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}><Icon size={16}/><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={13}/></button> })}{!visibleCategories.length && <div className="settings-no-result">没有匹配的设置</div>}</nav>
      <main className="settings-detail"><header className="settings-detail-head"><span><ActiveMetaIcon size={18}/></span><div><small>{activeMeta.detail}</small><strong>{activeMeta.label}</strong><p>{activeCategory === 'ai' ? '连接兼容 OpenAI 协议的模型服务，验证连接后即可用于问答、规划和测试诊断。' : activeCategory === 'capabilities' ? '管理 Lodestar 的长期记忆、可安装 Skill 和明确授权的桌面读取范围。' : activeCategory === 'appearance' ? '主题、字号和密度使用统一色阶，修改后立即应用到整个客户端。' : activeCategory === 'execution' ? '管理执行器、安全策略、证据目录和历史产物清理。' : activeCategory === 'data' ? '管理项目包与本地数据位置，敏感字段在导出时自动脱敏。' : '检查客户端、测试资产、执行记录和数据驻留状态。'}</p></div></header>{activeCategory === 'ai' && <AiSettingsPanel aiConfig={aiConfig} onChange={onAiConfigChange}/>} {activeCategory === 'capabilities' && <LodestarCapabilitiesPanel onOpenAi={onOpenAi}/>} {activeCategory === 'appearance' && <AppearanceSettingsPanel theme={theme} onThemeChange={onThemeChange} uiScale={uiScale} onUiScaleChange={onUiScaleChange} uiDensity={uiDensity} onUiDensityChange={onUiDensityChange}/>} {activeCategory === 'execution' && <SettingsPanel projectCount={projectCount} caseCount={caseCount} flowCount={flowCount} runCount={runCount} planCount={planCount} dataDir={runtimeDataDir} onOpenEnvironments={onOpenEnvironments}/>} {activeCategory === 'data' && <><section className="settings-panel data-location-panel"><header className="settings-section-head"><div className="settings-section-icon neutral"><Database size={17}/></div><div><strong>本地数据</strong><small>Local Data</small></div></header><div className="settings-row"><div><strong>客户端数据目录</strong><small>数据库、日志、WebView 状态和执行证据统一保存在当前用户目录</small></div><code>{runtimeDataDir || '正在读取本地数据目录…'}</code></div></section><ProjectPackageControls projectId={projectId} onImported={onImported}/></>} {activeCategory === 'diagnostics' && <DiagnosticsSettingsPanel projectCount={projectCount} caseCount={caseCount} flowCount={flowCount} runCount={runCount} planCount={planCount} dataDir={runtimeDataDir}/>}</main>
    </div>
  </div>
}

function AiSettingsPanel({ aiConfig, onChange }: { aiConfig: { base_url: string; api_key: string; model: string }; onChange: (c: { base_url: string; api_key: string; model: string }) => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelOptions, setModelOptions] = useState<string[]>([])
  const localAi = isLocalAiConfig(aiConfig)
  const connectionReady = localAi || Boolean(aiConfig.base_url && aiConfig.api_key && aiConfig.model && aiConfig.model !== LOCAL_AI_MODEL)
  const provider = localAi ? 'Lodestar' : /anthropic/i.test(aiConfig.base_url) ? 'Anthropic' : /minimax/i.test(aiConfig.base_url) ? 'MiniMax' : /sub2api/i.test(aiConfig.base_url) ? 'Sub2API' : aiConfig.base_url ? 'OpenAI Compatible' : '等待配置'
  const verify = async () => { setBusy(true); setMessage(''); try { const result = await api<{ ok: boolean; api_kind?: string; model?: string }>('/ai/verify', { method: 'POST', body: JSON.stringify(aiConfig) }); setMessage(`验证通过 · ${result.api_kind || ''} · ${result.model || ''}`) } catch (error) { setMessage(error instanceof Error ? error.message : '验证失败') } finally { setBusy(false) } }
  const discover = async () => {
    setBusy(true)
    setMessage('正在读取可用模型…')
    try {
      const result = await api<{ models: string[]; selected: string }>('/ai/models', { method: 'POST', body: JSON.stringify({ base_url: aiConfig.base_url, api_key: aiConfig.api_key }) })
      const models = Array.from(new Set((result.models || []).filter(Boolean)))
      setModelOptions(models)
      const selected = result.selected || models[0] || ''
      onChange({ ...aiConfig, model: selected })
      setMessage(models.length ? `已识别 ${models.length} 个模型，已选中推荐模型：${selected}` : '接口未返回可用模型，请手动输入模型名称')
    } catch (error) {
      setModelOptions([])
      setMessage(error instanceof Error ? error.message : '识别失败')
    } finally { setBusy(false) }
  }
  const useLocal = () => { setModelOptions([]); onChange({ base_url: LOCAL_AI_BASE_URL, api_key: '', model: LOCAL_AI_MODEL }); setMessage('已切换到本地模式，无需 API Key') }
  const useExternal = () => { setModelOptions([]); onChange({ base_url: '', api_key: '', model: '' }); setMessage('请填写接口和 API Key，再点击“识别模型”') }
  return <section className="settings-panel ai-settings-panel">
    <header className="settings-section-head"><div className="settings-section-icon"><Sparkles size={17}/></div><div><strong>AI 模型连接</strong><small>Lodestar</small></div><span className={`settings-status ${connectionReady ? 'ready' : ''}`}><i/>{localAi ? '本地模式就绪' : connectionReady ? '外部模型就绪' : '等待配置'}</span></header>
    <div className="ai-runtime-switch" role="group" aria-label="AI 运行模式"><button type="button" className={localAi ? 'active' : ''} onClick={useLocal}><Cpu size={14}/><span><strong>本地模式</strong><small>无需 Key，记忆、Skill 与桌面能力可用</small></span></button><button type="button" className={!localAi ? 'active' : ''} onClick={useExternal}><Cloud size={14}/><span><strong>外部模型</strong><small>完整通用问答、文档与图片理解</small></span></button></div>
    <div className="ai-settings-layout"><div className="ai-settings-form">
      <label className="wide"><span>接口地址</span><div className="settings-field"><Link2 size={15}/><input disabled={localAi} placeholder="https://api.example.com/v1" value={localAi ? LOCAL_AI_BASE_URL : aiConfig.base_url} onChange={(e) => { setModelOptions([]); onChange({ ...aiConfig, base_url: e.target.value, model: aiConfig.model === LOCAL_AI_MODEL ? '' : aiConfig.model }) }}/></div></label>
      <label><span>访问密钥</span><div className="settings-field"><KeyRound size={15}/><input disabled={localAi} type={showKey ? 'text' : 'password'} placeholder={localAi ? '本地模式无需 API Key' : 'API Key'} value={aiConfig.api_key} onChange={(e) => onChange({ ...aiConfig, api_key: e.target.value })}/><button type="button" disabled={localAi} onClick={() => setShowKey((visible) => !visible)} aria-label={showKey ? '隐藏密钥' : '显示密钥'} title={showKey ? '隐藏密钥' : '显示密钥'}>{showKey ? <EyeOff size={14}/> : <Eye size={14}/>}</button></div></label>
      <label><span>模型</span><div className="settings-field"><Bot size={15}/>{modelOptions.length ? <select disabled={localAi} value={aiConfig.model} onChange={(e) => onChange({ ...aiConfig, model: e.target.value })}>{modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}</select> : <input disabled={localAi} placeholder={localAi ? LOCAL_AI_MODEL : '先识别模型，或手动输入名称'} value={localAi ? LOCAL_AI_MODEL : aiConfig.model === LOCAL_AI_MODEL ? '' : aiConfig.model} onChange={(e) => onChange({ ...aiConfig, model: e.target.value })}/>}</div></label>
      <div className="ai-settings-actions"><button className="outline-btn" disabled={busy || localAi || !aiConfig.base_url || !aiConfig.api_key} onClick={() => void discover()}><Search size={14}/>{busy ? '识别中…' : '识别模型'}</button><button className="toolbar-btn primary" disabled={busy || !connectionReady} onClick={() => void verify()}><Check size={14}/>{busy ? '处理中…' : localAi ? '检查本地引擎' : '验证连接'}</button></div>
    </div><aside className="ai-runtime-summary"><small>RUNTIME PROFILE</small><strong>{provider}</strong><p>{localAi ? '当前无需配置 Key。长期记忆、Skill、桌面读取、测试拆解、执行规划、失败诊断和精确计算均可使用；连接外部模型后获得完整开放式生成能力。' : modelOptions.length ? `已读取 ${modelOptions.length} 个可用模型，可在模型下拉框中直接切换。` : connectionReady ? '当前连接信息完整，可以进行模型连通性验证。' : '填写接口和密钥后点击“识别模型”，系统会显示可选择的模型列表。'}</p><span><ShieldCheck size={13}/>配置仅保存在当前本地数据目录</span><span><BrainCircuit size={13}/>长期记忆自动进入后续对话</span><span><PackagePlus size={13}/>Skill 可安装、启停和卸载</span><span><FolderOpen size={13}/>桌面文件仅在授权范围内读取</span></aside></div>
    {message && <div className="settings-message">{message}</div>}
  </section>
}

function SettingsPanel({ projectCount, caseCount, flowCount, runCount, planCount, dataDir, onOpenEnvironments }: { projectCount: number; caseCount: number; flowCount: number; runCount: number; planCount: number; dataDir: string; onOpenEnvironments: () => void }) {
  const dialog = useDialog()
  const [readOnly, setReadOnly] = useState(window.localStorage.getItem('automation-studio.default-read-only') !== 'false')
  const [days, setDays] = useState('')
  const [before, setBefore] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<{ runs: number; screenshots: number; logs: number; traces: number; reports: number; other_files: number; total_files: number; skipped_running: number } | null>(null)
  useEffect(() => { window.localStorage.setItem('automation-studio.default-read-only', String(readOnly)) }, [readOnly])
  const previewCleanup = async () => {
    if (!days && !before) return
    setBusy(true); setMessage('正在统计可清理产物…')
    try {
      const result = await api<typeof preview>('/artifacts/cleanup/preview', { method: 'POST', body: JSON.stringify(days ? { days: Number(days) } : { before }) })
      setPreview(result); setMessage('预览完成，请确认后再清理')
    } catch (error) { setMessage(error instanceof Error ? error.message : '预览失败') } finally { setBusy(false) }
  }
  const cleanup = async () => {
    if (!preview || !await dialog.confirm(`将清理 ${preview.runs} 个 Run 的 ${preview.total_files} 个证据文件。数据库记录和旧项目文件不会删除。`, { title: '清理历史执行产物', confirmLabel: '确认清理', danger: true })) return
    setBusy(true); setMessage('正在清理…')
    try {
      const query = days ? `days=${days}` : `before=${encodeURIComponent(before)}`
      const result = await api<{ removed_files: number; skipped_running: number }>(`/artifacts/cleanup?${query}`, { method: 'DELETE' })
      setMessage(`已清理 ${result.removed_files} 个文件，跳过 ${result.skipped_running} 个正在运行的 Run；历史数据库记录保留`); setPreview(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : '清理失败') } finally { setBusy(false) }
  }
  return <section className="settings-panel workspace-settings-panel"><header className="settings-section-head"><div className="settings-section-icon neutral"><Settings size={17}/></div><div><strong>工作区与执行</strong><small>Workspace &amp; Execution</small></div></header><div className="settings-row"><div><strong>测试环境与安全门禁</strong><small>配置环境身份、Base URL、请求域名白名单、支付策略和只读权限</small></div><button className="outline-btn" onClick={onOpenEnvironments}><ShieldCheck size={14}/>管理测试环境</button></div><div className="settings-row"><div><strong>默认只读模式</strong><small>阻止 write / destructive 动作，适合先验证流程</small></div><button className={`toggle ${readOnly ? 'on' : ''}`} onClick={() => setReadOnly(!readOnly)} aria-label="默认只读模式"><span/></button></div><div className="settings-row"><div><strong>浏览器支持</strong><small>Chromium / Edge 正式支持，Firefox / WebKit 为实验性</small></div><span className="health">Chromium 已启用</span></div><div className="settings-row"><div><strong>当前数据诊断</strong><small>仅展示当前数据库统计，不会自动删除项目数据</small></div><span className="diagnostic-counts">项目 {projectCount} · 用例 {caseCount} · 流程 {flowCount} · 计划 {planCount} · Run {runCount}</span></div><div className="settings-row"><div><strong>产物目录</strong><small>报告、截图、日志、DOM 与 Trace 按 Run 独立保存</small></div><code>{dataDir ? `${dataDir}\\runs` : '本地数据目录/runs'}</code></div><div className="settings-row danger-zone"><div><strong>清理历史执行产物</strong><small>只处理 Lodestar 的运行证据目录，正在运行的任务会跳过</small></div><select value={days} onChange={(e) => { setDays(e.target.value); setBefore(''); setPreview(null) }}><option value="">快捷范围</option><option value="7">7 天前</option><option value="30">30 天前</option><option value="90">90 天前</option></select><input type="date" value={before} onChange={(e) => { setBefore(e.target.value); setDays(''); setPreview(null) }}/><button className="outline-btn" disabled={(!days && !before) || busy} onClick={() => void previewCleanup()}>预览</button><button className="toolbar-btn danger" disabled={!preview || busy} onClick={() => void cleanup()}>{busy ? '处理中…' : '确认清理'}</button></div>{preview && <div className="cleanup-preview"><strong>预计清理</strong><span>{preview.runs} 个 Run</span><span>{preview.screenshots} 张截图</span><span>{preview.logs} 个日志</span><span>{preview.traces} 个 Trace</span><span>{preview.reports} 个报告</span><span>共 {preview.total_files} 个文件</span>{preview.skipped_running > 0 && <em>已跳过 {preview.skipped_running} 个正在运行的 Run</em>}</div>}{message && <div className="settings-message">{message}</div>}</section>
}

export default App
