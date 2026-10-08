// Creates the Azure Blob Storage container used for attachments (receipts, photos, manuals).
// Run once per fresh Azurite volume for local dev — real Azure Storage
// containers are provisioned by Terraform instead.
//
//   node scripts/create-storage-container.js
const { BlobServiceClient } = require('@azure/storage-blob')

const { loadEnvLocal } = require('./load-env')

loadEnvLocal()

async function main() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME

  if (!connectionString || !containerName) {
    console.error(
      'AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER_NAME must be set in .env.local'
    )
    process.exit(1)
  }

  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(containerName)
  const result = await containerClient.createIfNotExists()

  console.log(
    result.succeeded
      ? `Created container "${containerName}"`
      : `Container "${containerName}" already exists`
  )
}

main().catch((error) => {
  console.error('Failed to create storage container:', error)
  process.exit(1)
})
