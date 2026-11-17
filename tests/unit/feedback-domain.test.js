const assert = require('node:assert/strict');
const Feedback = require('../../src/models/Feedback');
const feedbackService = require('../../src/modules/shared/feedback/feedback.service');

describe('Feedback domain and metrics contract', () => {
  it('canonical feedback validation requires a valid category and at least one 1-5 rating', () => {
    assert.throws(() => feedbackService.canonicalFeedbackInput({ feedbackFor: 'Service' }), /at least one rating/);
    assert.throws(() => feedbackService.canonicalFeedbackInput({ feedbackFor: 'Service', serviceQuality: 6 }), /1 to 5/);
    const value = feedbackService.canonicalFeedbackInput({
      feedbackFor: 'Service', serviceQuality: 5, comment: ' Fabricated feedback ', customerId: 'ignored',
    });
    assert.equal(value.serviceQuality, 5);
    assert.equal(value.comment, 'Fabricated feedback');
    assert.equal('customerId' in value, false);
  });

  it('service rating aggregation uses the 30-day boundary and canonical/legacy fallback', async () => {
    const originalAggregate = Feedback.aggregate;
    let pipeline;
    Feedback.aggregate = async (value) => {
      pipeline = value;
      return [{ average: 4.26, responseCount: 3 }];
    };
    try {
      const now = new Date('2026-08-30T12:00:00.000Z');
      const result = await feedbackService.getServiceRating30d(now);
      assert.deepEqual(result, { average: 4.3, responseCount: 3 });
      assert.equal(pipeline[0].$match.createdAt.$gte.toISOString(), '2026-07-31T12:00:00.000Z');
      assert.deepEqual(pipeline[1].$project.rating, { $ifNull: ['$serviceQuality', '$ratings.serviceQuality'] });
      assert.deepEqual(pipeline[2].$match.rating, { $gte: 1, $lte: 5 });
    } finally {
      Feedback.aggregate = originalAggregate;
    }
  });

  it('canonical writes use authenticated ownership and reads include legacy ownership', async () => {
    const originalCreate = Feedback.create;
    const originalFind = Feedback.find;
    const originalCount = Feedback.countDocuments;
    let created;
    let ownership;
    Feedback.create = async (value) => { created = value; return value; };
    Feedback.find = (query) => {
      ownership = query;
      return { skip: () => ({ limit: () => ({ sort: async () => [] }) }) };
    };
    Feedback.countDocuments = async () => 0;
    try {
      await feedbackService.createFeedback('customer-1', { feedbackFor: 'Order', productQuality: 4 });
      await feedbackService.getUserFeedback('customer-1');
      assert.equal(created.customer, 'customer-1');
      assert.equal(created.feedbackFor, 'Order');
      assert.equal('ratings' in created, false);
      assert.deepEqual(ownership, { $or: [{ customer: 'customer-1' }, { customerId: 'customer-1' }] });
    } finally {
      Feedback.create = originalCreate;
      Feedback.find = originalFind;
      Feedback.countDocuments = originalCount;
    }
  });
});
