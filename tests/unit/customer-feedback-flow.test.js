const assert = require('assert');
const feedbackCtrl = require('../../src/controllers/feedback.controller');
const feedbackService = require('../../src/modules/shared/feedback/feedback.service');
const Feedback = require('../../src/models/Feedback');
const configCache = require('../../src/utils/config-cache');

describe('Customer Feedback Flow', () => {

  const mockRes = () => {
    const res = {
      _statusCode: 200,
      _body: null,
      status(code) {
        this._statusCode = code;
        return this;
      },
      json(data) {
        this._body = data;
        return this;
      }
    };
    return res;
  };

  before(() => {
    configCache.getFeatureFlags = async () => ({
      customerFeedbackEnabled: true
    });
  });

  it('should submit feedback successfully when valid category and rating provided', async () => {
    const originalCreate = Feedback.create;
    let savedPayload = null;

    Feedback.create = async (payload) => {
      savedPayload = { ...payload, _id: '65f111222333444555666777' };
      return savedPayload;
    };

    const req = {
      user: { _id: '65f9999999999abcdef99999' },
      body: {
        feedbackFor: 'Service',
        referenceLabel: 'SRQ-1005',
        serviceQuality: 5,
        technicianBehavior: 4,
        comment: 'Excellent AC maintenance service by the technician team.'
      }
    };

    const res = mockRes();
    await feedbackCtrl.createFeedback(req, res);

    assert.strictEqual(res._statusCode, 201);
    assert.strictEqual(savedPayload.feedbackFor, 'Service');
    assert.strictEqual(savedPayload.serviceQuality, 5);
    assert.strictEqual(savedPayload.technicianBehavior, 4);
    assert.strictEqual(savedPayload.comment, 'Excellent AC maintenance service by the technician team.');

    Feedback.create = originalCreate;
  });

  it('should return error if no ratings are provided', async () => {
    const req = {
      user: { _id: '65f9999999999abcdef99999' },
      body: {
        feedbackFor: 'Service',
        comment: 'No ratings given'
      }
    };

    const res = mockRes();
    await feedbackCtrl.createFeedback(req, res);

    assert.strictEqual(res._statusCode, 400);
    assert.ok(res._body.message.includes('at least one rating'));
  });

  it('should get customer feedback history', async () => {
    const originalFind = Feedback.find;
    const originalCount = Feedback.countDocuments;

    Feedback.find = () => ({
      skip: () => ({
        limit: () => ({
          sort: async () => [
            { _id: 'fb1', feedbackFor: 'Service', serviceQuality: 5 }
          ]
        })
      })
    });
    Feedback.countDocuments = async () => 1;

    const req = {
      user: { _id: '65f9999999999abcdef99999' },
      query: {}
    };

    const res = mockRes();
    await feedbackCtrl.getFeedbacks(req, res);

    assert.strictEqual(res._statusCode, 200);
    assert.ok(Array.isArray(res._body));
    assert.strictEqual(res._body.length, 1);
    assert.strictEqual(res._body[0].serviceQuality, 5);

    Feedback.find = originalFind;
    Feedback.countDocuments = originalCount;
  });
});
