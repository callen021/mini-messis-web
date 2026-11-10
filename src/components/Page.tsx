import { type ReactNode, useEffect } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';
import { ChevronLeftIcon } from './icons';

export interface PageProps {
  /** Large iOS-style title. */
  title: ReactNode;
  /** Document title; defaults to `title` when it is a string. */
  documentTitle?: string;
  /** Muted line under the title. */
  sub?: ReactNode;
  /** Back link rendered above the title. */
  back?: { to: string; label: string };
  /** Control shown at the right of the title (e.g. a round + button). */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Standard page scaffold: optional back row, large title, subtitle, content. */
export function Page({ title, documentTitle, sub, back, action, className, children }: PageProps) {
  const docTitle = documentTitle ?? (typeof title === 'string' ? title : undefined);
  useEffect(() => {
    if (docTitle) document.title = `${docTitle} · Mini-Messi's`;
  }, [docTitle]);
  return (
    <section className={cn('page', className)}>
      {back && (
        <div className="backrow noprint">
          <Link to={back.to} className="back">
            <ChevronLeftIcon />
            {back.label}
          </Link>
        </div>
      )}
      {action ? (
        <div className="titlerow">
          <h1 className="large">{title}</h1>
          {action}
        </div>
      ) : (
        <h1 className="large">{title}</h1>
      )}
      {sub !== undefined && <p className="sub">{sub}</p>}
      {children}
    </section>
  );
}
