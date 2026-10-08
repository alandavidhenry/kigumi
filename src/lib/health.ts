import { BlobServiceClient } from '@azure/storage-blob'

import prisma from '@/lib/prisma'

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function checkStorage(): Promise<boolean> {
  try {
    const client = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING!
    )
    await client
      .getContainerClient(process.env.AZURE_STORAGE_CONTAINER_NAME ?? 'kigumi')
      .getProperties()
    return true
  } catch {
    return false
  }
}
