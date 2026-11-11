import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export const UPLOAD_LINK_SECONDS = 10 * 60;  // time to upload after asking for a link
export const DOWNLOAD_LINK_SECONDS = 5 * 60; // time a "view document" link works

// Private file storage on AWS S3 (or anything that speaks S3, like the local MinIO container).
// Files never pass through our servers: we hand out short-lived signed links, and the app
// uploads to / downloads from the bucket directly. The bucket itself stays private.
@Injectable()
export class StorageService {
  private readonly bucket = process.env.STORAGE_BUCKET;
  private client?: S3Client;

  // Created on first use, so users-service still starts when storage isn't configured yet
  private get s3(): S3Client {
    const { STORAGE_REGION, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_ENDPOINT } = process.env;
    if (!this.bucket || !STORAGE_REGION || !STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
      throw new ServiceUnavailableException('Document storage is not configured');
    }
    this.client ??= new S3Client({
      region: STORAGE_REGION,
      credentials: { accessKeyId: STORAGE_ACCESS_KEY_ID, secretAccessKey: STORAGE_SECRET_ACCESS_KEY },
      // only set for local MinIO; AWS S3 needs no endpoint
      ...(STORAGE_ENDPOINT ? { endpoint: STORAGE_ENDPOINT, forcePathStyle: true } : {}),
      // don't add checksum headers the uploader would also have to send: a signed link must work with a plain PUT
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.client;
  }

  // A link the app can PUT one file to. Type and size are part of the signature,
  // so the link can't be used to upload something else.
  uploadUrl(key: string, contentType: string, sizeBytes: number): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes });
    return getSignedUrl(this.s3, command, {
      expiresIn: UPLOAD_LINK_SECONDS,
      signableHeaders: new Set(['content-type', 'content-length']),
    });
  }

  downloadUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: DOWNLOAD_LINK_SECONDS,
    });
  }

  // What is really in the bucket, or null when nothing was uploaded
  async stat(key: string): Promise<{ sizeBytes: number; contentType?: string } | null> {
    try {
      const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
