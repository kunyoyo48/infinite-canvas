import { useMemo, useState } from "react";
import { App, Button } from "antd";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WorkflowCard, WorkflowFilterBar } from "@/components/workflow/workflow-card";
import { useWorkflowStore, visibleWorkflows } from "@/stores/use-workflow-store";
import { useUserStore } from "@/stores/use-user-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { WORKFLOW_CATEGORIES } from "@/types/workflow";

/**
 * 页面 1：工作流广场。
 * 只展示 status=published 且 is_public 的工作流（外加自己的）。
 */
export default function WorkflowMarketPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const uid = useUserStore((state) => state.user?.id) || "local-user";
    const workflows = useWorkflowStore((state) => state.workflows);
    const favorites = useWorkflowStore((state) => state.favorites);
    const toggleFavorite = useWorkflowStore((state) => state.toggleFavorite);
    const copyWorkflow = useWorkflowStore((state) => state.copyWorkflow);

    const [category, setCategory] = useState("");
    const [modelId, setModelId] = useState("");
    const [keyword, setKeyword] = useState("");

    /** 广场模型筛选项：所有公开工作流用到过的推荐模型 */
    const modelOptions = useMemo(() => Array.from(new Set(workflows.filter((item) => item.is_public && item.status === "published").map((item) => item.recommend_model_id))).sort(), [workflows]);

    const list = useMemo(() => {
        // 广场只展示已发布的工作流：公开的全部 + 自己已发布的（草稿去「我的工作流」看）
        const base = visibleWorkflows(workflows, uid).filter((item) => item.status === "published");
        const search = keyword.trim().toLowerCase();
        return base
            .filter((item) => (category ? item.category === category : true))
            .filter((item) => (modelId ? item.recommend_model_id === modelId || item.allowed_model_ids.includes(modelId) : true))
            .filter((item) => (search ? `${item.title} ${item.description}`.toLowerCase().includes(search) : true))
            .sort((a, b) => b.run_count - a.run_count || (b.publish_time || "").localeCompare(a.publish_time || ""));
    }, [category, keyword, modelId, uid, workflows]);

    return (
        <main className="h-full overflow-auto bg-background">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-5 dark:border-stone-800">
                    <div>
                        <p className="text-xs" style={{ color: theme.node.faint }}>
                            {t("workflow.title")}
                        </p>
                        <h1 className="mt-2 text-2xl font-semibold" style={{ color: theme.node.text }}>
                            {t("workflow.nav")}
                        </h1>
                        <p className="mt-1 text-sm" style={{ color: theme.node.muted }}>
                            {t("workflow.subtitle")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => navigate("/workflow/my")}>{t("workflow.myTitle")}</Button>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/workflow/edit")}>
                            {t("workflow.create")}
                        </Button>
                    </div>
                </header>

                <WorkflowFilterBar category={category} modelId={modelId} keyword={keyword} categories={WORKFLOW_CATEGORIES} models={modelOptions} onCategory={setCategory} onModel={setModelId} onKeyword={setKeyword} />

                {list.length ? (
                    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
                        {list.map((workflow) => (
                            <WorkflowCard
                                key={workflow.workflow_id}
                                workflow={workflow}
                                onUse={() => navigate(`/workflow/run/${workflow.workflow_id}`)}
                                onDetail={() => navigate(`/workflow/run/${workflow.workflow_id}`)}
                                onFavorite={() => toggleFavorite(workflow.workflow_id)}
                                onEdit={workflow.author_uid === uid ? () => navigate(`/workflow/edit/${workflow.workflow_id}`) : undefined}
                                onCopy={() => {
                                    const next = copyWorkflow(workflow.workflow_id);
                                    if (!next) return;
                                    message.success(t("workflow.copied"));
                                    navigate(`/workflow/edit/${next}`);
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed text-center" style={{ borderColor: theme.node.stroke }}>
                        <h2 className="text-base font-medium" style={{ color: theme.node.text }}>
                            {t("workflow.marketEmpty")}
                        </h2>
                        <p className="mt-2 text-sm" style={{ color: theme.node.muted }}>
                            {t("workflow.marketEmptyHint")}
                        </p>
                        <Button type="primary" className="mt-5" icon={<Plus className="size-4" />} onClick={() => navigate("/workflow/edit")}>
                            {t("workflow.create")}
                        </Button>
                    </section>
                )}

                <p className="text-center text-[11px]" style={{ color: theme.node.faint }}>
                    {t("workflow.favorites")}: {favorites.length}
                </p>
            </div>
        </main>
    );
}
