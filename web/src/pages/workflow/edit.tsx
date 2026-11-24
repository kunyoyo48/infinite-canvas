import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, App, Button, Input, InputNumber, Select, Switch, Tag, Tooltip } from "antd";
import { ArrowLeft, ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WorkflowImageField } from "@/components/workflow/workflow-image-field";
import { useWorkflowStore } from "@/stores/use-workflow-store";
import { useUserStore } from "@/stores/use-user-store";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { extractTemplateVars, renderTemplate } from "@/lib/workflow/template";
import { WORKFLOW_CATEGORIES, type WorkflowField, type WorkflowFieldType, type WorkflowRecord } from "@/types/workflow";

const RESERVED_KEYS = ["model_id", "uid", "run_id", "workflow_id"];

/** 页面 3：工作流编辑器（作者专属）。四个分区：基础信息 / 模型配置 / 表单配置 / 提示词模板。 */
export default function WorkflowEditPage() {
    const { workflowId } = useParams();
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const uid = useUserStore((state) => state.user?.id) || "local-user";
    const workflows = useWorkflowStore((state) => state.workflows);
    const createWorkflow = useWorkflowStore((state) => state.createWorkflow);
    const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
    const config = useConfigStore((state) => state.config);

    const existing = workflowId ? workflows.find((item) => item.workflow_id === workflowId) : undefined;
    const [draft, setDraft] = useState<WorkflowRecord | null>(existing || null);
    const [dirty, setDirty] = useState(false);

    // 新建：先落一条草稿再编辑，避免编辑器里出现空 ID
    useEffect(() => {
        if (existing || workflowId) return;
        const id = createWorkflow();
        setDraft(useWorkflowStore.getState().workflows.find((item) => item.workflow_id === id) || null);
        navigate(`/workflow/edit/${id}`, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (existing) setDraft(existing);
    }, [existing]);

    /** 可选模型：来自渠道已配置的生图模型 */
    const imageModels = useMemo(() => Array.from(new Set(config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === "image").map((model) => model.name)))), [config.channels]);

    const patch = (next: Partial<WorkflowRecord>) => {
        setDraft((prev) => (prev ? { ...prev, ...next } : prev));
        setDirty(true);
    };

    if (!draft) {
        return (
            <main className="flex h-full items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-sm" style={{ color: theme.node.muted }}>
                        {t("workflow.notFound")}
                    </p>
                    <Button className="mt-4" onClick={() => navigate("/workflow/my")}>
                        {t("workflow.backToMy")}
                    </Button>
                </div>
            </main>
        );
    }

    if (draft.author_uid !== uid) {
        return (
            <main className="flex h-full items-center justify-center bg-background">
                <div className="text-center">
                    <p className="text-sm" style={{ color: theme.node.muted }}>
                        {t("workflow.privateTip")}
                    </p>
                    <Button className="mt-4" onClick={() => navigate("/workflow/my")}>
                        {t("workflow.backToMy")}
                    </Button>
                </div>
            </main>
        );
    }

    const templateVars = draft.form_schema.map((field) => field.key);
    const unknownVars = extractTemplateVars(`${draft.prompt_template}\n${draft.negative_prompt_template}`).filter((key) => !templateVars.includes(key));
    const previewValues = Object.fromEntries(draft.form_schema.map((field) => [field.key, field.default || `<${field.label}>`]));
    const previewPrompt = renderTemplate(draft.prompt_template, previewValues, draft.form_schema);

    const save = (publish: boolean) => {
        if (!draft.title.trim()) return message.warning(t("workflow.saveFirst"));
        if (!draft.preview_image) return message.warning(t("workflow.previewRequired"));
        if (!draft.prompt_template.trim()) return message.warning(t("workflow.templateRequired"));
        if (!draft.allowed_model_ids.includes(draft.recommend_model_id)) return message.warning(t("workflow.recommendMustBeAllowed"));
        saveWorkflow(draft, publish);
        setDirty(false);
        message.success(publish ? t("workflow.published") : t("workflow.savedDraft"));
    };

    return (
        <main className="h-full overflow-auto bg-background">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-6 py-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/workflow/my")}>
                            {t("workflow.backToMy")}
                        </Button>
                        <h1 className="text-lg font-semibold" style={{ color: theme.node.text }}>
                            {workflowId ? t("workflow.editorTitleEdit") : t("workflow.editorTitleNew")}
                        </h1>
                        <Tag>{t("workflow.versionTag", { version: draft.version })}</Tag>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => save(false)}>{t("workflow.saveDraft")}</Button>
                        <Button type="primary" onClick={() => save(true)}>
                            {t("workflow.publish")}
                        </Button>
                    </div>
                </header>

                {dirty ? <Alert type="info" showIcon message={t("workflow.leaveConfirm")} /> : null}

                {/* ① 基础信息 */}
                <Section title={t("workflow.editorBasic")} theme={theme}>
                    <Field label={t("workflow.fieldTitle")} required>
                        <Input value={draft.title} maxLength={120} placeholder={t("workflow.fieldTitlePlaceholder")} onChange={(event) => patch({ title: event.target.value })} />
                    </Field>
                    <Field label={t("workflow.fieldDescription")}>
                        <Input.TextArea value={draft.description} autoSize={{ minRows: 3, maxRows: 8 }} placeholder={t("workflow.fieldDescriptionPlaceholder")} onChange={(event) => patch({ description: event.target.value })} />
                    </Field>
                    <Field label={t("workflow.fieldPreview")} hint={t("workflow.fieldPreviewHint")} required>
                        <WorkflowImageField value={draft.preview_image} onChange={(next) => patch({ preview_image: next })} aspect="wide" />
                    </Field>
                    <Field label={t("workflow.fieldCategory")}>
                        <Select className="w-full" value={draft.category} options={WORKFLOW_CATEGORIES.map((item) => ({ label: item.name, value: item.code }))} onChange={(next) => patch({ category: String(next) })} />
                    </Field>
                    <Field label={t("workflow.fieldPublic")} hint={t("workflow.fieldPublicHint")}>
                        <Switch checked={draft.is_public} onChange={(next) => patch({ is_public: next })} />
                    </Field>
                </Section>

                {/* ② 模型配置 */}
                <Section title={t("workflow.editorModel")} theme={theme}>
                    <Field label={t("workflow.fieldRecommendModel")} hint={t("workflow.fieldRecommendHint")} required>
                        <Select
                            className="w-full"
                            value={draft.recommend_model_id || undefined}
                            options={imageModels.map((model) => ({ label: model, value: model }))}
                            onChange={(next) => {
                                const model = String(next);
                                patch({ recommend_model_id: model, allowed_model_ids: Array.from(new Set([...draft.allowed_model_ids, model])) });
                            }}
                        />
                    </Field>
                    <Field label={t("workflow.fieldAllowedModels")} hint={t("workflow.fieldAllowedHint")}>
                        <Select
                            mode="multiple"
                            className="w-full"
                            value={draft.allowed_model_ids}
                            options={imageModels.map((model) => ({ label: model, value: model }))}
                            onChange={(next) => patch({ allowed_model_ids: next.map(String) })}
                        />
                    </Field>
                </Section>

                {/* ③ 表单配置 */}
                <Section title={t("workflow.editorForm")} theme={theme}>
                    <div className="flex flex-col gap-2">
                        {draft.form_schema.map((field, index) => (
                            <FormFieldRow
                                key={field.key}
                                index={index}
                                field={field}
                                fields={draft.form_schema}
                                theme={theme}
                                onChange={(next) => patch({ form_schema: draft.form_schema.map((item, itemIndex) => (itemIndex === index ? next : item)) })}
                                onRemove={() => patch({ form_schema: draft.form_schema.filter((_, itemIndex) => itemIndex !== index) })}
                                onMove={(offset) => {
                                    const target = index + offset;
                                    if (target < 0 || target >= draft.form_schema.length) return;
                                    const next = [...draft.form_schema];
                                    [next[index], next[target]] = [next[target], next[index]];
                                    patch({ form_schema: next });
                                }}
                            />
                        ))}
                        <Button icon={<Plus className="size-4" />} onClick={() => patch({ form_schema: [...draft.form_schema, { key: `field${draft.form_schema.length + 1}`, label: t("workflow.fieldLabel"), type: "text", required: false, default: "" }] })}>
                            {t("workflow.addField")}
                        </Button>
                    </div>
                </Section>

                {/* ④ 提示词模板 */}
                <Section title={t("workflow.editorPrompt")} theme={theme}>
                    <Field label={t("workflow.templatePrompt")} hint={t("workflow.templateHint")} required>
                        <Input.TextArea value={draft.prompt_template} autoSize={{ minRows: 5, maxRows: 16 }} className="font-mono text-xs" onChange={(event) => patch({ prompt_template: event.target.value })} />
                    </Field>
                    <Field label={t("workflow.templateNegative")}>
                        <Input.TextArea value={draft.negative_prompt_template} autoSize={{ minRows: 2, maxRows: 8 }} className="font-mono text-xs" onChange={(event) => patch({ negative_prompt_template: event.target.value })} />
                    </Field>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px]" style={{ color: theme.node.faint }}>
                            {t("workflow.templateVars")}：
                        </span>
                        {templateVars.length ? (
                            templateVars.map((key) => (
                                <Tag
                                    key={key}
                                    className="cursor-pointer"
                                    onClick={() => patch({ prompt_template: `${draft.prompt_template}{{ ${key} }}` })}
                                >
                                    {`{{ ${key} }}`}
                                </Tag>
                            ))
                        ) : (
                            <span className="text-[11px]" style={{ color: theme.node.faint }}>
                                —
                            </span>
                        )}
                    </div>
                    {unknownVars.length ? <Alert type="warning" showIcon message={t("workflow.templateUnknownVars", { vars: unknownVars.join(", ") })} /> : null}
                    <Field label={t("workflow.templatePreview")}>
                        <pre className="max-h-40 overflow-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed" style={{ background: theme.node.fill, color: theme.node.muted }}>
                            {previewPrompt || "—"}
                        </pre>
                    </Field>
                </Section>

                <div className="flex justify-end gap-2 pb-6">
                    <Button onClick={() => navigate("/workflow/my")}>{t("common.cancel")}</Button>
                    <Button onClick={() => save(false)}>{t("workflow.saveDraft")}</Button>
                    <Button type="primary" onClick={() => save(true)}>
                        {t("workflow.publish")}
                    </Button>
                </div>
            </div>
        </main>
    );
}

