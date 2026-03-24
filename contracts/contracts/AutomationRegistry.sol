// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract AutomationRegistry is Ownable {
    enum TriggerType {
        Schedule,
        BlockTick,
        EpochTick,
        ExternalEvent
    }

    struct Job {
        uint256 id;
        address creator;
        string name;
        TriggerType triggerType;
        address emitter;
        bytes32 topic0;
        uint256 triggerValue;
        uint256 workflowId;
        uint64 cooldownSeconds;
        bool active;
        uint64 createdAt;
        uint64 lastExecutedAt;
        uint64 successCount;
        uint64 failureCount;
    }

    struct AlertRule {
        uint256 id;
        address creator;
        string name;
        address emitter;
        bytes32 topic0;
        uint256 minValue;
        uint256 workflowId;
        uint64 cooldownSeconds;
        bool active;
        uint64 createdAt;
        uint64 lastAlertAt;
        uint64 triggerCount;
    }

    struct JobInput {
        string name;
        TriggerType triggerType;
        address emitter;
        bytes32 topic0;
        uint256 triggerValue;
        uint256 workflowId;
        uint64 cooldownSeconds;
        bool active;
    }

    struct AlertInput {
        string name;
        address emitter;
        bytes32 topic0;
        uint256 minValue;
        uint256 workflowId;
        uint64 cooldownSeconds;
        bool active;
    }

    error NotOperator();
    error UnknownJob();
    error UnknownAlertRule();
    error InvalidName();
    error UnauthorizedJobUpdate();
    error UnauthorizedAlertUpdate();

    event OperatorUpdated(address indexed account, bool indexed enabled);

    event JobCreated(
        uint256 indexed jobId,
        address indexed creator,
        TriggerType triggerType,
        uint256 indexed workflowId,
        string name
    );
    event JobUpdated(
        uint256 indexed jobId,
        TriggerType triggerType,
        uint256 indexed workflowId,
        bool active
    );
    event JobExecutionRecorded(
        uint256 indexed jobId,
        uint256 indexed workflowId,
        bool success,
        uint64 executedAt
    );

    event AlertRuleCreated(
        uint256 indexed alertId,
        address indexed creator,
        uint256 indexed workflowId,
        string name
    );
    event AlertRuleUpdated(uint256 indexed alertId, uint256 indexed workflowId, bool active);
    event AlertTriggered(
        uint256 indexed alertId,
        uint256 indexed workflowId,
        uint256 observedValue,
        uint64 triggeredAt
    );

    uint256 public nextJobId = 1;
    uint256 public nextAlertRuleId = 1;

    mapping(address => bool) public operators;

    mapping(uint256 => Job) private _jobs;
    mapping(uint256 => AlertRule) private _alertRules;
    uint256[] private _jobIds;
    uint256[] private _alertRuleIds;

    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner()) {
            revert NotOperator();
        }
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        operators[initialOwner] = true;
        emit OperatorUpdated(initialOwner, true);
    }

    function setOperator(address operator, bool enabled) external onlyOwner {
        operators[operator] = enabled;
        emit OperatorUpdated(operator, enabled);
    }

    function createJob(JobInput calldata input) external returns (uint256 jobId) {
        if (bytes(input.name).length == 0) {
            revert InvalidName();
        }

        jobId = nextJobId++;
        _jobs[jobId] = Job({
            id: jobId,
            creator: msg.sender,
            name: input.name,
            triggerType: input.triggerType,
            emitter: input.emitter,
            topic0: input.topic0,
            triggerValue: input.triggerValue,
            workflowId: input.workflowId,
            cooldownSeconds: input.cooldownSeconds,
            active: input.active,
            createdAt: uint64(block.timestamp),
            lastExecutedAt: 0,
            successCount: 0,
            failureCount: 0
        });
        _jobIds.push(jobId);

        emit JobCreated(jobId, msg.sender, input.triggerType, input.workflowId, input.name);
    }

    function updateJob(uint256 jobId, JobInput calldata input) external {
        Job storage job = _jobs[jobId];
        if (job.id == 0) {
            revert UnknownJob();
        }
        if (job.creator != msg.sender && msg.sender != owner()) {
            revert UnauthorizedJobUpdate();
        }
        if (bytes(input.name).length == 0) {
            revert InvalidName();
        }

        job.name = input.name;
        job.triggerType = input.triggerType;
        job.emitter = input.emitter;
        job.topic0 = input.topic0;
        job.triggerValue = input.triggerValue;
        job.workflowId = input.workflowId;
        job.cooldownSeconds = input.cooldownSeconds;
        job.active = input.active;

        emit JobUpdated(jobId, input.triggerType, input.workflowId, input.active);
    }

    function setJobActive(uint256 jobId, bool active) external {
        Job storage job = _jobs[jobId];
        if (job.id == 0) {
            revert UnknownJob();
        }
        if (job.creator != msg.sender && msg.sender != owner()) {
            revert UnauthorizedJobUpdate();
        }

        job.active = active;
        emit JobUpdated(jobId, job.triggerType, job.workflowId, active);
    }

    function createAlertRule(AlertInput calldata input) external returns (uint256 alertId) {
        if (bytes(input.name).length == 0) {
            revert InvalidName();
        }

        alertId = nextAlertRuleId++;
        _alertRules[alertId] = AlertRule({
            id: alertId,
            creator: msg.sender,
            name: input.name,
            emitter: input.emitter,
            topic0: input.topic0,
            minValue: input.minValue,
            workflowId: input.workflowId,
            cooldownSeconds: input.cooldownSeconds,
            active: input.active,
            createdAt: uint64(block.timestamp),
            lastAlertAt: 0,
            triggerCount: 0
        });
        _alertRuleIds.push(alertId);

        emit AlertRuleCreated(alertId, msg.sender, input.workflowId, input.name);
    }

    function updateAlertRule(uint256 alertId, AlertInput calldata input) external {
        AlertRule storage alertRule = _alertRules[alertId];
        if (alertRule.id == 0) {
            revert UnknownAlertRule();
        }
        if (alertRule.creator != msg.sender && msg.sender != owner()) {
            revert UnauthorizedAlertUpdate();
        }
        if (bytes(input.name).length == 0) {
            revert InvalidName();
        }

        alertRule.name = input.name;
        alertRule.emitter = input.emitter;
        alertRule.topic0 = input.topic0;
        alertRule.minValue = input.minValue;
        alertRule.workflowId = input.workflowId;
        alertRule.cooldownSeconds = input.cooldownSeconds;
        alertRule.active = input.active;

        emit AlertRuleUpdated(alertId, input.workflowId, input.active);
    }

    function setAlertRuleActive(uint256 alertId, bool active) external {
        AlertRule storage alertRule = _alertRules[alertId];
        if (alertRule.id == 0) {
            revert UnknownAlertRule();
        }
        if (alertRule.creator != msg.sender && msg.sender != owner()) {
            revert UnauthorizedAlertUpdate();
        }
        alertRule.active = active;
        emit AlertRuleUpdated(alertId, alertRule.workflowId, active);
    }

    function recordJobExecution(
        uint256 jobId,
        bool success,
        uint64 executedAt
    )
        external
        onlyOperator
    {
        Job storage job = _jobs[jobId];
        if (job.id == 0) {
            revert UnknownJob();
        }

        job.lastExecutedAt = executedAt;
        if (success) {
            job.successCount += 1;
        } else {
            job.failureCount += 1;
        }
        emit JobExecutionRecorded(jobId, job.workflowId, success, executedAt);
    }

    function recordAlertTrigger(
        uint256 alertId,
        uint256 observedValue,
        uint64 triggeredAt
    )
        external
        onlyOperator
    {
        AlertRule storage alertRule = _alertRules[alertId];
        if (alertRule.id == 0) {
            revert UnknownAlertRule();
        }

        alertRule.lastAlertAt = triggeredAt;
        alertRule.triggerCount += 1;
        emit AlertTriggered(alertId, alertRule.workflowId, observedValue, triggeredAt);
    }

    function jobCount() external view returns (uint256) {
        return _jobIds.length;
    }

    function alertRuleCount() external view returns (uint256) {
        return _alertRuleIds.length;
    }

    function jobIdAt(uint256 index) external view returns (uint256) {
        return _jobIds[index];
    }

    function alertRuleIdAt(uint256 index) external view returns (uint256) {
        return _alertRuleIds[index];
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    function getAlertRule(uint256 alertId) external view returns (AlertRule memory) {
        return _alertRules[alertId];
    }

    function getJobs() external view returns (Job[] memory jobs) {
        uint256 count = _jobIds.length;
        jobs = new Job[](count);
        for (uint256 i = 0; i < count; i++) {
            jobs[i] = _jobs[_jobIds[i]];
        }
    }

    function getAlertRules() external view returns (AlertRule[] memory alertRules) {
        uint256 count = _alertRuleIds.length;
        alertRules = new AlertRule[](count);
        for (uint256 i = 0; i < count; i++) {
            alertRules[i] = _alertRules[_alertRuleIds[i]];
        }
    }
}
