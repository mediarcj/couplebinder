// File: server/__tests__/validateProfileUpdate.test.js
// Description: Unit tests for profile validation middleware
// Purpose: Lock in parsing/validation behavior for is_private and account_privacy fields
// Notes: Tests strict boolean parsing and backward compatibility mapping

const express = require('express');
// I am loading `supertest` into `request` so this file can reuse that dependency below.
const request = require('supertest');
// I am loading `../middleware/validateProfileUpdate` into `validateProfileUpdate` so this file can reuse that dependency below.
const validateProfileUpdate = require('../middleware/validateProfileUpdate');

// I am keeping `makeApp` as a named helper so the surrounding workflow can call this step when it needs it.
function makeApp() {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  const app = express();
  // I am attaching this middleware or router here so matching requests pass through it in the existing Express order.
  app.use(express.json());
  // inject requestId to satisfy logger
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  // This registers the PUT `/api/profile/me` route so Express can send matching requests through the handlers listed here.
  app.put('/api/profile/me', validateProfileUpdate, (req, res) => {
    // echo the sanitized patch for assertions
    res.json({ ok: true, patch: req.profilePatch });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  // This return sends the completed value or response back to the code that called this function.
  return app;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am grouping the related test cases here so a beginner can see which behavior this section is checking.
describe('validateProfileUpdate', () => {
  // I am saving `app` here so the nearby steps can reuse the same value without rebuilding it each time.
  const app = makeApp();

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('is_private field validation', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts boolean is_private=true', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: true });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts boolean is_private=false', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: false });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts string is_private="true"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 'true' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts string is_private="false"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 'false' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts string is_private="1"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: '1' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts string is_private="0"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: '0' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts string is_private="yes"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 'yes' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts string is_private="no"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 'no' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts number is_private=1', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 1 });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts number is_private=0', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 0 });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('rejects invalid is_private="foo"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: 'foo' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(400);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.error).toBe('validation_failed');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.details).toContain('is_private must be a boolean (true/false)');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('rejects invalid is_private=null', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: null });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(400);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.error).toBe('validation_failed');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.details).toContain('is_private has invalid type');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('rejects invalid is_private=undefined', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ is_private: undefined });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(400);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.error).toBe('validation_failed');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.details).toContain('is_private has invalid type');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('account_privacy field mapping', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('account_privacy mapping: "private" -> is_private=true', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ account_privacy: 'private' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('account_privacy mapping: "public" -> is_private=false', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ account_privacy: 'public' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('rejects invalid account_privacy="invalid"', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ account_privacy: 'invalid' });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(400);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.error).toBe('validation_failed');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.details).toContain('account_privacy must be one of: public, private');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('conflict resolution', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('conflict resolution: account_privacy wins over is_private', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ 
        // I am keeping the `account_privacy` field in this object so the receiving code can read that value by its expected name.
        account_privacy: 'public', 
        // I am keeping the `is_private` field in this object so the receiving code can read that value by its expected name.
        is_private: true 
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(false);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('conflict resolution: account_privacy wins over is_private (reverse)', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ 
        // I am keeping the `account_privacy` field in this object so the receiving code can read that value by its expected name.
        account_privacy: 'private', 
        // I am keeping the `is_private` field in this object so the receiving code can read that value by its expected name.
        is_private: false 
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am grouping the related test cases here so a beginner can see which behavior this section is checking.
  describe('combined field validation', () => {
    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('accepts multiple valid fields including is_private', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ 
        // I am keeping the `is_private` field in this object so the receiving code can read that value by its expected name.
        is_private: true,
        // I am keeping the `profile_title` field in this object so the receiving code can read that value by its expected name.
        profile_title: 'Test Title',
        // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
        phone: '123-456-7890'
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(200);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.is_private).toBe(true);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.profile_title).toBe('Test Title');
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.patch.phone).toBe('123-456-7890');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am naming one expected behavior here so the test runner can report this scenario separately if it fails.
    test('rejects if any field is invalid', async () => {
      // I am saving `r` here so the nearby steps can reuse the same value without rebuilding it each time.
      const r = await request(app).put('/api/profile/me').send({ 
        // I am keeping the `is_private` field in this object so the receiving code can read that value by its expected name.
        is_private: true,
        // I am keeping the `profile_title` field in this object so the receiving code can read that value by its expected name.
        profile_title: 'Test Title',
        is_private: 'invalid' // This should cause rejection
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.status).toBe(400);
      // I am checking the observed value here against the behavior this test promises to protect.
      expect(r.body.error).toBe('validation_failed');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
