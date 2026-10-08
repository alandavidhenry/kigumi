import { BlobServiceClient } from '@azure/storage-blob'

import type { ContainerClient } from '@azure/storage-blob'

// Azure Blob Storage (Azurite locally). Blobs are only ever addressed through
// paths built by blobPathFor, which starts with the organisation id; callers
// look the path up in the tenant-scoped Attachment table first.

let container: ContainerClient | null = null

function getContainer(): ContainerClient {
  if (container) return container
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  const name = process.env.AZURE_STORAGE_CONTAINER_NAME
  if (!connectionString || !name) {
    throw new Error('Blob storage is not configured')
  }
  container =
    BlobServiceClient.fromConnectionString(connectionString).getContainerClient(
      name
    )
  return container
}

export function blobPathFor(
  organisationId: string,
  attachmentId: string,
  extension: string
): string {
  return `${organisationId}/${attachmentId}.${extension}`
}

export async function uploadBlob(
  path: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  await getContainer()
    .getBlockBlobClient(path)
    .uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } })
}

export async function downloadBlob(path: string): Promise<Buffer> {
  return getContainer().getBlockBlobClient(path).downloadToBuffer()
}

export async function deleteBlob(path: string): Promise<void> {
  await getContainer().getBlockBlobClient(path).deleteIfExists()
}
