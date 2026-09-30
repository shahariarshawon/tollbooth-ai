import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

interface PaginationProps {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}

function Pagination({ offset, limit, total, onChange }: PaginationProps) {
  if (total <= limit) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {from}-{to} of {total}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
        >
          <ChevronLeft /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange(offset + limit)}
          disabled={offset + limit >= total}
        >
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export { Pagination };