function Section({ title, theme, children }: { title: string; theme: CanvasTheme; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <h2 className="text-sm font-medium" style={{ color: theme.node.text }}>
                {title}
            </h2>
            {children}
        </section>
    );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs text-stone-500 dark:text-stone-400">
                {label}
                {required ? <span className="ml-1 text-red-500">*</span> : null}
            </label>
            {children}
            {hint ? <span className="text-[11px] text-stone-400 dark:text-stone-500">{hint}</span> : null}
        </div>
    );
}

/** 单条表单配置：key / label / type / required / options + 排序删除 */
function FormFieldRow({
    field,
    index,
    fields,
    theme,
    onChange,
    onRemove,
    onMove,
}: {
    field: WorkflowField;
    index: number;
    fields: WorkflowField[];
    theme: CanvasTheme;
    onChange: (next: WorkflowField) => void;
    onRemove: () => void;
    onMove: (offset: number) => void;
}) {
    const { t } = useTranslation();
    const duplicated = fields.filter((item) => item.key === field.key).length > 1;
    const invalid = !/^[a-zA-Z_][a-zA-Z0-9_]{0,31}$/.test(field.key) || duplicated || RESERVED_KEYS.includes(field.key);

    return (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: invalid ? "#ef4444" : theme.node.stroke }}>
            <div className="flex items-center gap-2">
                <GripVertical className="size-3.5 shrink-0" style={{ color: theme.node.faint }} />
                <Input size="small" className="!w-40 font-mono" value={field.key} placeholder="key" onChange={(event) => onChange({ ...field, key: event.target.value })} />
                <Input size="small" className="!w-40" value={field.label} placeholder={t("workflow.fieldLabel")} onChange={(event) => onChange({ ...field, label: event.target.value })} />
                <Select
                    size="small"
                    className="!w-32"
                    value={field.type}
                    options={[
                        { label: t("workflow.typeImage"), value: "image" },
                        { label: t("workflow.typeText"), value: "text" },
                        { label: t("workflow.typeTextarea"), value: "textarea" },
                        { label: t("workflow.typeSelect"), value: "select" },
                        { label: t("workflow.typeNumber"), value: "number" },
                    ]}
                    onChange={(next) => onChange({ ...field, type: next as WorkflowFieldType, options: next === "select" ? field.options || [{ label: "选项 1", value: "option1" }] : undefined })}
                />
                <Tooltip title={t("workflow.requiredLabel")}>
                    <Switch size="small" checked={field.required} onChange={(next) => onChange({ ...field, required: next })} />
                </Tooltip>
                <div className="ml-auto flex items-center gap-1">
                    <button type="button" className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10" disabled={index === 0} onClick={() => onMove(-1)} style={{ color: theme.node.muted }}>
                        <ChevronUp className="size-3.5" />
                    </button>
                    <button type="button" className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10" disabled={index === fields.length - 1} onClick={() => onMove(1)} style={{ color: theme.node.muted }}>
                        <ChevronDown className="size-3.5" />
                    </button>
                    <button type="button" className="rounded p-0.5 text-red-500 hover:bg-red-500/10" onClick={onRemove} aria-label={t("workflow.deleteField")}>
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            </div>

            {invalid ? <span className="text-[11px] text-red-500">{RESERVED_KEYS.includes(field.key) ? t("workflow.fieldKeyReserved") : t("workflow.fieldKeyInvalid")}</span> : null}

            {field.type === "select" ? (
                <div className="flex flex-col gap-1.5 pl-5">
                    <span className="text-[11px]" style={{ color: theme.node.faint }}>
                        {t("workflow.fieldOptions")}
                    </span>
                    {(field.options || []).map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                            <Input size="small" className="!w-40" value={option.label} placeholder={t("workflow.optionLabel")} onChange={(event) => onChange({ ...field, options: (field.options || []).map((item, itemIndex) => (itemIndex === optionIndex ? { ...item, label: event.target.value } : item)) })} />
                            <Input size="small" className="!w-40 font-mono" value={option.value} placeholder={t("workflow.optionValue")} onChange={(event) => onChange({ ...field, options: (field.options || []).map((item, itemIndex) => (itemIndex === optionIndex ? { ...item, value: event.target.value } : item)) })} />
                            <button type="button" className="rounded p-0.5 text-red-500 hover:bg-red-500/10" onClick={() => onChange({ ...field, options: (field.options || []).filter((_, itemIndex) => itemIndex !== optionIndex) })}>
                                <Trash2 className="size-3.5" />
                            </button>
                        </div>
                    ))}
                    <Button size="small" type="text" className="self-start px-0" icon={<Plus className="size-3.5" />} onClick={() => onChange({ ...field, options: [...(field.options || []), { label: `选项 ${(field.options?.length || 0) + 1}`, value: `option${(field.options?.length || 0) + 1}` }] })}>
                        {t("workflow.addOption")}
                    </Button>
                </div>
            ) : null}

            {field.type === "number" ? (
                <div className="flex items-center gap-2 pl-5">
                    <span className="text-[11px]" style={{ color: theme.node.faint }}>
                        min / max / step
                    </span>
                    <InputNumber size="small" className="!w-20" value={field.min} onChange={(next) => onChange({ ...field, min: next ?? undefined })} />
                    <InputNumber size="small" className="!w-20" value={field.max} onChange={(next) => onChange({ ...field, max: next ?? undefined })} />
                    <InputNumber size="small" className="!w-20" value={field.step} onChange={(next) => onChange({ ...field, step: next ?? undefined })} />
                </div>
            ) : null}
        </div>
    );
}
