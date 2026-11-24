import type { WorkflowField } from "@/types/workflow";

/** 与后端保持同一个正则：只认 {{key}}，key 限 1~64 位字母数字下划线点横线 */
const PLACEHOLDER = /\{\{\s*([\w.-]{1,64})\s*\}\}/g;

/** 提取模板里出现的全部变量名（去重） */
export function extractTemplateVars(template: string) {
    const found = new Set<string>();
    for (const match of template.matchAll(PLACEHOLDER)) found.add(match[1]);
    return Array.from(found);
}

/**
 * 单次扫描替换：
 * - 只替换 form_schema 里声明过的变量，未声明的占位符一律变成空串
 * - 绝不二次扫描，用户输入里含 {{x}} 不会被当成占位符再渲染一次
 */
export function renderTemplate(template: string, values: Record<string, string>, fields: WorkflowField[]) {
    const allowed = new Set(fields.map((field) => field.key));
    return template.replace(PLACEHOLDER, (_match, key: string) => {
        if (!allowed.has(key)) return "";
        return String(values[key] ?? "").slice(0, 4000);
    });
}

/** 负面提示词并入主提示词：渠道不认 negative_prompt 字段时的通用做法 */
export function composePrompt(prompt: string, negativePrompt: string) {
    const main = prompt.trim();
    const negative = negativePrompt.trim();
    if (!negative) return main;
    return main ? `${main}\n\n避免出现：${negative}` : `避免出现：${negative}`;
}
