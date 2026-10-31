import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { imageExtension } from "@/lib/canvas/canvas-generation-helpers";
import { runWithConcurrency } from "@/lib/concurrency";
import { createZip } from "@/lib/zip";
import { IMAGE_REQUEST_CONCURRENCY } from "@/services/api/image";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { withLocalProxy } from "@/stores/use-config-store";
import type { CanvasExportAsset, CanvasExportFile } from "@/types/canvas-export";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export async function exportCanvasProjects(projects: CanvasProject[], fileName = i18n.t("canvas.export.defaultProjectName")) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                collectStorageKeys(project).map(async (storageKey) => {
                    const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                    if (!blob) return;
                    const path = `projects/${project.id}/files/${safeFileName(storageKey)}.${fileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "infinite-canvas", version: 3, exportedAt: new Date().toISOString(), projects: exportedProjects };
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = i18n.t("canvas.export.defaultNodesName")) {
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    await Promise.all(
        nodes.map(async (node) => {
            const title = node.title || node.type;
            const storageKey = node.metadata?.storageKey || "";
            if (storageKey) {
                const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                if (blob) return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            if (node.type === CanvasNodeType.Text) return void zipFiles.push({ name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.prompt || "" });
            const content = node.metadata?.content;
            if (content && content.startsWith("data:")) {
                const blob = await (await fetch(content)).blob();
                return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
        }),
    );

    const zip = await createZip(zipFiles);
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasImages(nodes: CanvasNodeData[], fileName = i18n.t("canvas.export.defaultNodesName")) {
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    const images = nodes
        .filter((node) => node.type === CanvasNodeType.Image)
        .flatMap((node) => {
            const base = node.title || i18n.t("canvas.export.item");
            const items = (node.metadata?.images || []).flatMap((image, index) =>
                image.content || image.storageKey ? [{ name: `${base}-${index + 1}`, content: image.content, storageKey: image.storageKey, mimeType: image.mimeType }] : [],
            );
            if (!items.length && node.metadata?.content) items.push({ name: base, content: node.metadata.content, storageKey: node.metadata.storageKey, mimeType: node.metadata.mimeType || "" });
            return items;
        });

    const resolved = await runWithConcurrency(images, IMAGE_REQUEST_CONCURRENCY, async (image) => {
        try {
            const stored = image.storageKey ? await getImageBlob(image.storageKey) : null;
            const blob = stored || (image.content ? await fetch(withLocalProxy(image.content)).then((response) => (response.ok ? response.blob() : null)).catch(() => null) : null);
            return { image, blob };
        } catch {
            return { image, blob: null };
        }
    });

    const zipFilesForImages: { name: string; data: BlobPart }[] = [];
    const fallbacks: { name: string; content: string }[] = [];
    resolved.forEach(({ image, blob }) => {
        const ext = blob ? fileExtension(blob.type || image.mimeType || "", image.storageKey || "") : imageExtension(image.content || "");
        const name = uniqueName(image.name, ext);
        if (blob) zipFilesForImages.push({ name, data: blob });
        else if (image.content) fallbacks.push({ name, content: image.content });
    });

    if (zipFilesForImages.length) saveAs(await createZip(zipFilesForImages), `${safeFileName(fileName)}.zip`);
    fallbacks.forEach((image) => saveAs(image.content, image.name));
    return zipFilesForImages.length + fallbacks.length;
}

function collectStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return [...keys];
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectStorageKeys(child, keys)) : collectStorageKeys(item, keys)));
    return [...keys];
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("svg")) return "svg";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
