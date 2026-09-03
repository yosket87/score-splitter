'use client'

import { useRef, type ReactNode } from 'react'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

interface ResponsiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  title: string
  description: string
  children: ReactNode
  dialogContentClassName?: string
  drawerContentClassName?: string
  drawerBodyClassName?: string
  onCloseAutoFocus?: (event: Event) => void
}

export function ResponsiveModal({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  dialogContentClassName,
  drawerContentClassName,
  drawerBodyClassName,
  onCloseAutoFocus,
}: ResponsiveModalProps) {
  const isMobile = useIsMobile()
  const drawerRef = useRef<HTMLDivElement>(null)

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
        <DrawerContent
          ref={drawerRef}
          onOpenAutoFocus={(event) => {
            // メニューなど外部から開いた場合、入力欄を避けて本体にフォーカスを移す。
            if (!trigger) {
              event.preventDefault()
              drawerRef.current?.focus()
            }
          }}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn('app-modal-surface app-solid-panel px-4 pb-safe', drawerContentClassName)}
        >
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className={cn('pb-4', drawerBodyClassName)}>
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className={cn('app-modal-surface app-solid-panel', dialogContentClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
