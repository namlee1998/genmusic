import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Circle, XCircle, Clock, X } from 'lucide-react';
import { SessionData } from '@/store/useSdlcStore';

interface SessionCardProps {
  session: SessionData;
  isActive: boolean;
  onSelect: (sessionId: string) => void;
  onClose?: (sessionId: string) => void;
}

export default function SessionCard({ session, isActive, onSelect, onClose }: SessionCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 border-gray-300 hover:bg-gray-200';
      case 'running':
        return 'bg-blue-100 border-blue-400 hover:bg-blue-200';
      case 'awaiting_approval':
        return 'bg-amber-100 border-amber-400 hover:bg-amber-200';
      case 'completed':
        return 'bg-green-100 border-green-400 hover:bg-green-200';
      case 'failed':
        return 'bg-red-100 border-red-400 hover:bg-red-200';
      default:
        return 'bg-gray-100 border-gray-300';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-200 text-gray-800';
      case 'running':
        return 'bg-blue-200 text-blue-800';
      case 'awaiting_approval':
        return 'bg-amber-200 text-amber-800';
      case 'completed':
        return 'bg-green-200 text-green-800';
      case 'failed':
        return 'bg-red-200 text-red-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  const getPhaseIcon = (phaseStatus: string | null) => {
    if (phaseStatus === 'completed') return <CheckCircle2 size={16} className="text-green-600" />;
    if (phaseStatus === 'running' || phaseStatus === 'processing') return <Circle size={16} className="text-blue-600 animate-pulse" />;
    if (phaseStatus === 'failed') return <XCircle size={16} className="text-red-600" />;
    if (phaseStatus === 'skipped') return <Circle size={16} className="text-gray-400" />;
    return <Circle size={16} className="text-gray-300" />;
  };

  const completedPhases = (session.pipelinePhases || []).filter(p => p.status === 'completed').length;
  const progressPercent = (completedPhases / 4) * 100;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect(session.sessionId)}
      className={`session-card border-2 rounded-lg p-4 cursor-pointer transition-all ${getStatusColor(session.status)} ${
        isActive ? 'ring-2 ring-offset-2 ring-blue-500' : ''
      }`}
    >
      {/* Header with title and close button */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${getStatusBadgeColor(session.status)}`}>
              {session.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">
            {session.featureRequest || 'Untitled Session'}
          </h3>
        </div>
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(session.sessionId);
            }}
            className="text-gray-500 hover:text-gray-700 transition-colors p-1"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="w-full bg-gray-300 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-xs text-gray-600 mt-1 font-medium">
          {completedPhases}/4 phases completed
        </p>
      </div>

      {/* Phase indicators */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {(session.pipelinePhases || []).map((phase, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center w-6 h-6">
              {getPhaseIcon(phase.status)}
            </div>
            <span className="text-xs font-medium text-gray-700">{phase.agent}</span>
          </div>
        ))}
      </div>

      {/* Timestamps */}
      <div className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-300 pt-2">
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>{formatTime(session.createdAt)}</span>
        </div>
        {session.updatedAt && (
          <span className="text-gray-500">
            Updated: {formatTime(session.updatedAt)}
          </span>
        )}
      </div>

      {/* Error indicator */}
      {session.error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs text-red-700">
          {session.error}
        </div>
      )}
    </motion.div>
  );
}
