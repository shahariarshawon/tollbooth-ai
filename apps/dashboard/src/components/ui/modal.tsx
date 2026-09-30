'use client';

import * as React from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/** The standard modal: title, optional description, body and footer. Every form uses this. */
function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={className}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
}

/** Confirmation for irreversible or disruptive actions (delete, revoke, suspend). */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  loading = false,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Modal>
  );
}

interface FormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  submitting?: boolean;
  /** Error from the last submit attempt, shown above the buttons. */
  error?: string | null;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  children: React.ReactNode;
}

/** A modal containing a form, with consistent Cancel/Submit buttons and error display. */
function FormModal({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  submitting = false,
  error,
  onSubmit,
  children,
}: FormModalProps) {
  const formId = React.useId();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      {...(description ? { description } : {})}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={submitting}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {children}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

export { Modal, ConfirmDialog, FormModal };
