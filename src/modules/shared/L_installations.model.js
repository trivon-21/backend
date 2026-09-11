const mongoose = require("mongoose");
const Installation = require("./installation/installation.model");

if (!mongoose.models.L_Installation) {
  mongoose.models.L_Installation = Installation;
}

module.exports = Installation;