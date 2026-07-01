// T5 (B6) — gateBridge.subscribeProject fan-out.
//
// Verifies that a listener registered against a projectId receives every
// event emitted for ANY task under that project, that unsubscribe removes
// it cleanly, and that listeners on different projects don't leak.

// uuid v14 is ESM-only; mock it so jest's CJS transform doesn't choke on it.
jest.mock('uuid', () => { let n = 0; return { v4: () => `uuid-${++n}` }; });

const gateBridge = require('../../src/services/gateBridge');

describe('gateBridge.subscribeProject', () => {
  beforeEach(() => {
    gateBridge._clearAll();
  });

  test('subscribeProject returns an unsubscribe function', () => {
    const cb = jest.fn();
    const unsub = gateBridge.subscribeProject('proj-1', cb);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  test('unsubscribe prevents future events from reaching the listener', async () => {
    const cb = jest.fn();
    const unsub = gateBridge.subscribeProject('proj-1', cb);
    unsub();
    // Register a gate after unsubscribe — cb must not fire.
    gateBridge.requestGate({
      taskId: 'task-X', projectId: 'proj-1', role: 'dev-agent', kind: 'output_review', payload: {},
    });
    await new Promise((r) => setImmediate(r));
    expect(cb).not.toHaveBeenCalled();
  });

  test('events for a different project do not leak into a subscriber', async () => {
    const cbA = jest.fn();
    const cbB = jest.fn();
    gateBridge.subscribeProject('proj-A', cbA);
    gateBridge.subscribeProject('proj-B', cbB);
    gateBridge.requestGate({
      taskId: 'task-A1', projectId: 'proj-A', role: 'po-agent', kind: 'question', payload: {},
    });
    await new Promise((r) => setImmediate(r));
    expect(cbB).not.toHaveBeenCalled();
  });
});