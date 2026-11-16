import { create } from "zustand";

// Agent-triggered generations wait here for the user to confirm the model, ratio, and other options.
// The Agent panel only enqueues a request; the browser keeps it until the user confirms, then runs the generation.

export type AgentGenerationKind = "image" | "video";

export type AgentGenerationOptions = {
    model: string;
    ratio: string;
    resolution: string;
    quality: string;
    count: string;
    seconds: string;
    mode: "frames" | "reference";
};

export type AgentGenerationRequest = {
    id: string;
    kind: AgentGenerationKind;
    prompt: string;
    options: AgentGenerationOptions;
    onConfirm: (options: AgentGenerationOptions) => void;
    onCancel?: () => void;
};

type AgentGenerationStore = {
    requests: AgentGenerationRequest[];
    enqueue: (request: Omit<AgentGenerationRequest, "id">) => void;
    confirm: (id: string, options: AgentGenerationOptions) => void;
    cancel: (id: string) => void;
};

let requestId = 0;

export const useAgentGenerationStore = create<AgentGenerationStore>((set, get) => ({
    requests: [],
    enqueue: (request) => {
        requestId += 1;
        set((state) => ({ requests: [...state.requests, { ...request, id: `agent-generation-${requestId}` }] }));
    },
    confirm: (id, options) => {
        const [current, ...rest] = get().requests;
        if (!current || current.id !== id) return;
        set({ requests: rest });
        current.onConfirm(options);
    },
    cancel: (id) => {
        const [current, ...rest] = get().requests;
        if (!current || current.id !== id) return;
        set({ requests: rest });
        current.onCancel?.();
    },
}));
