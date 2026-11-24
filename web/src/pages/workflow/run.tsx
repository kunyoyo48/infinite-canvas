import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, App, Button, Progress, Select, Spin, Tooltip } from "antd";
import { ArrowLeft, Download, Heart, ImagePlus, Sparkles, Square } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WorkflowImagePreview } from "@/components/workflow/workflow-image-field";
import { WorkflowSchemaForm, initialWorkflowValues, validateWorkflowValues } from "@/components/workflow/workflow-schema-form";
import { isModelAvailable, runWorkflow, type RunStage } from "@/services/api/workflow";
import { fetchPlatformModels } from "@/services/api/platform-models";
import { toPublicWorkflow, useWorkflowStore, visibleWorkflows } from "@/stores/use-workflow-store";
import { useCanvasInsertStore } from "@/stores/use-canvas-insert-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { resolveImageUrl } from "@/services/image-storage";

/**
 * 页面 2：工作流运行页（普通用户视图）。
 * 只消费 PublicWorkflow 的字段：样图、简介、模型下拉、动态表单。
 * 这一层拿不到 prompt_template —— 模板只存在于 store 内部，渲染发生在 runWorkflow 里。
 */
export default function WorkflowRunPage() {
    const { workflowId = "" } = useParams();
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const uid = useUserStore((state) => state.user?.id) || "local-user";
    const workflows = useWorkflowStore((state) => state.workflows);
    const favorites = useWorkflowStore((state) => state.favorites);
    const toggleFavorite = useWorkflowStore((state) => state.toggleFavorite);
    const markRun = useWorkflowStore((state) => state.markRun);
    const queueToCanvas = useCanvasInsertStore((state) => state.queue);
    const config = useConfigStore((state) => state.config);

    // 只投影出公共字段：本组件的作用域里不存在 prompt_template / negative_prompt_template
    const workflow = useMemo(() => {
        const record = visibleWorkflows(workflows, uid).find((item) => item.workflow_id === workflowId);
        return record ? toPublicWorkflow(record) : null;
    }, [uid, workflowId, workflows]);

    /** 平台真实模型池：渠道里没手动登记但平台上有的模型也应可选 */
    const [platformModels, setPlatformModels] = useState<string[]>([]);
    useEffect(() => {
        let alive = true;
        void Promise.all(config.channels.filter((channel) => channel.apiFormat === "openai").map((channel) => fetchPlatformModels(channel))).then((lists) => {
            if (alive) setPlatformModels(Array.from(new Set(lists.flat())));
        });
        return () => {
            alive = false;
        };
    }, [config.channels]);

    /** 渠道本地配置过 或 平台模型池里存在，都算可用 */
    const available = (id: string) => isModelAvailable(config, id) || platformModels.includes(id);

    const [modelId, setModelId] = useState("");
    const [values, setValues] = useState<Record<string, string>>({});
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [stage, setStage] = useState<RunStage>("prepare");
    const [images, setImages] = useState<string[]>([]);
    const [error, setError] = useState("");
    const abortRef = useRef<AbortController | null>(null);

    // 工作流切换时重置表单
    useEffect(() => {
        if (!workflow) return;
        setValues(initialWorkflowValues(workflow.form_schema));
        setImages([]);
        setError("");
        setProgress(0);
        const allowed = workflow.allowed_model_ids.filter((id) => isModelAvailable(config, id) || platformModels.includes(id));
        setModelId(allowed.includes(workflow.recommend_model_id) ? workflow.recommend_model_id : allowed[0] || workflow.recommend_model_id);
        // 只在 workflow 变化时重置，config 变化不重置用户已填内容
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workflow?.workflow_id]);

    if (!workflow) {
        return (
            <main className="flex h-full items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-sm" style={{ color: theme.node.muted }}>
                        {t("workflow.notFound")}
                    </p>
                    <Button className="mt-4" onClick={() => navigate("/workflow")}>
                        {t("workflow.backToMarket")}
                    </Button>
                </div>
            </main>
        );
    }

    if (!workflow.is_public && workflow.author_uid !== uid) {
        return (
            <main className="flex h-full items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-sm" style={{ color: theme.node.muted }}>
                        {t("workflow.privateTip")}
                    </p>
                    <Button className="mt-4" onClick={() => navigate("/workflow")}>
                        {t("workflow.backToMarket")}
                    </Button>
                </div>
            </main>
        );
    }

    const modelOptions = workflow.allowed_model_ids.map((id) => ({ label: id, value: id, disabled: !available(id) }));
    const showDiffHint = modelId && modelId !== workflow.recommend_model_id;
    const isFavorite = favorites.includes(workflow.workflow_id);

    const submit = async () => {
        const invalid = validateWorkflowValues(workflow.form_schema, values, t);
        if (invalid) {
            message.warning(invalid);
            return;
        }
        setRunning(true);
        setError("");
        setImages([]);
        setProgress(0);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const result = await runWorkflow({
                workflowId: workflow.workflow_id,
                modelId,
                values,
                signal: controller.signal,
                onProgress: (next, nextStage) => {
                    setProgress(next);
                    setStage(nextStage);
                },
            });
            setImages(result.images);
            markRun(workflow.workflow_id);
        } catch (caught) {
            const reason = caught instanceof Error ? caught.message : "";
            if (reason === "EMPTY_PROMPT") setError(t("workflow.emptyPrompt"));
            else if (controller.signal.aborted) setError("");
            else setError(reason || t("workflow.runFailed"));
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    };

    const addToCanvas = async () => {
        if (!images.length) return;
        queueToCanvas(images.map((value, index) => ({ value, title: `${workflow.title}${images.length > 1 ? ` #${index + 1}` : ""}` })));
        // 画布页挂载后消费待插入队列（mode=new 会自动新建并进入项目）
        navigate("/canvas?mode=new");
    };

    return (
        <main className="h-full overflow-auto bg-background">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-6">
                <div className="flex items-center justify-between">
                    <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/workflow")}>
                        {t("workflow.backToMarket")}
                    </Button>
                    <Button type="text" icon={<Heart className={isFavorite ? "size-4 fill-rose-400 text-rose-400" : "size-4"} />} onClick={() => toggleFavorite(workflow.workflow_id)}>
                        {t("workflow.favoritesCount", { count: workflow.favorite_count })}
                    </Button>
                </div>

                <div className="overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <WorkflowImagePreview value={workflow.preview_image} className="aspect-[16/9] w-full object-cover" alt={workflow.title} />
                    <div className="flex flex-col gap-2 p-4">
                        <h1 className="text-lg font-semibold" style={{ color: theme.node.text }}>
                            {workflow.title}
                        </h1>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: theme.node.muted }}>
                            {workflow.description}
                        </p>
                        <div className="flex items-center gap-3 text-[11px]" style={{ color: theme.node.faint }}>
                            <span>{workflow.author_name}</span>
                            <span>{t("workflow.versionTag", { version: workflow.version })}</span>
                            <span>{t("workflow.runsCount", { count: workflow.run_count })}</span>
                        </div>
                    </div>
                </div>

                <section className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <p className="text-xs" style={{ color: theme.node.muted }}>
                        💡 {t("workflow.pickerModelHint", { model: workflow.recommend_model_id })}
                    </p>
                    <Select className="w-full" value={modelId || undefined} options={modelOptions} onChange={(next) => setModelId(String(next))} disabled={running} />
                    {modelOptions.every((option) => option.disabled) ? <Alert type="warning" showIcon message={t("workflow.noModelAvailable")} /> : null}
                    {showDiffHint ? (
                        <p className="text-[11px]" style={{ color: theme.node.faint }}>
                            {t("workflow.pickerModelWarning")}
                        </p>
                    ) : null}
                </section>

                <section className="flex flex-col gap-4 rounded-xl border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    <WorkflowSchemaForm fields={workflow.form_schema} values={values} onChange={(key, next) => setValues((prev) => ({ ...prev, [key]: next }))} />
                </section>

                {running ? (
                    <section className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <Progress percent={progress} status="active" showInfo={false} />
                        <div className="flex items-center justify-between text-xs" style={{ color: theme.node.muted }}>
                            <span>
                                {t(stage === "prepare" ? "workflow.stagePrepare" : stage === "render" ? "workflow.stageRender" : stage === "submit" ? "workflow.stageSubmit" : "workflow.stageUpload")}
                            </span>
                            <Button size="small" type="text" icon={<Square className="size-3" />} onClick={() => abortRef.current?.abort()}>
                                {t("workflow.cancelGenerate")}
                            </Button>
                        </div>
                    </section>
                ) : null}

                {error ? <Alert type="error" showIcon message={error} /> : null}

                {images.length ? (
                    <section className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                        <p className="text-sm font-medium" style={{ color: theme.node.text }}>
                            {t("workflow.resultTitle")}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {images.map((value, index) => (
                                <WorkflowResultImage key={`${value}-${index}`} value={value} />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button type="primary" icon={<ImagePlus className="size-4" />} onClick={() => void addToCanvas()}>
                                {t("workflow.addToCanvas")}
                            </Button>
                            <Button icon={<Sparkles className="size-4" />} disabled={running} onClick={() => void submit()}>
                                {t("workflow.regenerate")}
                            </Button>
                        </div>
                    </section>
                ) : null}

                {!running && !images.length ? (
                    <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} onClick={() => void submit()} disabled={modelOptions.every((option) => option.disabled)}>
                        {t("workflow.startGenerate")}
                    </Button>
                ) : null}

                {running && !images.length ? (
                    <Button size="large" block disabled>
                        <Spin size="small" className="mr-2" />
                        {t("workflow.generating")}
                    </Button>
                ) : null}
            </div>
        </main>
    );
}

function WorkflowResultImage({ value }: { value: string }) {
    const { t } = useTranslation();
    const [url, setUrl] = useState("");

    useEffect(() => {
        let alive = true;
        void (value.startsWith("image:") ? resolveImageUrl(value, "") : Promise.resolve(value)).then((next) => {
            if (alive) setUrl(next);
        });
        return () => {
            alive = false;
        };
    }, [value]);

    if (!url) return <div className="aspect-square w-full animate-pulse rounded-lg bg-black/5 dark:bg-white/5" />;

    return (
        <Tooltip title={t("workflow.download")}>
            <a href={url} download className="group relative block overflow-hidden rounded-lg">
                <img src={url} alt="" className="w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Download className="size-5 text-white" />
                </span>
            </a>
        </Tooltip>
    );
}
