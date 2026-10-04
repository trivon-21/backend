const ITEM_CLASSES = [
  'AC Equipment',
  'Spare Parts',
  'Installation Materials',
  'Consumables',
  'Tools and Test Equipment',
  'Kits and Bundles',
  'Unclassified'
];

const ITEM_SUBCATEGORIES = {
  'AC Equipment': ['Split Indoor Unit', 'Split Outdoor Unit', 'Cassette Unit', 'Ducted Unit', 'Multi-Split / VRF Unit', 'Fan-Coil / Air-Handling Unit', 'Packaged / Rooftop Unit'],
  'Spare Parts': ['Compressor', 'Fan Motor', 'Blower / Fan Blade', 'Coil', 'PCB / Inverter Board', 'Electrical Control', 'Sensor / Thermostat / Remote', 'Valve', 'Filter-Drier / Sight Glass', 'Drain Pump / Louver Motor'],
  'Installation Materials': ['Copper Tube / Line Set', 'Copper Fitting / Flare Nut', 'Pipe Insulation', 'Drain Pipe / Hose', 'Bracket / Stand / Vibration Pad', 'Electrical / Communication Cable', 'Isolator / Breaker / Trunking', 'Ducting', 'Fastener / Tape / Sealant'],
  Consumables: ['Refrigerant', 'Nitrogen', 'Oil / Lubricant', 'Brazing Material', 'Cleaning Chemical', 'Disposable Filter', 'Sealant / Service Tape'],
  'Tools and Test Equipment': ['Vacuum Pump', 'Recovery Machine', 'Manifold Gauge', 'Vacuum / Micron Gauge', 'Leak Detector', 'Refrigerant Scale', 'Electrical Meter', 'Thermometer / Psychrometer / Anemometer', 'Flaring / Swaging Tool', 'Tube Tool', 'Torque Wrench'],
  'Kits and Bundles': ['Installation Kit', 'Line-Set Kit', 'Drain Kit', 'Maintenance Kit', 'Compressor Replacement Kit', 'Technician Tool Kit'],
  Unclassified: ['Unclassified']
};

// Storage addressing has three levels: a warehouse (code "A", shown as
// "Warehouse A"), the racks inside it ("R1".."R5"), and the numbered bins on
// each rack. A bin code is the physical label a product carries - warehouse
// letter + rack number + two-digit bin - so a full address reads
// "Warehouse A, R2, A201".
const WAREHOUSE_CODES = ['A', 'B', 'C'];
const RACKS_PER_WAREHOUSE = 5;
const BINS_PER_RACK = 5;

function warehouseLabelFor(warehouseCode) {
  return warehouseCode ? `Warehouse ${warehouseCode}` : '';
}

function binCodeFor(warehouseCode, rackNumber, binNumber) {
  return `${warehouseCode}${rackNumber}${String(binNumber).padStart(2, '0')}`;
}

function buildRack(warehouseCode, rackNumber) {
  const bins = [];
  for (let binNumber = 1; binNumber <= BINS_PER_RACK; binNumber++) {
    bins.push(binCodeFor(warehouseCode, rackNumber, binNumber));
  }
  return { rackTag: `R${rackNumber}`, bins };
}

function buildWarehouseRacks(warehouseCode) {
  const racks = [];
  for (let rackNumber = 1; rackNumber <= RACKS_PER_WAREHOUSE; rackNumber++) {
    racks.push(buildRack(warehouseCode, rackNumber));
  }
  return racks;
}

const INVENTORY_LOCATIONS = WAREHOUSE_CODES.map((warehouse) => ({
  warehouse,
  warehouseLabel: warehouseLabelFor(warehouse),
  racks: buildWarehouseRacks(warehouse),
}));

const LEGACY_CLASS_MAP = {
  'Air Conditioners': 'AC Equipment',
  'Repair Parts': 'Spare Parts',
  Tools: 'Tools and Test Equipment',
  'Installation Kits': 'Kits and Bundles'
};

