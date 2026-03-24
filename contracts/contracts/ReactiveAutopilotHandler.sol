// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SomniaEventHandler } from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import { SomniaExtensions } from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";
import { AutomationRegistry } from "./AutomationRegistry.sol";
import { WorkflowOrchestrator } from "./WorkflowOrchestrator.sol";

contract ReactiveAutopilotHandler is SomniaEventHandler, Ownable {
    bytes32 public constant BLOCK_TICK_TOPIC = keccak256("BlockTick(uint64)");
    bytes32 public constant EPOCH_TICK_TOPIC = keccak256("EpochTick(uint64,uint64)");
    bytes32 public constant SCHEDULE_TOPIC = keccak256("Schedule(uint256)");

    AutomationRegistry public immutable registry;
    WorkflowOrchestrator public immutable orchestrator;

    uint256 public processedEvents;

    event ReactiveEventProcessed(
        address indexed emitter,
        bytes32 indexed topic0,
        uint256 jobsMatched,
        uint256 alertsMatched,
        bytes32 contextHash
    );
    event JobTriggered(
        uint256 indexed jobId,
        uint256 indexed workflowId,
        uint256 indexed runId,
        bool success
    );
    event AlertRaised(
        uint256 indexed alertId,
        uint256 indexed workflowId,
        uint256 observedValue,
        uint256 runId
    );

    constructor(
        address registryAddress,
        address orchestratorAddress,
        address initialOwner
    )
        Ownable(initialOwner)
    {
        registry = AutomationRegistry(registryAddress);
        orchestrator = WorkflowOrchestrator(payable(orchestratorAddress));
    }

    function runJobManually(uint256 jobId, bytes32 contextHash) external onlyOwner {
        AutomationRegistry.Job memory job = registry.getJob(jobId);
        if (!job.active || job.workflowId == 0) {
            return;
        }
        (uint256 runId, bool success) = _executeWorkflow(job.workflowId, contextHash);
        registry.recordJobExecution(job.id, success, uint64(block.timestamp));
        emit JobTriggered(job.id, job.workflowId, runId, success);
    }

    function _onEvent(
        address emitter,
        bytes32[] calldata eventTopics,
        bytes calldata data
    )
        internal
        override
    {
        bytes32 topic0 = eventTopics.length > 0 ? eventTopics[0] : bytes32(0);
        processedEvents += 1;
        bytes32 baseContextHash =
            keccak256(abi.encode(block.number, block.timestamp, emitter, topic0, data, processedEvents));

        uint256 jobsMatched = _processJobs(emitter, topic0, eventTopics, baseContextHash);
        uint256 alertsMatched = _processAlerts(emitter, topic0, data, baseContextHash);

        emit ReactiveEventProcessed(emitter, topic0, jobsMatched, alertsMatched, baseContextHash);
    }

    function _processJobs(
        address emitter,
        bytes32 topic0,
        bytes32[] calldata eventTopics,
        bytes32 contextHash
    )
        internal
        returns (uint256 jobsMatched)
    {
        uint256 totalJobs = registry.jobCount();
        for (uint256 i = 0; i < totalJobs; i++) {
            uint256 jobId = registry.jobIdAt(i);
            AutomationRegistry.Job memory job = registry.getJob(jobId);

            if (!_jobMatches(job, emitter, topic0, eventTopics)) {
                continue;
            }
            if (job.cooldownSeconds > 0 && block.timestamp < uint256(job.lastExecutedAt) + job.cooldownSeconds) {
                continue;
            }

            jobsMatched += 1;
            (uint256 runId, bool success) =
                _executeWorkflow(job.workflowId, keccak256(abi.encode(contextHash, job.id)));
            registry.recordJobExecution(job.id, success, uint64(block.timestamp));
            emit JobTriggered(job.id, job.workflowId, runId, success);
        }
    }

    function _processAlerts(
        address emitter,
        bytes32 topic0,
        bytes calldata data,
        bytes32 contextHash
    )
        internal
        returns (uint256 alertsMatched)
    {
        uint256 observedValue = _decodePrimaryUint(data);
        uint256 totalRules = registry.alertRuleCount();

        for (uint256 i = 0; i < totalRules; i++) {
            uint256 alertId = registry.alertRuleIdAt(i);
            AutomationRegistry.AlertRule memory alertRule = registry.getAlertRule(alertId);

            if (!alertRule.active) {
                continue;
            }
            if (alertRule.emitter != address(0) && alertRule.emitter != emitter) {
                continue;
            }
            if (alertRule.topic0 != bytes32(0) && alertRule.topic0 != topic0) {
                continue;
            }
            if (alertRule.minValue > 0 && observedValue < alertRule.minValue) {
                continue;
            }
            if (
                alertRule.cooldownSeconds > 0
                    && block.timestamp < uint256(alertRule.lastAlertAt) + alertRule.cooldownSeconds
            ) {
                continue;
            }

            alertsMatched += 1;
            registry.recordAlertTrigger(alertRule.id, observedValue, uint64(block.timestamp));

            uint256 runId = 0;
            if (alertRule.workflowId != 0) {
                (runId,) = _executeWorkflow(
                    alertRule.workflowId,
                    keccak256(abi.encode(contextHash, alertRule.id, observedValue))
                );
            }
            emit AlertRaised(alertRule.id, alertRule.workflowId, observedValue, runId);
        }
    }

    function _executeWorkflow(uint256 workflowId, bytes32 contextHash) internal returns (uint256 runId, bool success) {
        if (workflowId == 0) {
            return (0, false);
        }

        try orchestrator.executeWorkflow(workflowId, contextHash) returns (uint256 newRunId, bool isSuccess) {
            runId = newRunId;
            success = isSuccess;
        } catch {
            runId = 0;
            success = false;
        }
    }

    function _jobMatches(
        AutomationRegistry.Job memory job,
        address emitter,
        bytes32 topic0,
        bytes32[] calldata eventTopics
    )
        internal
        view
        returns (bool)
    {
        if (!job.active) {
            return false;
        }

        if (job.triggerType == AutomationRegistry.TriggerType.ExternalEvent) {
            if (job.emitter != address(0) && job.emitter != emitter) {
                return false;
            }
            if (job.topic0 != bytes32(0) && job.topic0 != topic0) {
                return false;
            }
            return true;
        }

        if (emitter != SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS) {
            return false;
        }

        if (job.triggerType == AutomationRegistry.TriggerType.Schedule) {
            if (topic0 != SCHEDULE_TOPIC) {
                return false;
            }
            if (job.triggerValue == 0) {
                return true;
            }
            return eventTopics.length > 1 && eventTopics[1] == bytes32(job.triggerValue);
        }

        if (job.triggerType == AutomationRegistry.TriggerType.BlockTick) {
            if (topic0 != BLOCK_TICK_TOPIC) {
                return false;
            }
            if (job.triggerValue == 0) {
                return true;
            }
            return eventTopics.length > 1 && eventTopics[1] == bytes32(job.triggerValue);
        }

        if (job.triggerType == AutomationRegistry.TriggerType.EpochTick) {
            if (topic0 != EPOCH_TICK_TOPIC) {
                return false;
            }
            if (job.triggerValue == 0) {
                return true;
            }
            return eventTopics.length > 1 && eventTopics[1] == bytes32(job.triggerValue);
        }

        return false;
    }

    function _decodePrimaryUint(bytes calldata rawData) internal pure returns (uint256 value) {
        if (rawData.length < 32) {
            return 0;
        }
        assembly {
            value := calldataload(rawData.offset)
        }
    }
}
