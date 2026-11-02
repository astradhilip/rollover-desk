'use client';

import { Button } from '@rollover-desk/ui-web';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarDays,
  Columns3,
  FileSpreadsheet,
  LayoutGrid,
  LogOut,
  Menu,
  Scale,
  Settings,
  Table2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { id } = useParams<{ id?: string }>();
  const [open, setOpen] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  // Only claims signed out once the cookie is really gone.
  async function signOut() {
    setSignOutFailed(false);
    const response = await fetch('/api/session', { method: 'DELETE' }).catch(() => null);
    if (response?.ok) window.location.assign('/sign-in');
    else setSignOutFailed(true);
  }

  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: '/', label: 'Properties', icon: Building2 },
    ...(id
      ? [
          { href: `/p/${id}`, label: 'Desk', icon: LayoutGrid },
          { href: `/p/${id}/leases`, label: 'Leases', icon: Table2 },
          { href: `/p/${id}/pipeline`, label: 'Renewal pipeline', icon: Columns3 },
          { href: `/p/${id}/dates`, label: 'Critical dates', icon: CalendarDays },
          { href: `/p/${id}/rent-rolls`, label: 'Rent rolls', icon: FileSpreadsheet },
          { href: `/p/${id}/weights`, label: 'Risk weights', icon: Scale },
        ]
      : []),
    { href: '/account', label: 'Account', icon: Settings },
  ];

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[var(--side-width)_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-surface focus:p-2"
      >
        Skip to content
      </a>
      <div className="flex items-center justify-between border-b border-side-line bg-side-bg px-4 py-2 lg:hidden">
        <span className="text-lg font-semibold text-side-ink">Rollover Desk</span>
        <Button variant="ghost" aria-expanded={open} aria-controls="side-nav" onClick={() => setOpen(!open)}>
          {open ? <X aria-hidden className="size-4" /> : <Menu aria-hidden className="size-4" />}
          Menu
        </Button>
      </div>
      <aside
        id="side-nav"
        className={`${open ? 'flex' : 'hidden'} flex-col gap-4 border-b border-side-line bg-side-bg p-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:border-r lg:border-b-0`}
      >
        <div className="hidden px-2 pt-1 text-lg font-semibold text-side-ink lg:block">Rollover Desk</div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active =
              href === pathname || (href.split('/').length > 3 && pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-base lg:min-h-9 ${
                  active
                    ? 'bg-side-active-bg font-medium text-side-active-ink'
                    : 'text-side-muted hover:text-side-ink'
                }`}
              >
                <Icon aria-hidden className="size-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-side-line pt-3">
          <div className="min-w-0 px-2 text-xs text-side-muted">
            <div className="truncate font-medium text-side-ink">{me.data?.organizationName ?? ' '}</div>
            <div className="truncate">{me.data?.email ?? ' '}</div>
          </div>
          <Button variant="ghost" className="justify-start text-side-muted" onClick={signOut}>
            <LogOut aria-hidden className="size-4" />
            Sign out
          </Button>
          {signOutFailed ? (
            <p role="alert" className="px-2 text-xs text-bad">
              You’re still signed in. Check your connection and try again.
            </p>
          ) : null}
        </div>
      </aside>
      <main id="main" className="mx-auto flex w-full max-w-7xl min-w-0 flex-col gap-4 p-4 lg:p-6">
        {children}
      </main>
    </div>
  );
}