function deriveStockStatus(available, reorderLevel) {
  const stock = Math.max(0, Number(available) || 0);
  const threshold = Math.max(0, Number(reorderLevel) || 0);
  if (stock === 0) return 'out-of-stock';
  if (stock <= threshold) return 'low-stock';
  return 'in-stock';
}

function toLegacyStatus(stockStatus) {
  if (stockStatus === 'out-of-stock') return 'critical';
  if (stockStatus === 'low-stock') return 'warning';
  return 'normal';
}

function legacyStockStatus(available, reorderLevel) {
  return toLegacyStatus(deriveStockStatus(available, reorderLevel));
}

function isLowStock(item) {
  return deriveStockStatus(item.available, item.reorderLevel) !== 'in-stock';
}

function normalizeStringList(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map((entry) => String(entry).trim()).filter(Boolean))];
}

function suggestedOrderQuantity(available, maxStockLevel, reorderLevel) {
  const stock = Math.max(0, Number(available) || 0);
  const target = Math.max(1, Number(maxStockLevel) || Number(reorderLevel) || 1);
  return Math.max(1, target - stock);
}

function classifyLegacyItem(category, currentClass) {
  if (currentClass && currentClass !== 'Unclassified') return currentClass;
  return LEGACY_CLASS_MAP[category] || 'Unclassified';
}

function isValidClassification(itemClass, subcategory) {
  return ITEM_CLASSES.includes(itemClass) && (ITEM_SUBCATEGORIES[itemClass] || []).includes(subcategory);
}

function isValidInventoryLocation(warehouse, binCode) {
  const location = INVENTORY_LOCATIONS.find((entry) => entry.warehouse === warehouse);
  return Boolean(location && location.racks.some((rack) => rack.bins.includes(binCode)));
}

function rackTagFor(warehouse, binCode) {
  const location = INVENTORY_LOCATIONS.find((entry) => entry.warehouse === warehouse);
  return location?.racks.find((rack) => rack.bins.includes(binCode))?.rackTag || '';
}

function formatStorageLocation(warehouse, binCode) {
  const parts = [warehouseLabelFor(warehouse), rackTagFor(warehouse, binCode), binCode];
  return parts.filter(Boolean).join(', ');
}

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Colombo';

function toBusinessDateString(date = new Date(), timeZone = BUSINESS_TIMEZONE) {
  if (!date) return '';
  if (typeof date === 'string') {
    const trimmed = date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T00:00:00(\.000)?Z?$/);
    if (isoMatch) {
      return isoMatch[1];
    }
  }

  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return d.toISOString().slice(0, 10);
  }

  if (timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(d);
    } catch {
      // Fallback to local calendar components
    }
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isLoanOverdue(dueDate, referenceDate = new Date(), timeZone = BUSINESS_TIMEZONE) {
  if (!dueDate) return false;
  const dueStr = toBusinessDateString(dueDate, timeZone);
  const currentStr = toBusinessDateString(referenceDate, timeZone);
  if (!dueStr || !currentStr) return false;
  return dueStr < currentStr;
}

/**
 * True when a loan's due date falls within the next `days` calendar days
 * (inclusive of today, exclusive of already-overdue loans).
 *
 * @param {Date|string} dueDate
 * @param {number} days
 * @param {Date} [referenceDate]
 * @param {string} [timeZone]
 * @returns {boolean}
 */
function isLoanDueWithinDays(dueDate, days, referenceDate = new Date(), timeZone = BUSINESS_TIMEZONE) {
  if (!dueDate) return false;
  const dueStr = toBusinessDateString(dueDate, timeZone);
  const currentStr = toBusinessDateString(referenceDate, timeZone);
  if (!dueStr || !currentStr) return false;
  if (dueStr < currentStr) return false;
  const horizon = new Date(referenceDate);
  horizon.setDate(horizon.getDate() + days);
  const horizonStr = toBusinessDateString(horizon, timeZone);
  return dueStr <= horizonStr;
}

