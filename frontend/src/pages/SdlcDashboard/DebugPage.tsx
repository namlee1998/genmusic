import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Bug, 
  Activity, 
  Database, 
  Key, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ArrowRight, 
  AlertTriangle,
  HelpCircle,
  Code2,
  FileCode,
  Sparkles
} from 'lucide-react';
import { getProjectHealth, SystemHealthData, updateSystemSettings } from '@/services/api/sdlcApi';

interface DiagnosisResult {
  title: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  fileName: string | null;
  lineNumber: string | null;
  explanation: string;
  remediations: string[];
  matchedRule: string | null;
}

export default function DebugPage() {
  const { t } = useTranslation();
  
  // Health states
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Diagnosis inputs
  const [errorInput, setErrorInput] = useState('');
  const [componentType, setComponentType] = useState('auto');
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    GOOGLE_API_KEY: '',
    E2B_API_KEY: ''
  });

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const data = await getProjectHealth();
      setHealthData(data);
    } catch (err: any) {
      console.error('Failed to load project health:', err);
      setHealthError(err.message || 'Failed to connect to backend server health API');
    } finally {
      setHealthLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    try {
      await updateSystemSettings(apiKeys);
      setIsSettingsOpen(false);
      setApiKeys({
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        DEEPSEEK_API_KEY: '',
        GOOGLE_API_KEY: '',
        E2B_API_KEY: ''
      });
      await fetchHealth();
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDiagnose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!errorInput.trim()) {
      setDiagnosis(null);
      return;
    }

    const text = errorInput.toLowerCase();
    
    // 1. Extract file & line if possible from standard stack trace (e.g. at functionName (filepath:line:col))
    const stackLineRegex = /(?:at\s+)?([a-zA-Z0-9_<>.]+)?\s*\(?([^:)\n]+):(\d+):(\d+)\)?/i;
    const match = errorInput.match(stackLineRegex);
    let fileName = null;
    let lineNumber = null;
    if (match) {
      const pathParts = match[2].split(/[/\\]/);
      fileName = pathParts[pathParts.length - 1]; // get file basename
      lineNumber = match[3];
    }

    // 2. Classify error type
    let errorType = 'Unknown Error';
    if (text.includes('referencerror') || text.includes('referenceerror')) {
      errorType = 'ReferenceError (Variable is missing)';
    } else if (text.includes('typeerror')) {
      errorType = 'TypeError (Invalid type operation)';
    } else if (text.includes('prismaclient') || text.includes('prisma:query') || text.includes('sqlite')) {
      errorType = 'Prisma / Database Engine Error';
    } else if (text.includes('axioserror') || text.includes('network error') || text.includes('connrefused')) {
      errorType = 'Axios / Network Connectivity Error';
    } else if (text.includes('modulenotfounderror') || text.includes('cannot find module')) {
      errorType = 'Module Resolution Error';
    } else if (text.includes('syntaxerror')) {
      errorType = 'SyntaxError (Malformed Code)';
    } else if (text.includes('sse') || text.includes('eventsource') || text.includes('event-stream')) {
      errorType = 'SSE Streaming / Protocol Error';
    }

    // 3. Match against CLAUDE.md project guidelines and rules
    let matchedRule = null;
    let title = 'General Application Issue';
    let explanation = 'The system detected an standard application error traceback. Review the file and line number below to isolate the source.';
    let remediations: string[] = [
      'Double-check the file path and exact line number listed in the stack trace.',
      'Check if all recent dependencies are installed using npm install / pip install.',
      'Verify that all local configuration or .env properties match the template.'
    ];
    let severity: 'error' | 'warning' | 'info' = 'error';

    // Rule 4: Auth stub bypass
    if (text.includes('membershipservice') || text.includes('authservice') || text.includes('quotaservice')) {
      matchedRule = 'CLAUDE.md Rule 4 (Auth Bypassed)';
      title = 'Bypassed Service Reference Attempt';
      severity = 'error';
      explanation = 'It looks like the code tried to import or call MembershipService, AuthService, or QuotaService. According to Rule 4, all quota, admin, and membership controls are bypassed and deleted in this single-user version.';
      remediations = [
        'Do NOT import MembershipService, QuotaService, or AuthService.',
        'Use the inline stub objects configured in SdlcWorkflowService.js or DocumentService.js.',
        'If calling authorization gates, replace the call with a dummy check returning true or default permissions (e.g. user role "owner").'
      ];
    }
    // Rule 1: SSE Streaming
    else if (text.includes('stream_') || text.includes('astream_events') || text.includes('stream') && (text.includes('delta') || text.includes('sse'))) {
      matchedRule = 'CLAUDE.md Rule 1 (SSE Streaming)';
      title = 'Broken SSE Stream Pipe';
      severity = 'warning';
      explanation = 'The system detected streaming or Server-Sent Events (SSE) anomalies. Rule 1 states that the Python Agent token streams rely on astream_events to send live updates to the UI, and structured output refactoring can break JSON delta reconstruction.';
      remediations = [
        'Check if you refactored python code using OpenAI Function Calling (with_structured_output). Ensure it correctly streams JSON delta elements.',
        'Verify backend headers are: Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive.',
        'Ensure the backend controller calls res.flushHeaders() to flush buffer blocks early to the client browser.'
      ];
    }
    // Rule 5: Forbidden legacy agents
    else if (text.includes('agent_1') || text.includes('agent_2') || text.includes('agent_3')) {
      matchedRule = 'CLAUDE.md Rule 5 (No Legacy Agents)';
      title = 'Legacy Agent Execution Attempt';
      severity = 'error';
      explanation = 'An error occurred involving agent_1, agent_2, or agent_3. Rule 5 strictly forbids the import or execution of these legacy agents as they have been completely deleted from the pipeline.';
      remediations = [
        'Locate and delete imports of agent_1, agent_2, or agent_3 inside main_pipeline.py or controller services.',
        'Use the modern PO, UX, DEV, and QA agents instead.'
      ];
    }
    // Rule 3: Pipeline / styling overlaps
    else if (text.includes('pipeline') && (text.includes('flex') || text.includes('grid') || text.includes('overlap') || text.includes('arrow'))) {
      matchedRule = 'CLAUDE.md Rule 3 (Frontend UI Overlaps)';
      title = 'Pipeline CSS Layout Issue';
      severity = 'warning';
      explanation = 'A style alignment or rendering overlap was reported in the pipeline component. Rule 3 warns that sdlc-pipeline must use Flexbox to keep connector arrows from wrapping onto multiple lines.';
      remediations = [
        'Open sdlc.css and check if CSS Grid is conflicting with the flex-based layout of sdlc-pipeline.',
        'Ensure that phase cards and connection arrows are not set to flex-wrap or flex-shrink: 1.'
      ];
    }
    // Rule 2: Hybrid router
    else if (text.includes('_get_llm') || text.includes('model_config') || text.includes('model=none') || text.includes('model = none')) {
      matchedRule = 'CLAUDE.md Rule 2 (Respect the Hybrid Router)';
      title = 'LLM Router Signature Mismatch';
      severity = 'error';
      explanation = 'An error occurred during agent LLM model retrieval. Rule 2 requires that _get_llm(model_config) signature is mandatory and must not be reverted to model=None.';
      remediations = [
        'Ensure the _get_llm function call passes the model_config object parameter.',
        'Do not revert model definitions to simple static strings or None parameters.'
      ];
    }
    // Database connection
    else if (text.includes('sqlite') || text.includes('prisma') || text.includes('dev.db')) {
      title = 'Database Engine Connection Failure';
      severity = 'error';
      explanation = 'The database client failed to run queries or connect to the dev.db sqlite database file.';
      remediations = [
        'Verify that your .env file defines DATABASE_URL="file:./dev.db".',
        'Check if there are pending schema migrations by running npx prisma db push in your terminal.',
        'Ensure the backend process has read/write permissions for the backend/prisma/ directory.'
      ];
    }
    // Connection refused / Vite proxy
    else if (text.includes('connrefused') || text.includes('axioserror') && text.includes('3000')) {
      title = 'Backend Server Offline';
      severity = 'error';
      explanation = 'The frontend is unable to reach the backend REST API on port 3000. Connection was refused.';
      remediations = [
        'Start the backend API server by running npm run dev in the backend directory.',
        'Ensure there is no conflicting process running on port 3000 (e.g. Kill existing node servers).',
        'Check if Vite proxy settings in vite.config.ts are routing /api requests to http://localhost:3000.'
      ];
    }

    setDiagnosis({
      title,
      type: errorType,
      severity,
      fileName,
      lineNumber,
      explanation,
      remediations,
      matchedRule
    });
  };

  const handleClear = () => {
    setErrorInput('');
    setDiagnosis(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 text-on-surface">
            <Bug className="text-rose-500 animate-pulse" size={24} />
            <span>Platform Developer Diagnostics</span>
          </h1>
          <p className="text-xs text-on-surface-variant/70 mt-1">
            Troubleshoot system configuration, verify database bindings, and debug backend log tracebacks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg text-xs font-semibold text-indigo-400 transition-all cursor-pointer"
          >
            <Key size={13} />
            <span>Configure AI Settings</span>
          </button>
          <button
            onClick={fetchHealth}
            disabled={healthLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high border border-outline-variant/40 rounded-lg text-xs font-semibold text-on-surface transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={healthLoading ? 'animate-spin' : ''} />
            <span>{healthLoading ? 'Checking...' : 'Refresh Health'}</span>
          </button>
        </div>
      </div>

      {/* 2. Health Check Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* DB Connection card */}
        <div className="app-card p-4 flex flex-col justify-between min-h-[120px] relative overflow-hidden group hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-label-mono text-on-surface-variant/50 uppercase tracking-widest leading-none">Database Status</span>
              <h3 className="text-sm font-bold flex items-center gap-1.5 mt-1 text-on-surface">
                <Database size={15} className="text-primary" />
                <span>SQLite (Prisma)</span>
              </h3>
            </div>
            {healthLoading ? (
              <span className="w-2.5 h-2.5 rounded-full bg-outline animate-ping" />
            ) : healthError || healthData?.db.status === 'error' ? (
              <XCircle className="text-error" size={18} />
            ) : (
              <CheckCircle2 className="text-green-500" size={18} />
            )}
          </div>
          
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-xs text-on-surface-variant/80">
              {healthError ? 'Database Connection Failed' : `Project count: ${healthData?.db.projectCount ?? 0}`}
            </span>
            {healthData?.db.status === 'error' && (
              <span className="text-[9px] font-bold text-error bg-error/10 border border-error/20 px-1.5 py-0.5 rounded uppercase">
                ERROR
              </span>
            )}
          </div>
          {healthError && (
            <div className="absolute inset-x-0 bottom-0 bg-error/5 border-t border-error/20 px-3 py-1.5 text-[9px] text-error font-medium truncate">
              {healthError}
            </div>
          )}
        </div>

        {/* environment Keys status */}
        <div className="app-card p-4 md:col-span-2 flex flex-col justify-between min-h-[120px] hover:border-primary/40 transition-all duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-[10px] font-label-mono text-on-surface-variant/50 uppercase tracking-widest leading-none">Configured Integrations</span>
              <h3 className="text-sm font-bold flex items-center gap-1.5 mt-1 text-on-surface">
                <Key size={15} className="text-amber-500" />
                <span>AI Providers & Secrets API</span>
              </h3>
            </div>
            <Activity size={16} className="text-on-surface-variant/40" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {[
              { label: 'OpenAI API', key: 'OPENAI_API_KEY' },
              { label: 'Anthropic Key', key: 'ANTHROPIC_API_KEY' },
              { label: 'DeepSeek Key', key: 'DEEPSEEK_API_KEY' },
              { label: 'Google Gemini', key: 'GOOGLE_API_KEY' },
              { label: 'Database URL', key: 'DATABASE_URL' }
            ].map((item) => {
              const loaded = healthData?.env[item.key as keyof typeof healthData.env] ?? false;
              return (
                <div 
                  key={item.label}
                  className={`px-2 py-1.5 rounded-lg border flex items-center justify-between transition-colors ${
                    loaded 
                      ? 'bg-primary/5 border-primary/10 text-primary' 
                      : 'bg-surface-container border-outline-variant/30 text-on-surface-variant/60'
                  }`}
                >
                  <span className="text-[10px] font-bold truncate">{item.label}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${loaded ? 'bg-primary animate-pulse' : 'bg-outline-variant'}`} />
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 3. Error Diagnostics Input Form & Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Form Container */}
        <div className="lg:col-span-7 app-card p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-3">
            <Code2 size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-on-surface">Log & Traceback Analyzer</h2>
          </div>

          <form onSubmit={handleDiagnose} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                Paste Error Trace / Log Lines
              </label>
              <textarea
                value={errorInput}
                onChange={(e) => setErrorInput(e.target.value)}
                placeholder="Paste the full compiler error, Node.js TypeError, SQLite exception, or Axios response failure here..."
                rows={10}
                className="w-full p-3 bg-code-bg text-on-surface-variant font-mono text-xs rounded-xl border border-outline-variant/50 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 resize-none transition-all custom-scrollbar"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-on-surface-variant">Component:</span>
                <select
                  value={componentType}
                  onChange={(e) => setComponentType(e.target.value)}
                  className="bg-surface-container border border-outline-variant/50 rounded-lg text-xs py-1 px-2.5 text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="auto">Auto-detect Component</option>
                  <option value="frontend">Frontend Client (Vite)</option>
                  <option value="backend">Backend API Server</option>
                  <option value="db">Prisma DB / SQLite</option>
                  <option value="python">Python Agents</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3.5 py-1.5 rounded-lg border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-surface-variant transition-all cursor-pointer"
                >
                  Clear
                </button>
                
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-xs font-bold text-white shadow-[0_0_8px_rgba(99,102,241,0.25)] flex items-center gap-1 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  <Sparkles size={13} className="animate-spin-slow" />
                  <span>Run Diagnostic</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Diagnosis Results */}
        <div className="lg:col-span-5 flex flex-col h-full">
          {diagnosis ? (
            <div className="app-card p-5 flex-1 flex flex-col justify-between border-t-2 border-t-primary animate-fade-up">
              <div className="space-y-4">
                {/* Rule Match Badge */}
                <div className="flex justify-between items-center">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                    diagnosis.severity === 'error' 
                      ? 'bg-error/10 border-error/20 text-error' 
                      : 'bg-warning/10 border-warning/20 text-warning'
                  }`}>
                    {diagnosis.type}
                  </span>
                  
                  {diagnosis.matchedRule && (
                    <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 size={9} />
                      <span>{diagnosis.matchedRule}</span>
                    </span>
                  )}
                </div>

                {/* Title and location */}
                <div className="space-y-1 pb-2 border-b border-outline-variant/30">
                  <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
                    {diagnosis.severity === 'error' ? (
                      <XCircle size={18} className="text-error shrink-0" />
                    ) : (
                      <AlertTriangle size={18} className="text-warning shrink-0" />
                    )}
                    <span>{diagnosis.title}</span>
                  </h3>
                  
                  {diagnosis.fileName && (
                    <p className="text-[10px] font-mono text-on-surface-variant/80 flex items-center gap-1 mt-1">
                      <FileCode size={11} className="text-primary" />
                      <span>Location: {diagnosis.fileName} {diagnosis.lineNumber && `(Line: ${diagnosis.lineNumber})`}</span>
                    </p>
                  )}
                </div>

                {/* Explanation text */}
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-on-surface uppercase tracking-wider">Analysis Result</h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    {diagnosis.explanation}
                  </p>
                </div>

                {/* Remediations Checklist */}
                <div className="space-y-2 pt-2">
                  <h4 className="text-[10px] font-bold text-on-surface uppercase tracking-wider">Troubleshooting steps</h4>
                  <ul className="space-y-1.5">
                    {diagnosis.remediations.map((step, idx) => (
                      <li key={idx} className="flex gap-2 items-start text-xs text-on-surface-variant/90 leading-relaxed">
                        <ArrowRight size={12} className="text-primary mt-0.5 shrink-0" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-t border-outline-variant/30 pt-4 mt-6 flex justify-between items-center text-[10px] text-on-surface-variant/40">
                <span>Rule classification matches: CLAUDE.md guidelines</span>
                <HelpCircle size={12} />
              </div>
            </div>
          ) : (
            <div className="app-card border-dashed border-2 border-outline-variant/40 p-8 flex-1 flex flex-col items-center justify-center text-center text-on-surface-variant/50 min-h-[300px]">
              <Bug size={32} className="stroke-[1.25] mb-2" />
              <h3 className="text-xs font-bold text-on-surface-variant/70">Awaiting Log Submission</h3>
              <p className="text-[10px] max-w-xs mt-1 leading-relaxed">
                Paste compiler errors or logs, click "Run Diagnostic", and the system will locate source files and recommend immediate fixes.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* 4. AI Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-xl bg-surface-container-lowest border border-outline-variant/50 shadow-2xl p-6">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3 mb-4">
              <h3 className="text-base font-bold flex items-center gap-2 text-on-surface">
                <Key className="text-amber-500" size={18} />
                <span>Configure AI Providers</span>
              </h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1"
              >
                <XCircle size={18} />
              </button>
            </div>
            
            <form onSubmit={handleSaveSettings} className="space-y-4">
              <p className="text-xs text-on-surface-variant mb-4">
                Enter your API keys below to save them to the backend environment file. Leave fields blank to keep existing keys.
              </p>

              {[
                { label: 'OpenAI API Key', key: 'OPENAI_API_KEY', ph: 'sk-...' },
                { label: 'Anthropic API Key', key: 'ANTHROPIC_API_KEY', ph: 'sk-ant-...' },
                { label: 'DeepSeek API Key', key: 'DEEPSEEK_API_KEY', ph: 'sk-...' },
                { label: 'Google Gemini Key', key: 'GOOGLE_API_KEY', ph: 'AIza...' },
                { label: 'E2B Sandbox API Key', key: 'E2B_API_KEY', ph: 'e2b_...' }
              ].map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    {field.label}
                  </label>
                  <input
                    type="password"
                    placeholder={field.ph}
                    value={apiKeys[field.key as keyof typeof apiKeys]}
                    onChange={(e) => setApiKeys({...apiKeys, [field.key]: e.target.value})}
                    className="w-full bg-surface-container border border-outline-variant/50 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              ))}

              <div className="flex justify-end pt-4 gap-3">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-on-surface-variant hover:bg-surface-variant border border-transparent hover:border-outline-variant/50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-[0_0_10px_rgba(99,102,241,0.2)] disabled:opacity-50"
                >
                  {settingsSaving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  <span>Save Keys</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
