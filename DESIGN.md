# Design

The Blueprint direction, chosen by the user: a rent roll surveyed like a drawing. Written from the built system; `packages/design-tokens/src/index.ts` holds the values and is the only source of them.

## Register

Operate. An analyst working beside Excel. Scanning and trust come first, and character lives in precise details: hairline rules, tabular figures and the surveyed date line.

## Colour

Restrained: cool neutrals plus one accent. Light is navy ink on crisp white over a pale blue-grey ground. Dark is cyan line work on deep navy, with a darker side nav. Both follow the system setting, and Account can pin one.

| Role                | Tokens                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Ground and surfaces | `bg`, `surface`, `sunken`                                                |
| Text                | `ink`, `muted`. `faint` is for rules and ticks only: it fails AA as text |
| Rules               | `line`, `line-2`                                                         |
| Action              | `accent` with `accent-ink`; `accent-soft` with `accent-text`             |
| State               | `good`, `warn`, `bad`, each with a `-soft` ground                        |
| Side nav            | `side-*`                                                                 |
| Chart series        | `c1` to `c5`                                                             |

State is never colour alone: pair it with a word.

## Type

Geist, self-hosted through the `geist` package. Figures are tabular wherever they line up.

| Token          | Size           | Use                              |
| -------------- | -------------- | -------------------------------- |
| `h1` / `h1-sm` | 28 / 24px, 600 | Page title, smaller under 1024px |
| `kpi`          | 26px, 600      | KPI values                       |
| `h2`           | 17px           | Reserved for larger sections     |
| `lg`           | 15px, 600      | Panel titles                     |
| `base`         | 13.5px         | Body and tables                  |
| `sm`, `xs`     | 12.5, 12px     | Labels, notes                    |

## Shape and depth

Radii are 4 (`sm`, badges), 6 (`md`, controls) and 8 (`lg`, panels and tiles). Panels have a 1px rule and, in light only, a faint shadow. No nested cards.

## Layout

A 236px side nav and a content column up to `max-w-7xl`. Under 1024px the nav folds behind a Menu button in a top bar, and targets grow to 44px. Tables scroll inside their own region, never the page.

## Components

From `packages/ui-web`: `Button`, `TextField`, `SelectField`, `Badge`, `Panel`, `PageHead`, `KpiTile`, `EmptyState`, `ErrorState`, `Skeleton`, `Loading`, `TableWrap`, `Th`, `Td`, `SurveyLine`.

**The surveyed date line** is the signature: a lease's dates measured to scale along a dimension line with end ticks and year ticks, a heavy tick for today, and a dated list beneath so nothing relies on the drawing alone.

**KPI tiles** have no trend lines yet, unlike the original direction. There is no history to plot, and a line with nothing behind it would be invented.

## Rules

- No raw colours, sizes or default palette classes outside `design-tokens`. ESLint, Stylelint and the design detector enforce this in `pnpm check`.
- Loading, empty and error states are distinct, and errors say how to recover.
- A missing value reads "Not recorded", never zero.
- No eyebrows, gradient text, colored side borders or decorative sparklines.
- Motion only answers an action. Skeletons stop under reduced motion.
