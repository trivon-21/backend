const service = require("./customer.service");

exports.toString = (req, res) => {
  res.json({ message: "Customer module placeholder" });
};
