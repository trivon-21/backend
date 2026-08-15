const mongoose = require("mongoose");
const schema = new mongoose.Schema({
    bankName: String,
    branchName: String,
    accountName: String,
    accountNo: String,
    type: String,
}, { strict: false, timestamps: true });
module.exports = mongoose.model("L_BankDetail", schema);