import './sdlc.css';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Gavel,
  ShieldAlert,
  HelpCircle,
  Clock,
  Activity,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  FileCode,
} from 'lucide-react';
import { useHitlStore } from '@/store/useHitlStore';
import { useAppStore } from '@/store/useAppStore';
import { useSdlcStore } from '@/store/useSdlcStore';
import { type GlobalInterventionItem } from '@/services/api/sdlcApi';

export default function HitlDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { interventions, isLoading, error, fetchInterventions } = useHitlStore();
  const { setCurrentProject } = useAppStore();
  const { resetState } = useSdlcStore();

  useEffect(() => {
    void fetchInterventions();
    const timer = setInterval(() => {
      void fetchInterventions();
    }, 30000); // 30s auto polling
    return () => clearInterval(timer);
  }, [fetchInterventions]);

  // Derived counts
  const totalCount = interventions.length;
  const securityCount = interventions.filter((item) => item.type === 'DEV_FILE_GATE').length;
  const poCount = interventions.filter((item) => item.type === 'PO_CLARIFY').length;

  const handleResolve = (item: GlobalInterventionItem) => {
    // 1. Clear any stale store state from prior project
    resetState();
    // 2. Select the current project
    setCurrentProject(item.projectId);
    // 3. Navigate with the highlight query parameter
    navigate(`/sdlc?highlightGate=${item.id}`);
  };

  const getGateTypeLabel = (type: string) => {
    switch (type) {
      case 'PO_CLARIFY':
        return t('hitl.poQuestions', 'PO Clarification');
      case 'DEV_FILE_GATE':
        return t('hitl.securityRisks', 'Security Gate');
      case 'FINAL_RELEASE':
        return 'Final Release';
      default:
        return type;
    }
  };

  // Mock global audit events for the sidebar timeline
  const mockAuditTrail = [
    {
      id: 1,
      actor: 'Owner (User)',
      action: 'Approved Final Release on Payment Service API',
      time: '15m ago',
      type: 'success',
    },
    {
      id: 2,
      actor: 'PO Agent',
      action: 'Requested PO Clarification on recurring subscription payment service logic',
      time: '1h ago',
      type: 'warning',
    },
    {
      id: 3,
      actor: 'DEV Agent',
      action: 'Bypassed authentication validation rule override in Auth Middleware Server',
      time: '2h ago',
      type: 'danger',
    },
    {
      id: 4,
      actor: 'QA Agent',
      action: 'Completed regression validation tests. Sandbox passed: 12/12 scenarios',
      time: '4h ago',
      type: 'info',
    },
  ];

  return (
    <main className="sdlc-dashboard hitl-dashboard-page">
      {/* Header section */}
      <header className="delivery-header">
        <div>
          <p className="delivery-header__eyebrow">
            <Gavel size={14} className="text-amber-500" /> {t('dashboard.workspace', 'AIDLC delivery workspace')}
          </p>
          <h1>{t('hitl.title', 'Intervention Center')}</h1>
          <p className="text-sm text-on-surface-variant/80">
            Centralized overview of pending security gates, product manager inputs, and release approvals across active repositories.
          </p>
        </div>
        <div>
          <button
            className="delivery-header__cta flex items-center gap-1.5"
            onClick={() => void fetchInterventions()}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            <span>{t('common.refresh', 'Refresh')}</span>
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="hitl-stats-grid">
        <div className="hitl-stats-card">
          <div className="hitl-stats-card__icon hitl-stats-card__icon--total">
            <Activity size={18} />
          </div>
          <div>
            <h3>{t('hitl.totalPending', 'Total Pending')}</h3>
            <p className="hitl-stats-card__value">{totalCount}</p>
          </div>
        </div>

        <div className="hitl-stats-card">
          <div className="hitl-stats-card__icon hitl-stats-card__icon--security">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h3>{t('hitl.securityRisks', 'Security Risks')}</h3>
            <p className="hitl-stats-card__value text-red-500">{securityCount}</p>
          </div>
        </div>

        <div className="hitl-stats-card">
          <div className="hitl-stats-card__icon hitl-stats-card__icon--po">
            <HelpCircle size={18} />
          </div>
          <div>
            <h3>{t('hitl.poQuestions', 'PO Questions')}</h3>
            <p className="hitl-stats-card__value text-amber-500">{poCount}</p>
          </div>
        </div>

        <div className="hitl-stats-card">
          <div className="hitl-stats-card__icon hitl-stats-card__icon--resolution">
            <Clock size={18} />
          </div>
          <div>
            <h3>{t('hitl.avgResolution', 'Avg Resolution')}</h3>
            <p className="hitl-stats-card__value">~12 min</p>
          </div>
        </div>
      </div>

      <div className="hitl-content-split">
        {/* Main grid of pending gates */}
        <section className="hitl-main-section">
          {error && (
            <div className="hitl-error-banner">
              <ShieldAlert size={16} />
              <span>{t('hitl.errorFetch', 'Failed to load interventions.')} {error}</span>
              <button onClick={() => void fetchInterventions()} className="hitl-error-retry">
                {t('hitl.retry', 'Retry')}
              </button>
            </div>
          )}

          {isLoading && totalCount === 0 ? (
            <div className="hitl-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="hitl-card hitl-card--skeleton">
                  <div className="hitl-skeleton hitl-skeleton__badge"></div>
                  <div className="hitl-skeleton hitl-skeleton__title"></div>
                  <div className="hitl-skeleton hitl-skeleton__repo"></div>
                  <div className="hitl-skeleton hitl-skeleton__text"></div>
                  <div className="hitl-skeleton hitl-skeleton__btn"></div>
                </div>
              ))}
            </div>
          ) : totalCount === 0 ? (
            <div className="hitl-empty-state">
              <CheckCircle size={48} className="text-green-500 animate-bounce" />
              <h2>{t('hitl.emptyState', 'All clear! No pending interventions.')}</h2>
              <p className="text-sm text-on-surface-variant/60 max-w-sm">
                Your AI Agents are executing pipelines seamlessly. New approvals will pop up here when security overrides or PO clarifications are needed.
              </p>
            </div>
          ) : (
            <div className="hitl-grid">
              {interventions.map((item) => (
                <div key={item.id} className={`hitl-card hitl-card--${item.type.toLowerCase()}`}>
                  <div className="hitl-card__header">
                    <span className={`hitl-badge hitl-badge--${item.type.toLowerCase()}`}>
                      {getGateTypeLabel(item.type)}
                    </span>
                    <span className="hitl-card__time">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <h2 className="hitl-card__title">{item.projectName}</h2>
                  <div className="hitl-card__repo">
                    <ExternalLink size={12} className="text-on-surface-variant/50" />
                    <span>{item.repoUrl}</span>
                  </div>

                  <div className="hitl-card__body">
                    {item.type === 'PO_CLARIFY' && item.payload.questions && (
                      <div className="hitl-card__details">
                        <p className="hitl-card__details-title">
                          {t('hitl.phaseLabel', 'Phase:')} <span className="font-semibold text-amber-500">PO Requirements Grooming</span>
                        </p>
                        <ul className="hitl-card__questions-list">
                          {item.payload.questions.slice(0, 2).map((q, idx) => (
                            <li key={idx} className="truncate">
                              • {q}
                            </li>
                          ))}
                          {item.payload.questions.length > 2 && (
                            <li className="text-[10px] text-on-surface-variant/60 font-semibold italic pl-3">
                              + {item.payload.questions.length - 2} more clarification questions
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {item.type === 'DEV_FILE_GATE' && (
                      <div className="hitl-card__details">
                        <p className="hitl-card__details-title">
                          {t('hitl.phaseLabel', 'Phase:')} <span className="font-semibold text-red-500">Development Bypass Gate</span>
                        </p>
                        <div className="hitl-card__code-meta">
                          <FileCode size={13} className="text-red-500" />
                          <span className="font-mono text-xs text-red-400 truncate">{item.payload.path}</span>
                        </div>
                        <p className="hitl-card__reason-snippet truncate mt-1.5">
                          {item.payload.reason}
                        </p>
                      </div>
                    )}

                    {item.type === 'FINAL_RELEASE' && (
                      <div className="hitl-card__details">
                        <p className="hitl-card__details-title">
                          {t('hitl.phaseLabel', 'Phase:')} <span className="font-semibold text-blue-500">Final Release Acceptance Gate</span>
                        </p>
                        <p className="hitl-card__reason-snippet line-clamp-2 mt-1">
                          {item.payload.reason}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="hitl-card__actions mt-auto">
                    <button
                      onClick={() => handleResolve(item)}
                      className="hitl-card__btn flex items-center justify-between w-full"
                    >
                      <span>{t('hitl.navigateResolve', 'Navigate to Resolve')}</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Global timeline of manual override events */}
        <aside className="hitl-timeline-sidebar">
          <h2>{t('hitl.timelineTitle', 'Audit Logs & Override Events')}</h2>
          <div className="hitl-timeline">
            {mockAuditTrail.map((event) => (
              <div key={event.id} className={`hitl-timeline-item hitl-timeline-item--${event.type}`}>
                <div className="hitl-timeline-item__dot"></div>
                <div className="hitl-timeline-item__content">
                  <div className="hitl-timeline-item__header">
                    <span className="hitl-timeline-item__actor">{event.actor}</span>
                    <span className="hitl-timeline-item__time">{event.time}</span>
                  </div>
                  <p className="hitl-timeline-item__action">{event.action}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
