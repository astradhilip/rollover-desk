'use client';

import { PageHead, Panel } from '@rollover-desk/ui-web';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function AccountPage() {
  const { theme, setTheme } = useTheme();
  // The saved theme is only known in the browser.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <>
      <PageHead title="Account" />
      <Panel title="Theme">
        <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-4">
          <legend className="sr-only">Theme</legend>
          {OPTIONS.map((o) => (
            <label key={o.value} className="flex min-h-11 items-center gap-2 text-base text-ink lg:min-h-9">
              <input
                type="radio"
                name="theme"
                value={o.value}
                checked={ready && theme === o.value}
                onChange={() => setTheme(o.value)}
                className="size-4 accent-accent"
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      </Panel>
    </>
  );
}
