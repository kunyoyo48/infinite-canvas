// 工作流模块广场：数据结构定义。
// 字段与后端 workflows 表一一对应，后端接入时直接把接口返回映射到这里即可。

export type WorkflowFieldType = "image" | "text" | "textarea" | "select" | "number";

export type WorkflowFieldOption = {
    label: string;
    value: string;
};

export type WorkflowField = {
    /** 变量名，模板中用 {{key}} 引用 */
    key: string;
    label: string;
    type: WorkflowFieldType;
    required: boolean;
    /** 仅 select 使用 */
    options?: WorkflowFieldOption[];
    default?: string;
    placeholder?: string;
    maxLength?: number;
    min?: number;
    max?: number;
    step?: number;
};

export type WorkflowStatus = "draft" | "published";

export type WorkflowRecord = {
    workflow_id: string;
    title: string;
    description: string;
    /** 样图：storageKey（image:xxx）、data URL 或 http URL */
    preview_image: string;
    author_uid: string;
    author_name: string;
    is_public: boolean;
    status: WorkflowStatus;
    category: string;
    /** 平台模型 ID（如 gpt-image-2），不是渠道编码值 */
    recommend_model_id: string;
    allowed_model_ids: string[];
    form_schema: WorkflowField[];
    prompt_template: string;
    negative_prompt_template: string;
    version: number;
    run_count: number;
    favorite_count: number;
    fork_count: number;
    source_workflow_id?: string;
    create_time: string;
    update_time: string;
    publish_time?: string;
};

/** 普通用户视图：剥离提示词模板等内部配置，运行页只持有这个对象 */
export type PublicWorkflow = Omit<WorkflowRecord, "prompt_template" | "negative_prompt_template">;

export type WorkflowCategory = {
    code: string;
    name: string;
};

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
    { code: "general", name: "通用" },
    { code: "portrait", name: "人像摄影" },
    { code: "product", name: "商品图" },
    { code: "poster", name: "海报设计" },
    { code: "illustration", name: "插画动漫" },
];
