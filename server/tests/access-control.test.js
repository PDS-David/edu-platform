'use strict';
const fs = require('fs');
const path = require('path');

describe('ACCESS-01 — R2 proxy bypass route removed (source check)', () => {
  test('resourceRoutes.js does not define a /r2/* route handler', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/resourceRoutes.js'), 'utf8');
    // Old route was: router.get('/r2/*', ...)
    expect(src).not.toMatch(/router\.(get|use)\s*\(\s*['"`]\/r2\//);
  });

  test('resourceRoutes.js still has authenticated /:id/download endpoint', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/resourceRoutes.js'), 'utf8');
    expect(src).toMatch(/router\.get\s*\(\s*['"`]\/:id\/download/);
    // Must pass through protect middleware
    expect(src).toMatch(/protect/);
  });

  test('resourceRoutes.js download endpoint re-checks entitlement for students', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/resourceRoutes.js'), 'utf8');
    expect(src).toMatch(/resource_assignments/);
    expect(src).toMatch(/student_id.*uid|uid.*student_id/);
  });

  test('resourceRoutes.js local fallback does NOT redirect to /uploads/', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/resourceRoutes.js'), 'utf8');
    // Must not have an unconditional redirect to /uploads — it should stream
    expect(src).not.toMatch(/res\.redirect.*\/uploads\/resources/);
  });

  test('server.js blocks /uploads/resources direct access', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(src).toMatch(/app\.use\s*\(\s*['"`]\/uploads\/resources/);
    expect(src).toMatch(/403/);
  });
});
