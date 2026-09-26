import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        // Status tones from DESIGN.md (fg on bg), one per meaning — so
        // "En curso", "Finalizada" and "Programada" stop being the same
        // grey pill. Dark variants keep the same hue at lower luminance.
        success:
          'border-transparent bg-[#dcfce7] text-[#166534] dark:bg-[rgb(22_101_52/0.4)] dark:text-[#bbf7d0]',
        warning:
          'border-transparent bg-[#fef3c7] text-[#92400e] dark:bg-[rgb(146_64_14/0.4)] dark:text-[#fde68a]',
        danger:
          'border-transparent bg-[#fee2e2] text-[#991b1b] dark:bg-[rgb(153_27_27/0.4)] dark:text-[#fecaca]',
        info: 'border-transparent bg-[#dbeafe] text-[#1e40af] dark:bg-[rgb(30_64_175/0.4)] dark:text-[#bfdbfe]',
        neutral: 'border-transparent bg-[#27272a] text-[#fafafa] dark:bg-[#3f3f46]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
