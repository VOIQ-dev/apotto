'use client';

import { Tooltip as MantineTooltip } from '@mantine/core';
import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  className?: string;
}

export function Tooltip({
  content,
  children,
  className = '',
}: TooltipProps) {
  return (
    <MantineTooltip
      label={content}
      withinPortal
      withArrow
      offset={8}
      position="top"
      color="dark"
      classNames={{
        tooltip:
          'bg-slate-900/95 border border-white/10 text-slate-100 text-[11px] font-medium shadow-xl',
        arrow: 'text-slate-900/95',
      }}
      transitionProps={{ transition: 'fade', duration: 120 }}
    >
      <span className={className}>{children}</span>
    </MantineTooltip>
  );
}

