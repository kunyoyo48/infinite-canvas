import { create } from "zustand";
import { nanoid } from "nanoid";

import { localForageStorage } from "@/lib/localforage-storage";
import { useUserStore } from "@/stores/use-user-store";
import { useConfigStore, modelOptionName } from "@/stores/use-config-store";
import type { PublicWorkflow, WorkflowRecord } from "@/types/workflow";

/**
 * 工作流数据仓库。
 * 当前按项目既有约定存在浏览器本地（localforage），
 * 接入后端时只需要把下面几个 action 换成接口调用，
 * 组件层与视图层不用动（接口清单见 docs 里的后端契约）。
 */

const STORE_KEY = "infinite-canvas:workflow_store";

type WorkflowStore = {
    hydrated: boolean;
    workflows: WorkflowRecord[];
    favorites: string[];
    /** 收藏切换 */
    toggleFavorite: (workflowId: string) => void;
    /** 新建：返回新 ID */
    createWorkflow: (seed?: Partial<WorkflowRecord>) => string;
    /** 保存草稿 / 发布 */
    saveWorkflow: (workflow: WorkflowRecord, publish: boolean) => void;
    /** 删除（软删，仅作者） */
    deleteWorkflow: (workflowId: string) => void;
    /** 取消公开 */
    unpublish: (workflowId: string) => void;
    /** 复制一份私有副本，返回新 ID */
    copyWorkflow: (workflowId: string) => string;
    /** 运行次数 +1（仅成功时调用） */
    markRun: (workflowId: string) => void;
};

/** 当前登录用户 ID：主站接入前用本地占位身份，接入后由 useUserStore 提供 */
function currentUid() {
    return useUserStore.getState().user?.id || "local-user";
}

function currentName() {
    return useUserStore.getState().user?.displayName || useUserStore.getState().user?.username || "本地作者";
}

function nowIso() {
    return new Date().toISOString();
}

/** 默认允许选择的模型：取渠道里已配置的生图模型 */
function defaultAllowedModels() {
    const config = useConfigStore.getState().config;
    const models = config.channels.flatMap((channel) => channel.models.filter((model) => model.capability === "image").map((model) => model.name));
    return models.length ? Array.from(new Set(models)).slice(0, 8) : ["gpt-image-2"];
}

function createEmptyWorkflow(): WorkflowRecord {
    const allowed = defaultAllowedModels();
    return {
        workflow_id: `wf_${nanoid(12)}`,
        title: "未命名工作流",
        description: "",
        preview_image: "",
        author_uid: currentUid(),
        author_name: currentName(),
        is_public: false,
        status: "draft",
        category: "general",
        recommend_model_id: allowed[0],
        allowed_model_ids: allowed,
        form_schema: [{ key: "subject", label: "主体描述", type: "text", required: true, default: "", placeholder: "例如：金属保温杯" }],
        prompt_template: "{{subject}}",
        negative_prompt_template: "",
        version: 1,
        run_count: 0,
        favorite_count: 0,
        fork_count: 0,
        create_time: nowIso(),
        update_time: nowIso(),
    };
}

/** 示例工作流：首次打开广场时用于验证链路，可随时删除 */
function createDemoWorkflow(): WorkflowRecord {
    const allowed = defaultAllowedModels();
    const base = createEmptyWorkflow();
    return {
        ...base,
        workflow_id: "wf_demo_product_shot",
        title: "电商主图 · 纯白背景",
        description: "适合 3C、美妆、家居类商品主图。上传产品照片或填写产品描述，自动生成纯白背景、棚拍灯光的商品图。建议模型：gpt-image-2，出图尺寸 1:1。",
        author_name: "示例作者",
        is_public: true,
        status: "published",
        category: "product",
        recommend_model_id: allowed[0],
        allowed_model_ids: allowed,
        form_schema: [
            { key: "product_name", label: "产品名称", type: "text", required: true, default: "", placeholder: "例如：不锈钢保温杯" },
            { key: "style", label: "画面风格", type: "select", required: true, default: "realistic", options: [{ label: "写实棚拍", value: "realistic studio photo" }, { label: "极简插画", value: "flat minimalist illustration" }] },
            { key: "ref_image", label: "产品参考图", type: "image", required: false },
        ],
        prompt_template: "professional e-commerce product photo of {{product_name}}, {{style}}, pure white background, soft studio lighting, high detail, centered composition",
        negative_prompt_template: "blurry, watermark, text, extra objects, cluttered background",
        run_count: 128,
        favorite_count: 12,
        publish_time: nowIso(),
    };
}

