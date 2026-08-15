const service = require("./finance.service");

exports.toString = (req, res) => {
  res.json({ message: "Finance module placeholder" });
};
