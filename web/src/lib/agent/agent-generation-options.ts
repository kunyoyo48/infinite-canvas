import { clampVideoSeconds, computeMediaSize, computeVideoSize, inferMediaRatio, inferMediaScale, inferVideoRatio, parseVideoResolution } from "@/lib/media-size";
import { normalizeVideoModeValue } from "@/components/video-settings-panel";
import type { CanvasAgentOp } from "@/lib/canvas/canvas-agent-ops";
import type { AgentGenerationOptions } from "@/stores/use-agent-generation-store";
import { normalizeModelOptionValue, resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "@/types/canvas";

// Agent-triggered generations always go through the options dialog. These helpers turn the current
// config or canvas node metadata into dialog defaults, then back into workbench config or node metadata.

export function agentImageOptions(input: { config: AiConfig; model?: string; size?: string; quality?: string; count?: string }): AgentGenerationOptions {
    const size = input.size?.trim() || input.config.size;
    const count = Math.max(1, Math.min(5000, Math.floor(Number(input.count) || 1)));
    return {
        model: resolveModelForCapability(input.config, normalizeModelOptionValue(input.model, input.config.channels), "image"),
        ratio: inferMediaRatio(size),
        resolution: inferMediaScale(size),
        quality: input.quality?.trim() || input.config.quality || "auto",
        count: String(count),
        seconds: input.config.videoSeconds || "6",
        mode: normalizeVideoModeValue(input.config.videoMode),
    };
}

export function agentVideoOptions(input: { config: AiConfig; model?: string; size?: string; resolution?: string; seconds?: string; mode?: string }): AgentGenerationOptions {
    const size = input.size?.trim() || input.config.size;
    return {
        model: resolveModelForCapability(input.config, normalizeModelOptionValue(input.model, input.config.channels), "video"),
        ratio: inferVideoRatio(size),
        resolution: parseVideoResolution(input.resolution || input.config.vquality),
        quality: input.config.quality || "auto",
        count: "1",
        seconds: clampVideoSeconds(input.seconds || input.config.videoSeconds),
        mode: normalizeVideoModeValue(input.mode || input.config.videoMode),
    };
}

export function agentImageMetadata(options: AgentGenerationOptions): Partial<CanvasNodeMetadata> {
    return { model: options.model, size: computeMediaSize(options.resolution, options.ratio), quality: options.quality, count: Number(options.count) || 1 };
}

export function agentVideoMetadata(options: AgentGenerationOptions): Partial<CanvasNodeMetadata> {
    return { model: options.model, size: computeVideoSize(options.resolution, options.ratio), vquality: options.resolution, seconds: options.seconds, videoMode: options.mode };
}

/** Resolve the generation mode the same way the canvas bridge does, so Agent replies match the dialog. */
export function agentGenerationMode(op: Extract<CanvasAgentOp, { type: "run_generation" }>, nodes: CanvasNodeData[]): CanvasGenerationMode {
    const target = nodes.find((node) => node.id === op.nodeId);
    if (op.mode) return op.mode;
    if (target?.metadata?.generationMode) return target.metadata.generationMode;
    if (target?.type === CanvasNodeType.Video) return "video";
    if (target?.type === CanvasNodeType.Audio) return "audio";
    if (target?.type === CanvasNodeType.Text) return "text";
    return "image";
}

/** Whether applying these ops opens an image/video confirmation dialog. */
export function hasAgentGenerationOptions(ops: CanvasAgentOp[], nodes: CanvasNodeData[]) {
    return ops.some((op) => {
        if (op?.type !== "run_generation") return false;
        const mode = agentGenerationMode(op, nodes);
        return mode === "image" || mode === "video";
    });
}
