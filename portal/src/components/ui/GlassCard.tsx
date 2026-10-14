import React from 'react';
import { cn } from '../../lib/cn';

export function GlassCard({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass-card p-5', className)} {...rest}>
      {children}
    </div>
  );
}
