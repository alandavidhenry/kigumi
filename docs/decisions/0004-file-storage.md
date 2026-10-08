# 0004 — File storage: Azure Blob Storage

**Status:** Accepted (2026-10-08)

## Context

Receipts, invoices, manuals, equipment photos and desk photos need durable private storage. Minato uses Azure Blob Storage with Azurite locally and SAS URLs for downloads.

## Decision

- Azure Blob Storage (`@azure/storage-blob`), one private container. Blob paths are prefixed `org/{organisationId}/...` so blobs are partitioned by tenant even outside the database.
- Uploads go through our API routes (no direct browser-to-blob uploads in the MVP). Size caps by kind: images 10 MB, PDFs 20 MB. MIME type is sniffed from magic bytes, never trusted from the client. Allow-list: JPEG, PNG, WebP, HEIC, PDF. Filenames are sanitised.
- Downloads use short-lived read-only SAS URLs, issued after a tenant check.
- Virus scanning: Microsoft Defender for Storage malware scanning when the infrastructure lands (Phase 8). Until then, the type allow-list and size caps are the only controls.
- Manufacturer PDFs and images are **never** stored (ADR 0008); we only link to them.

## Consequences

- Same local dev setup as Minato (`USE_AZURITE=true`, docker-compose Azurite).
- An `Attachment` table records metadata; blobs are deleted with their owning entity.
