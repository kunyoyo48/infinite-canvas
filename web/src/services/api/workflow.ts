import { requestEdit, requestGeneration } from "@/services/api/image";
import { encodeChannelModel, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import { composePrompt, renderTemplate } from "@/lib/workflow/template";
import { useWorkflowStore } from "@/stores/use-workflow-store";
import type { ReferenceImage } from "@/types/image";
import type { WorkflowField } from "@/types/workflow";

/**
 * 工作流运行。
 *
 * 对接事实（2026-11 实测 xnnapi.top）：
 * - 真实生图接口是 OpenAI 兼容面：POST {baseUrl}/images/generations 与 /images/edits
 * - 需求书里的 /api/generate 实际返回 404，不使用
 * - /v1/* 认 sk- 开头的 API key；/api/* 认网页登录态 access token，两者不通用
 * - 因此本模块直接复用画布的 requestGeneration / requestEdit，
 *   渠道 baseUrl 默认 https://www.xnnapi.top/v1，扣费落在该 key 所属账号，工作流零额外计费。
 *
 * 流程：表单值 + 模板 → 渲染 prompt → 组装 AiConfig → 调生图 → 结果存本地
 */

export type RunStage = "prepare" | "render" | "submit" | "upload";

export type RunResult = {
    images: string[];
    renderedPrompt: string;
    renderedNegative: string;
};

/** 工作流里的模型 ID 是平台裸名（gpt-image-2），画布配置里是「渠道::模型」 */
export function resolveModelValue(config: AiConfig, modelId: string) {
    const bare = modelId.includes("::") ? modelId.split("::").slice(1).join("::") : modelId;
    const channel = config.channels.find((item) => item.models.some((model) => model.name === bare));
    return channel ? encodeChannelModel(channel.id, bare) : bare;
}

/** 渠道里是否真的配了这个模型 */
export function isModelAvailable(config: AiConfig, modelId: string) {
    const bare = modelId.includes("::") ? modelId.split("::").slice(1).join("::") : modelId;
    return config.channels.some((item) => item.models.some((model) => model.name === bare));
}

/** 收集表单里的图片字段，转成参考图数组 */
async function collectReferences(fields: WorkflowField[], values: Record<string, string>): Promise<ReferenceImage[]> {
    const imageValues = fields
        .filter((field) => field.type === "image")
        .map((field) => values[field.key])
        .filter((value): value is string => Boolean(value));
    const references: ReferenceImage[] = [];
    for (const [index, value] of imageValues.entries()) {
        const dataUrl = await imageToDataUrl({ url: value, storageKey: value.startsWith("image:") ? value : undefined });
        if (!dataUrl) continue;
        references.push({ id: `ref-${index}`, name: `reference-${index}.png`, type: "image/png", dataUrl, storageKey: value.startsWith("image:") ? value : undefined, url: value.startsWith("image:") ? undefined : value });
    }
    return references;
}

export async function runWorkflow(params: {
    /** 只传 ID：完整记录（含提示词模板）在此处按需读取，页面层拿不到模板 */
    workflowId: string;
    modelId: string;
    values: Record<string, string>;
    onProgress?: (progress: number, stage: RunStage) => void;
    signal?: AbortSignal;
}): Promise<RunResult> {
    const { workflowId, modelId, values, onProgress, signal } = params;
    const workflow = useWorkflowStore.getState().workflows.find((item) => item.workflow_id === workflowId);
    if (!workflow) throw new Error("WORKFLOW_NOT_FOUND");
    const config = useConfigStore.getState().config;
    const fields = workflow.form_schema;

    onProgress?.(8, "prepare");
    const renderedPrompt = renderTemplate(workflow.prompt_template, values, fields).trim();
    const renderedNegative = renderTemplate(workflow.negative_prompt_template || "", values, fields).trim();
    if (!renderedPrompt) throw new Error("EMPTY_PROMPT");

    onProgress?.(18, "render");
    const references = await collectReferences(fields, values);
    const prompt = composePrompt(renderedPrompt, renderedNegative);

    // 单图走 generations，带参考图走 edits，与画布生图行为一致
    const requestConfig: AiConfig = { ...config, model: resolveModelValue(config, modelId), count: "1", systemPrompt: "" };

    onProgress?.(30, "submit");
    const images = references.length ? await requestEdit(requestConfig, prompt, references, { signal }) : await requestGeneration(requestConfig, prompt, { signal });

    onProgress?.(82, "upload");
    // 结果落本地存储，刷新或重开画布后图片不丢
    const stored: string[] = [];
    for (const image of images) {
        const uploaded = await uploadImage(image.dataUrl);
        stored.push(uploaded.storageKey || uploaded.url);
    }
    onProgress?.(100, "upload");

    return { images: stored, renderedPrompt, renderedNegative };
}