/**
 * Returns the material requests whose requested quantity, on at least one
 * line, exceeds available stock for that inventory item.
 *
 * @param {Array<{ items?: Array<{ inventoryId: string, qty: number }> }>} materialRequests
 * @param {Array<{ _id: string, available?: number }>} inventory
 * @returns {Array} the blocked subset of materialRequests
 */
function findBlockedMaterialRequests(materialRequests, inventory) {
  const inventoryById = new Map(inventory.map((item) => [String(item._id), item]));
  return materialRequests.filter((request) => (
    (request.items || []).some((line) => (
      Number(inventoryById.get(String(line.inventoryId))?.available || 0) < Number(line.qty || 0)
    ))
  ));
}

/**
 * Collapses pick-request lines that target the same inventory item into a
 * single required quantity, so a kit with two lines against one SKU is
 * checked and reserved once instead of racing against itself.
 *
 * @param {Array<{ lineId: string, inventoryId: unknown, sku?: string, qty: number }>} lines
 * @returns {Array<{ inventoryId: string, totalQty: number, lineIds: string[], sku: string }>}
 */
function aggregateReservationLines(lines) {
  const groups = new Map();
  for (const line of lines || []) {
    const key = String(line.inventoryId);
    const existing = groups.get(key);
    if (existing) {
      existing.totalQty += Number(line.qty) || 0;
      existing.lineIds.push(line.lineId);
    } else {
      groups.set(key, {
        inventoryId: key,
        totalQty: Number(line.qty) || 0,
        lineIds: [line.lineId],
        sku: line.sku,
      });
    }
  }
  return [...groups.values()];
}

/**
 * Compares aggregated reservation groups against known stock and returns the
 * groups that are short, each carrying every contributing lineId.
 *
 * @param {ReturnType<typeof aggregateReservationLines>} groups
 * @param {Map<string, { available?: number, name?: string }>} stockByInventoryId
 * @returns {Array<{ inventoryId: string, lineIds: string[], sku: string, name: string, required: number, available: number, shortage: number }>}
 */
function computeKitShortages(groups, stockByInventoryId) {
  const shortages = [];
  for (const group of groups) {
    const stock = stockByInventoryId.get(group.inventoryId);
    const available = Number(stock?.available || 0);
    if (available < group.totalQty) {
      shortages.push({
        inventoryId: group.inventoryId,
        lineIds: group.lineIds,
        sku: stock?.sku || group.sku,
        name: stock?.name || '',
        required: group.totalQty,
        available,
        shortage: group.totalQty - available,
      });
    }
  }
  return shortages;
}

// Mirrors legacyStockStatus() as a Mongo aggregation-pipeline expression, so
// a pipeline-style findOneAndUpdate can derive `status` from the post-image
// in the same round trip instead of a separate read-modify-write. Both must
// agree on every value of `available`/`reorderLevel` — see the parity test.
const STOCK_STATUS_PIPELINE_EXPR = {
  $switch: {
    branches: [
      { case: { $lte: [{ $ifNull: ['$available', 0] }, 0] }, then: 'critical' },
      {
        case: {
          $lte: [
            { $ifNull: ['$available', 0] },
            { $max: [0, { $ifNull: ['$reorderLevel', 0] }] },
          ],
        },
        then: 'warning',
      },
    ],
    default: 'normal',
  },
};

module.exports = {
  ITEM_CLASSES,
  ITEM_SUBCATEGORIES,
  INVENTORY_LOCATIONS,
  WAREHOUSE_CODES,
  LEGACY_CLASS_MAP,
  BUSINESS_TIMEZONE,
  deriveStockStatus,
  toLegacyStatus,
  legacyStockStatus,
  isLowStock,
  normalizeStringList,
  suggestedOrderQuantity,
  classifyLegacyItem,
  isValidClassification,
  isValidInventoryLocation,
  rackTagFor,
  formatStorageLocation,
  warehouseLabelFor,
  toBusinessDateString,
  isLoanOverdue,
  isLoanDueWithinDays,
  findBlockedMaterialRequests,
  aggregateReservationLines,
  computeKitShortages,
  STOCK_STATUS_PIPELINE_EXPR,
};
