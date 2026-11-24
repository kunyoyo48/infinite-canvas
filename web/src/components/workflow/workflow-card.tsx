import { Button, Input, Select, Tooltip } from "antd";
import { ArrowUpRight, Copy, Globe2, Heart, Lock, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";

import { WorkflowImagePreview } from "@/components/workflow/workflow-image-field";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import type { WorkflowRecord } from "@/types/workflow";

/**
 * 广场卡片。
 * 结构：样图 → 标题 → 简介（两行截断，hover 看全文）→ 推荐模型徽标 → 作者/状态 → 操作按钮。
 */
export function WorkflowCard({ workflow, onUse, onDetail, onFavorite, onCopy, onEdit }: { workflow: WorkflowRecord; onUse: () => void; onDetail: () => void; onFavorite: () => void; onCopy?: () => void; onEdit?: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <article className="group mb-5 break-inside-avoid overflow-hidden rounded-xl border transition-transform duration-150 hover:-translate-y-0.5" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
            <button type="button" className="block w-full overflow-hidden" onClick={onDetail} aria-label={workflow.title}>
                <div className="relative aspect-[4/3] w-full overflow-hidden" style={{ background: theme.node.fill }}>
                    <WorkflowImagePreview value={workflow.preview_image} className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" alt={workflow.title} />
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm">
                        {workflow.is_public ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
                        {workflow.is_public ? t("workflow.publicBadge") : t("workflow.privateBadge")}
                    </span>
                </div>
            </button>

            <div className="flex flex-col gap-2 p-3">
                <button type="button" className="text-left text-sm font-medium leading-snug" style={{ color: theme.node.text }} onClick={onDetail}>
                    {workflow.title}
                </button>

                <Tooltip title={workflow.description} placement="top" mouseEnterDelay={0.4}>
                    <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: theme.node.muted }}>
                        {workflow.description || "—"}
                    </p>
                </Tooltip>

                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-400 ring-1 ring-cyan-500/25">
                        🏷 {t("workflow.recommendTag")}：{workflow.recommend_model_id}
                    </span>
                    <span className="text-[11px]" style={{ color: theme.node.faint }}>
                        {workflow.author_name}
                    </span>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px]" style={{ color: theme.node.faint }}>
                        <span>{t("workflow.runsCount", { count: workflow.run_count })}</span>
                        <button type="button" className={cn("inline-flex items-center gap-0.5 transition-colors", workflow.favorite_count > 0 && "text-rose-400")} onClick={onFavorite}>
                            <Heart className="size-3" />
                            {workflow.favorite_count}
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        {onEdit ? (
                            <Tooltip title={t("common.edit")}>
                                <button type="button" className="rounded-md p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={onEdit} aria-label={t("common.edit")}>
                                    <Pencil className="size-3.5" />
                                </button>
                            </Tooltip>
                        ) : null}
                        {onCopy ? (
                            <Tooltip title={t("workflow.copy")}>
                                <button type="button" className="rounded-md p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10" style={{ color: theme.node.muted }} onClick={onCopy} aria-label={t("workflow.copy")}>
                                    <Copy className="size-3.5" />
                                </button>
                            </Tooltip>
                        ) : null}
                        <Button size="small" type="text" icon={<ArrowUpRight className="size-3.5" />} onClick={onDetail}>
                            {t("workflow.detail")}
                        </Button>
                        <Button size="small" type="primary" onClick={onUse}>
                            {t("workflow.useNow")}
                        </Button>
                    </div>
                </div>
            </div>
        </article>
    );
}

/** 顶部筛选条：分类 / 模型 / 搜索 */
export function WorkflowFilterBar({
    category,
    modelId,
    keyword,
    categories,
    models,
    onCategory,
    onModel,
    onKeyword,
}: {
    category: string;
    modelId: string;
    keyword: string;
    categories: Array<{ code: string; name: string }>;
    models: string[];
    onCategory: (next: string) => void;
    onModel: (next: string) => void;
    onKeyword: (next: string) => void;
}) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select value={category} className="min-w-32" options={[{ label: t("workflow.filterCategory"), value: "" }, ...categories.map((item) => ({ label: item.name, value: item.code }))]} onChange={(next) => onCategory(String(next))} />
            <Select value={modelId} className="min-w-44" showSearch options={[{ label: t("workflow.filterModel"), value: "" }, ...models.map((item) => ({ label: item, value: item }))]} onChange={(next) => onModel(String(next))} />
            <Input.Search allowClear className="min-w-56 flex-1" placeholder={t("workflow.searchPlaceholder")} defaultValue={keyword} onSearch={(next) => onKeyword(next.trim())} style={{ background: theme.node.panel }} />
        </div>
    );
}
