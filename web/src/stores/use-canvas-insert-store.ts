import { create } from "zustand";

import { fitNodeSize } from "@/lib/canvas/canvas-node-size";
import { resolveImageUrl } from "@/services/image-storage";
import { createCanvasNode, imageMetadata } from "@/lib/canvas/canvas-node-factory";
import { CanvasNodeType, type CanvasNodeData, type Position } from "@/types/canvas";

/**
 * 跨页面交接：工作流出图后把图片「添加到画布」。
 * 广场与画布是同一个 SPA，用内存 store 传一次待插入的图片即可，不依赖 iframe/postMessage。
 * 画布页挂载后消费一次，转成图片节点插到视口中心。
 */

export type PendingCanvasImage = {
    /** image:xxx 形式的本地存储键，或 http(s) 地址 */
    value: string;
    title: string;
};

type CanvasInsertStore = {
    pending: PendingCanvasImage[];
    queue: (images: PendingCanvasImage[]) => void;
    take: () => PendingCanvasImage[];
};

export const useCanvasInsertStore = create<CanvasInsertStore>()((set, get) => ({
    pending: [],
    queue: (images) => set((state) => ({ pending: [...state.pending, ...images] })),
    take: () => {
        const items = get().pending;
        if (items.length) set({ pending: [] });
        return items;
    },
}));

/** 把待插入图片转成画布图片节点，围绕给定中心点排开 */
export async function buildImageNodes(items: PendingCanvasImage[], center: Position): Promise<CanvasNodeData[]> {
    const nodes: CanvasNodeData[] = [];
    let offsetX = 0;
    for (const item of items) {
        const url = item.value.startsWith("image:") ? await resolveImageUrl(item.value, "") : item.value;
        if (!url) continue;
        const size = await loadImageSize(url);
        const fitted = fitNodeSize(size.width, size.height);
        const node = createCanvasNode(CanvasNodeType.Image, { x: center.x + offsetX, y: center.y }, {
            ...imageMetadata({ url, storageKey: item.value.startsWith("image:") ? item.value : undefined, width: size.width, height: size.height, bytes: 0, mimeType: "" }),
            prompt: item.title,
        });
        node.width = fitted.width;
        node.height = fitted.height;
        node.title = item.title || node.title;
        node.position = { x: center.x + offsetX - fitted.width / 2, y: center.y - fitted.height / 2 };
        nodes.push(node);
        offsetX += fitted.width + 24;
    }
    return nodes;
}

function loadImageSize(url: string) {
    return new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024 });
        image.onerror = () => resolve({ width: 1024, height: 1024 });
        image.src = url;
    });
}
