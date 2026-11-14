import { DeleteObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, expect, it, vi } from 'vitest';
import { StorageService } from './storage.service.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('erases exact document versions and delete markers under the professional prefix', async () => {
  vi.stubEnv('STORAGE_REGION', 'eu-west-1');
  vi.stubEnv('STORAGE_ACCESS_KEY_ID', 'fixture');
  vi.stubEnv('STORAGE_SECRET_ACCESS_KEY', 'fixture');
  vi.stubEnv('STORAGE_BUCKET', 'fixture');
  const key = 'pro-documents/pro/document.pdf';
  const send = vi.spyOn(S3Client.prototype, 'send')
    .mockResolvedValueOnce({ Versions: [{ Key: key, VersionId: 'v1' }], DeleteMarkers: [{ Key: key, VersionId: 'v2' }] } as never)
    .mockResolvedValueOnce({} as never).mockResolvedValueOnce({} as never).mockResolvedValueOnce({} as never);
  await new StorageService().eraseProfessionalDocuments('pro');
  expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([
    ListObjectVersionsCommand, DeleteObjectCommand, DeleteObjectCommand, ListObjectVersionsCommand,
  ]);
  expect(send.mock.calls[0][0].input).toMatchObject({ Prefix: 'pro-documents/pro/' });
  expect(send.mock.calls[1][0].input).toMatchObject({ Key: key, VersionId: 'v1' });
  expect(send.mock.calls[2][0].input).toMatchObject({ Key: key, VersionId: 'v2' });
});
