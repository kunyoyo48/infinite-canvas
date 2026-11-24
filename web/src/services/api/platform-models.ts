import { fetchChannelModels } from "@/services/api/image";
import { useConfigStore, type ModelChannel } from "@/stores/use-config-store";

/**
 * 平台模型池同步。
 *
 * 数据源：渠道的 {baseUrl}/models —— 对 https://www.xnnapi.top/v1 就是 GET /v1/models，
 * 需要该渠道的 sk- API key（实测匿名与网页 access token 都会被 401）。
 *
 * 结果按渠道缓存到内存，避免每次进下拉都打一次接口。
 */

type CacheEntry = { at: number; models: string[] };

const CACHE_TTL = 60_000;
const cache = new Map<string, CacheEntry>();

/** 缓存键用 baseUrl + key 后四位，key 本身不进缓存键 */
function cacheKey(channel: ModelChannel) {
    return `${channel.baseUrl}|${channel.apiKey.slice(-4)}`;
}

/** 拉取单个渠道的真实模型列表；失败时回落到该渠道已配置的模型名 */
export async function fetchPlatformModels(channel: ModelChannel): Promise<string[]> {
    const key = cacheKey(channel);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.models;

    const configured = channel.models.map((model) => model.name);
    if (!channel.baseUrl.trim() || !channel.apiKey.trim()) return configured;

    try {
        const models = await fetchChannelModels(channel);
        cache.set(key, { at: Date.now(), models });
        return models;
    } catch {
        // 网络异常或 key 失效时不让下拉空掉，先给已配置的
        return configured;
    }
}

/** 只保留生图能力可用的模型：从真实列表里挑出名字像生图模型的，再并上渠道里被标为 image 的 */
export function pickImageModels(channel: ModelChannel, all: string[]) {
    const declared = new Set(channel.models.filter((model) => model.capability === "image").map((model) => model.name));
    const IMAGE_HINTS = ["image", "dall-e", "dalle", "flux", "sdxl", "imagen", "seedream", "banana", "midjourney", "mj", "sd", "qwen-image", "grok-imagine", "kolors", "hunyuan"];
    const guessed = all.filter((name) => IMAGE_HINTS.some((hint) => name.toLowerCase().includes(hint)));
    return Array.from(new Set([...declared, ...guessed])).sort();
}

/** 拉取所有渠道的模型并去重；供编辑器「推荐模型 / 允许切换模型」下拉使用 */
export async function fetchAllPlatformModels(): Promise<string[]> {
    const channels = useConfigStore.getState().config.channels.filter((channel) => channel.apiFormat === "openai");
    if (!channels.length) return [];
    const lists = await Promise.all(channels.map((channel) => fetchPlatformModels(channel)));
    return Array.from(new Set(lists.flat())).sort();
}

/** 清空缓存：用户改了 key 或平台上新模型后可手动触发 */
export function clearModelCache() {
    cache.clear();
}
