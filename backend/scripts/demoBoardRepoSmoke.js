#!/usr/bin/env node
/**
 * Repo-aware demo board preflight — seeds the 3-flow board from a real git repo
 * (sourceRepoPath), asserts each flow parks at PO/DEV/QA AND runs repo-aware
 * (each flow project gets its own repo clone), then releases Flow 3 and checks
 * final.md was written into that flow's repo clone.
 */

process.env.USE_MOCK_AGENTS = 'true';
process.env.EXECUTION_PATH = 'claude-code';
process.env.USE_MOCK_CLAUDE_CODE = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DATABASE_URL = process.env.SMOKE_DATABASE_URL || 'file:./board-repo-smoke.db';
process.env.GATE_TIMEOUT_MS = process.env.GATE_TIMEOUT_MS || '30000';

const path = require('path');
const fs = require('fs');
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
const repoService = require('../src/services/repoService');
const { v4: uuidv4 } = require('uuid');
const svc = require('../src/services/SdlcWorkflowService');
const prisma = require('../src/config/database');

const SRC_REPO = process.env.SRC_REPO || path.join(__dirname, '..', '.tmp-srcrepo');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXPECT = { 1: 'po', 2: 'dev', 3: 'qa' };

(async () => {
  console.log('▶  AIFA repo-aware demo board preflight');
  console.log(`   source repo: ${SRC_REPO}\n`);
  let ok = true;
  try {
    if (!fs.existsSync(SRC_REPO)) throw new Error(`source repo not found: ${SRC_REPO}`);
    await demoBoard.seedBoard({ reset: true, sourceRepoPath: SRC_REPO });

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
      const repoClone = path.join(repoService.WORKSPACE_DIR, flow.projectId, 'repo');
      const repoAware = fs.existsSync(path.join(repoClone, '.git'));
      const pass = flow.reviewStage === expected && repoAware;
      ok = ok && pass;
      console.log(`${pass ? '✅' : '❌'} Flow ${flow.flowNo}  parked: ${String(flow.reviewStage).padEnd(4)} (exp ${expected}) · repo-aware: ${repoAware} · ${flow.progress.done}/4`);
    }

    // Walk Flow 3 to release and verify final.md lands in its repo clone.
    const flow3 = b.flows.find((f) => f.flowNo === 3);
    await svc.submitGateDecision({ taskId: flow3.card.taskId, decision: 'APPROVE', user: null });
    await sleep(1500);
    await svc.submitReleaseDecision({ projectId: flow3.projectId, decisionId: uuidv4(), decision: 'APPROVE', user: null });
    await sleep(1500);
    const repoClone = path.join(repoService.WORKSPACE_DIR, flow3.projectId, 'repo');
    const finalInRepo = fs.existsSync(path.join(repoClone, 'final.md'));
    ok = ok && finalInRepo;
    console.log(`\n${finalInRepo ? '✅' : '❌'} Flow 3 released → final.md written into the repo clone (${repoClone})`);

    console.log(`\n${ok ? '✅ PASS' : '❌ FAIL'} — repo-aware board: 3 flows on the uploaded repo, report written into repo`);
  } catch (err) {
    ok = false;
    console.log(`\n❌ FAIL  ${err.message}`);
  } finally {
    await demoBoard.resetBoard().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
  process.exit(ok ? 0 : 1);
})();
