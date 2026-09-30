'use client';

import * as React from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { IssuedApiKey } from '@/types/api';

/**
 * The only place a full API key is ever displayed. The parent keeps it in state just long enough to
 * render this dialog and discards it on close; it is never stored, logged or put in the URL.
 */
export function SecretRevealDialog({
  issued,
  onClose,
}: {
  issued: IssuedApiKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [copyFailed, setCopyFailed] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.secret);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      // Clipboard access can be blocked; the key is selectable in the box below.
      setCopyFailed(true);
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Your new API key"
      description={`Key "${issued.apiKey.name}" for ${issued.apiKey.projectName}.`}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <p className="flex items-start gap-2 rounded-md bg-warning/15 px-3 py-2 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        Copy this key now. For your security it will not be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code
          data-testid="api-key-secret"
          className="min-w-0 flex-1 select-all break-all rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm"
        >
          {issued.secret}
        </code>
        <Button variant="outline" size="icon" onClick={() => void copy()} aria-label="Copy key">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
        {copied && 'Copied to clipboard.'}
        {copyFailed && 'Could not copy automatically. Select the key and copy it manually.'}
      </p>
    </Modal>
  );
}
