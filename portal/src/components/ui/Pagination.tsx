import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '../../types/productoDanado';
import { Button } from './Button';

export function Pagination({ meta, onPageChange }: { meta: PaginationMeta; onPageChange: (page: number) => void }) {
  return (
    <div className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="opacity-70 tabular-nums">
        {meta.total} resultado{meta.total === 1 ? '' : 's'} · página {meta.page} de {meta.totalPages}
      </span>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
          <ChevronLeft size={16} /> Anterior
        </Button>
        <Button variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
          Siguiente <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
