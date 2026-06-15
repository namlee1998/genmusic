import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { approveToolCall, getPendingToolApprovals } from '@/services/api/sdlcApi';
import { useSdlcStore } from '@/store/useSdlcStore';

interface ToolApprovalPromptProps {
  onApprovalComplete?: () => void;
}

interface PendingApproval {
  taskId: string;
  data: {
    tool_calls?: Array<{
      name: string;
      args: Record<string, unknown>;
    }>;
    [key: string]: unknown;
  };
}

export const ToolApprovalPrompt: React.FC<ToolApprovalPromptProps> = ({ onApprovalComplete }) => {
  const [pendingQueue, setPendingQueue] = useState<PendingApproval[]>([]);
  const [feedback, setFeedback] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const projectId = useSdlcStore(state => state.projectId);

  useEffect(() => {

    // Remove /api/v1 from base url to get socket root
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
    const socketUrl = baseUrl.replace('/api/v1', '');
    
    const newSocket = io(socketUrl, {
      withCredentials: true,
    });

    newSocket.on('connect', () => {
      console.log('Socket connected, joining global_approvals');
      newSocket.emit('join_global_approvals');
    });

    newSocket.on('tool_approval_pending', (data) => {
      console.log('Tool approval requested:', data);
      setPendingQueue(prev => {
        // Prevent duplicates
        if (prev.find(p => p.taskId === data.taskId)) return prev;
        return [...prev, { taskId: data.taskId, data: data.data }];
      });
    });

    socketRef.current = newSocket;

    return () => {
      socketRef.current = null;
      newSocket.disconnect();
    };
  }, []);

  // Fetch initial pending approvals on mount or project change
  useEffect(() => {
    if (projectId) {
      getPendingToolApprovals(projectId).then(res => {
        if (res.success && res.data?.length > 0) {
          setPendingQueue(res.data);
        }
      }).catch(err => console.error('Failed to fetch pending approvals', err));
    }
  }, [projectId]);

  if (pendingQueue.length === 0) return null;

  const currentPending = pendingQueue[0];

  const handleDecision = async (approved: boolean) => {
    try {
      await approveToolCall(currentPending.taskId, approved, feedback);
      setPendingQueue(prev => prev.slice(1));
      setFeedback('');
      if (onApprovalComplete) onApprovalComplete();
    } catch (err) {
      console.error('Failed to submit tool approval', err);
      alert('Error submitting decision.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-sm p-4">
      <div className="bg-[#1e1e2e] rounded-xl border border-gray-700 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-[#2a2a3c] px-6 py-4 border-b border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-yellow-400 text-xl">⚠️</span>
            <h3 className="text-lg font-semibold text-white">Action Required: Approve Tool Execution</h3>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <p className="text-gray-300 mb-4">
            The DEV Agent wants to execute the following tools in your environment. Please review carefully.
          </p>

          <div className="bg-black rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto border border-gray-700">
            {currentPending.data?.tool_calls?.map((tc, i) => (
              <div key={i} className="mb-4 last:mb-0">
                <div className="text-purple-400 mb-1">▶ Tool: {tc.name}</div>
                <div className="pl-4 text-gray-300 whitespace-pre-wrap">
                  {JSON.stringify(tc.args, null, 2)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Feedback / Instructions (Modifies command if Approved, Reason if Rejected):
            </label>
            <textarea
              className="w-full bg-[#2a2a3c] border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 resize-none"
              rows={3}
              placeholder="e.g., 'Do not use npm, use yarn instead.'"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#2a2a3c] px-6 py-4 border-t border-gray-700 flex justify-between items-center">
          <div className="text-gray-400 text-sm">
            {pendingQueue.length > 1 ? `${pendingQueue.length - 1} more pending...` : ''}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => handleDecision(false)}
              className="px-6 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              Reject (N)
            </button>
            <button
              onClick={() => handleDecision(true)}
              className={`px-6 py-2 rounded-lg font-medium text-white transition-colors ${feedback ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {feedback ? 'Submit Feedback' : 'Approve (Y)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
