const mongoose = require("mongoose");
const Repair = require("./repair/repair.model");

if (!mongoose.models.L_Repair) {
  mongoose.models.L_Repair = Repair;
}

module.exports = Repair;