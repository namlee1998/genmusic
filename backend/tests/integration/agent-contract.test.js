// I4: shared agent-contract conformance suite. The mock implementation
// (`_buildMockOutput`) must satisfy the role contract for every agent. When a
// real agent is wired it runs through this exact suite, so any divergence from
// the mock's shape is caught here instead of mid-pipeline.

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

const SdlcWorkflowService = require('../../src/services/SdlcWorkflowService');
const { assertOutputConforms, REQUIRED_OUTPUT_KEYS, AGENT_CONTRACT_VERSION } = require('../../src/services/agentContract');

// Happy-path so the high-risk DEV security gate passes on the first run.
beforeAll(() => { process.env.MOCK_SCENARIO = 'happy_path'; });
afterAll(() => { delete process.env.MOCK_SCENARIO; });

const CONTEXT = {
  'po-agent': { featureRequest: { title: 'Add Google login', description: 'OAuth 2.0 sign-in' } },
  'ux-agent': {},
  'dev-agent': {},
  'qa-agent': {},
};

describe('I4 — agent output contract', () => {
  test('contract version is pinned', () => {
    expect(AGENT_CONTRACT_VERSION).toBe('agent-io.v1');
  });

  test.each(Object.keys(REQUIRED_OUTPUT_KEYS))(
    'mock %s output conforms to the contract',
    async (role) => {
      const task = { id: 'test-task', type: role, projectId: 'proj-1', sourceRunId: 'src-1' };
      const output = await SdlcWorkflowService._buildMockOutput(task, CONTEXT[role]);
      const result = assertOutputConforms(role, output);
      expect(result.missing).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );

  test('assertOutputConforms reports missing keys for an empty output', () => {
    const result = assertOutputConforms('po-agent', {});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['prd', 'acceptance_criteria']));
  });
});
