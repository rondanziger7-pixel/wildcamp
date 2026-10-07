export const ISSUES_URL = 'https://github.com/rondanziger7-pixel/wildcamp/issues/new';

export interface ReportInput {
  lat: number;
  lng: number;
  municipality?: string;
  canton?: string;
  verdict: string;
  /** Link to this spot in the app. */
  link: string;
}

/**
 * A prefilled GitHub issue for reporting a rule that is missing or wrong. Nothing is sent from the app: the
 * reporter sees the issue page first and decides whether to submit it.
 */
export function reportUrl(r: ReportInput): string {
  const place = reportPlace(r);
  return `${ISSUES_URL}?${new URLSearchParams({ title: `Rule report: ${place}`, body: reportBody(r), labels: 'rule-report' })}`;
}

const reportPlace = (r: ReportInput) => [r.municipality, r.canton].filter(Boolean).join(', ') || `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`;

/** The same report as plain text, to copy and send by any channel when the person has no GitHub account. */
export function reportText(r: ReportInput): string {
  return `Rule report: ${reportPlace(r)}\n\n${reportBody(r)}\n\nSend to: ${ISSUES_URL.replace('/issues/new', '/issues')}`;
}

function reportBody(r: ReportInput): string {
  const place = reportPlace(r);
  return [
    `**Place:** ${place}`,
    `**Spot:** ${r.link}`,
    `**The app said:** ${r.verdict}`,
    '',
    '**What is missing or wrong?**',
    '',
    '',
    '**Official source** (the municipality\'s or canton\'s own page or PDF, article number if you can):',
    '',
    '',
    '_Reports are checked against the source text before a rule is added; press articles and guides alone are not enough._',
  ].join('\n');
}
