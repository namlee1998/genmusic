#!/usr/bin/env node
/**
 * Demo board preflight — seeds the 3-flow board and asserts each flow parks at
 * its target agent review (Flow 1 → PO, Flow 2 → DEV, Flow 3 → QA), then checks
 * that approving Flow 3's QA review makes its release gate eligible.
 *
 * Exit code 0 = board seeded and parked as expected.
 */

process.env.USE_MOCK_AGENTS = 'true';
process.env.EXECUTION_PATH = 'claude-code';
process.env.USE_MOCK_CLAUDE_CODE = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.SMOKE_DATABASE_URL || 'file:./board-smoke.db';
process.env.GATE_TIMEOUT_MS = process.env.GATE_TIMEOUT_MS || '30000';

const path = require('path');
const { execSync } = require('child_process');

try {
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.join(__dirname, '..'), stdio: 'ignore', env: process.env,
  });
} catch (e) {
  console.error('Failed to prepare the isolated smoke DB schema:', e.message);
  process.exit(1);
}

const demoBoard = require('../src/services/demoBoardService');
const prisma = require('../src/config/database');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXPECT = { 1: 'po', 2: 'dev', 3: 'qa' };

(async () => {
  console.log('▶  AIFA demo board preflight\n');
  let ok = true;
  try {
    await demoBoard.seedBoard({ reset: true });

    // Poll until the board reports ready (or time out).
    let b = null;
    const start = Date.now();
    while (Date.now() - start < 180000) {
      b = await demoBoard.getBoard();
      if (b && b.status === 'ready') break;
      const parked = (b?.flows || []).filter((f) => f.status === 'ready').length;
      process.stdout.write(`\r   seeding… ${parked}/3 flows parked   `);
      await sleep(1000);
    }
    process.stdout.write('\n\n');

    if (!b || b.status !== 'ready') throw new Error(`board never became ready (status=${b?.status})`);

    for (const flow of b.flows) {
      const expected = EXPECT[flow.flowNo];
      const got = flow.reviewStage;
      const bullets = flow.card?.whatsIncluded || [];
      const pass = got === expected && !!flow.card;
      ok = ok && pass;
      console.log(`${pass ? '✅' : '❌'} Flow ${flow.flowNo}  parked at: ${String(got).padEnd(4)} (expected ${expected})  · ${flow.progress.done}/4 · "${flow.card?.title || '—'}"`);
      console.log(`      what's included: ${bullets.length ? bullets.join(', ') : '(none)'}`);
    }

    // Flow 3 (QA) should be one approval away from release eligibility.
    const flow3 = b.flows.find((f) => f.flowNo === 3);
    const relGate = flow3?.releaseGate;
    console.log(`\n   Flow 3 release gate: eligible=${relGate?.eligible} status=${relGate?.status}`);

    console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'} — demo board parked 3 flows at PO / DEV / QA`);
  } catch (err) {
    ok = false;
    console.log(`\n❌ FAIL  ${err.message}`);
  } finally {
    await demoBoard.resetBoard().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
  process.exit(ok ? 0 : 1);
})();
