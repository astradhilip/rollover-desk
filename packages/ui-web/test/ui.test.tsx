import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorState, surveyPosition, SurveyLine, TextField } from '../src/index';

describe('surveyPosition', () => {
  it('measures to scale, by hand: 2026-01-01 to 2026-12-31 is 364 days, and 2026-07-02 is day 182', () => {
    expect(surveyPosition('2026-07-02', '2026-01-01', '2026-12-31')).toBe(50);
  });
  it('keeps out-of-range dates on the line, and survives a zero span', () => {
    expect(surveyPosition('2030-01-01', '2026-01-01', '2027-01-01')).toBe(100);
    expect(surveyPosition('2020-01-01', '2026-01-01', '2027-01-01')).toBe(0);
    expect(surveyPosition('2026-01-01', '2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('components', () => {
  it('lists every date in order with its state in words', () => {
    const html = renderToStaticMarkup(
      <SurveyLine
        asOf="2026-01-15"
        marks={[
          { date: '2029-01-31', label: 'Expiration', state: 'upcoming' },
          { date: '2025-12-01', label: 'Notice', state: 'passed' },
        ]}
      />,
    );
    expect(html.indexOf('2025-12-01')).toBeLessThan(html.indexOf('2029-01-31'));
    expect(html).toContain('Passed');
    expect(html).toContain('Upcoming');
  });
  it('ties a field error to its input', () => {
    const html = renderToStaticMarkup(<TextField label="Email" error="Enter an email." />);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]+-note"/);
    expect(html).toContain('Enter an email.');
  });
  it('announces an error', () => {
    expect(renderToStaticMarkup(<ErrorState title="x" message="y" />)).toContain('role="alert"');
  });
});
