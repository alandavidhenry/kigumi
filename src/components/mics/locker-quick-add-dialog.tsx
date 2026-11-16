'use client'

import { Zap } from 'lucide-react'
import { useState } from 'react'

import { MicQuickAdd } from '@/components/mics/mic-quick-add'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'

export function LockerQuickAddDialog({
  rooms
}: {
  readonly rooms: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='surface'>
          <Zap />
          Quick add
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Quick add microphones</DialogTitle>
          <DialogDescription>
            Search the catalogue and add several microphones at once.
          </DialogDescription>
        </DialogHeader>
        <MicQuickAdd rooms={rooms} compact onAdded={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
