import { CheckCircle2, CircleDashed, CloudCog, LoaderCircle, XCircle } from 'lucide-react';
import type { WorkflowStatus } from '@/store/useSdlcStore';

const MCP_LANES = [
  { key: 'po', worker: 'PO Agent', tool: 'Confluence MCP', endpoint: 'docs.search / page.write', color: '#6366f1' },
  { key: 'ux', worker: 'UX Agent', tool: 'Penpot MCP', endpoint: 'wireframe.publish', color: '#8b5cf6' },
  { key: 'dev', worker: 'DEV Agent', tool: 'Repository MCP + E2B', endpoint: 'repo.write / test.run', color: '#3b82f6' },
  { key: 'qa', worker: 'QA Agent', tool: 'Jira MCP + TestRail MCP', endpoint: 'issue.write / testcase.write', color: '#10b981' },
] as const;

interface Props {
  phases: WorkflowStatus['phases'];
}

function getLaneState(status?: string | null) {
  if (status === 'pending' || status === 'processing') return 'calling';
  if (status === 'completed') return 'received';
  if (status === 'failed') return 'failed';
  return 'waiting';
}

export default function McpActivityPanel({ phases }: Props) {
  return (
    <section className="mcp-activity">
      <div className="mcp-activity__header">
        <div>
          <p>MCP / HTTPS activity</p>
          <h2>Worker tool-call visualization</h2>
          <span>Each worker sends an allow-listed request and receives the tool result over HTTPS.</span>
        </div>
        <CloudCog size={24} />
      </div>

      <div className="mcp-activity__lanes">
        {MCP_LANES.map((lane) => {
          const state = getLaneState(phases[lane.key]?.status);
          const toolIcon = state === 'calling'
            ? <LoaderCircle className="spin" size={16} />
            : state === 'received'
              ? <CheckCircle2 size={16} />
              : state === 'failed'
                ? <XCircle size={16} />
                : <CircleDashed size={16} />;
          return (
            <article className={`mcp-lane mcp-lane--${state}`} key={lane.key} style={{ '--mcp-color': lane.color } as React.CSSProperties}>
              <div className="mcp-lane__worker">
                <strong>{lane.worker}</strong>
                <span>{state === 'calling' ? 'Calling MCP' : state === 'received' ? 'Tool result received' : state === 'failed' ? 'Tool call failed' : 'Waiting for worker run'}</span>
              </div>

              <div className="mcp-lane__exchange">
                <div className="mcp-lane__arrow mcp-lane__arrow--request"><span>HTTPS request</span><b>→</b></div>
                <div className="mcp-lane__arrow mcp-lane__arrow--result"><b>←</b><span>{state === 'received' ? 'success result' : 'tool response'}</span></div>
              </div>

              <div className="mcp-lane__tool">
                {toolIcon}
                <div><strong>{lane.tool}</strong><span>{lane.endpoint}</span></div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
