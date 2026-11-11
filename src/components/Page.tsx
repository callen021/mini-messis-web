import { type ReactNode, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '@/lib/cn';
import { ChevronLeftIcon } from './icons';

export interface PageBack {
  to: string;
  label: string;
  /**
   * Go back in history instead of pushing `to` (D61): the opener keeps its scroll position. Falls
   * back to `to` when there is no in-app history (a direct link or a reload).
   */
  pop?: boolean;
}

export interface PageProps {
  /** Large iOS-style title. */
  title: ReactNode;
  /** Document title; defaults to `title` when it is a string. */
  documentTitle?: string;
  /** Muted line under the title. */
  sub?: ReactNode;
  /** Back link rendered above the title. */
  back?: PageBack;
  /** Control shown at the right of the title (e.g. a round + button). */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** True when the router has an earlier entry of our own to go back to. */
function canPop(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  return idx > 0;
}

function BackLink({ back }: { back: PageBack }) {
  const navigate = useNavigate();
  if (back.pop && canPop()) {
    return (
      <button type="button" className="back" onClick={() => navigate(-1)}>
        <ChevronLeftIcon />
        {back.label}
      </button>
    );
  }
  return (
    <Link to={back.to} className="back">
      <ChevronLeftIcon />
      {back.label}
    </Link>
  );
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
          <BackLink back={back} />
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
