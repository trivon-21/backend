const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const User = require('../../../models/User');
const AssetLoan = require('../../../models/AssetLoan');
const SerializedAsset = require('../../../models/SerializedAsset');
const QuarantineItem = require('../../../models/QuarantineItem');
const RmaCase = require('../../../models/RmaCase');
const Activity = require('../../../models/Activity');
const { toBusinessDateString, isLoanOverdue } = require('../../../utils/inventory-domain');
const { normalizeSerialNumber } = require('../../../utils/serialized-asset-domain');
const { dispositionForReturnCondition } = require('../../../utils/rma-workflow');
const {
  serviceError,
  assertRole,
  assertObjectId,
  generateId,
  TECHNICIAN_ROLES,
  projectSerialNumbers,
} = require('./shared');

/**
 * Retrieves technician members from the configured shared database.
 */
exports.getTechnicians = async () => {
  const technicians = await User.find({ role: { $in: TECHNICIAN_ROLES } })
    .select('fullName role')
    .sort({ fullName: 1 })
    .lean();
  return technicians.map((technician) => ({
    _id: technician._id,
    name: technician.fullName,
    fullName: technician.fullName,
    role: technician.role,
  }));
};

/**
 * Fetches all active asset loans.
 */
exports.getAssetLoans = async () => {
  return AssetLoan.find({ status: { $ne: 'returned' } })
    .populate('serializedAssetId', 'serialNumber status')
    .sort({ checkedOutAt: -1 });
};

/**
 * Returns serialized HVAC tools with asset tags that are not currently on loan.
 */
exports.getAvailableTools = async () => {
  const availableAssets = await SerializedAsset.find({
    status: 'available',
    currentLoanId: { $in: [null, undefined] },
    activeRmaCaseId: { $in: [null, undefined] },
    quarantineId: { $in: [null, undefined] },
  })
    .select('inventoryId serialNumber')
    .sort({ serialNumber: 1 })
    .lean();
  const availableByInventory = new Map();
  for (const asset of availableAssets) {
    const key = String(asset.inventoryId);
    if (!availableByInventory.has(key)) availableByInventory.set(key, []);
    availableByInventory.get(key).push(asset.serialNumber);
  }
  const tools = await Inventory.find({
    _id: { $in: [...availableByInventory.keys()] },
    itemClass: 'Tools and Test Equipment',
    isSerialized: true,
  }).select('name description sku itemClass subcategory brand location binLocation available reorderLevel');
  const projected = await projectSerialNumbers(tools);
  return projected.map((tool) => ({
    ...tool,
    availableSerialNumbers: availableByInventory.get(String(tool._id)) || [],
  }));
};

/**
 * Records a new tool checkout and logs the activity.
 */
exports.checkOutTool = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  assertObjectId(data.toolId, 'Tool reference is invalid', 'INVALID_TOOL_ID');
  assertObjectId(data.technicianId, 'Technician reference is invalid', 'INVALID_TECHNICIAN_ID');
  if (!String(data.assetTag || '').trim()) {
    throw serviceError('Select an asset tag', 400, 'ASSET_TAG_REQUIRED');
  }
  const dueDateStr = toBusinessDateString(data.dueDate);
  if (!dueDateStr || isLoanOverdue(data.dueDate)) {
    throw serviceError('Tool due date must be a valid future date', 400, 'INVALID_DUE_DATE');
  }
  const dueDate = new Date(`${dueDateStr}T00:00:00.000Z`);
  const technician = await User.findOne({ _id: data.technicianId, role: { $in: TECHNICIAN_ROLES } });
  if (!technician) throw serviceError('Technician not found or role is not eligible for tool lending', 404, 'TECHNICIAN_NOT_FOUND');
  const normalizedAssetTag = normalizeSerialNumber(data.assetTag);
  try {
    return await mongoose.connection.transaction(async (session) => {
      const asset = await SerializedAsset.findOne({ normalizedSerial: normalizedAssetTag }).session(session);
      if (!asset || String(asset.inventoryId) !== String(data.toolId)) {
        throw serviceError('Serialized tool or asset tag not found', 404, 'TOOL_NOT_FOUND');
      }
      if (asset.status !== 'available') {
        throw serviceError('This asset tag is not available for checkout', 409, 'ASSET_NOT_AVAILABLE');
      }
      const tool = await Inventory.findOne({
        _id: asset.inventoryId,
        itemClass: 'Tools and Test Equipment',
        isSerialized: true,
      }).session(session);
      if (!tool) throw serviceError('Serialized tool or asset tag not found', 404, 'TOOL_NOT_FOUND');

      const activeLoan = await AssetLoan.findOne({
        $or: [{ serializedAssetId: asset._id }, { normalizedAssetTag }],
        status: 'on-loan',
      }).session(session);
      if (activeLoan) {
        throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');
      }
      const loan = new AssetLoan({
        assetTag: asset.serialNumber,
        normalizedAssetTag,
        serializedAssetId: asset._id,
      });
      Object.assign(loan, {
        toolId: tool._id,
        serializedAssetId: asset._id,
        toolName: tool.name,
        assetTag: asset.serialNumber,
        normalizedAssetTag,
        technicianId: String(technician._id),
        technicianUserId: technician._id,
        technicianName: technician.fullName,
        checkedOutAt: new Date(),
        dueDate,
        status: 'on-loan',
        returnedAt: undefined,
        condition: 'good',
      });
      await loan.save({ session });
      asset.status = 'on-loan';
      asset.currentLoanId = loan._id;
      await asset.save({ session });
      await Activity.create([{
        type: 'request', title: 'Tool Checked Out',
        description: `${technician.fullName} checked out ${tool.name} (${asset.serialNumber})`,
        actionLabel: 'View Asset',
      }], { session });
      return loan;
    });
  } catch (error) {
    if (error.code === 11000) {
      throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');
    }
    throw error;
  }
};

