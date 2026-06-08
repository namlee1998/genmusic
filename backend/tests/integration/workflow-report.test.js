jest.mock('../../src/services/repoService', () => ({
  WORKSPACE_DIR: require('os').tmpdir(),
  commitAndDiff: jest.fn(),
}));
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}));

const { buildFinalMarkdown } = require('../../src/services/workflowReport');
const { writeReleaseBundle } = require('../../src/services/workflowReport');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

describe('workflowReport', () => {
  test('includes the required real-agent artifact contract in final.md', () => {
    const artifact = (phase, type, contentJson) => ({
      phase,
      type,
      contentJson,
    });
    const packet = {
      artifacts: [
        artifact('po-agent', 'prd', { title: 'Google login' }),
        artifact('po-agent', 'acceptance_criteria', ['User can sign in']),
        artifact('ux-agent', 'ux_spec', { screens: ['Login'] }),
        artifact('dev-agent', 'patch_diff', 'diff --git a/login.js b/login.js'),
        artifact('dev-agent', 'sandbox_result', { build_ok: true }),
        artifact('dev-agent', 'self_test_report', { passed: 4 }),
        artifact('qa-agent', 'test_run_report', { total: 4, failed: 0 }),
        artifact('qa-agent', 'ac_coverage_matrix', [{ ac: 'AC-1', status: 'PASS' }]),
      ],
    };

    const markdown = buildFinalMarkdown({
      projectId: 'project-1',
      packet,
      audit: { events: [] },
      evidence: {},
      releaseDecision: { decision: 'APPROVE' },
      diff: '',
    });

    expect(markdown).toContain('## Product Requirements (PO)');
    expect(markdown).toContain('### acceptance criteria');
    expect(markdown).toContain('## Development Evidence');
    expect(markdown).toContain('### self test report');
    expect(markdown).toContain('## QA Evidence');
    expect(markdown).toContain('### test run report');
    expect(markdown).toContain('### ac coverage matrix');
    expect(markdown).toContain('diff --git a/login.js b/login.js');
  });

  test('writes final.md and qa-report.md when no repo clone is available', async () => {
    const projectId = `workflow-report-${Date.now()}`;
    const packet = {
      artifacts: [
        {
          phase: 'qa-agent',
          type: 'test_run_report',
          contentJson: { total: 1, failed: 0 },
        },
      ],
    };

    const bundle = await writeReleaseBundle({
      projectId,
      repoContext: null,
      packet,
      audit: { events: [] },
      evidence: {},
      releaseDecision: { decision: 'APPROVE' },
    });

    expect(bundle.finalMdPath).toBe(path.join(os.tmpdir(), projectId, 'release', 'final.md'));
    await expect(fs.readFile(bundle.finalMdPath, 'utf8')).resolves.toContain('AIFA Release Report');
    await expect(fs.readFile(path.join(os.tmpdir(), projectId, 'release', 'qa-report.md'), 'utf8'))
      .resolves.toContain('test run report');
    await fs.rm(path.join(os.tmpdir(), projectId), { recursive: true, force: true });
  });
});
