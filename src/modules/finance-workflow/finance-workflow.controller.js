const service = require('./finance-workflow.service');

function sendError(res, error) {
  res.status(error.statusCode || 400).json({ message: error.message, code: error.code });
}

exports.listPurchaseRequests = async (req, res) => {
  try { res.json(await service.listPurchaseRequests(req.user, req.query)); } catch (error) { sendError(res, error); }
};
exports.decidePurchaseRequest = async (req, res) => {
  try { res.json(await service.decidePurchaseRequest(req.params.id, req.body || {}, req.user)); } catch (error) { sendError(res, error); }
};
exports.listNonPoReceipts = async (req, res) => {
  try { res.json(await service.listNonPoReceipts(req.user, req.query)); } catch (error) { sendError(res, error); }
};
exports.reconcileNonPoReceipt = async (req, res) => {
  try { res.json(await service.reconcileNonPoReceipt(req.params.id, req.body || {}, req.user)); } catch (error) { sendError(res, error); }
};
