import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type Variant = 'default' | 'accent' | 'success' | 'warning' | 'purple';

const variantStyles: Record<Variant, string> = {
  default: 'border-border bg-surface text-muted',
  accent: 'border-border-bright bg-accent-glow text-accent-bright',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  purple: 'border-purple/30 bg-purple/10 text-purple',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
