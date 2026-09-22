import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="panel panel-sheen flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel-high text-xl text-muted"
      >
        {icon ?? '○'}
      </div>
      <h3 className="text-base font-semibold tracking-wide text-ink">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-pretty text-muted">{description}</p>
      ) : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
