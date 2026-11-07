import type { RateValue } from './rates';
import { CONFIG } from '../config';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatAmount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function rateText(value: RateValue): string {
  if (typeof value === 'number') return `${CONFIG.currency} ${formatAmount(value)}`;
  if (typeof value === 'string' && value.trim()) return value;
  return '—';
}

/** period = year * 100 + month  (e.g. 202603 → "March 2026") */
export function periodLabel(period: number, short = false): string {
  if (!period) return '';
  const year = Math.floor(period / 100);
  const month = period % 100;
  if (!month) return String(year);
  const name = MONTHS[month - 1] ?? '';
  return `${short ? name.slice(0, 3) : name} ${year}`;
}

export function formatDateTime(input: number | string | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
