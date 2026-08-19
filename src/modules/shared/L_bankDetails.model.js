const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  bankName:      String,
  branch:        String, // team uses "branch" not "branchName"
  accountName:   String,
  accountNumber: String, // team uses "accountNumber" not "accountNo"
  type:          String,
  currency:      String,
  updatedBy:     mongoose.Schema.Types.ObjectId,
}, { strict: false, timestamps: true });

// Register under both names so both old and new code works
const BankDetail = mongoose.models.BankDetail
  || mongoose.model("BankDetail", schema, "bank_details");

if (!mongoose.models.L_BankDetail) {
  mongoose.model("L_BankDetail", schema, "bank_details");
}

module.exports = BankDetail;