import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeSlug, validateSlug } from "@/lib/submission";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  isAllowedImageContentType,
  isExtensionAllowedForContentType,
  isValidFileSize,
  sanitizeFilename,
} from "@/lib/uploads";
import { createImageUploadPost, createR2Client } from "@/lib/r2";
import type { AllowedImageContentType } from "@/lib/uploads";

const MAX_OBJECT_KEY_BYTES = 1024;

interface UploadRequest {
  filename: string;
  contentType: string;
  articleSlug: string;
  fileSize: number;
}

/**
 * @description POST /api/upload - 生成 R2 预签名 URL，用于客户端直接上传图片
 * @param request - NextRequest 对象，请求体包含以下字段：
 *   - filename: 文件名
 *   - contentType: 文件 MIME 类型
 *   - articleSlug: 文章 slug（用于组织文件路径）
 *   - fileSize: 文件大小（字节，用于限制超大上传）
 * @returns NextResponse - 返回 JSON 对象：
 *   - uploadUrl: 预签名上传 URL（用于表单 POST）
 *   - fields: 需随表单一同提交的字段
 *   - publicUrl: 图片的公开访问 URL
 *   - key: R2 对象键
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const {
      R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      R2_PUBLIC_URL,
    } = process.env;

    if (
      !R2_ACCOUNT_ID ||
      !R2_ACCESS_KEY_ID ||
      !R2_SECRET_ACCESS_KEY ||
      !R2_BUCKET_NAME ||
      !R2_PUBLIC_URL
    ) {
      console.error("R2 环境变量未配置");
      return NextResponse.json(
        { error: "服务器配置错误：R2 未配置" },
        { status: 500 },
      );
    }

    let body: UploadRequest;
    try {
      body = (await request.json()) as UploadRequest;
    } catch {
      return NextResponse.json(
        { error: "请求体格式错误：应为 JSON" },
        { status: 400 },
      );
    }

    const { filename, contentType, articleSlug, fileSize } = body;

    if (
      typeof filename !== "string" ||
      typeof contentType !== "string" ||
      typeof articleSlug !== "string" ||
      typeof fileSize === "undefined"
    ) {
      return NextResponse.json(
        {
          error: "缺少必要参数：filename, contentType, articleSlug, fileSize",
        },
        { status: 400 },
      );
    }

    const normalizedContentType = contentType.toLowerCase();
    const sanitizedSlug = sanitizeSlug(articleSlug);
    if (!validateSlug(sanitizedSlug) || sanitizedSlug !== articleSlug) {
      return NextResponse.json(
        {
          error:
            "articleSlug 不符合规范（需为 1-100 位小写字母、数字、连字符或下划线）",
        },
        { status: 400 },
      );
    }

    if (!isValidFileSize(fileSize)) {
      return NextResponse.json(
        {
          error: `文件大小无效或超过限制（最大 ${
            MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)
          }MB）`,
        },
        { status: 400 },
      );
    }

    if (!isAllowedImageContentType(normalizedContentType)) {
      return NextResponse.json(
        {
          error: "仅支持图片类型：image/jpeg, image/png, image/gif, image/webp",
        },
        { status: 400 },
      );
    }

    const sanitizedFilename = sanitizeFilename(filename);

    if (!sanitizedFilename) {
      return NextResponse.json(
        {
          error: "文件名不合法，仅支持字母、数字、., _, -，且不能以 . 开头",
        },
        { status: 400 },
      );
    }

    if (
      !isExtensionAllowedForContentType(
        sanitizedFilename,
        normalizedContentType,
      )
    ) {
      return NextResponse.json(
        {
          error: "文件扩展名与 contentType 不匹配或不受支持",
        },
        { status: 400 },
      );
    }

    const timestamp = Date.now();
    const userId = session.user.id;
    const key = `users/${userId}/${sanitizedSlug}/${timestamp}-${sanitizedFilename}`;

    if (Buffer.byteLength(key, "utf8") > MAX_OBJECT_KEY_BYTES) {
      return NextResponse.json(
        { error: "生成的对象 Key 过长，请缩短文件名或文章 slug" },
        { status: 400 },
      );
    }

    const r2Client = createR2Client({
      accountId: R2_ACCOUNT_ID,
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    });

    const presignedPost = await createImageUploadPost({
      client: r2Client,
      bucket: R2_BUCKET_NAME,
      key,
      contentType: normalizedContentType as AllowedImageContentType,
    });

    const publicUrl = `${R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({
      uploadUrl: presignedPost.url,
      fields: presignedPost.fields,
      publicUrl,
      key,
    });
  } catch (error) {
    console.error("生成预签名 URL 失败:", error);
    return NextResponse.json(
      {
        error: "生成上传链接失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 },
    );
  }
}
