const service = require("./sales.service");

exports.toString = (req, res) => {
  res.json({ message: "Sales module placeholder" });
};
