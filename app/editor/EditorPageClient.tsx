"use client";

import { useEditorStore } from "@/lib/editor-store";
import { EditorMetadataForm } from "@/app/components/EditorMetadataForm";
import { DocsDestinationForm } from "@/app/components/DocsDestinationForm";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/app/components/MarkdownEditor";
import { Button } from "@/app/components/ui/button";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import type { Session } from "next-auth";
import { buildDocsNewUrl } from "@/lib/github";
import {
  MAX_SLUG_LENGTH,
  ensureMarkdownExtension,
  sanitizeSlug,
  stripMarkdownExtension,
  validateSlug,
} from "@/lib/submission";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  isAllowedImageContentType,
  isExtensionAllowedForContentType,
} from "@/lib/uploads";

interface EditorPageClientProps {
  session: Session;
}

function buildFrontmatter({
  title,
  description,
  tags,
}: {
  title: string;
  description?: string;
  tags?: string[];
}) {
  const safeTitle = JSON.stringify(title);
  const safeDescription = JSON.stringify(description ?? "");
  const date = new Date().toISOString().slice(0, 10);
  const normalizedTags = (tags ?? [])
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  const lines = [
    "---",
    `title: ${safeTitle}`,
    `description: ${safeDescription}`,
    `date: "${date}"`,
  ];

  if (normalizedTags.length > 0) {
    lines.push(
      "tags:",
      ...normalizedTags.map((tag) => `  - ${JSON.stringify(tag)}`),
    );
  } else {
    lines.push("tags: []");
  }

  lines.push("---");
  return lines.join("\n");
}

const MAX_IMAGE_SIZE_MB = MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024);

/**
 * 编辑器页面客户端组件
 * 包含表单、编辑器和发布按钮
 */
