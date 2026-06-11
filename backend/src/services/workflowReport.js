// Release-bundle writer.
//
// Beginner reading guide: after an owner/admin approves release, this service
// combines resolved artifacts, audit events, evidence, and git metadata into
// final.md and qa-report.md. It writes into the server repo copy when available.
//
// On RELEASED, assemble a multi-part release bundle in the cloned repo:
//   1) working branch  2) commit/patch diff  3) final.md  4) QA report
//   5) release decision. final.md gathers the audit trail + PO/UX/DEV/QA
//   summaries + release evidence. FILE:<path> refs are resolved upstream
//   (artifacts arrive already resolved from getFinalReviewPacket).

const fs = require('fs/promises');
const path = require('path');
const repoService = require('./repoService');
const logger = require('../config/logger');

function section(title, body) {
  return `\n\n## ${title}\n\n${body || '_none_'}`;
}

function artifactText(artifacts, phase, type) {
  const a = (artifacts || []).find((x) => (x.phase === phase || x.agentType === phase) && (x.type === type || x.artifactType === type));
  if (!a) return null;
  if (typeof a.contentText === 'string' && a.contentText.trim()) return a.contentText;
  if (a.contentJson) return '```json\n' + JSON.stringify(a.contentJson, null, 2) + '\n```';
  return null;
}

function joinedArtifacts(artifacts, phase, types) {
  return types
    .map((type) => {
      const body = artifactText(artifacts, phase, type);
      return body ? `### ${type.replace(/_/g, ' ')}\n\n${body}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
}

/** Build the final.md markdown from the review packet, audit trail, and evidence. */
function buildFinalMarkdown({ projectId, packet, audit, evidence, releaseDecision, diff }) {
  const artifacts = packet?.artifacts || [];
  const when = new Date().toISOString();
  let md = `# AIFA Release Report\n\n- Project: \`${projectId}\`\n- Generated: ${when}\n- Decision: **${releaseDecision?.decision || 'APPROVE'}**`;

  md += section('Feature', evidence?.feature ? '```json\n' + JSON.stringify(evidence.feature, null, 2) + '\n```' : null);
  md += section('Product Requirements (PO)', joinedArtifacts(artifacts, 'po-agent', ['prd', 'acceptance_criteria']));
  md += section('UX Spec', artifactText(artifacts, 'ux-agent', 'ux_spec'));
  md += section('Development Evidence', joinedArtifacts(artifacts, 'dev-agent', ['implementation_plan', 'sandbox_result', 'self_test_report']));
  md += section('Patch / Diff', diff ? '```diff\n' + diff.slice(0, 8000) + '\n```' : artifactText(artifacts, 'dev-agent', 'patch_diff'));
  md += section('QA Evidence', joinedArtifacts(artifacts, 'qa-agent', ['qa_report', 'test_run_report', 'ac_coverage_matrix']));

  md += section('Release Evidence', '```json\n' + JSON.stringify(evidence || {}, null, 2) + '\n```');

  const events = (audit?.events || []).map((e) => `- \`${e.timestamp}\` **${e.action}** (${e.actor})${e.comment ? ` — ${e.comment}` : ''}`).join('\n');
  md += section('Audit Trail', events);

  md += section('Release Decision', '```json\n' + JSON.stringify({
    decision: releaseDecision?.decision,
    action: releaseDecision?.action,
    comment: releaseDecision?.comment,
    reviewer_role: releaseDecision?.payload?.reviewer_role || null,
    at: releaseDecision?.createdAt || when,
  }, null, 2) + '\n```');

  return md + '\n';
}

/**
 * Write the release bundle. When a repo was cloned, final.md + QA report are
 * written INTO the repo and committed on the working branch; otherwise they go
 * to the per-project workspace so the demo still produces files.
 *
 * @returns {{ outputs: object[], finalMdPath: string, commitHash: string|null, diff: string }}
 */
async function writeReleaseBundle({ projectId, repoContext, packet, audit, evidence, releaseDecision }) {
  const repoPath = repoContext?.repoPath || null;
  const baseDir = repoPath || path.join(repoService.WORKSPACE_DIR, projectId, 'release');
  await fs.mkdir(baseDir, { recursive: true });

  // Capture the diff first (DEV changes already committed during the run).
  let diff = '';
  let commitHash = null;
  if (repoPath) {
    try {
      const res = await repoService.commitAndDiff({ repoPath, branch: repoContext.baseBranch || 'main', message: 'aifa: pre-release snapshot' });
      diff = res.diff;
      commitHash = res.commitHash;
    } catch (e) {
      logger.warn('release bundle: diff capture failed', { projectId, error: e.message });
    }
  }

  const finalMd = buildFinalMarkdown({ projectId, packet, audit, evidence, releaseDecision, diff });
  const finalMdPath = path.join(baseDir, 'final.md');
  await fs.writeFile(finalMdPath, finalMd, 'utf8');

  // QA report as its own file for convenience.
  const qaReport = joinedArtifacts(packet?.artifacts || [], 'qa-agent', ['qa_report', 'test_run_report', 'ac_coverage_matrix'])
    || '_No QA evidence_';
  const qaPath = path.join(baseDir, 'qa-report.md');
  await fs.writeFile(qaPath, qaReport, 'utf8');

  // Commit the report files onto the working branch when in a repo.
  if (repoPath) {
    try {
      const res = await repoService.commitAndDiff({ repoPath, branch: repoContext.baseBranch || 'main', message: 'aifa: release report (final.md, qa-report.md)' });
      if (res.commitHash) commitHash = res.commitHash;
    } catch (e) {
      logger.warn('release bundle: report commit failed', { projectId, error: e.message });
    }
  }

  const outputs = [
    { type: 'branch', value: repoContext?.workingBranch || null },
    { type: 'commit', value: commitHash },
    { type: 'final_md', value: finalMdPath },
    { type: 'qa_report', value: qaPath },
    { type: 'release_decision', value: releaseDecision?.decision || 'APPROVE' },
  ];
  logger.info('release bundle written', { projectId, finalMdPath, commitHash, branch: repoContext?.workingBranch || null });
  return { outputs, finalMdPath, commitHash, diff };
}

module.exports = { writeReleaseBundle, buildFinalMarkdown };