export const useWorkflowStore = create<WorkflowStore>()((set, get) => ({
    hydrated: false,
    workflows: [],
    favorites: [],

    toggleFavorite: (workflowId) => {
        const isFavorite = get().favorites.includes(workflowId);
        set((state) => ({
            favorites: isFavorite ? state.favorites.filter((id) => id !== workflowId) : [...state.favorites, workflowId],
            workflows: state.workflows.map((item) => (item.workflow_id === workflowId ? { ...item, favorite_count: Math.max(0, item.favorite_count + (isFavorite ? -1 : 1)) } : item)),
        }));
    },

    createWorkflow: (seed) => {
        const workflow = { ...createEmptyWorkflow(), ...seed, author_uid: currentUid(), author_name: currentName() };
        set((state) => ({ workflows: [workflow, ...state.workflows] }));
        return workflow.workflow_id;
    },

    saveWorkflow: (workflow, publish) => {
        const now = nowIso();
        set((state) => {
            const exists = state.workflows.some((item) => item.workflow_id === workflow.workflow_id);
            const next: WorkflowRecord = {
                ...workflow,
                author_uid: workflow.author_uid || currentUid(),
                author_name: workflow.author_name || currentName(),
                status: publish ? "published" : workflow.status,
                version: publish && workflow.status === "published" ? workflow.version + 1 : workflow.version,
                publish_time: publish ? workflow.publish_time || now : workflow.publish_time,
                update_time: now,
            };
            return { workflows: exists ? state.workflows.map((item) => (item.workflow_id === next.workflow_id ? next : item)) : [next, ...state.workflows] };
        });
    },

    deleteWorkflow: (workflowId) => {
        set((state) => ({ workflows: state.workflows.filter((item) => item.workflow_id !== workflowId), favorites: state.favorites.filter((id) => id !== workflowId) }));
    },

    unpublish: (workflowId) => {
        set((state) => ({ workflows: state.workflows.map((item) => (item.workflow_id === workflowId ? { ...item, is_public: false, update_time: nowIso() } : item)) }));
    },

    copyWorkflow: (workflowId) => {
        const source = get().workflows.find((item) => item.workflow_id === workflowId);
        if (!source) return "";
        const copy: WorkflowRecord = {
            ...structuredClone(source),
            workflow_id: `wf_${nanoid(12)}`,
            title: `${source.title} 副本`.slice(0, 120),
            author_uid: currentUid(),
            author_name: currentName(),
            is_public: false,
            status: "draft",
            version: 1,
            run_count: 0,
            favorite_count: 0,
            fork_count: 0,
            source_workflow_id: source.workflow_id,
            create_time: nowIso(),
            update_time: nowIso(),
            publish_time: undefined,
        };
        set((state) => ({ workflows: [copy, ...state.workflows.map((item) => (item.workflow_id === workflowId ? { ...item, fork_count: item.fork_count + 1 } : item))] }));
        return copy.workflow_id;
    },

    markRun: (workflowId) => {
        set((state) => ({ workflows: state.workflows.map((item) => (item.workflow_id === workflowId ? { ...item, run_count: item.run_count + 1 } : item)) }));
    },
}));

/** 普通用户视图投影：白名单构造，绝不 delete 字段 */
export function toPublicWorkflow(workflow: WorkflowRecord): PublicWorkflow {
    return {
        workflow_id: workflow.workflow_id,
        title: workflow.title,
        description: workflow.description,
        preview_image: workflow.preview_image,
        author_uid: workflow.author_uid,
        author_name: workflow.author_name,
        is_public: workflow.is_public,
        status: workflow.status,
        category: workflow.category,
        recommend_model_id: workflow.recommend_model_id,
        allowed_model_ids: workflow.allowed_model_ids,
        form_schema: workflow.form_schema,
        version: workflow.version,
        run_count: workflow.run_count,
        favorite_count: workflow.favorite_count,
        fork_count: workflow.fork_count,
        source_workflow_id: workflow.source_workflow_id,
        create_time: workflow.create_time,
        update_time: workflow.update_time,
        publish_time: workflow.publish_time,
    };
}

/** 广场/我的列表里，当前用户能看到的记录（公开的全部 + 自己的全部） */
export function visibleWorkflows(workflows: WorkflowRecord[], uid: string) {
    return workflows.filter((item) => item.author_uid === uid || (item.is_public && item.status === "published"));
}

/** 首屏注入示例数据 + 本地持久化（只从本地读，不依赖后端） */
void (async () => {
    const raw = await localForageStorage.getItem(STORE_KEY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as { workflows: WorkflowRecord[]; favorites: string[] };
            useWorkflowStore.setState({ workflows: parsed.workflows || [], favorites: parsed.favorites || [], hydrated: true });
        } catch {
            useWorkflowStore.setState({ workflows: [createDemoWorkflow()], favorites: [], hydrated: true });
        }
    } else {
        useWorkflowStore.setState({ workflows: [createDemoWorkflow()], favorites: [], hydrated: true });
    }
    useWorkflowStore.subscribe((state) => {
        void localForageStorage.setItem(STORE_KEY, JSON.stringify({ workflows: state.workflows, favorites: state.favorites }));
    });
})();

/** 模型 ID 归一：渠道值 "default::gpt-image-2" → "gpt-image-2" */
export function normalizeModelId(value: string) {
    return modelOptionName(value || "");
}
