'use strict';

/**
 * Manager Work-Item Domain (Epic 27 / PLAN2)
 *
 * Pure, stateless domain functions for normalizing and classifying
 * work items (service tickets, maintenance, installations, inspections)
 * surfaced in the Manager portal.
 *
 * These functions have no side effects and no database access; they
 * operate only on plain objects and primitives.
 */

// ── Source-type normalization ────────────────────────────────────────────────

const SOURCE_TYPE_MAP = {
  'service-ticket': 'service',
  'service_ticket': 'service',
  'inspection-ticket': 'inspection',
  'inspection_ticket': 'inspection',
  'installation-ticket': 'installation',
  'installation_ticket': 'installation',
  'maintenance-ticket': 'maintenance',
  'maintenance_ticket': 'maintenance',
};

/**
 * Maps raw/legacy source type strings to canonical lowercase identifiers.
 * Unknown values are returned as-is lowercased.
 *
 * @param {string} raw
 * @returns {string}
 */
function canonicalSourceType(raw) {
  if (!raw) return raw;
  const lower = String(raw).toLowerCase();
  return SOURCE_TYPE_MAP[lower] || lower;
}

// ── Status normalization ─────────────────────────────────────────────────────

const SERVICE_STATUS_MAP = {
  'New': 'open',
  'Reviewed': 'in-progress',
  'Assigned': 'in-progress',
  'In Progress': 'in-progress',
  'in-progress': 'in-progress',
  'Resolved': 'resolved',
  'resolved': 'resolved',
  'Escalated': 'escalated',
  'escalated': 'escalated',
  // Cancelled and Rejected are both dead-end, non-actionable states — neither
  // is "escalated" (which implies work still needs manager attention).
  'Cancelled': 'cancelled',
  'cancelled': 'cancelled',
  'Rejected': 'cancelled',
  'rejected': 'cancelled',
  'Closed': 'closed',
  'closed': 'closed',
  'completed': 'completed',
  'Completed': 'completed',
};

const INSTALLATION_STATUS_MAP = {
  'Pending': 'open',
  'pending': 'open',
  'Assigned': 'in-progress',
  'Scheduled': 'scheduled',
  'scheduled': 'scheduled',
  'In Progress': 'in-progress',
  'in-progress': 'in-progress',
  'Completed': 'completed',
  'completed': 'completed',
  'Cancelled': 'cancelled',
  'cancelled': 'cancelled',
};

const INSPECTION_STATUS_MAP = {
  INSPECTED: 'resolved',
  // A rejected payment still needs manager attention (chase the customer,
  // decide next steps) — unlike Cancelled/Rejected tickets, this is not a
  // dead end, so it correctly stays 'escalated' rather than 'cancelled'.
  PAYMENT_REJECTED: 'escalated',
  INSPECTION_SCHEDULED: 'in-progress',
  ONGOING: 'in-progress',
  REPORT_RECORDED: 'in-progress',
};

/**
 * Normalizes a raw service ticket status string to a canonical lowercase value.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeServiceStatus(raw) {
  if (!raw) return raw;
  return SERVICE_STATUS_MAP[raw] || String(raw).toLowerCase();
}

/**
 * Normalizes a raw installation ticket status string to a canonical lowercase value.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeInstallationStatus(raw) {
  if (!raw) return raw;
  return INSTALLATION_STATUS_MAP[raw] || String(raw).toLowerCase();
}

/**
 * Normalizes a raw inspection ticket status string to a canonical lowercase value.
 * Unmapped values (PENDING_PAYMENT, PAYMENT_UNDER_REVIEW, PAYMENT_CONFIRMED)
 * default to 'open' — the inspection is still awaiting action.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeInspectionStatus(raw) {
  if (!raw) return raw;
  return INSPECTION_STATUS_MAP[raw] || 'open';
}

// ── Terminal-state detection ─────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set([
  'cancelled', 'resolved', 'closed', 'completed',
]);

/**
 * Returns true when the canonical status represents a terminal (non-actionable) state.
 *
 * @param {string} status  Canonical lowercase status string.
 * @returns {boolean}
 */
function isTerminal(status) {
  return TERMINAL_STATUSES.has(String(status).toLowerCase());
}

// ── Assignment expectations ──────────────────────────────────────────────────

/**
 * Returns true when a work item is expected to have an assignment but does not.
 *
 * Rules:
 * - Inspection tickets are managed by the inspection workflow; assignment is never
 *   expected from the Manager portal.
 * - Service and maintenance tickets without an `assignedTechnicianId` are unassigned.
 * - Installation tickets without an `assignedTeamId` are unassigned.
 *
 * @param {{ sourceType: string, status?: string, assignedTechnicianId?: string, assignedTeamId?: string }} ticket
 * @returns {boolean}
 */
function isUnassigned(ticket) {
  const src = canonicalSourceType(ticket.sourceType);
  if (src === 'inspection') return false;
  if (src === 'service' || src === 'maintenance') {
    return !ticket.assignedTechnicianId;
  }
  if (src === 'installation') {
    return !ticket.assignedTeamId;
  }
  return false;
}

// ── SLA classification ───────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Classifies the SLA risk for a work item relative to `now`.
 *
 * - Returns `null` for terminal tickets or tickets without a due date.
 * - Returns `'overdue'` when `slaDueAt <= now`.
 * - Returns `'due-soon'` when `slaDueAt` is within the next 24 hours.
 * - Returns `null` otherwise (safe, no immediate risk).
 *
 * @param {{ status?: string, slaDueAt?: Date | string }} ticket
 * @param {Date} [now]  Reference point; defaults to `new Date()`.
 * @returns {'overdue' | 'due-soon' | null}
 */
function slaClassification(ticket, now = new Date()) {
  if (!ticket.slaDueAt) return null;
  if (isTerminal(ticket.status)) return null;

  const dueMs = new Date(ticket.slaDueAt).getTime();
  const nowMs = now.getTime();

  if (dueMs <= nowMs) return 'overdue';
  if (dueMs - nowMs <= TWENTY_FOUR_HOURS_MS) return 'due-soon';
  return null;
}

module.exports = {
  canonicalSourceType,
  normalizeServiceStatus,
  normalizeInstallationStatus,
  normalizeInspectionStatus,
  isTerminal,
  isUnassigned,
  slaClassification,
};
