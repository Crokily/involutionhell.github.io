import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { AllowedImageContentType } from "./uploads";
import { MAX_IMAGE_UPLOAD_BYTES } from "./uploads";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createR2Client(config: R2Config) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function createImageUploadPost(params: {
  client: S3Client;
  bucket: string;
  key: string;
  contentType: AllowedImageContentType;
}) {
  return createPresignedPost(params.client, {
    Bucket: params.bucket,
    Key: params.key,
    Fields: {
      "Content-Type": params.contentType,
    },
    Conditions: [
      ["eq", "$Content-Type", params.contentType],
      ["content-length-range", 1, MAX_IMAGE_UPLOAD_BYTES],
      ["eq", "$key", params.key],
    ],
    Expires: 900, // 15min
  });
}