/**
 * Processes a tool return, archiving the loan and logging the return event.
 */
exports.returnTool = async (loanId, user, input = {}) => {
  assertRole(user, ['INVENTORY']);
  assertObjectId(loanId, 'Loan reference is invalid', 'INVALID_LOAN_ID');
  const condition = input.condition || 'good';
  const disposition = dispositionForReturnCondition(condition);

  return mongoose.connection.transaction(async (session) => {
    const loan = await AssetLoan.findById(loanId).session(session);
    if (!loan) throw serviceError('Loan not found', 404, 'LOAN_NOT_FOUND');
    if (loan.status === 'returned') throw serviceError('This loan has already been returned', 409, 'ASSET_ALREADY_RETURNED');
    const asset = loan.serializedAssetId
      ? await SerializedAsset.findById(loan.serializedAssetId).session(session)
      : await SerializedAsset.findOne({ normalizedSerial: normalizeSerialNumber(loan.assetTag) }).session(session);
    if (!asset) throw serviceError('Serialized asset registry record not found', 409, 'ASSET_REGISTRY_MISSING');
    if (asset.status !== 'on-loan' || String(asset.currentLoanId || '') !== String(loan._id)) {
      throw serviceError('Serialized asset loan state is inconsistent', 409, 'ASSET_LOAN_STATE_CONFLICT');
    }
    loan.serializedAssetId = asset._id;
    loan.status = 'returned';
    loan.returnedAt = new Date();
    loan.condition = condition;
    if (input.notes) loan.notes = input.notes;
    await loan.save({ session });

    if (condition === 'good') {
      asset.status = 'available';
      asset.quarantineId = undefined;
    } else if (condition === 'incomplete') {
      const [quarantine] = await QuarantineItem.create([{
        quarantineId: generateId('QZ'),
        itemName: loan.toolName,
        quantity: 1,
        unit: 'unit',
        reason: input.notes
          ? `Returned tool marked incomplete: ${loan.assetTag} - ${input.notes}`
          : `Returned tool marked incomplete: ${loan.assetTag}`,
        source: 'manual',
        sourceRefId: String(loan._id),
        inventoryId: loan.toolId,
        serialNumbers: [asset.serialNumber],
      }], { session });
      asset.status = 'inspection-hold';
      asset.quarantineId = quarantine._id;
    } else if (condition === 'damaged') {
      const [quarantine] = await QuarantineItem.create([{
        quarantineId: generateId('QZ'),
        itemName: loan.toolName,
        quantity: 1,
        unit: 'unit',
        reason: input.notes
          ? `Returned tool marked damaged: ${loan.assetTag} - ${input.notes}`
          : `Returned tool marked damaged: ${loan.assetTag}`,
        source: 'manual',
        sourceRefId: String(loan._id),
        inventoryId: loan.toolId,
        serialNumbers: [asset.serialNumber],
      }], { session });

      const rmaId = generateId('RMA');
      const inventoryItem = await Inventory.findById(asset.inventoryId).session(session);
      const [rmaCase] = await RmaCase.create([{
        rmaId,
        inventoryId: asset.inventoryId,
        serializedAssetId: asset._id,
        serialNumber: asset.serialNumber,
        itemName: loan.toolName,
        itemSku: inventoryItem ? inventoryItem.sku : '',
        faultDescription: input.notes || `Returned tool marked damaged: ${loan.assetTag}`,
        reportedBy: user?.fullName || 'Inventory Manager',
        status: 'reported',
        type: inventoryItem ? inventoryItem.type : 'Single',
        resolution: '',
      }], { session });

      asset.status = 'supplier-return-pending';
      asset.activeRmaCaseId = rmaCase._id;
      asset.preRmaStatus = 'supplier-return-pending';
      asset.quarantineId = quarantine._id;
    }
    asset.currentLoanId = undefined;
    await asset.save({ session });
    await Activity.create([{
      type: 'return', title: 'Tool Returned',
      description: `${loan.technicianName} returned ${loan.toolName} (${loan.assetTag}) [${condition}]`,
      actionLabel: 'View Log',
    }], { session });
    return loan;
  });
};

/**
 * Retrieves all historical asset return logs.
 */
exports.getAssetReturnLogs = async () => {
  return await AssetLoan.find({ status: 'returned' }).sort({ returnedAt: -1 });
};
