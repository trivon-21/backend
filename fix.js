const fs = require('fs');
let code = fs.readFileSync('src/modules/shared/installation/installation.controller.js', 'utf8');

const replacement1 = `exports.getInstallationById = async (req, res) => {
  try {
    const id = req.params.id;
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    const installation = await Installation.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { ticketId: id },
        { $expr: { $eq: [{ $toString: "$_id" }, id] } },
        { $expr: { $eq: [{ $toString: "$orderId" }, id] } }
      ]
    }).populate('customerId', 'fullName name email phoneNumber contactNo address').lean();

    if (!installation) {`;
code = code.replace(/exports\.getInstallationById = async \(req, res\) => \{[\s\S]*?if \(\!installation\) \{/, replacement1);

const replacement2 = `exports.updateInstallationStatus = async (req, res) => {
  try {
    const { status, date } = req.body;
    const id = req.params.id;
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    
    const installation = await Installation.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { ticketId: id },
        { $expr: { $eq: [{ $toString: "$_id" }, id] } },
        { $expr: { $eq: [{ $toString: "$orderId" }, id] } }
      ]
    });
    
    if (!installation) {`;
code = code.replace(/exports\.updateInstallationStatus = async \(req, res\) => \{[\s\S]*?if \(\!installation\) \{/, replacement2);

const replacement3 = `exports.completeInstallation = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    const isValidId = mongoose.Types.ObjectId.isValid(id);
    
    const installation = await Installation.findOne({
      $or: [
        { _id: isValidId ? id : null },
        { ticketId: id },
        { $expr: { $eq: [{ $toString: "$_id" }, id] } },
        { $expr: { $eq: [{ $toString: "$orderId" }, id] } }
      ]
    });
    
    if (!installation) {`;
code = code.replace(/exports\.completeInstallation = async \(req, res\) => \{[\s\S]*?if \(\!installation\) \{/, replacement3);

// ADD siteDetails mapping in getInstallationById
const siteDetailsMapping = `
    let siteDetails = installation.siteDetails;
    if (!siteDetails || Object.keys(siteDetails).length === 0) {
      if (installation.inspectionTicketId) {
        const InspectionReport = require('../inspection/inspectionReport.model');
        const report = await InspectionReport.findOne({ ticketId: installation.inspectionTicketId }).lean();
        if (report) {
          siteDetails = {
            buildingType: report.siteType || '-',
            floors: report.floorLevel ? parseInt(report.floorLevel) || 1 : 1,
            rooms: report.rooms ? report.rooms.length : 0,
            ceilingHeight: 'N/A',
            wallType: report.rooms && report.rooms[0] ? report.rooms[0].wallCondition || '-' : '-',
            powerSupply: report.rooms && report.rooms[0] && report.rooms[0].powerPointsNearby ? 'Available' : 'Not Available',
            outdoorAccess: report.parkingAvailability ? true : false
          };
        }
      }
    }

    const enrichedInstallation = {
      ...installation,
      siteDetails,
      location: installation.customerId?.address || installation.location || '-',`;

code = code.replace(/const enrichedInstallation = \{\s*\.\.\.installation,\s*location:/, siteDetailsMapping);

fs.writeFileSync('src/modules/shared/installation/installation.controller.js', code);
