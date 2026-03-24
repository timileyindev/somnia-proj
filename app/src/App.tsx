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
  AlertTriangle,
  BellRing,
  Clock3,
  Pencil,
  Plus,
  RefreshCcw,
  Rocket,
  Search,
  Zap,
} from 'lucide-react'
import {
  automationRegistryAbi,
  mockProtocolControllerAbi,
  mockSignalEmitterAbi,
  reactiveHandlerAbi,
  workflowOrchestratorAbi,
} from './abis'
import { appConfig, hasCoreAddresses } from './config'
import { Drawer } from './components/Drawer'
import { RunTimeline } from './components/RunTimeline'
import { StatCard } from './components/StatCard'
import { StatusBadge } from './components/StatusBadge'

type Job = {
  id: bigint
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
  const [account, setAccount] = useState<string | null>(null)
  const [signer, setSigner] = useState<ethers.Signer | null>(null)
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
    triggerValue: '0',
    workflowId: '1',
    cooldownSeconds: '30',
  })
  const [alertForm, setAlertForm] = useState({
    name: 'Metric threshold alert',
    emitter: appConfig.contracts.mockSignalEmitter ?? '',
    topic0: metricSignalTopic,
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
    return createContracts(signer)
  }, [signer])

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

  const connectWallet = useCallback(async () => {
    const injected = (window as Window & { ethereum?: ethers.Eip1193Provider })
      .ethereum
    if (!injected) {
      setError('No wallet found. Install MetaMask or another injected wallet.')
      return
    }

    const browserProvider = new ethers.BrowserProvider(injected)
    await browserProvider.send('eth_requestAccounts', [])
    const nextSigner = await browserProvider.getSigner()
    const nextAccount = await nextSigner.getAddress()

    const network = await browserProvider.getNetwork()
    if (Number(network.chainId) !== appConfig.chainId) {
      setError(
        `Connected chain ${network.chainId.toString()} differs from configured chain ${appConfig.chainId}.`,
      )
    } else {
      setError(null)
    }

    setSigner(nextSigner)
    setAccount(nextAccount)
  }, [])

  const createDefaultWorkflow = useCallback(async () => {
    if (!writeContracts || !writeContracts.protocolController) {
      setError(
        'Wallet signer or protocol controller address missing. Configure VITE_MOCK_PROTOCOL_CONTROLLER_ADDRESS.',
      )
      return
    }

    const protocolInterface = new ethers.Interface(mockProtocolControllerAbi)
    await withAction('create workflow', async () => {
      const tx = await writeContracts.orchestrator.createWorkflow(
        'UI Risk Mitigation Workflow',
        [
          {
            target: writeContracts.protocolController!.target,
            value: 0n,
            data: protocolInterface.encodeFunctionData('activateProtectionMode'),
            allowFailure: false,
            label: 'Activate protection',
          },
          {
            target: writeContracts.protocolController!.target,
            value: 0n,
            data: protocolInterface.encodeFunctionData('rebalance', [300n]),
            allowFailure: false,
            label: 'Rebalance',
          },
          {
            target: writeContracts.protocolController!.target,
            value: 0n,
            data: protocolInterface.encodeFunctionData('repayDebt', [150n]),
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

  const q = (row: string, needle: string) =>
    needle.trim() === '' || row.toLowerCase().includes(needle.trim().toLowerCase())

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) =>
      q(`${job.name} ${job.id} ${job.emitter} ${job.topic0}`, jobFilter),
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
      triggerValue: '0',
      workflowId: workflows[0]?.id.toString() ?? '1',
      cooldownSeconds: '30',
    })
    setJobDrawerOpen(true)
  }, [workflows])

  const openEditJobDrawer = useCallback((job: Job) => {
    setEditingJobId(job.id)
    setJobForm({
      name: job.name,
      triggerType: String(job.triggerType),
      emitter: job.emitter,
      topic0: job.topic0,
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
      minValue: '800',
      workflowId: workflows[0]?.id.toString() ?? '1',
      cooldownSeconds: '30',
    })
    setAlertDrawerOpen(true)
  }, [workflows])

  const openEditAlertDrawer = useCallback((rule: AlertRule) => {
    setEditingAlertId(rule.id)
    setAlertForm({
      name: rule.name,
      emitter: rule.emitter,
      topic0: rule.topic0,
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
                Automation & Infrastructure
              </p>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">
                {appConfig.appName} Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Scheduler + Alerts + Cross-contract orchestrator with real-time analytics.
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
              <button
                type="button"
                onClick={connectWallet}
                className="rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/30"
              >
                {account ? `Connected: ${shortAddress(account)}` : 'Connect Wallet'}
              </button>
              <button
                type="button"
                onClick={() => void refreshDashboard()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Refresh
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
          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Processed Events" value={bigintToString(processedEvents)} />
          <StatCard label="Active Jobs" value={analytics.activeJobs.toString()} />
          <StatCard label="Active Alerts" value={analytics.activeAlerts.toString()} />
          <StatCard
            label="Workflow run success rate"
            value={analytics.workflowSuccessRate}
            hint={`${analytics.runSuccesses} success / ${analytics.runFailures} failures (orchestrator)`}
          />
          <StatCard
            label="Job execution success rate"
            value={analytics.jobExecutionSuccessRate}
            hint={`Registry-tracked runs (${bigintToString(analytics.jobRuns)} total)`}
          />
          <StatCard
            label="Total Workflow Runs"
            value={analytics.totalRuns.toString()}
            hint={`Across ${analytics.totalWorkflows} workflows`}
          />
          <StatCard
            label="Tracked Job Executions"
            value={bigintToString(analytics.jobRuns)}
            hint={isLoading ? 'Refreshing...' : 'Auto-refresh every 12s'}
          />
          <StatCard
            label="Wallet"
            value={account ? shortAddress(account) : 'not connected'}
            hint={pendingAction ? `Pending: ${pendingAction}` : 'Connect for write actions'}
          />
          <StatCard
            label="Explorer"
            value={appConfig.explorerBaseUrl ? 'configured' : 'not set'}
            hint={appConfig.explorerBaseUrl ?? 'Set VITE_EXPLORER_BASE_URL'}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Rocket className="h-4 w-4 text-indigo-300" />
              Automation Controls
            </h2>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={createDefaultWorkflow}
                className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-left text-sm transition hover:bg-indigo-500/20"
              >
                Create Default Workflow
              </button>
              <button
                type="button"
                onClick={emitDemoSignal}
                className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-left text-sm transition hover:bg-blue-500/20"
              >
                Emit Demo Signals
              </button>
              <button
                type="button"
                onClick={openNewJobDrawer}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-left text-sm transition hover:bg-violet-500/20"
              >
                <Plus className="h-4 w-4" />
                New automation job
              </button>
              <button
                type="button"
                onClick={openNewAlertDrawer}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-sm transition hover:bg-emerald-500/20"
              >
                <Plus className="h-4 w-4" />
                New alert rule
              </button>
              <div className="flex gap-2">
                <input
                  value={manualJobId}
                  onChange={(event) => setManualJobId(event.target.value)}
                  placeholder="Job ID"
                  className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={runManualJob}
                  className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm transition hover:bg-emerald-500/20"
                >
                  Manual Trigger
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Zap className="h-4 w-4 text-cyan-300" />
              Run Outcomes (latest 12)
            </h2>
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
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <Clock3 className="h-4 w-4 text-indigo-300" />
              Job Reliability Snapshot
            </h2>
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
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <BellRing className="h-4 w-4 text-violet-300" />
              Execution timeline
            </h2>
            <RunTimeline runs={runs} formatTime={formatTimestamp} />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold">Jobs</h2>
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
                      <td className="px-3 py-4 text-slate-400" colSpan={7}>
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
                            {shortAddress(job.emitter)} · {shortHex(job.topic0)}
                          </div>
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
              <h2 className="text-base font-semibold">Alert Rules</h2>
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
              <h2 className="text-base font-semibold">Workflows</h2>
              <div className="relative max-w-xs flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  value={workflowFilter}
                  onChange={(e) => setWorkflowFilter(e.target.value)}
                  placeholder="Filter workflows…"
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
              <h2 className="mb-0 text-base font-semibold">Recent Runs</h2>
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
          title={editingJobId ? `Edit job #${editingJobId.toString()}` : 'New automation job'}
        >
          <form onSubmit={(e) => void submitJobDrawer(e)} className="grid gap-2">
            <input
              value={jobForm.name}
              onChange={(event) =>
                setJobForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Job name"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <select
              value={jobForm.triggerType}
              onChange={(event) =>
                setJobForm((prev) => ({
                  ...prev,
                  triggerType: event.target.value,
                }))
              }
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="0">Schedule</option>
              <option value="1">Block Tick</option>
              <option value="2">Epoch Tick</option>
              <option value="3">External Event</option>
            </select>
            <input
              value={jobForm.emitter}
              onChange={(event) =>
                setJobForm((prev) => ({ ...prev, emitter: event.target.value }))
              }
              placeholder="Emitter address"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              value={jobForm.topic0}
              onChange={(event) =>
                setJobForm((prev) => ({ ...prev, topic0: event.target.value }))
              }
              placeholder="Topic0 (or 0x00...)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              value={jobForm.workflowId}
              onChange={(event) =>
                setJobForm((prev) => ({ ...prev, workflowId: event.target.value }))
              }
              placeholder="Workflow ID"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              value={jobForm.cooldownSeconds}
              onChange={(event) =>
                setJobForm((prev) => ({
                  ...prev,
                  cooldownSeconds: event.target.value,
                }))
              }
              placeholder="Cooldown (s)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              value={jobForm.triggerValue}
              onChange={(event) =>
                setJobForm((prev) => ({
                  ...prev,
                  triggerValue: event.target.value,
                }))
              }
              placeholder="Trigger value (schedule / tick id)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="mt-2 rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-3 py-2 text-sm font-medium transition hover:bg-indigo-500/30"
            >
              {editingJobId ? 'Update job' : 'Create job'}
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
              : 'New alert rule'
          }
        >
          <form onSubmit={(e) => void submitAlertDrawer(e)} className="grid gap-2">
            <input
              value={alertForm.name}
              onChange={(event) =>
                setAlertForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Alert name"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              value={alertForm.emitter}
              onChange={(event) =>
                setAlertForm((prev) => ({ ...prev, emitter: event.target.value }))
              }
              placeholder="Emitter address"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              value={alertForm.topic0}
              onChange={(event) =>
                setAlertForm((prev) => ({ ...prev, topic0: event.target.value }))
              }
              placeholder="Topic0"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={alertForm.minValue}
                onChange={(event) =>
                  setAlertForm((prev) => ({ ...prev, minValue: event.target.value }))
                }
                placeholder="Min value (first data word)"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
              <input
                value={alertForm.workflowId}
                onChange={(event) =>
                  setAlertForm((prev) => ({ ...prev, workflowId: event.target.value }))
                }
                placeholder="Workflow ID"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <input
              value={alertForm.cooldownSeconds}
              onChange={(event) =>
                setAlertForm((prev) => ({
                  ...prev,
                  cooldownSeconds: event.target.value,
                }))
              }
              placeholder="Cooldown (s)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3 py-2 text-sm font-medium transition hover:bg-emerald-500/30"
            >
              {editingAlertId ? 'Update alert' : 'Create alert'}
            </button>
          </form>
        </Drawer>

        <Drawer
          open={stepsDrawerWorkflowId !== null}
          onClose={() => setStepsDrawerWorkflowId(null)}
          title={
            stepsDrawerWorkflowId
              ? `Workflow #${stepsDrawerWorkflowId.toString()} steps`
              : 'Steps'
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
    </div>
  )
}

export default App
