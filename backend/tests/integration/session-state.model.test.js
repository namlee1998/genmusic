const mockFindMany = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../src/config/database', () => ({
  sessionState: {
    findMany: mockFindMany,
    update: mockUpdate,
    delete: mockDelete,
  },
}));

const SessionState = require('../../src/models/SessionState');

describe('SessionState model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('removeDocIds updates and deletes project-scoped session states', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'state-keep', selectedDocIds: '["doc-1","doc-2"]', metadata: '{}' },
      { id: 'state-delete', selectedDocIds: '["doc-1"]', metadata: '{}' },
      { id: 'state-untouched', selectedDocIds: '["doc-3"]', metadata: '{}' },
    ]);
    mockUpdate.mockResolvedValue({ id: 'state-keep', selectedDocIds: '["doc-2"]', metadata: '{}' });
    mockDelete.mockResolvedValue({ id: 'state-delete' });

    await SessionState.removeDocIds(['doc-1'], { projectId: 'project-1' });

    expect(mockFindMany).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'state-keep' },
      data: { selectedDocIds: '["doc-2"]' },
    });
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'state-delete' } });
  });
});
