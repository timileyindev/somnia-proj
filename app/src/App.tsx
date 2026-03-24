import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BellRing,
  Clock3,
  ListOrdered,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Wrench,
  Zap,
} from 'lucide-react'
import {
  automationRegistryAbi,
  mockProtocolControllerAbi,
  mockSignalEmitterAbi,
  reactiveHandlerAbi,
  workflowOrchestratorAbi,
} from './abis'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { appConfig, hasCoreAddresses } from './config'
import { CopyableAddress } from './components/CopyableAddress'
import { Drawer } from './components/Drawer'
import { ErrorToast } from './components/ErrorToast'
import { RunTimeline } from './components/RunTimeline'
import { StatCard } from './components/StatCard'
import { StatusBadge } from './components/StatusBadge'
import { useEthersSigner } from './hooks/useEthersSigner'

type Job = {
  id: bigint
  creator: string
  name: string
  triggerType: number
  emitter: string
  topic0: string
  workflowId: bigint
  triggerValue: bigint
  cooldownSeconds: bigint
  active: boolean
  lastExecutedAt: bigint
  successCount: bigint
  failureCount: bigint
}

type AlertRule = {
  id: bigint
  name: string
  emitter: string
  topic0: string
  minValue: bigint
  workflowId: bigint
  cooldownSeconds: bigint
  active: boolean
  lastAlertAt: bigint
  triggerCount: bigint
}

type Workflow = {
  id: bigint
  name: string
  creator: string
  active: boolean
  runCount: bigint
  successCount: bigint
  failureCount: bigint
  stepCount: bigint
}

type WorkflowRun = {
  id: bigint
  workflowId: bigint
  executor: string
  contextHash: string
  success: boolean
  failedStepIndex: bigint
  executedAt: bigint
}

type Contracts = {
  registry: ethers.Contract
  orchestrator: ethers.Contract
  handler: ethers.Contract
  signalEmitter: ethers.Contract
  protocolController?: ethers.Contract
}

const triggerLabels = ['Schedule', 'Block Tick', 'Epoch Tick', 'External Event']
const healthSignalTopic = ethers.id('HealthSignal(address,uint256,uint256)')
const metricSignalTopic = ethers.id('MetricSignal(uint256,uint256,uint256)')
/** Emitter address jobs must use for Schedule / BlockTick / EpochTick (matches handler). */
const SOMNIA_REACTIVITY_PRECOMPILE = '0x0000000000000000000000000000000000000100'
const blockTickTopic = ethers.id('BlockTick(uint64)')
const epochTickTopic = ethers.id('EpochTick(uint64,uint64)')
const scheduleTopic = ethers.id('Schedule(uint256)')

type DemoTopicPreset = 'health' | 'metric' | 'any' | 'custom'

/** Maps stored topic0 to a preset for loading edit forms (empty string alone is ambiguous). */
function inferTopicPreset(topic0: string): DemoTopicPreset {
  if (topic0 === healthSignalTopic) return 'health'
  if (topic0 === metricSignalTopic) return 'metric'
  if (!topic0 || topic0 === ethers.ZeroHash) return 'any'
  return 'custom'
}

function jobEmitterAndTopicForTrigger(
  triggerType: string,
  mockEmitter: string | undefined,
): { emitter: string; topic0: string } {
  const mock = (mockEmitter ?? '').trim()
  if (triggerType === '0') {
    return { emitter: SOMNIA_REACTIVITY_PRECOMPILE, topic0: scheduleTopic }
  }
  if (triggerType === '1') {
    return { emitter: SOMNIA_REACTIVITY_PRECOMPILE, topic0: blockTickTopic }
  }
  if (triggerType === '2') {
    return { emitter: SOMNIA_REACTIVITY_PRECOMPILE, topic0: epochTickTopic }
  }
  return {
    emitter: mock,
    topic0: healthSignalTopic,
  }
}

