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

const INVENTORY_LOCATIONS = [
  {
    warehouse: 'Central Warehouse',
    placementAreas: [
      'Receiving & Inspection',
      'Small Parts Racking',
      'Consumables Storage',
      'Dispatch Staging'
    ]
  },
  {
    warehouse: 'Equipment Warehouse',
    placementAreas: [
      'Indoor Unit Storage',
      'Outdoor Unit Storage',
      'Large Equipment Floor',
      'Installation Materials'
    ]
  },
  {
    warehouse: 'Service Warehouse',
    placementAreas: [
      'Spare Parts Racking',
      'Tool Crib',
      'Technician Pickup',
      'Returns & Quarantine'
    ]
  }
];

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

function isValidInventoryLocation(warehouse, placementArea) {
  const location = INVENTORY_LOCATIONS.find((entry) => entry.warehouse === warehouse);
  return Boolean(location && location.placementAreas.includes(placementArea));
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

module.exports = {
  ITEM_CLASSES,
  ITEM_SUBCATEGORIES,
  INVENTORY_LOCATIONS,
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
  toBusinessDateString,
  isLoanOverdue,
};
