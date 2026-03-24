// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract WorkflowOrchestrator is Ownable, ReentrancyGuard {
    struct Workflow {
        uint256 id;
        address creator;
        string name;
        bool active;
        uint64 createdAt;
        uint64 runCount;
        uint64 successCount;
        uint64 failureCount;
        uint256 stepCount;
    }

    struct WorkflowStep {
        address target;
        uint256 value;
        bytes data;
        bool allowFailure;
        string label;
    }

    struct WorkflowStepInput {
        address target;
        uint256 value;
        bytes data;
        bool allowFailure;
        string label;
    }

    struct WorkflowRun {
        uint256 id;
        uint256 workflowId;
        address executor;
        bytes32 contextHash;
        bool success;
        uint256 failedStepIndex;
        uint64 executedAt;
    }

    error NotAuthorizedExecutor();
    error UnknownWorkflow();
    error EmptyWorkflowSteps();
    error WorkflowInactive();
    error InvalidTarget();
    error InsufficientExecutionValue(uint256 provided, uint256 required);
    error UnauthorizedWorkflowUpdate();

    event ExecutorUpdated(address indexed executor, bool indexed enabled);
    event WorkflowCreated(
        uint256 indexed workflowId,
        address indexed creator,
        string name,
        uint256 stepCount
    );
    event WorkflowStatusUpdated(uint256 indexed workflowId, bool active);
    event WorkflowStepExecuted(
        uint256 indexed runId,
        uint256 indexed workflowId,
        uint256 indexed stepIndex,
        address target,
        bool success,
        bytes returnData
    );
    event WorkflowExecuted(
        uint256 indexed runId,
        uint256 indexed workflowId,
        address indexed executor,
        bool success,
        uint256 failedStepIndex,
        bytes32 contextHash
    );

    uint256 public nextWorkflowId = 1;
    uint256 public nextRunId = 1;

    mapping(address => bool) public executors;

    mapping(uint256 => Workflow) private _workflows;
    mapping(uint256 => WorkflowStep[]) private _workflowSteps;
    mapping(uint256 => WorkflowRun) private _runs;
    uint256[] private _workflowIds;
    uint256[] private _runIds;

    modifier onlyAuthorizedExecutor() {
        if (!executors[msg.sender] && msg.sender != owner()) {
            revert NotAuthorizedExecutor();
        }
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        executors[initialOwner] = true;
        emit ExecutorUpdated(initialOwner, true);
    }

    receive() external payable { }

    function setExecutor(address executor, bool enabled) external onlyOwner {
        executors[executor] = enabled;
        emit ExecutorUpdated(executor, enabled);
    }

    function createWorkflow(
        string calldata name,
        WorkflowStepInput[] calldata steps
    )
        external
        returns (uint256 workflowId)
    {
        if (steps.length == 0) {
            revert EmptyWorkflowSteps();
        }

        workflowId = nextWorkflowId++;
        Workflow storage workflow = _workflows[workflowId];
        workflow.id = workflowId;
        workflow.creator = msg.sender;
        workflow.name = name;
        workflow.active = true;
        workflow.createdAt = uint64(block.timestamp);
        workflow.stepCount = steps.length;

        for (uint256 i = 0; i < steps.length; i++) {
            if (steps[i].target == address(0)) {
                revert InvalidTarget();
            }
            _workflowSteps[workflowId].push(
                WorkflowStep({
                    target: steps[i].target,
                    value: steps[i].value,
                    data: steps[i].data,
                    allowFailure: steps[i].allowFailure,
                    label: steps[i].label
                })
            );
        }

        _workflowIds.push(workflowId);
        emit WorkflowCreated(workflowId, msg.sender, name, steps.length);
    }

    function setWorkflowActive(uint256 workflowId, bool active) external {
        Workflow storage workflow = _workflows[workflowId];
        if (workflow.id == 0) {
            revert UnknownWorkflow();
        }
        if (workflow.creator != msg.sender && msg.sender != owner()) {
            revert UnauthorizedWorkflowUpdate();
        }

        workflow.active = active;
        emit WorkflowStatusUpdated(workflowId, active);
    }

    function executeWorkflow(
        uint256 workflowId,
        bytes32 contextHash
    )
        external
        payable
        nonReentrant
        onlyAuthorizedExecutor
        returns (uint256 runId, bool overallSuccess)
    {
        Workflow storage workflow = _workflows[workflowId];
        if (workflow.id == 0) {
            revert UnknownWorkflow();
        }
        if (!workflow.active) {
            revert WorkflowInactive();
        }

        WorkflowStep[] storage steps = _workflowSteps[workflowId];
        uint256 requiredValue = 0;
        for (uint256 i = 0; i < steps.length; i++) {
            requiredValue += steps[i].value;
        }
        if (msg.value < requiredValue) {
            revert InsufficientExecutionValue(msg.value, requiredValue);
        }

        overallSuccess = true;
        uint256 failedStepIndex = type(uint256).max;

        runId = nextRunId++;
        for (uint256 i = 0; i < steps.length; i++) {
            WorkflowStep storage step = steps[i];
            (bool success, bytes memory returnData) =
                step.target.call{ value: step.value }(step.data);

            emit WorkflowStepExecuted(runId, workflowId, i, step.target, success, returnData);

            if (!success && !step.allowFailure) {
                overallSuccess = false;
                failedStepIndex = i;
                break;
            }
        }

        workflow.runCount += 1;
        if (overallSuccess) {
            workflow.successCount += 1;
        } else {
            workflow.failureCount += 1;
        }

        _runs[runId] = WorkflowRun({
            id: runId,
            workflowId: workflowId,
            executor: msg.sender,
            contextHash: contextHash,
            success: overallSuccess,
            failedStepIndex: failedStepIndex,
            executedAt: uint64(block.timestamp)
        });
        _runIds.push(runId);

        emit WorkflowExecuted(
            runId,
            workflowId,
            msg.sender,
            overallSuccess,
            failedStepIndex,
            contextHash
        );

        if (msg.value > requiredValue) {
            (bool refunded,) = payable(msg.sender).call{ value: msg.value - requiredValue }("");
            require(refunded, "REFUND_FAILED");
        }
    }

    function workflowCount() external view returns (uint256) {
        return _workflowIds.length;
    }

    function runCount() external view returns (uint256) {
        return _runIds.length;
    }

    function workflowIdAt(uint256 index) external view returns (uint256) {
        return _workflowIds[index];
    }

    function runIdAt(uint256 index) external view returns (uint256) {
        return _runIds[index];
    }

    function getWorkflow(uint256 workflowId) external view returns (Workflow memory) {
        return _workflows[workflowId];
    }

    function getWorkflowSteps(uint256 workflowId) external view returns (WorkflowStep[] memory) {
        return _workflowSteps[workflowId];
    }

    function getWorkflows() external view returns (Workflow[] memory workflows) {
        uint256 count = _workflowIds.length;
        workflows = new Workflow[](count);
        for (uint256 i = 0; i < count; i++) {
            workflows[i] = _workflows[_workflowIds[i]];
        }
    }

    function getRun(uint256 runId) external view returns (WorkflowRun memory) {
        return _runs[runId];
    }

    function getRuns() external view returns (WorkflowRun[] memory runs) {
        uint256 count = _runIds.length;
        runs = new WorkflowRun[](count);
        for (uint256 i = 0; i < count; i++) {
            runs[i] = _runs[_runIds[i]];
        }
    }
}
