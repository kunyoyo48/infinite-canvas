import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeData, CanvasNodeImage, CanvasNodeMetadata, CanvasNodeStatus } from "@/types/canvas";

export type CanvasImageBatchPrimary = { item: CanvasNodeImage; width: number; height: number };

export type CanvasImageBatchState = {
    projectId: string;
    rootNodeId: string;
    originNodeId: string;
    originIsConfig: boolean;
    images: CanvasNodeImage[];
    primary?: CanvasImageBatchPrimary;
    status: CanvasNodeStatus;
    errorDetails?: string;
};

export type CanvasImageBatchJob = {
    state: CanvasImageBatchState;
    rootNode: CanvasNodeData;
    controller: AbortController;
    finished: boolean;
};

type CanvasImageBatchListener = (state: CanvasImageBatchState) => void;

const jobs = new Map<string, CanvasImageBatchJob>();
const projectListeners = new Map<string, Set<CanvasImageBatchListener>>();

const jobKey = (projectId: string, rootNodeId: string) => `${projectId}:${rootNodeId}`;

function applyNodeState(node: CanvasNodeData, state: CanvasImageBatchState) {
    const metadata: CanvasNodeMetadata = {
        ...node.metadata,
        images: state.images,
        status: state.status,
        errorDetails: state.errorDetails,
    };
    // Only place the first success; later slots and the user's own primary choice must keep the current frame.
    if (!state.primary || node.metadata?.primaryImageId) return { ...node, metadata };
    const { item, width, height } = state.primary;
    const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
    return {
        ...node,
        position: { x: center.x - width / 2, y: center.y - height / 2 },
        width,
        height,
        metadata: {
            ...metadata,
            content: item.content,
            storageKey: item.storageKey,
            naturalWidth: item.naturalWidth,
            naturalHeight: item.naturalHeight,
            bytes: item.bytes,
            mimeType: item.mimeType,
            primaryImageId: item.id,
        },
    };
}

/** Merge a live batch state into the current nodes, so edits made while it runs are kept. */
export function applyCanvasImageBatchState(nodes: CanvasNodeData[], state: CanvasImageBatchState) {
    return nodes.map((node) => {
        if (node.id === state.rootNodeId) return applyNodeState(node, state);
        if (state.originIsConfig && node.id === state.originNodeId && node.id !== state.rootNodeId) {
            return { ...node, metadata: { ...node.metadata, status: state.status, errorDetails: state.errorDetails } };
        }
        return node;
    });
}

function removeJob(projectId: string, rootNodeId: string) {
    jobs.delete(jobKey(projectId, rootNodeId));
}

/** Ensure the root node is already persisted before any slot result needs a place to go. */
function persistStart(projectId: string, rootNode: CanvasNodeData) {
    const store = useCanvasStore.getState();
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return;
    const nodes = project.nodes.some((node) => node.id === rootNode.id) ? project.nodes.map((node) => (node.id === rootNode.id ? rootNode : node)) : [...project.nodes, rootNode];
    store.updateProject(projectId, { nodes });
}

function emit(job: CanvasImageBatchJob) {
    const { state } = job;
    const store = useCanvasStore.getState();
    const project = store.projects.find((item) => item.id === state.projectId);
    // A deleted project or node means the user gave up on this batch; stop instead of resurrecting it.
    if (!project || !project.nodes.some((node) => node.id === state.rootNodeId)) {
        job.controller.abort();
        removeJob(state.projectId, state.rootNodeId);
        return false;
    }
    const listeners = projectListeners.get(state.projectId);
    if (listeners?.size) {
        listeners.forEach((listener) => listener(state));
        return true;
    }
    // The page is gone; write the batch straight to storage so its results survive navigation.
    store.updateProject(state.projectId, { nodes: applyCanvasImageBatchState(project.nodes, state) });
    return true;
}

/**
 * Keep a running batch outside React so navigating away does not drop its results.
 * The job owns only slot progress and the first result's placement; every mirror applies
 * that state to the current node, so dragging or editing the node is never reverted.
 */
export function startCanvasImageBatch(projectId: string, rootNode: CanvasNodeData, originNodeId: string, originIsConfig: boolean, controller: AbortController) {
    const job: CanvasImageBatchJob = {
        rootNode,
        controller,
        finished: false,
        state: { projectId, rootNodeId: rootNode.id, originNodeId, originIsConfig, images: rootNode.metadata?.images || [], status: (rootNode.metadata?.status as CanvasNodeStatus) || "loading" },
    };
    jobs.set(jobKey(projectId, rootNode.id), job);
    persistStart(projectId, rootNode);
    const isCurrent = () => jobs.get(jobKey(projectId, rootNode.id)) === job;
    return {
        state: () => job.state,
        succeed(imageId: string, item: CanvasNodeImage, size: { width: number; height: number }) {
            if (!isCurrent()) return;
            job.state = {
                ...job.state,
                images: job.state.images.map((image) => (image.id === imageId ? item : image)),
                ...(job.state.primary ? {} : { primary: { item, width: size.width, height: size.height } }),
            };
            emit(job);
        },
        fail(imageId: string, errorDetails: string) {
            if (!isCurrent()) return;
            job.state = { ...job.state, images: job.state.images.map((image) => (image.id === imageId ? { ...image, status: "error" as const, errorDetails } : image)) };
            emit(job);
        },
        finish(status: CanvasNodeStatus, errorDetails?: string) {
            if (!isCurrent()) return;
            job.state = { ...job.state, status, errorDetails };
            job.finished = true;
            // A mounted page has applied the terminal state; otherwise keep the job for the next replay.
            if (emit(job) && projectListeners.get(projectId)?.size) removeJob(projectId, job.state.rootNodeId);
        },
        cancel() {
            if (isCurrent()) removeJob(projectId, job.state.rootNodeId);
        },
    };
}

export function activeCanvasImageBatches(projectId: string) {
    return Array.from(jobs.values()).filter((job) => job.state.projectId === projectId);
}

export function restoreCanvasImageBatches(projectId: string, nodes: CanvasNodeData[]) {
    return activeCanvasImageBatches(projectId).reduce((current, job) => {
        const hasRoot = current.some((node) => node.id === job.state.rootNodeId);
        return applyCanvasImageBatchState(hasRoot ? current : [...current, job.rootNode], job.state);
    }, nodes);
}

/** Replays active jobs on mount, then keeps mirroring their later slot updates. */
export function subscribeCanvasImageBatches(projectId: string, listener: CanvasImageBatchListener) {
    const listeners = projectListeners.get(projectId) ?? new Set<CanvasImageBatchListener>();
    projectListeners.set(projectId, listeners);
    listeners.add(listener);
    activeCanvasImageBatches(projectId).forEach((job) => {
        listener(job.state);
        if (job.finished) removeJob(projectId, job.state.rootNodeId);
    });
    return () => {
        listeners.delete(listener);
        if (!listeners.size) projectListeners.delete(projectId);
    };
}