function shortAddress(address: string): string {
  if (!address || address === ethers.ZeroAddress) {
    return '—'
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function shortHex(value: string): string {
  if (!value || value === ethers.ZeroHash) {
    return 'wildcard'
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`
}

function bigintToString(value: bigint): string {
  return Number(value).toLocaleString()
}

function formatTimestamp(unix: bigint): string {
  if (!unix || unix === 0n) {
    return '—'
  }
  return new Date(Number(unix) * 1000).toLocaleString()
}

function toDescendingById<T extends { id: bigint }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.id === b.id) return 0
    return a.id > b.id ? -1 : 1
  })
}

type WorkflowStepForm = {
  id: string
  target: string
  value: string
  data: string
  allowFailure: boolean
  label: string
}

const mockProtocolInterface = new ethers.Interface(mockProtocolControllerAbi)
const mockSignalInterface = new ethers.Interface(mockSignalEmitterAbi)

/** Addresses from env (this deployment) — users can still paste any other contract in the target field. */
function workflowConfiguredTargets(): { label: string; address: string }[] {
  const c = appConfig.contracts
  const out: { label: string; address: string }[] = []
  const add = (label: string, addr: string | undefined) => {
    const t = addr?.trim()
    if (t) {
      out.push({ label, address: t })
    }
  }
  add('Mock protocol controller', c.mockProtocolController)
  add('Mock signal emitter', c.mockSignalEmitter)
  add('Automation registry', c.automationRegistry)
  add('Workflow orchestrator', c.workflowOrchestrator)
  add('Reactive autopilot handler', c.reactiveAutopilotHandler)
  return out
}

/** Select value for “deployment” dropdown: option address if target matches, else ''. */
function deploymentTargetSelectValue(
  stepTarget: string,
  options: { label: string; address: string }[],
): string {
  const t = stepTarget.trim()
  if (!t) {
    return ''
  }
  let normalized: string
  try {
    normalized = ethers.getAddress(t)
  } catch {
    return ''
  }
  for (const o of options) {
    try {
      if (ethers.getAddress(o.address) === normalized) {
        return o.address
      }
    } catch {
      continue
    }
  }
  return ''
}

function workflowStepFormTemplate(index: number): WorkflowStepForm {
  return {
    id: crypto.randomUUID(),
    target: '',
    value: '0',
    data: '0x',
    allowFailure: false,
    label: `Step ${index + 1}`,
  }
}

function buildWorkflowStepsForChain(
  steps: WorkflowStepForm[],
): {
  target: string
  value: bigint
  data: string
  allowFailure: boolean
  label: string
}[] {
  if (steps.length === 0) {
    throw new Error('Add at least one step.')
  }
  return steps.map((s, i) => {
    const n = i + 1
    const targetRaw = s.target.trim()
    if (!targetRaw) {
      throw new Error(`Step ${n}: target address is required.`)
    }
    let target: string
    try {
      target = ethers.getAddress(targetRaw)
    } catch {
      throw new Error(`Step ${n}: invalid target address.`)
    }
    if (target === ethers.ZeroAddress) {
      throw new Error(`Step ${n}: target cannot be the zero address.`)
    }
    let value: bigint
    try {
      value = BigInt(s.value.trim() || '0')
    } catch {
      throw new Error(`Step ${n}: invalid ETH value (wei as a whole number).`)
    }
    if (value < 0n) {
      throw new Error(`Step ${n}: ETH value cannot be negative.`)
    }
    const d = s.data.trim()
    const dataHex = d === '' || d === '0x' ? '0x' : d.startsWith('0x') ? d : `0x${d}`
    try {
      ethers.getBytes(dataHex)
    } catch {
      throw new Error(`Step ${n}: calldata must be valid hex (use 0x or empty for no call data).`)
    }
    const label = s.label.trim() || `Step ${n}`
    return {
      target,
      value,
      data: dataHex,
      allowFailure: s.allowFailure,
      label,
    }
  })
}

function createContracts(
  runner: ethers.Provider | ethers.Signer,
  includeProtocol = true,
): Contracts {
  const registry = new ethers.Contract(
    appConfig.contracts.automationRegistry!,
    automationRegistryAbi,
    runner,
  )
  const orchestrator = new ethers.Contract(
    appConfig.contracts.workflowOrchestrator!,
    workflowOrchestratorAbi,
    runner,
  )
  const handler = new ethers.Contract(
    appConfig.contracts.reactiveAutopilotHandler!,
    reactiveHandlerAbi,
    runner,
  )
  const signalEmitter = new ethers.Contract(
    appConfig.contracts.mockSignalEmitter!,
    mockSignalEmitterAbi,
    runner,
  )

  const protocolController =
    includeProtocol && appConfig.contracts.mockProtocolController
      ? new ethers.Contract(
          appConfig.contracts.mockProtocolController,
          mockProtocolControllerAbi,
          runner,
        )
      : undefined

  return { registry, orchestrator, handler, signalEmitter, protocolController }
}

function App() {
  const { status, address, chainId } = useAccount()
  const signer = useEthersSigner()
  const account = status === 'connected' ? address ?? null : null

  const [jobs, setJobs] = useState<Job[]>([])
  const [alertRules, setAlertRules] = useState<AlertRule[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [processedEvents, setProcessedEvents] = useState<bigint>(0n)
  const [isLoading, setIsLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [manualJobId, setManualJobId] = useState('1')
  const [jobForm, setJobForm] = useState({
    name: 'Health signal trigger',
    triggerType: '3',
    emitter: appConfig.contracts.mockSignalEmitter ?? '',
    topic0: healthSignalTopic,
    topicPreset: 'health' as DemoTopicPreset,
    triggerValue: '0',
    workflowId: '1',
    cooldownSeconds: '30',
  })
  const [alertForm, setAlertForm] = useState({
    name: 'Metric threshold alert',
    emitter: appConfig.contracts.mockSignalEmitter ?? '',
    topic0: metricSignalTopic,
    topicPreset: 'metric' as DemoTopicPreset,
    minValue: '800',
    workflowId: '1',
    cooldownSeconds: '30',
  })
  const [jobDrawerOpen, setJobDrawerOpen] = useState(false)
  const [alertDrawerOpen, setAlertDrawerOpen] = useState(false)
  const [editingJobId, setEditingJobId] = useState<bigint | null>(null)
  const [editingAlertId, setEditingAlertId] = useState<bigint | null>(null)
  const [jobFilter, setJobFilter] = useState('')
  const [alertFilter, setAlertFilter] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState('')
  const [runFilter, setRunFilter] = useState('')
  const [stepsDrawerWorkflowId, setStepsDrawerWorkflowId] = useState<bigint | null>(null)
  const [workflowSteps, setWorkflowSteps] = useState<
    { target: string; label: string; allowFailure: boolean }[]
  >([])
  const [stepsLoading, setStepsLoading] = useState(false)
  const [workflowDrawerOpen, setWorkflowDrawerOpen] = useState(false)
  const [workflowForm, setWorkflowForm] = useState({
    name: '',
    steps: [workflowStepFormTemplate(0)] as WorkflowStepForm[],
  })

  const readProvider = useMemo(() => {
    if (!appConfig.rpcUrl) {
      return null
    }
    return new ethers.JsonRpcProvider(appConfig.rpcUrl)
  }, [])

  const readContracts = useMemo(() => {
    if (!hasCoreAddresses()) {
      return null
    }
    const runner = signer ?? readProvider
    if (!runner) {
      return null
    }
    return createContracts(runner)
  }, [readProvider, signer])

  const writeContracts = useMemo(() => {
    if (!signer || !hasCoreAddresses()) {
      return null
    }
    if (status !== 'connected' || chainId !== appConfig.chainId) {
      return null
    }
    return createContracts(signer)
  }, [signer, status, chainId])

  const refreshDashboard = useCallback(async () => {
    if (!readContracts) {
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const [jobsData, alertData, workflowData, runData, eventCount] =
        await Promise.all([
          readContracts.registry.getJobs(),
          readContracts.registry.getAlertRules(),
          readContracts.orchestrator.getWorkflows(),
          readContracts.orchestrator.getRuns(),
          readContracts.handler.processedEvents(),
        ])

      setJobs(toDescendingById(jobsData as Job[]))
      setAlertRules(toDescendingById(alertData as AlertRule[]))
      setWorkflows(toDescendingById(workflowData as Workflow[]))
      setRuns(toDescendingById(runData as WorkflowRun[]))
      setProcessedEvents(eventCount as bigint)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to read data'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [readContracts])

  useEffect(() => {
    void refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => {
    if (!readContracts) {
      return
    }
    const timer = window.setInterval(() => {
      void refreshDashboard()
    }, 12_000)
    return () => window.clearInterval(timer)
  }, [readContracts, refreshDashboard])

  const withAction = useCallback(
    async (label: string, action: () => Promise<void>) => {
      setPendingAction(label)
      setError(null)
      try {
        await action()
        await refreshDashboard()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed'
        setError(message)
      } finally {
        setPendingAction(null)
      }
    },
    [refreshDashboard],
  )

  const openNewWorkflowDrawer = useCallback(() => {
    setWorkflowForm({
      name: '',
      steps: [workflowStepFormTemplate(0)],
    })
    setWorkflowDrawerOpen(true)
  }, [])

  const submitWorkflowDrawer = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!writeContracts) {
        setError('Connect a wallet on the correct network before creating a workflow.')
        return
      }
      const name = workflowForm.name.trim()
      if (!name) {
        setError('Enter a workflow name.')
        return
      }
      let built: ReturnType<typeof buildWorkflowStepsForChain>
      try {
        built = buildWorkflowStepsForChain(workflowForm.steps)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid workflow steps.')
        return
      }
      await withAction('create workflow', async () => {
        const tx = await writeContracts.orchestrator.createWorkflow(name, built)
        await tx.wait()
        setWorkflowDrawerOpen(false)
      })
    },
    [workflowForm, withAction, writeContracts],
  )

  const createDefaultWorkflow = useCallback(async () => {
    if (!writeContracts || !writeContracts.protocolController) {
      setError(
        'Wallet signer or protocol controller address missing. Configure VITE_MOCK_PROTOCOL_CONTROLLER_ADDRESS.',
      )
      return
    }

    await withAction('create workflow', async () => {
      const tx = await writeContracts.orchestrator.createWorkflow(
        'UI Risk Mitigation Workflow',
        [
          {
            target: writeContracts.protocolController!.target,
            value: 0n,
            data: mockProtocolInterface.encodeFunctionData('activateProtectionMode'),
            allowFailure: false,
            label: 'Activate protection',
          },
          {
            target: writeContracts.protocolController!.target,
            value: 0n,
            data: mockProtocolInterface.encodeFunctionData('rebalance', [300n]),
            allowFailure: false,
            label: 'Rebalance',
          },
          {
            target: writeContracts.protocolController!.target,
            value: 0n,
            data: mockProtocolInterface.encodeFunctionData('repayDebt', [150n]),
            allowFailure: true,
            label: 'Repay debt',
          },
        ],
      )
      await tx.wait()
    })
  }, [withAction, writeContracts])

  const emitDemoSignal = useCallback(async () => {
    if (!writeContracts) {
      setError('Connect a wallet before sending signals.')
      return
    }
    await withAction('emit demo signals', async () => {
      const vaultAddress = account ?? ethers.ZeroAddress
      const tx1 = await writeContracts.signalEmitter.emitHealthSignal(
        vaultAddress,
        870n,
        1_250n,
      )
      await tx1.wait()
      const tx2 = await writeContracts.signalEmitter.emitMetricSignal(1n, 930n)
      await tx2.wait()
    })
  }, [account, withAction, writeContracts])

  const runManualJob = useCallback(async () => {
    if (!writeContracts) {
      setError('Connect a wallet before triggering jobs.')
      return
    }
    const parsedJobId = BigInt(manualJobId || '1')
    await withAction('manual job trigger', async () => {
      const contextHash = ethers.keccak256(
        ethers.toUtf8Bytes(`dashboard-manual-${Date.now()}`),
      )
      const tx = await writeContracts.handler.runJobManually(
        parsedJobId,
        contextHash,
      )
      await tx.wait()
    })
  }, [manualJobId, withAction, writeContracts])

  const analytics = useMemo(() => {
    const activeJobs = jobs.filter((job) => job.active).length
    const activeAlerts = alertRules.filter((rule) => rule.active).length
    const totalJobSuccess = jobs.reduce((sum, job) => sum + job.successCount, 0n)
    const totalJobFailure = jobs.reduce((sum, job) => sum + job.failureCount, 0n)
    const totalJobRuns = totalJobSuccess + totalJobFailure
    const runSuccesses = runs.filter((run) => run.success).length
    const runFailures = runs.length - runSuccesses
    const workflowSuccessRate =
      runs.length > 0
        ? `${((runSuccesses / runs.length) * 100).toFixed(1)}%`
        : '0%'
    const jobExecutionSuccessRate =
      totalJobRuns > 0n
        ? `${((Number(totalJobSuccess) / Number(totalJobRuns)) * 100).toFixed(1)}%`
        : '0%'

    return {
      activeJobs,
      activeAlerts,
      totalWorkflows: workflows.length,
      totalRuns: runs.length,
      jobRuns: totalJobRuns,
      workflowSuccessRate,
      jobExecutionSuccessRate,
      runSuccesses,
      runFailures,
    }
  }, [alertRules, jobs, runs, workflows.length])

  const runChartData = useMemo(
    () =>
      [...runs]
        .slice(0, 12)
        .reverse()
        .map((run) => ({
          name: `#${run.id.toString()}`,
          success: run.success ? 1 : 0,
          failed: run.success ? 0 : 1,
        })),
    [runs],
  )

  const jobChartData = useMemo(
    () =>
      [...jobs].slice(0, 8).map((job) => ({
        name: job.name.length > 18 ? `${job.name.slice(0, 18)}…` : job.name,
        success: Number(job.successCount),
        failed: Number(job.failureCount),
      })),
    [jobs],
  )

  const workflowDeploymentPicklist = useMemo(() => workflowConfiguredTargets(), [])

  const q = (row: string, needle: string) =>
    needle.trim() === '' || row.toLowerCase().includes(needle.trim().toLowerCase())

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) =>
      q(
        `${job.name} ${job.id} ${job.emitter} ${job.topic0} ${job.creator}`,
        jobFilter,
      ),
    )
  }, [jobFilter, jobs])

  const filteredAlerts = useMemo(() => {
    return alertRules.filter((rule) =>
      q(`${rule.name} ${rule.id} ${rule.emitter} ${rule.topic0}`, alertFilter),
    )
  }, [alertFilter, alertRules])

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) =>
      q(`${wf.name} ${wf.id} ${wf.creator}`, workflowFilter),
    )
  }, [workflowFilter, workflows])

  const filteredRuns = useMemo(() => {
    return runs.filter((run) =>
      q(`${run.id} ${run.workflowId} ${run.executor} ${run.contextHash}`, runFilter),
    )
  }, [runFilter, runs])

  const openNewJobDrawer = useCallback(() => {
    setEditingJobId(null)
    setJobForm({
      name: 'Health signal trigger',
      triggerType: '3',
      emitter: appConfig.contracts.mockSignalEmitter ?? '',
      topic0: healthSignalTopic,
      topicPreset: 'health',
      triggerValue: '0',
      workflowId: workflows[0]?.id.toString() ?? '1',
      cooldownSeconds: '30',
    })
    setJobDrawerOpen(true)
  }, [workflows, appConfig.contracts.mockSignalEmitter])

  const openEditJobDrawer = useCallback((job: Job) => {
    setEditingJobId(job.id)
    setJobForm({
      name: job.name,
      triggerType: String(job.triggerType),
      emitter: job.emitter,
      topic0: job.topic0,
      topicPreset: inferTopicPreset(job.topic0),
      triggerValue: job.triggerValue.toString(),
      workflowId: job.workflowId.toString(),
      cooldownSeconds: job.cooldownSeconds.toString(),
    })
    setJobDrawerOpen(true)
  }, [])

  const openNewAlertDrawer = useCallback(() => {
    setEditingAlertId(null)
    setAlertForm({
      name: 'Metric threshold alert',
      emitter: appConfig.contracts.mockSignalEmitter ?? '',
      topic0: metricSignalTopic,
      topicPreset: 'metric',
      minValue: '800',
      workflowId: workflows[0]?.id.toString() ?? '1',
      cooldownSeconds: '30',
    })
    setAlertDrawerOpen(true)
  }, [workflows, appConfig.contracts.mockSignalEmitter])

  const openEditAlertDrawer = useCallback((rule: AlertRule) => {
    setEditingAlertId(rule.id)
    setAlertForm({
      name: rule.name,
      emitter: rule.emitter,
      topic0: rule.topic0,
      topicPreset: inferTopicPreset(rule.topic0),
      minValue: rule.minValue.toString(),
      workflowId: rule.workflowId.toString(),
      cooldownSeconds: rule.cooldownSeconds.toString(),
    })
    setAlertDrawerOpen(true)
  }, [])

  const loadWorkflowSteps = useCallback(
    async (workflowId: bigint) => {
      if (!readContracts) {
        return
      }
      setStepsDrawerWorkflowId(workflowId)
      setStepsLoading(true)
      setWorkflowSteps([])
      setError(null)
      try {
        const raw = (await readContracts.orchestrator.getWorkflowSteps(
          workflowId,
        )) as {
          target: string
          label: string
          allowFailure: boolean
        }[]
        setWorkflowSteps(
          raw.map((s) => ({
            target: s.target,
            label: s.label,
            allowFailure: s.allowFailure,
          })),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load steps'
        setError(message)
        setStepsDrawerWorkflowId(null)
      } finally {
        setStepsLoading(false)
      }
    },
    [readContracts],
  )

  const toggleJobActive = useCallback(
    async (job: Job) => {
      if (!writeContracts) {
        setError('Connect a wallet to update jobs.')
        return
      }
      await withAction('toggle job', async () => {
        const tx = await writeContracts.registry.setJobActive(job.id, !job.active)
        await tx.wait()
      })
    },
    [withAction, writeContracts],
  )

  const toggleAlertActive = useCallback(
    async (rule: AlertRule) => {
      if (!writeContracts) {
        setError('Connect a wallet to update alerts.')
        return
      }
      await withAction('toggle alert', async () => {
        const tx = await writeContracts.registry.setAlertRuleActive(rule.id, !rule.active)
        await tx.wait()
      })
    },
    [withAction, writeContracts],
  )

  const toggleWorkflowActive = useCallback(
    async (wf: Workflow) => {
      if (!writeContracts) {
        setError('Connect a wallet to update workflows.')
        return
      }
      await withAction('toggle workflow', async () => {
        const tx = await writeContracts.orchestrator.setWorkflowActive(wf.id, !wf.active)
        await tx.wait()
      })
    },
    [withAction, writeContracts],
  )

  const submitJobDrawer = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!writeContracts) {
        setError('Connect a wallet before saving jobs.')
        return
      }
      if (jobForm.triggerType === '3' && jobForm.topicPreset === 'custom') {
        const t = jobForm.topic0.trim()
        if (!/^0x[a-fA-F0-9]{64}$/.test(t)) {
          setError('Custom topic0 must be 0x followed by 64 hex characters.')
          return
        }
      }
      const input = {
        name: jobForm.name,
        triggerType: Number(jobForm.triggerType),
        emitter: jobForm.emitter || ethers.ZeroAddress,
        topic0: (jobForm.topic0 || ethers.ZeroHash) as `0x${string}`,
        triggerValue: BigInt(jobForm.triggerValue || '0'),
        workflowId: BigInt(jobForm.workflowId || '0'),
        cooldownSeconds: BigInt(jobForm.cooldownSeconds || '0'),
        active: true,
      }
      const label = editingJobId ? 'update job' : 'create job'
      await withAction(label, async () => {
        if (editingJobId) {
          const tx = await writeContracts.registry.updateJob(editingJobId, {
            ...input,
            active: jobs.find((j) => j.id === editingJobId)?.active ?? true,
          })
          await tx.wait()
        } else {
          const tx = await writeContracts.registry.createJob(input)
          await tx.wait()
        }
        setJobDrawerOpen(false)
        setEditingJobId(null)
      })
    },
    [editingJobId, jobForm, jobs, withAction, writeContracts],
  )

  const submitAlertDrawer = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!writeContracts) {
        setError('Connect a wallet before saving alerts.')
        return
      }
      if (alertForm.topicPreset === 'custom') {
        const t = alertForm.topic0.trim()
        if (!/^0x[a-fA-F0-9]{64}$/.test(t)) {
          setError('Custom topic0 must be 0x followed by 64 hex characters.')
          return
        }
      }
      const input = {
        name: alertForm.name,
        emitter: alertForm.emitter || ethers.ZeroAddress,
        topic0: (alertForm.topic0 || ethers.ZeroHash) as `0x${string}`,
        minValue: BigInt(alertForm.minValue || '0'),
        workflowId: BigInt(alertForm.workflowId || '0'),
        cooldownSeconds: BigInt(alertForm.cooldownSeconds || '0'),
        active: true,
      }
      const label = editingAlertId ? 'update alert' : 'create alert'
      await withAction(label, async () => {
        if (editingAlertId) {
          const tx = await writeContracts.registry.updateAlertRule(editingAlertId, {
            ...input,
            active: alertRules.find((r) => r.id === editingAlertId)?.active ?? true,
          })
          await tx.wait()
        } else {
          const tx = await writeContracts.registry.createAlertRule(input)
          await tx.wait()
        }
        setAlertDrawerOpen(false)
        setEditingAlertId(null)
      })
    },
    [alertForm, alertRules, editingAlertId, withAction, writeContracts],
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8">
        <header className="rounded-2xl border border-slate-800 bg-gradient-to-br from-indigo-900/50 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-indigo-300">
                On-chain automation
              </p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">
                {appConfig.appName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Define <strong className="font-medium text-slate-200">what to run</strong> (a
                workflow), then <strong className="font-medium text-slate-200">when to run it</strong>{' '}
                (a job or alert). The tables below show everything that exists on-chain.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                <span className="rounded-full border border-slate-700 px-2 py-1">
                  {appConfig.networkName}
                </span>
                <span className="rounded-full border border-slate-700 px-2 py-1">
                  Chain ID {appConfig.chainId}
                </span>
                {appConfig.rpcUrl ? (
                  <span className="rounded-full border border-slate-700 px-2 py-1">
                    RPC configured
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
                    RPC missing
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ConnectButton chainStatus="icon" showBalance={false} />
              <button
                type="button"
                onClick={() => void refreshDashboard()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh data
              </button>
            </div>
          </div>
          {!hasCoreAddresses() ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              Missing required app contract addresses in `.env`. Set:
              <span className="ml-1 font-mono text-xs">
                VITE_AUTOMATION_REGISTRY_ADDRESS, VITE_WORKFLOW_ORCHESTRATOR_ADDRESS,
                VITE_REACTIVE_HANDLER_ADDRESS, VITE_MOCK_SIGNAL_EMITTER_ADDRESS
              </span>
              .
            </div>
          ) : null}
        </header>

        <section className="rounded-xl border border-indigo-500/25 bg-indigo-950/15 p-4 md:p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-200">
            <ListOrdered className="h-4 w-4 shrink-0" />
            How to use this dashboard
          </h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300 marker:text-indigo-400">
            <li>
              <span className="text-slate-200">Connect your wallet</span> using the RainbowKit button
              (top right). Pick MetaMask, WalletConnect, or another option from the modal. Switch
              network if prompted. You need a wallet to create or change anything on-chain.
            </li>
            <li>
              <span className="text-slate-200">Create a workflow</span> — the ordered list of contract
              calls to execute. Use the sample button first if you are exploring.
            </li>
            <li>
              <span className="text-slate-200">Add a job or an alert</span> and set its workflow ID
              to the one you just created. A <strong className="font-medium text-slate-200">job</strong>{' '}
              reacts to time/ticks/events; an <strong className="font-medium text-slate-200">alert</strong>{' '}
              reacts when event data crosses a number you choose.
            </li>
            <li>
              <span className="text-slate-200">Fire a test</span> with “Send test signals” (demo only)
              or rely on real Somnia subscriptions + on-chain events in production.
            </li>
          </ol>
        </section>

        {hasCoreAddresses() ? (
          <section className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4">
            <h2 className="mb-1 text-sm font-semibold text-cyan-200">
              Demo contract addresses (copy for job / alert emitter)
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Use the mock signal contract as the <strong className="text-slate-400">emitter</strong> when
              you want health or metric events; paste the full address into the job or alert form.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <CopyableAddress
                label="Mock signal emitter"
                description="HealthSignal & MetricSignal events (demo protocol)"
                address={appConfig.contracts.mockSignalEmitter}
              />
              <CopyableAddress
                label="Mock protocol controller"
                description="Targets for sample workflow steps"
                address={appConfig.contracts.mockProtocolController}
              />
            </div>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Handler runs"
            value={bigintToString(processedEvents)}
            hint="How often the reactive handler processed an event"
          />
          <StatCard label="Active jobs" value={analytics.activeJobs.toString()} />
          <StatCard label="Active alerts" value={analytics.activeAlerts.toString()} />
          <StatCard
            label="Workflow success rate"
            value={analytics.workflowSuccessRate}
            hint={`${analytics.runSuccesses} ok / ${analytics.runFailures} failed`}
          />
          <StatCard
            label="Job run success rate"
            value={analytics.jobExecutionSuccessRate}
            hint={`From registry (${bigintToString(analytics.jobRuns)} total)`}
          />
          <StatCard
            label="Workflow runs"
            value={analytics.totalRuns.toString()}
            hint={`${analytics.totalWorkflows} workflow(s)`}
          />
          <StatCard
            label="Job runs (registry)"
            value={bigintToString(analytics.jobRuns)}
            hint={isLoading ? 'Refreshing…' : 'Refreshes every 12s'}
          />
          <StatCard
            label="Your wallet"
            value={account ? shortAddress(account) : 'Not connected'}
            hint={pendingAction ? `Working: ${pendingAction}` : 'Required for buttons below'}
          />
          <StatCard
            label="Block explorer"
            value={appConfig.explorerBaseUrl ? 'Set' : 'Not set'}
            hint={appConfig.explorerBaseUrl ?? 'VITE_EXPLORER_BASE_URL'}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <Wrench className="h-4 w-4 text-amber-300" />
              What do you want to do?
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Buttons are grouped by purpose. Start from the top if you are new here.
            </p>

            <div className="flex flex-col gap-5">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  1 · Workflows
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  A workflow is the script: which contracts to call, in order, when something triggers.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={openNewWorkflowDrawer}
                    className="inline-flex w-full items-center gap-2 rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-3 py-2.5 text-left text-sm font-medium text-indigo-50 transition hover:bg-indigo-500/30"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Create workflow (custom steps)
                  </button>
                  <button
                    type="button"
                    onClick={createDefaultWorkflow}
                    className="w-full rounded-lg border border-indigo-500/35 bg-indigo-500/15 px-3 py-2.5 text-left text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/25"
                  >
                    Create sample workflow (3 demo steps)
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  2 · Rules (jobs &amp; alerts)
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  Point each rule at a workflow ID from the tables below (usually 1 after you create the
                  sample).
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={openNewJobDrawer}
                    className="inline-flex w-full items-center gap-2 rounded-lg border border-violet-500/35 bg-violet-500/15 px-3 py-2.5 text-left text-sm font-medium text-violet-100 transition hover:bg-violet-500/25"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Add job — when to run a workflow
                  </button>
                  <button
                    type="button"
                    onClick={openNewAlertDrawer}
                    className="inline-flex w-full items-center gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-2.5 text-left text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Add alert — when a number in an event crosses a limit
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  3 · Try the demo
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  Pretends the mock protocol sent health and metric events so you can see the pipeline
                  move (if your on-chain setup is wired for it).
                </p>
                <button
                  type="button"
                  onClick={emitDemoSignal}
                  className="w-full rounded-lg border border-sky-500/35 bg-sky-500/15 px-3 py-2.5 text-left text-sm font-medium text-sky-100 transition hover:bg-sky-500/25"
                >
                  Send test signals (mock protocol)
                </button>
              </div>

              <div className="rounded-lg border border-slate-700/80 bg-slate-950/50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-500/90">
                  Advanced · manual run
                </p>
                <p className="mb-2 text-xs text-slate-500">
                  Runs one job by ID through the handler if your wallet is the{' '}
                  <strong className="text-slate-400">job creator</strong> (who created it on-chain) or
                  the <strong className="text-slate-400">reactive handler owner</strong> (usually the
                  deployer).
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-1">
                    <label htmlFor="manual-job-id" className="text-xs font-medium text-slate-400">
                      Job ID
                    </label>
                    <input
                      id="manual-job-id"
                      value={manualJobId}
                      onChange={(event) => setManualJobId(event.target.value)}
                      placeholder="1"
                      className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={runManualJob}
                    className="flex-1 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-900/50"
                  >
                    Run this job now
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-2">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <Zap className="h-4 w-4 text-cyan-300" />
              Recent workflow runs
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Last 12 runs: 1 = succeeded, 0 = failed (from the orchestrator).
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={runChartData}>
                  <defs>
                    <linearGradient id="runSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="success"
                    stroke="#22d3ee"
                    fill="url(#runSuccess)"
                    name="Success"
                  />
                  <Area
                    type="monotone"
                    dataKey="failed"
                    stroke="#f43f5e"
                    fillOpacity={0}
                    name="Failed"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <Clock3 className="h-4 w-4 text-indigo-300" />
              Job success vs failures
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Per job: how many handler runs succeeded vs failed (from the registry).
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={jobChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis allowDecimals={false} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      color: '#e2e8f0',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="success" fill="#22c55e" />
                  <Bar dataKey="failed" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
              <BellRing className="h-4 w-4 text-violet-300" />
              Run history (newest first)
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Same data as “Recent runs”, shown as a timeline.
            </p>
            <RunTimeline runs={runs} formatTime={formatTimestamp} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Jobs</h2>
                <p className="text-xs text-slate-500">When each job fires, it runs its workflow.</p>
              </div>
              <div className="relative max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                  placeholder="Filter by name, id, emitter…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Creator</th>
                    <th className="px-3 py-2">Trigger</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Runs</th>
                    <th className="px-3 py-2">Last run</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJobs.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-400" colSpan={8}>
                        {jobs.length === 0 ? 'No jobs yet.' : 'No matches.'}
                      </td>
                    </tr>
                  ) : (
                    filteredJobs.map((job) => (
                      <tr key={job.id.toString()} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-slate-300">{job.id.toString()}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{job.name}</div>
                          <div className="text-xs text-slate-400">
                            Emitter {shortAddress(job.emitter)} · {shortHex(job.topic0)}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-400">
                          {shortAddress(job.creator)}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {triggerLabels[job.triggerType] ?? `#${job.triggerType}`}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={job.active ? 'active' : 'inactive'} />
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {Number(job.successCount + job.failureCount)}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {formatTimestamp(job.lastExecutedAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => void toggleJobActive(job)}
                              className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              {job.active ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditJobDrawer(job)}
                              className="inline-flex items-center gap-0.5 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Alerts</h2>
                <p className="text-xs text-slate-500">Threshold checks on event data → workflow.</p>
              </div>
              <div className="relative max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={alertFilter}
                  onChange={(e) => setAlertFilter(e.target.value)}
                  placeholder="Filter alerts…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Threshold</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Triggers</th>
                    <th className="px-3 py-2">Last alert</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-400" colSpan={7}>
                        {alertRules.length === 0 ? 'No alert rules yet.' : 'No matches.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAlerts.map((rule) => (
                      <tr key={rule.id.toString()} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-slate-300">{rule.id.toString()}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{rule.name}</div>
                          <div className="text-xs text-slate-400">
                            {shortAddress(rule.emitter)} · {shortHex(rule.topic0)}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {rule.minValue.toString()}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={rule.active ? 'active' : 'inactive'} />
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {rule.triggerCount.toString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {formatTimestamp(rule.lastAlertAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => void toggleAlertActive(rule)}
                              className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              {rule.active ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditAlertDrawer(rule)}
                              className="inline-flex items-center gap-0.5 rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Workflows</h2>
                <p className="text-xs text-slate-500">Ordered contract calls (the “what runs”).</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={openNewWorkflowDrawer}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/25"
                >
                  <Plus className="h-4 w-4" />
                  New workflow
                </button>
                <div className="relative min-w-0 flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    value={workflowFilter}
                    onChange={(e) => setWorkflowFilter(e.target.value)}
                    placeholder="Filter workflows…"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Runs</th>
                    <th className="px-3 py-2">Steps</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkflows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-400" colSpan={6}>
                        {workflows.length === 0 ? 'No workflows yet.' : 'No matches.'}
                      </td>
                    </tr>
                  ) : (
                    filteredWorkflows.map((workflow) => (
                      <tr
                        key={workflow.id.toString()}
                        className="border-t border-slate-800"
                      >
                        <td className="px-3 py-2 text-slate-300">
                          {workflow.id.toString()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{workflow.name}</div>
                          <div className="text-xs text-slate-400">
                            Owner {shortAddress(workflow.creator)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={workflow.active ? 'active' : 'inactive'} />
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {workflow.runCount.toString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {workflow.stepCount.toString()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => void toggleWorkflowActive(workflow)}
                              className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              {workflow.active ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void loadWorkflowSteps(workflow.id)}
                              className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
                            >
                              Steps
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Recent runs</h2>
                <p className="text-xs text-slate-500">Each line is one orchestrator execution.</p>
              </div>
              <div className="relative max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={runFilter}
                  onChange={(e) => setRunFilter(e.target.value)}
                  placeholder="Filter runs…"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-8 pr-3 text-sm"
                />
              </div>
            </div>
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Run</th>
                    <th className="px-3 py-2">Workflow</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Failed step</th>
                    <th className="px-3 py-2">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRuns.length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-slate-400" colSpan={5}>
                        {runs.length === 0 ? 'No runs yet.' : 'No matches.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRuns.slice(0, 20).map((run) => (
                      <tr key={run.id.toString()} className="border-t border-slate-800">
                        <td className="px-3 py-2 text-slate-300">{run.id.toString()}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {run.workflowId.toString()}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge
                            status={run.success ? 'success' : 'failed'}
                            text={run.success ? 'success' : 'failed'}
                          />
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {run.failedStepIndex ===
                          0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn
                            ? '—'
                            : run.failedStepIndex.toString()}
                        </td>
                        <td className="px-3 py-2 text-slate-300">
                          {formatTimestamp(run.executedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <Drawer
          open={jobDrawerOpen}
          onClose={() => {
            setJobDrawerOpen(false)
            setEditingJobId(null)
          }}
          title={
            editingJobId
              ? `Edit job #${editingJobId.toString()}`
              : 'Add job — when to run a workflow'
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            Pick a trigger type first — schedule / ticks set the system emitter and topic for you. For
            “contract event”, choose a demo signature or paste topic0 hex.
          </p>
          <form onSubmit={(e) => void submitJobDrawer(e)} className="grid gap-3">
            <div className="grid gap-1">
              <label htmlFor="job-drawer-name" className="text-xs font-medium text-slate-300">
                Job name
              </label>
              <p className="text-xs text-slate-500">Label for you in the dashboard only.</p>
              <input
                id="job-drawer-name"
                value={jobForm.name}
                onChange={(event) =>
                  setJobForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. Health signal trigger"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="job-drawer-trigger-type" className="text-xs font-medium text-slate-300">
                Trigger type
              </label>
              <p className="text-xs text-slate-500">
                What on-chain condition starts this workflow (time, ticks, or a specific event).
              </p>
              <select
                id="job-drawer-trigger-type"
                value={jobForm.triggerType}
                onChange={(event) => {
                  const t = event.target.value
                  const ext = jobEmitterAndTopicForTrigger(
                    t,
                    appConfig.contracts.mockSignalEmitter,
                  )
                  setJobForm((prev) => ({
                    ...prev,
                    triggerType: t,
                    ...ext,
                    ...(t === '3' ? { topicPreset: inferTopicPreset(ext.topic0) } : {}),
                  }))
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="0">One-off scheduled time (chain callback)</option>
                <option value="1">Every block (or specific block tick)</option>
                <option value="2">Epoch tick (recurring time buckets)</option>
                <option value="3">When a contract emits an event (you set emitter + topic)</option>
              </select>
            </div>
            {jobForm.triggerType === '3' ? (
              <>
                <div className="grid gap-1">
                  <label htmlFor="job-drawer-emitter" className="text-xs font-medium text-slate-300">
                    Emitter contract
                  </label>
                  <p className="text-xs text-slate-500">
                    Contract that emits the log — use the mock signal address from the copy panel above, or
                    your own contract.
                  </p>
                  <input
                    id="job-drawer-emitter"
                    value={jobForm.emitter}
                    onChange={(event) =>
                      setJobForm((prev) => ({ ...prev, emitter: event.target.value }))
                    }
                    placeholder="0x…"
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <label htmlFor="job-topic-preset" className="text-xs font-medium text-slate-300">
                    Event to match (topic0)
                  </label>
                  <p className="text-xs text-slate-500">
                    Demo signatures are filled in for you. “Custom” lets you paste the keccak hash from an
                    ABI tool.
                  </p>
                  <select
                    id="job-topic-preset"
                    value={jobForm.topicPreset}
                    onChange={(event) => {
                      const v = event.target.value as DemoTopicPreset
                      if (v === 'health') {
                        setJobForm((prev) => ({
                          ...prev,
                          topicPreset: 'health',
                          topic0: healthSignalTopic,
                        }))
                      } else if (v === 'metric') {
                        setJobForm((prev) => ({
                          ...prev,
                          topicPreset: 'metric',
                          topic0: metricSignalTopic,
                        }))
                      } else if (v === 'any') {
                        setJobForm((prev) => ({
                          ...prev,
                          topicPreset: 'any',
                          topic0: ethers.ZeroHash,
                        }))
                      } else {
                        setJobForm((prev) => ({
                          ...prev,
                          topicPreset: 'custom',
                          topic0: prev.topicPreset === 'custom' ? prev.topic0 : '',
                        }))
                      }
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="health">HealthSignal (demo — vault + factors)</option>
                    <option value="metric">MetricSignal (demo — metric id + value)</option>
                    <option value="any">Any event on this emitter (wildcard topic0)</option>
                    <option value="custom">Custom — paste topic0 hex below</option>
                  </select>
                  {jobForm.topicPreset === 'custom' ? (
                    <input
                      id="job-drawer-topic0-custom"
                      value={jobForm.topic0}
                      onChange={(event) =>
                        setJobForm((prev) => ({ ...prev, topic0: event.target.value }))
                      }
                      placeholder="0x + 64 hex chars"
                      className="rounded-lg border border-amber-500/30 bg-slate-950 px-3 py-2 font-mono text-sm"
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="grid gap-1 rounded-lg border border-slate-700/80 bg-slate-900/40 px-3 py-2">
                <p className="text-xs font-medium text-slate-300">System emitter &amp; topic (auto)</p>
                <p className="text-xs text-slate-500">
                  Schedule / block / epoch jobs listen to Somnia’s reactivity precompile (
                  <span className="font-mono">0x…0100</span>) with the matching system event hash. You
                  don’t need to edit these unless you know what you’re doing.
                </p>
                <div className="mt-1 space-y-1 font-mono text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500">Emitter:</span> {jobForm.emitter}
                  </div>
                  <div className="break-all">
                    <span className="text-slate-500">Topic0:</span> {jobForm.topic0}
                  </div>
                </div>
              </div>
            )}
            <div className="grid gap-1">
              <label htmlFor="job-drawer-workflow-id" className="text-xs font-medium text-slate-300">
                Workflow ID
              </label>
              <p className="text-xs text-slate-500">
                Numeric ID from the Workflows table — the script to run when this job fires.
              </p>
              <input
                id="job-drawer-workflow-id"
                value={jobForm.workflowId}
                onChange={(event) =>
                  setJobForm((prev) => ({ ...prev, workflowId: event.target.value }))
                }
                placeholder="e.g. 1"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="job-drawer-cooldown" className="text-xs font-medium text-slate-300">
                Cooldown (seconds)
              </label>
              <p className="text-xs text-slate-500">
                Minimum seconds between runs; use <span className="font-mono">0</span> for no wait.
              </p>
              <input
                id="job-drawer-cooldown"
                value={jobForm.cooldownSeconds}
                onChange={(event) =>
                  setJobForm((prev) => ({
                    ...prev,
                    cooldownSeconds: event.target.value,
                  }))
                }
                placeholder="e.g. 30"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="job-drawer-trigger-value" className="text-xs font-medium text-slate-300">
                Trigger value / filter
              </label>
              <p className="text-xs text-slate-500">
                Extra numeric filter: schedule or tick id, or <span className="font-mono">0</span> to
                match any for that trigger type.
              </p>
              <input
                id="job-drawer-trigger-value"
                value={jobForm.triggerValue}
                onChange={(event) =>
                  setJobForm((prev) => ({
                    ...prev,
                    triggerValue: event.target.value,
                  }))
                }
                placeholder="e.g. 0"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-3 py-2 text-sm font-medium transition hover:bg-indigo-500/30"
            >
              {editingJobId ? 'Save changes' : 'Create job on-chain'}
            </button>
          </form>
        </Drawer>

        <Drawer
          open={alertDrawerOpen}
          onClose={() => {
            setAlertDrawerOpen(false)
            setEditingAlertId(null)
          }}
          title={
            editingAlertId
              ? `Edit alert #${editingAlertId.toString()}`
              : 'Add alert — when event data crosses a limit'
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            Watches an event on an emitter. Pick a demo event signature below or paste a custom topic0.
            The handler reads the first 32-byte number in the event data and compares it to your minimum.
          </p>
          <form onSubmit={(e) => void submitAlertDrawer(e)} className="grid gap-3">
            <div className="grid gap-1">
              <label htmlFor="alert-drawer-name" className="text-xs font-medium text-slate-300">
                Alert name
              </label>
              <p className="text-xs text-slate-500">Label for you in the dashboard only.</p>
              <input
                id="alert-drawer-name"
                value={alertForm.name}
                onChange={(event) =>
                  setAlertForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. Metric threshold alert"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="alert-drawer-emitter" className="text-xs font-medium text-slate-300">
                Emitter contract
              </label>
              <p className="text-xs text-slate-500">Address of the contract whose events you are watching.</p>
              <input
                id="alert-drawer-emitter"
                value={alertForm.emitter}
                onChange={(event) =>
                  setAlertForm((prev) => ({ ...prev, emitter: event.target.value }))
                }
                placeholder="0x…"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="alert-topic-preset" className="text-xs font-medium text-slate-300">
                Event to match (topic0)
              </label>
              <p className="text-xs text-slate-500">
                Demo options fill the keccak hash for you. Use “Custom” to paste from an ABI tool.
              </p>
              <select
                id="alert-topic-preset"
                value={alertForm.topicPreset}
                onChange={(event) => {
                  const v = event.target.value as DemoTopicPreset
                  if (v === 'health') {
                    setAlertForm((prev) => ({
                      ...prev,
                      topicPreset: 'health',
                      topic0: healthSignalTopic,
                    }))
                  } else if (v === 'metric') {
                    setAlertForm((prev) => ({
                      ...prev,
                      topicPreset: 'metric',
                      topic0: metricSignalTopic,
                    }))
                  } else if (v === 'any') {
                    setAlertForm((prev) => ({
                      ...prev,
                      topicPreset: 'any',
                      topic0: ethers.ZeroHash,
                    }))
                  } else {
                    setAlertForm((prev) => ({
                      ...prev,
                      topicPreset: 'custom',
                      topic0: prev.topicPreset === 'custom' ? prev.topic0 : '',
                    }))
                  }
                }}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="health">HealthSignal (demo)</option>
                <option value="metric">MetricSignal (demo)</option>
                <option value="any">Any event on this emitter (wildcard)</option>
                <option value="custom">Custom — paste topic0 hex below</option>
              </select>
              {alertForm.topicPreset === 'custom' ? (
                <input
                  id="alert-drawer-topic0-custom"
                  value={alertForm.topic0}
                  onChange={(event) =>
                    setAlertForm((prev) => ({ ...prev, topic0: event.target.value }))
                  }
                  placeholder="0x + 64 hex chars"
                  className="rounded-lg border border-amber-500/30 bg-slate-950 px-3 py-2 font-mono text-sm"
                />
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <label htmlFor="alert-drawer-min-value" className="text-xs font-medium text-slate-300">
                  Minimum value (uint256)
                </label>
                <p className="text-xs text-slate-500">
                  Handler compares the first 32-byte word in event data; fire when observed ≥ this.
                </p>
                <input
                  id="alert-drawer-min-value"
                  value={alertForm.minValue}
                  onChange={(event) =>
                    setAlertForm((prev) => ({ ...prev, minValue: event.target.value }))
                  }
                  placeholder="e.g. 800"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="alert-drawer-workflow-id" className="text-xs font-medium text-slate-300">
                  Workflow ID
                </label>
                <p className="text-xs text-slate-500">Workflow to run when the threshold is met.</p>
                <input
                  id="alert-drawer-workflow-id"
                  value={alertForm.workflowId}
                  onChange={(event) =>
                    setAlertForm((prev) => ({ ...prev, workflowId: event.target.value }))
                  }
                  placeholder="e.g. 1"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid gap-1">
              <label htmlFor="alert-drawer-cooldown" className="text-xs font-medium text-slate-300">
                Cooldown (seconds)
              </label>
              <p className="text-xs text-slate-500">Minimum time between firing this alert again.</p>
              <input
                id="alert-drawer-cooldown"
                value={alertForm.cooldownSeconds}
                onChange={(event) =>
                  setAlertForm((prev) => ({
                    ...prev,
                    cooldownSeconds: event.target.value,
                  }))
                }
                placeholder="e.g. 30"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm font-medium transition hover:bg-emerald-500/30"
            >
              {editingAlertId ? 'Save changes' : 'Create alert on-chain'}
            </button>
          </form>
        </Drawer>

        <Drawer
          open={workflowDrawerOpen}
          onClose={() => setWorkflowDrawerOpen(false)}
          title="Create workflow"
        >
          <p className="mb-3 text-xs text-slate-500">
            Each step calls <strong className="font-medium text-slate-400">any</strong> contract on this
            network — including ones you deployed outside this dashboard. Paste the contract address and the
            calldata hex from your own ABI encoder, wallet, or scripts. The env “insert address” and
            quick-calldata menus are optional shortcuts for this repo’s demo contracts only.
          </p>
          <form onSubmit={(e) => void submitWorkflowDrawer(e)} className="grid gap-4">
            <div className="grid gap-1">
              <label htmlFor="workflow-drawer-name" className="text-xs font-medium text-slate-300">
                Workflow name
              </label>
              <input
                id="workflow-drawer-name"
                value={workflowForm.name}
                onChange={(event) =>
                  setWorkflowForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. My rebalance flow"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-300">Steps (order matters)</p>
              {workflowForm.steps.map((step, index) => (
                <div
                  key={step.id}
                  className="grid gap-2 rounded-lg border border-slate-700/90 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-400">
                      Step {index + 1}
                    </span>
                    {workflowForm.steps.length > 1 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setWorkflowForm((prev) => ({
                            ...prev,
                            steps: prev.steps.filter((_, j) => j !== index),
                          }))
                        }
                        className="inline-flex items-center gap-1 rounded border border-red-500/30 px-2 py-0.5 text-xs text-red-200/90 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor={`workflow-step-label-${index}`}
                    >
                      Label
                    </label>
                    <input
                      id={`workflow-step-label-${index}`}
                      value={step.label}
                      onChange={(event) =>
                        setWorkflowForm((prev) => ({
                          ...prev,
                          steps: prev.steps.map((s, j) =>
                            j === index ? { ...s, label: event.target.value } : s,
                          ),
                        }))
                      }
                      placeholder="Human-readable name"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor={`workflow-step-target-${index}`}
                    >
                      Target contract
                    </label>
                    <input
                      id={`workflow-step-target-${index}`}
                      value={step.target}
                      onChange={(event) =>
                        setWorkflowForm((prev) => ({
                          ...prev,
                          steps: prev.steps.map((s, j) =>
                            j === index ? { ...s, target: event.target.value } : s,
                          ),
                        }))
                      }
                      placeholder="0x… any contract on this chain"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  {workflowDeploymentPicklist.length > 0 ? (
                    <div className="grid gap-1">
                      <label
                        className="text-xs text-slate-400"
                        htmlFor={`workflow-step-target-preset-${index}`}
                      >
                        Insert address from this deployment
                      </label>
                      <select
                        id={`workflow-step-target-preset-${index}`}
                        value={deploymentTargetSelectValue(
                          step.target,
                          workflowDeploymentPicklist,
                        )}
                        onChange={(event) => {
                          const addr = event.target.value
                          setWorkflowForm((prev) => ({
                            ...prev,
                            steps: prev.steps.map((s, j) =>
                              j === index ? { ...s, target: addr } : s,
                            ),
                          }))
                        }}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                      >
                        <option value="">Choose a configured contract…</option>
                        {workflowDeploymentPicklist.map((opt) => (
                          <option
                            key={`${opt.label}-${opt.address}`}
                            value={opt.address}
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor={`workflow-step-calldata-helper-${index}`}
                    >
                      Quick calldata (demo ABIs — target unchanged)
                    </label>
                    <p className="text-[11px] leading-snug text-slate-500">
                      Fills the calldata field only. Set target to the contract that implements that call
                      (e.g. mock protocol for the first three, mock signal emitter for the last two).
                    </p>
                    <select
                      id={`workflow-step-calldata-helper-${index}`}
                      value=""
                      onChange={(event) => {
                        const v = event.target.value
                        if (!v) {
                          return
                        }
                        let data = '0x'
                        if (v === 'p_activate') {
                          data = mockProtocolInterface.encodeFunctionData(
                            'activateProtectionMode',
                            [],
                          )
                        } else if (v === 'p_rebalance300') {
                          data = mockProtocolInterface.encodeFunctionData('rebalance', [300n])
                        } else if (v === 'p_repay150') {
                          data = mockProtocolInterface.encodeFunctionData('repayDebt', [150n])
                        } else if (v === 's_metric') {
                          data = mockSignalInterface.encodeFunctionData('emitMetricSignal', [1n, 930n])
                        } else if (v === 's_health') {
                          data = mockSignalInterface.encodeFunctionData('emitHealthSignal', [
                            ethers.ZeroAddress,
                            870n,
                            1_250n,
                          ])
                        }
                        setWorkflowForm((prev) => ({
                          ...prev,
                          steps: prev.steps.map((s, j) =>
                            j === index ? { ...s, data } : s,
                          ),
                        }))
                      }}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                    >
                      <option value="">Encode demo call into calldata…</option>
                      <optgroup label="Mock protocol controller">
                        <option value="p_activate">activateProtectionMode()</option>
                        <option value="p_rebalance300">rebalance(300)</option>
                        <option value="p_repay150">repayDebt(150)</option>
                      </optgroup>
                      <optgroup label="Mock signal emitter">
                        <option value="s_metric">emitMetricSignal(1, 930)</option>
                        <option value="s_health">
                          emitHealthSignal(zero vault, 870, 1250)
                        </option>
                      </optgroup>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor={`workflow-step-value-${index}`}
                    >
                      Value (wei)
                    </label>
                    <input
                      id={`workflow-step-value-${index}`}
                      value={step.value}
                      onChange={(event) =>
                        setWorkflowForm((prev) => ({
                          ...prev,
                          steps: prev.steps.map((s, j) =>
                            j === index ? { ...s, value: event.target.value } : s,
                          ),
                        }))
                      }
                      placeholder="0"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label
                      className="text-xs text-slate-400"
                      htmlFor={`workflow-step-data-${index}`}
                    >
                      Calldata (hex)
                    </label>
                    <textarea
                      id={`workflow-step-data-${index}`}
                      value={step.data}
                      onChange={(event) =>
                        setWorkflowForm((prev) => ({
                          ...prev,
                          steps: prev.steps.map((s, j) =>
                            j === index ? { ...s, data: event.target.value } : s,
                          ),
                        }))
                      }
                      placeholder="0x"
                      rows={2}
                      className="resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs"
                    />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={step.allowFailure}
                      onChange={(event) =>
                        setWorkflowForm((prev) => ({
                          ...prev,
                          steps: prev.steps.map((s, j) =>
                            j === index ? { ...s, allowFailure: event.target.checked } : s,
                          ),
                        }))
                      }
                      className="rounded border-slate-600"
                    />
                    Allow failure (continue workflow if this call reverts)
                  </label>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() =>
                setWorkflowForm((prev) => ({
                  ...prev,
                  steps: [...prev.steps, workflowStepFormTemplate(prev.steps.length)],
                }))
              }
              className="rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Add step
            </button>

            <button
              type="submit"
              className="rounded-lg border border-indigo-500/35 bg-indigo-500/20 px-3 py-2.5 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/30"
            >
              Create workflow on-chain
            </button>
          </form>
        </Drawer>

        <Drawer
          open={stepsDrawerWorkflowId !== null}
          onClose={() => setStepsDrawerWorkflowId(null)}
          title={
            stepsDrawerWorkflowId
              ? `Workflow #${stepsDrawerWorkflowId.toString()} — steps`
              : 'Workflow steps'
          }
        >
          {stepsLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : workflowSteps.length === 0 ? (
            <p className="text-sm text-slate-500">No steps loaded.</p>
          ) : (
            <ol className="list-decimal space-y-3 pl-4 text-sm text-slate-200">
              {workflowSteps.map((step, i) => (
                <li key={`${step.target}-${i}`}>
                  <span className="font-medium text-white">{step.label}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {step.allowFailure ? '(allow fail)' : ''}
                  </span>
                  <div className="mt-1 font-mono text-xs text-slate-400">{step.target}</div>
                </li>
              ))}
            </ol>
          )}
        </Drawer>
      </main>

      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  )
}

export default App
