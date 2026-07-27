// Description: Unit tests for profile validation middleware
// Purpose: Lock in parsing/validation behavior for is_private and account_privacy fields
// Notes: Tests strict boolean parsing and backward compatibility mapping

const express = require('express');
const request = require('supertest');
const validateProfileUpdate = require('../middleware/validateProfileUpdate');

function makeApp() {
  const app = express();
  app.use(express.json());
  // inject requestId to satisfy logger
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.put('/api/profile/me', validateProfileUpdate, (req, res) => {
    // echo the sanitized patch for assertions
    res.json({ ok: true, patch: req.profilePatch });
  });
  return app;
}

describe('validateProfileUpdate', () => {
  const app = makeApp();

  describe('is_private field validation', () => {
    test('accepts boolean is_private=true', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: true });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });

    test('accepts boolean is_private=false', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: false });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('accepts string is_private="true"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 'true' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });

    test('accepts string is_private="false"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 'false' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('accepts string is_private="1"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: '1' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });

    test('accepts string is_private="0"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: '0' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('accepts string is_private="yes"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 'yes' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });

    test('accepts string is_private="no"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 'no' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('accepts number is_private=1', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 1 });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });

    test('accepts number is_private=0', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 0 });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('rejects invalid is_private="foo"', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: 'foo' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('validation_failed');
      expect(r.body.details).toContain('is_private must be a boolean (true/false)');
    });

    test('rejects invalid is_private=null', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: null });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('validation_failed');
      expect(r.body.details).toContain('is_private has invalid type');
    });

    test('treats JSON is_private=undefined as an omitted field', async () => {
      const r = await request(app).put('/api/profile/me').send({ is_private: undefined });
      expect(r.status).toBe(200);
      expect(r.body.patch).not.toHaveProperty('is_private');
    });
  });

  describe('account_privacy field mapping', () => {
    test('account_privacy mapping: "private" -> is_private=true', async () => {
      const r = await request(app).put('/api/profile/me').send({ account_privacy: 'private' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });

    test('account_privacy mapping: "public" -> is_private=false', async () => {
      const r = await request(app).put('/api/profile/me').send({ account_privacy: 'public' });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('rejects invalid account_privacy="invalid"', async () => {
      const r = await request(app).put('/api/profile/me').send({ account_privacy: 'invalid' });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('validation_failed');
      expect(r.body.details).toContain('account_privacy must be one of: public, private');
    });
  });

  describe('conflict resolution', () => {
    test('conflict resolution: account_privacy wins over is_private', async () => {
      const r = await request(app).put('/api/profile/me').send({ 
        account_privacy: 'public', 
        is_private: true 
      });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(false);
    });

    test('conflict resolution: account_privacy wins over is_private (reverse)', async () => {
      const r = await request(app).put('/api/profile/me').send({ 
        account_privacy: 'private', 
        is_private: false 
      });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
    });
  });

  describe('combined field validation', () => {
    test('accepts multiple valid fields including is_private', async () => {
      const r = await request(app).put('/api/profile/me').send({ 
        is_private: true,
        profile_title: 'Test Title',
        phone: '123-456-7890'
      });
      expect(r.status).toBe(200);
      expect(r.body.patch.is_private).toBe(true);
      expect(r.body.patch.profile_title).toBe('Test Title');
      expect(r.body.patch.phone).toBe('123-456-7890');
    });

    test('rejects if any field is invalid', async () => {
      const r = await request(app).put('/api/profile/me').send({ 
        profile_title: 'Test Title',
        is_private: 'invalid' // This should cause rejection
      });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe('validation_failed');
    });
  });
});
