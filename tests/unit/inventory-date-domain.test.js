const assert = require('node:assert/strict');
const {
  toBusinessDateString,
  isLoanOverdue,
  BUSINESS_TIMEZONE,
} = require('../../src/utils/inventory-domain');

describe('Inventory Date-Only and Timezone Semantics (IM-013)', () => {
  describe('toBusinessDateString', () => {
    it('defaults to Asia/Colombo business timezone', () => {
      assert.equal(BUSINESS_TIMEZONE, 'Asia/Colombo');
    });

    it('preserves date-only strings without timezone drift', () => {
      assert.equal(toBusinessDateString('2026-09-05'), '2026-09-05');
      assert.equal(toBusinessDateString('2024-02-29'), '2024-02-29'); // Leap day
      assert.equal(toBusinessDateString('2026-12-31'), '2026-12-31');
    });

    it('extracts date from UTC midnight ISO strings', () => {
      assert.equal(toBusinessDateString('2026-09-05T00:00:00.000Z'), '2026-09-05');
      assert.equal(toBusinessDateString('2024-02-29T00:00:00Z'), '2024-02-29');
    });

    it('formats UTC midnight Date objects without back-shifting in positive timezones', () => {
      const utcMidnight = new Date('2026-09-05T00:00:00.000Z');
      assert.equal(toBusinessDateString(utcMidnight, 'Asia/Colombo'), '2026-09-05');
      assert.equal(toBusinessDateString(utcMidnight, 'America/New_York'), '2026-09-05');
    });

    it('correctly shifts calendar day based on business timezone offset', () => {
      // 2026-09-05 20:00:00 UTC is 2026-09-06 01:30:00 in Asia/Colombo (UTC+5:30)
      const eveningInstant = new Date('2026-09-05T20:00:00.000Z');
      assert.equal(toBusinessDateString(eveningInstant, 'Asia/Colombo'), '2026-09-06');
      // In America/New_York (UTC-4 in Sep DST), it is 2026-09-05 16:00:00
      assert.equal(toBusinessDateString(eveningInstant, 'America/New_York'), '2026-09-05');
    });

    it('handles invalid or empty inputs gracefully', () => {
      assert.equal(toBusinessDateString(null), '');
      assert.equal(toBusinessDateString(undefined), toBusinessDateString(new Date()));
      assert.equal(toBusinessDateString('invalid-date'), '');
    });
  });

  describe('isLoanOverdue', () => {
    it('considers a loan ON TIME for the entire stated due date', () => {
      const dueDate = '2026-09-05';
      // Morning of due date
      const morningRef = new Date('2026-09-05T04:00:00.000Z'); // 09:30 Colombo
      assert.equal(isLoanOverdue(dueDate, morningRef, 'Asia/Colombo'), false);

      // Evening of due date
      const eveningRef = new Date('2026-09-05T17:30:00.000Z'); // 23:00 Colombo
      assert.equal(isLoanOverdue(dueDate, eveningRef, 'Asia/Colombo'), false);
    });

    it('marks a loan OVERDUE once the next calendar day begins in business timezone', () => {
      const dueDate = '2026-09-05';
      // 00:01 on 2026-09-06 Colombo is 2026-09-05 18:31 UTC
      const nextDayMidnightRef = new Date('2026-09-05T18:31:00.000Z');
      assert.equal(isLoanOverdue(dueDate, nextDayMidnightRef, 'Asia/Colombo'), true);

      // Midday next day
      const nextDayMiddayRef = new Date('2026-09-06T06:30:00.000Z'); // 12:00 Colombo
      assert.equal(isLoanOverdue(dueDate, nextDayMiddayRef, 'Asia/Colombo'), true);
    });

    it('marks future due dates as not overdue', () => {
      const dueDate = '2026-09-10';
      const currentRef = new Date('2026-09-05T08:00:00.000Z');
      assert.equal(isLoanOverdue(dueDate, currentRef, 'Asia/Colombo'), false);
    });

    it('returns false for missing or invalid dates', () => {
      assert.equal(isLoanOverdue(null), false);
      assert.equal(isLoanOverdue(''), false);
      assert.equal(isLoanOverdue('invalid'), false);
    });
  });
});
