import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Rollover Desk', template: '%s | Rollover Desk' },
  description: 'Rent roll in, explainable rollover and critical-date risk out.',
};

const CONTRACT = `<!--
THESIS: A rent roll surveyed like a drawing: every date measured to scale, every gap named. Refuses the SaaS metric-card wall.
OWN-WORLD: Blueprint. Navy ink on crisp white, or cyan line work on deep navy; Geist; radii 4, 6, 8; hairline rules.
STORY: The analyst sees what is at risk and why, then acts or exports.
FIRST VIEWPORT: Side nav 236px. Property name at 28px with today's date. Four KPI tiles. Attention queue beside the rollover chart.
FORM: User-pinned Blueprint direction, no roll. Code-led, no image generation here. Signature: the surveyed date line.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistSans.variable} suppressHydrationWarning>
      <body>
        <div hidden dangerouslySetInnerHTML={{ __html: CONTRACT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
