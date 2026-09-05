function stalePurchaseRequestError() {
  const error = new Error('This purchase request changed; refresh before trying again');
  error.statusCode = 409;
  error.code = 'STALE_ORDER_REQUEST';
  return error;
}

function assertPurchaseStatusVersion(request, suppliedVersion) {
  if (!Number.isInteger(suppliedVersion)
    || suppliedVersion !== Number(request.statusVersion || 0)) {
    throw stalePurchaseRequestError();
  }
}

async function savePurchaseRequest(request, options) {
  try {
    return await request.save(options);
  } catch (error) {
    if (error?.name === 'VersionError') throw stalePurchaseRequestError();
    throw error;
  }
}

module.exports = {
  assertPurchaseStatusVersion,
  savePurchaseRequest,
  stalePurchaseRequestError,
};
