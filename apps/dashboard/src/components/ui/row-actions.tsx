'use client';

import * as React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Hidden actions are omitted entirely, which is how role-based actions are implemented. */
  hidden?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
}

/** The "..." menu at the end of a table row. Renders nothing when no action is available. */
function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((action) => (
          <React.Fragment key={action.label}>
            {action.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              destructive={action.destructive}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { RowActions };
