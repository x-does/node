import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

interface SectionProps extends HTMLAttributes<HTMLElement> {
  heading?: string;
  subheading?: string;
}

export function Section({ heading, subheading, className, children, ...props }: SectionProps) {
  return (
    <section className={cn('mx-auto max-w-6xl px-4 py-16', className)} {...props}>
      {(heading || subheading) && (
        <div className="mb-10">
          {heading && <h2 className="font-display text-2xl font-bold text-foreground md:text-3xl">{heading}</h2>}
          {subheading && <p className="mt-2 text-muted">{subheading}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
