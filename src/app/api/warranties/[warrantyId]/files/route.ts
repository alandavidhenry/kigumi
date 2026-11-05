import { NextResponse } from 'next/server'

import { toErrorResponse } from '@/lib/api'
import { addWarrantyFile } from '@/lib/maintenance/warranty'
import { readUploadedFile } from '@/lib/request-body'
import { getTenantContext } from '@/lib/tenant-context'

interface RouteContext {
  params: Promise<{ warrantyId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const ctx = await getTenantContext()
    const { warrantyId } = await params
    const file = await readUploadedFile(request, 'Choose a file to upload')
    const attachment = await addWarrantyFile(ctx, warrantyId, file)
    return NextResponse.json({ file: attachment }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
