import { useMemo, useState } from "react";
import { App, Button, Popconfirm, Segmented, Tag } from "antd";
import { Copy, ExternalLink, Globe2, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { WorkflowImagePreview } from "@/components/workflow/workflow-image-field";
import { useWorkflowStore } from "@/stores/use-workflow-store";
import { useUserStore } from "@/stores/use-user-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { canvasThemes } from "@/lib/canvas-theme";

/** 页面 4：我的工作流（我创建的 / 我收藏的）。 */
export default function WorkflowMyPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const uid = useUserStore((state) => state.user?.id) || "local-user";
    const workflows = useWorkflowStore((state) => state.workflows);
    const favorites = useWorkflowStore((state) => state.favorites);
    const deleteWorkflow = useWorkflowStore((state) => state.deleteWorkflow);
    const copyWorkflow = useWorkflowStore((state) => state.copyWorkflow);
    const unpublish = useWorkflowStore((state) => state.unpublish);
    const toggleFavorite = useWorkflowStore((state) => state.toggleFavorite);

    const [tab, setTab] = useState<"created" | "favorited">("created");
    const [filter, setFilter] = useState<"all" | "public" | "private">("all");

    const list = useMemo(() => {
        if (tab === "favorited") return workflows.filter((item) => favorites.includes(item.workflow_id));
        return workflows
            .filter((item) => item.author_uid === uid)
            .filter((item) => (filter === "all" ? true : filter === "public" ? item.is_public : !item.is_public))
            .sort((a, b) => b.update_time.localeCompare(a.update_time));
    }, [favorites, filter, tab, uid, workflows]);

    return (
        <main className="h-full overflow-auto bg-background">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-6 py-6">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Button type="text" onClick={() => navigate("/workflow")}>
                            {t("workflow.backToMarket")}
                        </Button>
                        <h1 className="text-lg font-semibold" style={{ color: theme.node.text }}>
                            {t("workflow.myTitle")}
                        </h1>
                    </div>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/workflow/edit")}>
                        {t("workflow.create")}
                    </Button>
                </header>

                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Segmented
                        value={tab}
                        onChange={(next) => setTab(next as "created" | "favorited")}
                        options={[
                            { label: t("workflow.tabCreated"), value: "created" },
                            { label: t("workflow.tabFavorited"), value: "favorited" },
                        ]}
                    />
                    {tab === "created" ? (
                        <Segmented
                            value={filter}
                            onChange={(next) => setFilter(next as "all" | "public" | "private")}
                            options={[
                                { label: t("workflow.tabAll"), value: "all" },
                                { label: t("workflow.tabPublic"), value: "public" },
                                { label: t("workflow.tabPrivate"), value: "private" },
                            ]}
                        />
                    ) : null}
                </div>

                {list.length ? (
                    <div className="flex flex-col gap-2">
                        {list.map((workflow) => (
                            <article key={workflow.workflow_id} className="flex gap-3 rounded-xl border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg" style={{ background: theme.node.fill }}>
                                    <WorkflowImagePreview value={workflow.preview_image} className="size-full object-cover" alt={workflow.title} />
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <button type="button" className="truncate text-sm font-medium" style={{ color: theme.node.text }} onClick={() => navigate(`/workflow/run/${workflow.workflow_id}`)}>
                                            {workflow.title}
                                        </button>
                                        <Tag color={workflow.is_public ? "cyan" : "default"} icon={workflow.is_public ? <Globe2 className="size-3" /> : <Lock className="size-3" />}>
                                            {workflow.is_public ? t("workflow.publicBadge") : t("workflow.privateBadge")}
                                        </Tag>
                                        <Tag color={workflow.status === "published" ? "green" : "default"}>{workflow.status === "published" ? t("workflow.publishedBadge") : t("workflow.draftBadge")}</Tag>
                                        <Tag>{t("workflow.versionTag", { version: workflow.version })}</Tag>
                                    </div>
                                    <p className="line-clamp-1 text-xs" style={{ color: theme.node.muted }}>
                                        {workflow.description || "—"}
                                    </p>
                                    <div className="flex items-center gap-3 text-[11px]" style={{ color: theme.node.faint }}>
                                        <span>🏷 {workflow.recommend_model_id}</span>
                                        <span>{t("workflow.runsCount", { count: workflow.run_count })}</span>
                                        <span>{t("workflow.favoritesCount", { count: workflow.favorite_count })}</span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                                    <div className="flex items-center gap-1">
                                        {workflow.author_uid === uid ? (
                                            <>
                                                <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => navigate(`/workflow/edit/${workflow.workflow_id}`)}>
                                                    {t("common.edit")}
                                                </Button>
                                                <Button
                                                    size="small"
                                                    icon={<Copy className="size-3.5" />}
                                                    onClick={() => {
                                                        const next = copyWorkflow(workflow.workflow_id);
                                                        if (!next) return;
                                                        message.success(t("workflow.copied"));
                                                        navigate(`/workflow/edit/${next}`);
                                                    }}
                                                >
                                                    {t("workflow.copy")}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button size="small" icon={<ExternalLink className="size-3.5" />} onClick={() => navigate(`/workflow/run/${workflow.workflow_id}`)}>
                                                {t("workflow.useNow")}
                                            </Button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {workflow.is_public && workflow.author_uid === uid ? (
                                            <Button
                                                size="small"
                                                type="text"
                                                onClick={() => {
                                                    unpublish(workflow.workflow_id);
                                                    message.success(t("workflow.savedDraft"));
                                                }}
                                            >
                                                {t("workflow.unpublish")}
                                            </Button>
                                        ) : null}
                                        {tab === "favorited" ? (
                                            <Button size="small" type="text" onClick={() => toggleFavorite(workflow.workflow_id)}>
                                                {t("workflow.favorites")}
                                            </Button>
                                        ) : null}
                                        {workflow.author_uid === uid ? (
                                            <Popconfirm
                                                title={t("workflow.deleteConfirm")}
                                                okButtonProps={{ danger: true }}
                                                onConfirm={() => {
                                                    deleteWorkflow(workflow.workflow_id);
                                                    message.success(t("workflow.deleted"));
                                                }}
                                            >
                                                <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} aria-label={t("common.delete")} />
                                            </Popconfirm>
                                        ) : null}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <section className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed text-center" style={{ borderColor: theme.node.stroke }}>
                        <p className="text-sm" style={{ color: theme.node.muted }}>
                            {tab === "created" ? t("workflow.emptyMine") : t("workflow.emptyFavorited")}
                        </p>
                        {tab === "created" ? (
                            <Button type="primary" className="mt-4" icon={<Plus className="size-4" />} onClick={() => navigate("/workflow/edit")}>
                                {t("workflow.create")}
                            </Button>
                        ) : null}
                    </section>
                )}
            </div>
        </main>
    );
}
