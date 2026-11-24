import { Input, InputNumber, Select } from "antd";
import { useTranslation } from "react-i18next";

import { WorkflowImageField } from "@/components/workflow/workflow-image-field";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import type { WorkflowField } from "@/types/workflow";

/**
 * 动态表单渲染器。
 * 输入：form_schema（后端下发的字段数组）
 * 输出：values（{ key: string }），image 字段的值为 storageKey 或 URL
 * 校验：required 非空 + number 区间 + select 选项合法性，提交前统一跑一次。
 */
export function WorkflowSchemaForm({ fields, values, onChange }: { fields: WorkflowField[]; values: Record<string, string>; onChange: (key: string, value: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <div className="flex flex-col gap-4">
            {fields.map((field) => (
                <WorkflowFieldControl key={field.key} field={field} value={values[field.key] ?? field.default ?? ""} onChange={(next) => onChange(field.key, next)} theme={theme} />
            ))}
        </div>
    );
}

type ControlProps = {
    field: WorkflowField;
    value: string;
    onChange: (next: string) => void;
    theme: CanvasTheme;
};

function WorkflowFieldControl({ field, value, onChange, theme }: ControlProps) {
    const { t } = useTranslation();
    const label = (
        <span className="mb-1.5 block text-xs" style={{ color: theme.node.muted }}>
            {field.label}
            {field.required ? <span className="ml-1 text-red-500">*</span> : null}
        </span>
    );

    if (field.type === "image") return <WorkflowImageField label={field.label} required={field.required} value={value} onChange={onChange} aspect="wide" />;

    if (field.type === "select") {
        return (
            <div>
                {label}
                <Select
                    className="w-full"
                    value={value || undefined}
                    placeholder={field.placeholder || t("workflow.selectPlaceholder")}
                    options={(field.options || []).map((option) => ({ label: option.label, value: option.value }))}
                    onChange={(next) => onChange(String(next))}
                />
            </div>
        );
    }

    if (field.type === "number") {
        return (
            <div>
                {label}
                <InputNumber className="w-full" value={value === "" ? undefined : Number(value)} min={field.min} max={field.max} step={field.step || 1} onChange={(next) => onChange(next === null || next === undefined ? "" : String(next))} />
            </div>
        );
    }

    if (field.type === "textarea") {
        return (
            <div>
                {label}
                <Input.TextArea value={value} placeholder={field.placeholder} maxLength={field.maxLength || 2000} autoSize={{ minRows: 3, maxRows: 8 }} onChange={(event) => onChange(event.target.value)} />
            </div>
        );
    }

    return (
        <div>
            {label}
            <Input value={value} placeholder={field.placeholder} maxLength={field.maxLength || 200} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

/** 提交前校验，返回第一条错误文案；通过返回空串 */
export function validateWorkflowValues(fields: WorkflowField[], values: Record<string, string>, t: (key: string, options?: Record<string, unknown>) => string) {
    for (const field of fields) {
        const value = (values[field.key] ?? "").trim();
        if (field.required && !value) return t("workflow.fieldRequired", { label: field.label });
        if (field.type === "number" && value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return t("workflow.fieldNumber", { label: field.label });
            if (field.min !== undefined && number < field.min) return t("workflow.fieldRange", { label: field.label, min: field.min, max: field.max ?? 9999 });
            if (field.max !== undefined && number > field.max) return t("workflow.fieldRange", { label: field.label, min: field.min ?? 0, max: field.max });
        }
        if (field.type === "select" && value && field.options?.length && !field.options.some((option) => option.value === value)) {
            return t("workflow.fieldOption", { label: field.label });
        }
    }
    return "";
}

/** 初始化表单值：default 优先，number 缺省 1，其余空串 */
export function initialWorkflowValues(fields: WorkflowField[]) {
    const values: Record<string, string> = {};
    for (const field of fields) values[field.key] = field.default ?? (field.type === "number" ? "1" : "");
    return values;
}