export function EditorPageClient({ session }: EditorPageClientProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const [destinationPath, setDestinationPath] = useState("");
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  const { title, description, tags, filename, markdown, setFilename } =
    useEditorStore();
  const handleImageCountChange = useCallback((count: number) => {
    setImageCount(count);
  }, []);
  const previewFilename = filename ? ensureMarkdownExtension(filename) : "";

  /**
   * 上传单个图片到 R2
   */
  const uploadImage = async (
    blobUrl: string,
    file: File,
    articleSlug: string,
  ): Promise<{ blobUrl: string; publicUrl: string }> => {
    const contentType = file.type.toLowerCase();

    if (!validateSlug(articleSlug)) {
      throw new Error("文章 slug 不合法，请检查文件名。");
    }

    if (!isAllowedImageContentType(contentType)) {
      throw new Error("仅支持上传 jpg/png/gif/webp 图片。");
    }

    if (!isExtensionAllowedForContentType(file.name, contentType)) {
      throw new Error("文件扩展名与图片类型不匹配。");
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error(`图片大小需在 0 - ${MAX_IMAGE_SIZE_MB}MB 之间。`);
    }

    // 1. 获取预签名 URL
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: file.name,
        contentType,
        articleSlug,
        fileSize: file.size,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "获取上传链接失败");
    }

    const { uploadUrl, publicUrl, fields } = (await response.json()) as {
      uploadUrl: string;
      publicUrl: string;
      fields: Record<string, string>;
    };

    if (!uploadUrl || !fields) {
      throw new Error("上传参数缺失，请稍后重试。");
    }

    // 2. 上传文件到 R2
    const formData = new FormData();
    Object.entries(fields).forEach(([field, value]) => {
      formData.append(field, value);
    });
    formData.append("file", file);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`上传图片失败: ${uploadResponse.statusText}`);
    }

    return { blobUrl, publicUrl };
  };

  const handlePublish = async () => {
    setIsPublishing(true);

    try {
      if (!title.trim()) {
        alert("请输入文章标题");
        return;
      }

      if (!filename.trim()) {
        alert("请输入文件名");
        return;
      }

      if (!destinationPath) {
        alert("请选择投稿目录");
        return;
      }

      const normalizedFilename = ensureMarkdownExtension(filename);
      const filenameBase = stripMarkdownExtension(normalizedFilename);
      const articleSlug = sanitizeSlug(filenameBase);

      if (
        !articleSlug ||
        !validateSlug(articleSlug) ||
        articleSlug !== filenameBase
      ) {
        alert(
          `文件名仅支持英文、数字、连字符或下划线，并需以字母或数字开头且不超过 ${MAX_SLUG_LENGTH} 个字符。`,
        );
        return;
      }

      if (normalizedFilename !== filename) {
        setFilename(normalizedFilename);
      }

      let githubDraftWindow: Window | null = null;
      try {
        githubDraftWindow = window.open("", "_blank");
        if (githubDraftWindow) {
          githubDraftWindow.document.title = "正在生成稿件…";
          githubDraftWindow.document.body.innerHTML =
            '<p style="font-family:system-ui;padding:16px;">正在生成 GitHub 草稿，请稍候…</p>';
          githubDraftWindow.opener = null;
        }
      } catch {
        githubDraftWindow = null;
      }

      console.group("发布流程：上传图片并生成 GitHub 草稿");
      console.log("文章标题:", title);
      console.log("文件名:", normalizedFilename);
      console.log("投稿目录:", destinationPath);
      console.log("图片数量:", imageCount);
      let finalMarkdown = markdown;

      // 如果有图片，上传到 R2 并替换 URL
      const editorHandle = editorRef.current;
      if (!editorHandle) {
        throw new Error("编辑器尚未就绪，无法上传图片");
      }

      const removedImages = editorHandle.removeUnreferencedImages(markdown);
      if (removedImages > 0) {
        console.log(`已清理 ${removedImages} 个未在 Markdown 中引用的图片`);
      }

      const imageEntries = Array.from(editorHandle.getImages().entries());

      if (imageEntries.length > 0) {
        console.log("开始上传图片...");

        // 并发上传所有图片
        const uploadPromises = imageEntries.map(([blobUrl, file]) =>
          uploadImage(blobUrl, file, articleSlug),
        );

        const uploadResults = await Promise.all(uploadPromises);

        console.log("所有图片上传完成！");
        console.group("图片 URL 映射");
        uploadResults.forEach(({ blobUrl, publicUrl }) => {
          console.log(`${blobUrl} -> ${publicUrl}`);
        });
        console.groupEnd();

        // 替换 Markdown 中的 blob URL 为公开 URL
        uploadResults.forEach(({ blobUrl, publicUrl }) => {
          finalMarkdown = finalMarkdown.replaceAll(blobUrl, publicUrl);
        });

        console.log("Markdown 中的 blob URL 已替换为公开 URL");
      }

      console.group("最终 Markdown 内容");
      console.log(finalMarkdown);
      console.groupEnd();

      console.groupEnd();

      const frontmatter = buildFrontmatter({
        title,
        description,
        tags,
      });
      const markdownBody = finalMarkdown.trimStart();
      const finalContent =
        markdownBody.length > 0
          ? `${frontmatter}\n\n${markdownBody}`
          : `${frontmatter}\n`;

      const params = new URLSearchParams({
        filename: normalizedFilename,
        value: finalContent,
      });
      const githubUrl = buildDocsNewUrl(destinationPath, params);
      if (githubDraftWindow) {
        githubDraftWindow.location.href = githubUrl;
      } else {
        window.open(githubUrl, "_blank", "noopener,noreferrer");
      }
      alert("图片已上传并生成 GitHub 草稿，请在新标签页完成提交。");
    } catch (error) {
      console.error("发布失败:", error);
      alert(`发布失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* 头部 */}
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">创作新文章</h1>
          <p className="text-muted-foreground mt-1">
            欢迎，{session.user?.name || session.user?.email}
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">返回首页</Button>
        </Link>
      </header>

      {/* 主要内容区域 */}
      <div className="space-y-6">
        {/* 元数据表单 */}
        <EditorMetadataForm />
        <DocsDestinationForm onChange={setDestinationPath} />

        {/* Markdown 编辑器 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">文章内容</h2>
            <div className="text-sm text-muted-foreground">
              {markdown.length} 字符 · {imageCount} 张图片
            </div>
          </div>
          <MarkdownEditor
            ref={editorRef}
            onImagesChange={handleImageCountChange}
          />
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">
            {!title.trim() || !filename.trim() ? (
              <span className="text-destructive">请填写标题和文件名</span>
            ) : !destinationPath ? (
              <span className="text-destructive">请选择投稿目录</span>
            ) : (
              <span>
                将在{" "}
                <code className="font-mono text-foreground">
                  {destinationPath}
                </code>{" "}
                下创建{" "}
                <code className="font-mono text-foreground">
                  {previewFilename}
                </code>
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("确定要清空所有内容吗？")) {
                  useEditorStore.getState().reset();
                  window.location.reload();
                }
              }}
            >
              清空
            </Button>

            <Button
              onClick={handlePublish}
              disabled={
                !title.trim() ||
                !filename.trim() ||
                !destinationPath ||
                isPublishing
              }
            >
              {isPublishing ? "处理中..." : "发布文章"}
            </Button>
          </div>
        </div>

        {/* 提示信息 */}
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm dark:border-green-900 dark:bg-green-950">
          <h3 className="font-medium mb-2">发布流程提示</h3>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
            <li>填写标题、描述、标签与文件名，自动补全 .md 后缀</li>
            <li>选择或新建投稿目录，目录结构与现有投稿机制一致</li>
            <li>点击“发布文章”将自动上传图片并替换为线上 URL</li>
            <li>系统会生成标准 Frontmatter，并打开 GitHub 新建页面</li>
            <li>在 GitHub 页面确认内容后提交 PR 即可完成投稿</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
