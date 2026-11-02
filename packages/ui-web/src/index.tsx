import { AlertTriangle, Inbox } from 'lucide-react';
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from 'react';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

const BUTTON = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken',
  ghost: 'text-muted hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-bad border border-line hover:bg-bad-soft',
} as const;

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-base font-medium whitespace-nowrap transition-colors lg:min-h-9',
        'disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON[variant],
        className,
      )}
      {...props}
    />
  );
}

const CONTROL =
  'min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink lg:min-h-9 aria-[invalid=true]:border-bad';

interface FieldShell {
  label: string;
  hint?: string;
  error?: string | null;
}

function FieldFrame({ id, label, hint, error, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-note`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-note`} className="text-xs text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className={cx(CONTROL, className)}
        {...props}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-note` : undefined}
        className={cx(CONTROL, className)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

const TONE = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent-text',
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
} as const;
export type Tone = keyof typeof TONE;

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('min-w-0 rounded-lg border border-line bg-surface shadow-tile', className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-4 py-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageHead({ title, note, actions }: { title: string; note?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-h1-sm font-semibold tracking-tight text-balance text-ink lg:text-h1">{title}</h1>
        {note ? <p className="mt-1 max-w-prose text-base text-muted">{note}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function KpiTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3.5 shadow-tile">
      <div className="truncate text-sm text-muted">{label}</div>
      <div className="text-kpi leading-none font-semibold tracking-tight text-ink tabular-nums">{value}</div>
      {detail ? <div className="text-xs text-muted">{detail}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-6">
      <Inbox aria-hidden className="size-5 text-muted" />
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      {children ? <p className="max-w-prose text-base text-muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 p-6">
      <AlertTriangle aria-hidden className="size-5 text-bad" />
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="max-w-prose text-base text-muted">{message}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

/** Holds the layout while loading. Announced once by its parent region, so it stays silent itself. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx('animate-pulse rounded-md bg-sunken motion-reduce:animate-none', className)}
    />
  );
}

export function Loading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6" />
      ))}
    </div>
  );
}

export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-base tabular-nums">{children}</table>
    </div>
  );
}

export const Th = ({ children, numeric }: { children?: ReactNode; numeric?: boolean }) => (
  <th
    scope="col"
    className={cx(
      'border-b border-line px-4 py-2 text-sm font-medium whitespace-nowrap text-muted',
      numeric && 'text-right',
    )}
  >
    {children}
  </th>
);

export const Td = ({ children, numeric }: { children?: ReactNode; numeric?: boolean }) => (
  <td className={cx('border-b border-line-2 px-4 py-2 text-ink', numeric && 'text-right whitespace-nowrap')}>
    {children}
  </td>
);

export type SurveyMarkState = 'passed' | 'soon' | 'upcoming';
export interface SurveyMark {
  date: string;
  label: string;
  state: SurveyMarkState;
}

const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;

/** Where a date sits on the line, as a percentage, kept on the line when it falls outside. */
export function surveyPosition(date: string, from: string, to: string): number {
  const span = dayNumber(to) - dayNumber(from);
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((dayNumber(date) - dayNumber(from)) / span) * 100));
}

const MARK = { passed: 'bg-bad', soon: 'bg-warn', upcoming: 'bg-accent' } as const;
const WORD = { passed: 'Passed', soon: 'Soon', upcoming: 'Upcoming' } as const;

/**
 * The surveyed date line: a lease's dates measured out to scale like a dimension line on a drawing.
 * State is carried by the word as well as the colour.
 */
export function SurveyLine({ asOf, marks }: { asOf: string; marks: SurveyMark[] }) {
  const sorted = [...marks].sort((a, b) => a.date.localeCompare(b.date));
  const dates = [asOf, ...sorted.map((m) => m.date)].sort();
  const from = dates[0]!;
  const to = dates[dates.length - 1]!;
  const firstYear = Number(from.slice(0, 4)) + 1;
  const lastYear = Number(to.slice(0, 4));
  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y += 1) years.push(y);
  return (
    <figure className="m-0 flex flex-col gap-3">
      <div aria-hidden className="relative mx-2 mt-1 mb-6 h-6">
        <div className="absolute inset-x-0 top-3 border-t border-faint" />
        <div className="absolute top-1.5 left-0 h-3 border-l border-faint" />
        <div className="absolute top-1.5 right-0 h-3 border-r border-faint" />
        {years.map((y) => {
          const left = surveyPosition(`${y}-01-01`, from, to);
          return (
            <div key={y} className="absolute top-2 h-2 border-l border-faint" style={{ left: `${left}%` }}>
              <span className="absolute top-3 -translate-x-1/2 text-xs text-muted tabular-nums">{y}</span>
            </div>
          );
        })}
        <div
          className="absolute top-0 h-6 border-l-2 border-ink"
          style={{ left: `${surveyPosition(asOf, from, to)}%` }}
        />
        {sorted.map((m) => (
          <div
            key={`${m.date}${m.label}`}
            className={cx(
              'absolute top-2 size-2 -translate-x-1/2 rounded-full ring-2 ring-surface',
              MARK[m.state],
            )}
            style={{ left: `${surveyPosition(m.date, from, to)}%` }}
          />
        ))}
      </div>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {sorted.map((m) => (
          <li key={`${m.date}${m.label}`} className="flex flex-wrap items-baseline gap-x-3 text-base">
            <span className="font-medium text-ink tabular-nums">{m.date}</span>
            <span className="text-ink">{m.label}</span>
            <span className="text-xs text-muted">{WORD[m.state]}</span>
          </li>
        ))}
      </ol>
      <figcaption className="text-xs text-muted">Heavy tick marks today, {asOf}.</figcaption>
    </figure>
  );
}
