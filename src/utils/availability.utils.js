
// Configuration constants for availability calculation
const AVAILABILITY_CONFIG = {
  MAX_SLOTS_PER_DAY: 5,
  MAX_DAYS_TO_CHECK: 30,
  INCLUDE_TODAY: false
};

const toPositiveInteger = (value, fallback, fieldName) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new TypeError(`${fieldName} must be a non-negative integer`);
  }

  return parsedValue;
};

const normalizeDate = (value) => {
  // Handle empty/null values
  if (!value) {
    return null;
  }

  // Parse string or create from timestamp
  const date = new Date(value);
  
  // Validate the parsed date
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Set time to midnight for day-level comparison
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const isHoliday = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('date must be a valid Date instance');
  }

  return date.getDay() === 0; // 0 = Sunday
};


exports.calculateAvailableSlots = (teamJobs, options = {}) => {
  if (!Array.isArray(teamJobs)) {
    throw new TypeError('teamJobs must be an array');
  }

  
  const safeOptions = options && typeof options === 'object' ? options : {};

  
  const {
    maxSlots = AVAILABILITY_CONFIG.MAX_SLOTS_PER_DAY,
    maxDaysToCheck = AVAILABILITY_CONFIG.MAX_DAYS_TO_CHECK,
    includeToday = AVAILABILITY_CONFIG.INCLUDE_TODAY
  } = safeOptions;

  const requestedSlots = toPositiveInteger(maxSlots, AVAILABILITY_CONFIG.MAX_SLOTS_PER_DAY, 'maxSlots');
  const daysLimit = toPositiveInteger(maxDaysToCheck, AVAILABILITY_CONFIG.MAX_DAYS_TO_CHECK, 'maxDaysToCheck');
  const includeCurrentDay = Boolean(includeToday);

  
  if (requestedSlots === 0 || daysLimit === 0) {
    return [];
  }

  const availableSlots = [];
  
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  
  const busyDates = new Set();
  for (const job of teamJobs) {
    if (!job || typeof job !== 'object') {
      continue;
    }

    const normalizedDate = normalizeDate(job.serviceDate || job.scheduledDate || job.date);
    if (normalizedDate !== null) {
      busyDates.add(normalizedDate);
    }
  }

  
  let checkDate = new Date(today);
  if (!includeCurrentDay) {
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  let daysChecked = 0;

  
  while (availableSlots.length < requestedSlots && daysChecked < daysLimit) {
    // WHY: Skip holidays and booked dates so the UI only shows usable appointment options.
    if (!isHoliday(checkDate) && !busyDates.has(checkDate.getTime())) {
      availableSlots.push(new Date(checkDate));
    }

    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1);
    daysChecked += 1;
  }

  return availableSlots;
};


exports.DEFAULT_AVAILABILITY_OPTIONS = Object.freeze({
  MAX_SLOTS_PER_DAY: AVAILABILITY_CONFIG.MAX_SLOTS_PER_DAY,
  MAX_DAYS_TO_CHECK: AVAILABILITY_CONFIG.MAX_DAYS_TO_CHECK,
  INCLUDE_TODAY: AVAILABILITY_CONFIG.INCLUDE_TODAY
});