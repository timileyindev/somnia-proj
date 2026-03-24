import assert from "node:assert/strict";
import { describe, it, before } from "node:test";

import { network } from "hardhat";
import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  keccak256,
  stringToBytes,
  toBytes,
} from "viem";

/** Somnia reactivity precompile `address(0x0100)` as a 20-byte checksummed address */
const PRECOMPILE = getAddress("0x0000000000000000000000000000000000000100");

describe("Somnia Autopilot contracts", async () => {
  const { viem, networkHelpers } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();

  before(() => {
    assert.ok(deployer, "deployer wallet client required");
  });

  it("AutomationRegistry enforces operator for execution counters", async () => {
    const registry = await viem.deployContract("AutomationRegistry", [deployer!.account.address]);
    const wallets = await viem.getWalletClients();
    const operator = wallets[1];
    const stranger = wallets[2];
    assert.ok(operator && stranger, "need multiple funded accounts");

    await registry.write.setOperator([operator.account.address, true]);

    await registry.write.createJob(
      [
        {
          name: "t",
          triggerType: 3,
          emitter: deployer!.account.address,
          topic0: keccak256(stringToBytes("E()")),
          triggerValue: 0n,
          workflowId: 1n,
          cooldownSeconds: 0n,
          active: true,
        },
      ],
      { account: deployer!.account },
    );

    // Owner is always allowed; stranger must be rejected.
    await assert.rejects(
      registry.write.recordJobExecution([1n, true, BigInt(Math.floor(Date.now() / 1000))], {
        account: stranger.account,
      }),
    );

    await registry.write.recordJobExecution([1n, true, BigInt(Math.floor(Date.now() / 1000))], {
      account: operator.account,
    });

    const job = (await registry.read.getJob([1n])) as { successCount: bigint };
    assert.equal(job.successCount, 1n);
  });

  it("WorkflowOrchestrator executes multi-step workflows for authorized executors", async () => {
    const orchestrator = await viem.deployContract("WorkflowOrchestrator", [
      deployer!.account.address,
    ]);
    const mock = await viem.deployContract("MockProtocolController");

    const steps = [
      {
        target: mock.address,
        value: 0n,
        data: encodeFunctionData({
          abi: mock.abi,
          functionName: "activateProtectionMode",
        }),
        allowFailure: false,
        label: "protect",
      },
      {
        target: mock.address,
        value: 0n,
        data: encodeFunctionData({
          abi: mock.abi,
          functionName: "rebalance",
          args: [99n],
        }),
        allowFailure: false,
        label: "rebalance",
      },
    ] as const;

    await orchestrator.write.createWorkflow(["flow", steps], { account: deployer!.account });

    const tx = await orchestrator.write.executeWorkflow([1n, keccak256(toBytes("ctx"))], {
      account: deployer!.account,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });

    assert.equal(await mock.read.protectionMode(), true);
    assert.equal(await mock.read.rebalanceCount(), 1n);
    assert.equal(await mock.read.lastRebalanceAmount(), 99n);

    const wf = (await orchestrator.read.getWorkflow([1n])) as {
      runCount: bigint;
      successCount: bigint;
    };
    assert.equal(wf.runCount, 1n);
    assert.equal(wf.successCount, 1n);
  });

  it("ReactiveAutopilotHandler runs jobs on external events when invoked by precompile", async () => {
    const registry = await viem.deployContract("AutomationRegistry", [deployer!.account.address]);
    const orchestrator = await viem.deployContract("WorkflowOrchestrator", [
      deployer!.account.address,
    ]);
    const handler = await viem.deployContract("ReactiveAutopilotHandler", [
      registry.address,
      orchestrator.address,
      deployer!.account.address,
    ]);
    const mock = await viem.deployContract("MockProtocolController");
    const signal = await viem.deployContract("MockSignalEmitter");

    await registry.write.setOperator([handler.address, true]);
    await orchestrator.write.setExecutor([handler.address, true]);

    const steps = [
      {
        target: mock.address,
        value: 0n,
        data: encodeFunctionData({
          abi: mock.abi,
          functionName: "activateProtectionMode",
        }),
        allowFailure: false,
        label: "p",
      },
    ] as const;

    await orchestrator.write.createWorkflow(["react", steps], { account: deployer!.account });

    const healthTopic = keccak256(stringToBytes("HealthSignal(address,uint256,uint256)"));
    await registry.write.createJob(
      [
        {
          name: "health",
          triggerType: 3,
          emitter: signal.address,
          topic0: healthTopic,
          triggerValue: 0n,
          workflowId: 1n,
          cooldownSeconds: 0n,
          active: true,
        },
      ],
      { account: deployer!.account },
    );

    const data = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [1_000n, 2n],
    );

    await networkHelpers.impersonateAccount(PRECOMPILE);
    await networkHelpers.setBalance(PRECOMPILE, 10n ** 18n);
    const tx = await handler.write.onEvent(
      [signal.address, [healthTopic], data],
      { account: PRECOMPILE },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await networkHelpers.stopImpersonatingAccount(PRECOMPILE);

    assert.equal(await mock.read.protectionMode(), true);
    const job = (await registry.read.getJob([1n])) as { successCount: bigint };
    assert.equal(job.successCount, 1n);
  });

  it("ReactiveAutopilotHandler matches BlockTick system events from precompile", async () => {
    const registry = await viem.deployContract("AutomationRegistry", [deployer!.account.address]);
    const orchestrator = await viem.deployContract("WorkflowOrchestrator", [
      deployer!.account.address,
    ]);
    const handler = await viem.deployContract("ReactiveAutopilotHandler", [
      registry.address,
      orchestrator.address,
      deployer!.account.address,
    ]);
    const mock = await viem.deployContract("MockProtocolController");

    await registry.write.setOperator([handler.address, true]);
    await orchestrator.write.setExecutor([handler.address, true]);

    const steps = [
      {
        target: mock.address,
        value: 0n,
        data: encodeFunctionData({
          abi: mock.abi,
          functionName: "rebalance",
          args: [5n],
        }),
        allowFailure: false,
        label: "tick",
      },
    ] as const;

    await orchestrator.write.createWorkflow(["tick-flow", steps], { account: deployer!.account });

    await registry.write.createJob(
      [
        {
          name: "block tick",
          triggerType: 1,
          emitter: PRECOMPILE,
          topic0: keccak256(stringToBytes("BlockTick(uint64)")),
          triggerValue: 0n,
          workflowId: 1n,
          cooldownSeconds: 0n,
          active: true,
        },
      ],
      { account: deployer!.account },
    );

    const blockTopic = keccak256(stringToBytes("BlockTick(uint64)"));
    await networkHelpers.impersonateAccount(PRECOMPILE);
    await networkHelpers.setBalance(PRECOMPILE, 10n ** 18n);
    const tx = await handler.write.onEvent(
      [PRECOMPILE, [blockTopic], "0x"],
      { account: PRECOMPILE },
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await networkHelpers.stopImpersonatingAccount(PRECOMPILE);

    assert.equal(await mock.read.rebalanceCount(), 1n);
  });
});
