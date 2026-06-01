import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import {
  ChevronRight,
  Sparkles,
  CheckCircle2,
  ArrowDown,
  Bot,
  Zap,
  Shield,
  Lightbulb,
  ClipboardList,
  PenTool,
  Terminal,
  ShieldCheck,
  Activity,
  UserCheck,
  Gavel,
  History,
  FileText
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' as const } },
};

function Navbar({ onCta, session }: { onCta: () => void; session: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 h-16">
      <nav className="flex justify-between items-center h-full px-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold shadow-[0_0_12px_rgba(99,102,241,0.4)]">
            AI
          </div>
          <span className="font-bold text-lg tracking-tight text-on-surface font-headline">AIDLC Platform</span>
          <span className="px-2 py-0.5 bg-primary-container/20 text-primary border border-primary/30 font-label text-[10px] rounded-sm uppercase tracking-widest">Multi-Agent</span>
        </div>
        
        <div className="hidden md:flex items-center gap-8 text-sm">
          <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#features">Platform</a>
          <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#architecture">Agents</a>
          <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#demo">Demo</a>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/auth')} className="text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
            Sign In
          </button>
          <button
            onClick={onCta}
            className="text-sm font-bold bg-primary text-on-primary px-5 py-2.5 rounded-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)] flex items-center gap-1"
          >
            {session ? 'Go to Factory' : 'Start Building'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </nav>
    </header>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center px-6 border-r border-outline-variant/20 last:border-0">
      <p className="text-2xl font-bold text-secondary font-headline">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mt-1 font-bold">{label}</p>
    </div>
  );
}

function PipelineStep({
  step,
  icon: Icon,
  title,
  desc,
  color,
  isLast,
}: {
  step: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
  isLast: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center relative z-10">
      <div className={`w-16 h-16 rounded-xl bg-surface border border-outline-variant/30 flex items-center justify-center mb-4 transition-all duration-300 hover:border-primary relative group`}>
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-xl bg-gradient-to-br from-primary to-secondary`} />
        <Icon className="w-6 h-6 text-on-surface group-hover:text-primary transition-colors" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1.5">{step}</span>
      <h3 className="text-base font-bold text-on-surface mb-1.5">{title}</h3>
      <p className="text-xs text-on-surface-variant leading-relaxed max-w-[180px]">{desc}</p>
      {!isLast && (
        <div className="mt-6 flex flex-col items-center gap-1 xl:hidden">
          <ArrowDown className="w-4 h-4 text-outline/35" />
        </div>
      )}
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();

  const handleCta = () => navigate(session ? '/sdlc' : '/auth');

  const DEMO_INPUT = `User Intent: "I want a Kanban board to track feature backlogs. It should have columns for TODO, IN_PROGRESS, REVIEW, and DONE. Users can drag and drop tasks. Must include Row Level Security so users only see their own projects."`;

  const DEMO_OUTPUT = `# Product Requirements Document (PRD)

## Feature: Agile Kanban Board

### 1. Overview
Implement a fully functional Kanban board to manage feature backlogs within a project.

### 2. User Stories
- **US01:** As a user, I can create a new backlog item so that I can track work.
- **US02:** As a user, I can drag and drop items between statuses (TODO, IN_PROGRESS, REVIEW, DONE).
- **US03:** As an admin, I can ensure RLS policies restrict visibility to project members only.

### 3. Acceptance Criteria
- [x] Board renders 4 distinct columns.
- [x] Drag and drop updates the database via Supabase Realtime.
- [x] Unauthorized users cannot fetch backlogs (401/403).`;

  return (
    <div className="bg-background text-on-surface min-h-screen font-body antialiased overflow-x-hidden selection:bg-primary/20">
      {/* ─ Ambient background glows ─ */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden -z-0 opacity-15">
        <div className="absolute top-[-20%] right-[-10%] w-[900px] h-[900px] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute top-[30%] left-[-20%] w-[700px] h-[700px] bg-secondary/15 rounded-full blur-[120px]" />
      </div>

      <Navbar onCta={handleCta} session={!!session} />

      {/* ━━━━━━━━━━━━ HERO ━━━━━━━━━━━━ */}
      <section className="relative z-10 pt-40 pb-24 px-6 max-w-7xl mx-auto text-center">
        <motion.div variants={fadeUp} initial="hidden" animate="visible">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary font-label text-xs tracking-wider uppercase mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
            <span>AI-Powered SDLC Orchestration</span>
          </div>
        </motion.div>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6 font-headline text-on-surface"
        >
          End-to-End Autonomous <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
            Software Factory
          </span>
        </motion.h1>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-base md:text-lg text-on-surface-variant mb-12 max-w-2xl mx-auto leading-relaxed"
        >
          Deploy a team of specialized AI agents (PO, UX, DEV, QA) to build production-ready code from raw intent, supervised by human gatekeepers.
        </motion.p>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <button
            onClick={handleCta}
            className="w-full sm:w-auto px-8 py-4 bg-primary text-on-primary rounded-sm font-semibold text-base hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all flex items-center justify-center gap-2 group"
          >
            Deploy Your First Agent
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <a
            href="#architecture"
            className="w-full sm:w-auto px-8 py-4 border border-outline-variant bg-surface/50 text-on-surface rounded-sm font-semibold text-base hover:border-secondary hover:text-secondary transition-all"
          >
            Explore Architecture
          </a>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="mt-20 inline-flex flex-col sm:flex-row items-center gap-y-4 sm:gap-y-0 bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-5 px-6 shadow-md"
        >
          <StatItem value="5 Specialized" label="Agents" />
          <StatItem value="100% Audit" label="Trail" />
          <StatItem value="Zero Context" label="Loss" />
          <StatItem value="HITL" label="Controlled" />
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ PIPELINE DIAGRAM ━━━━━━━━━━━━ */}
      <section id="architecture" className="relative z-10 py-24 px-6 border-t border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-6xl mx-auto space-y-16">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="text-center space-y-4"
          >
            <span className="text-secondary font-label text-xs uppercase tracking-widest">LangGraph Flow</span>
            <h2 className="text-3xl md:text-4xl font-bold font-headline text-on-surface">Supervisor-Worker Pipeline</h2>
            <p className="text-on-surface-variant max-w-xl mx-auto text-sm">
              Visualize the autonomous flow of software creation from intent to verified production code, governed by human checkpoints.
            </p>
          </motion.div>

          {/* Pipeline grid steps */}
          <div className="relative">
            <div className="hidden xl:block absolute top-8 left-[12%] right-[12%] h-[1px] bg-outline-variant/30" />

            <div className="grid grid-cols-1 xl:grid-cols-9 gap-4 items-start">
              <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                <PipelineStep
                  step="01. Intent"
                  icon={Lightbulb}
                  title="Intent Agent"
                  desc="Parses raw user requests to extract core business logic."
                  color="bg-primary"
                  isLast={false}
                />
              </motion.div>

              <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
                <ChevronRight className="w-5 h-5 text-outline/35" />
              </div>

              <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ delay: 0.05 }}>
                <PipelineStep
                  step="02. Product"
                  icon={ClipboardList}
                  title="PO Agent"
                  desc="Drafts detailed PRDs and Acceptance Criteria."
                  color="bg-primary"
                  isLast={false}
                />
              </motion.div>

              <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
                <ChevronRight className="w-5 h-5 text-outline/35" />
              </div>

              <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ delay: 0.1 }}>
                <PipelineStep
                  step="03. Design"
                  icon={PenTool}
                  title="UX Agent"
                  desc="Generates user flows and wireframe specifications."
                  color="bg-primary"
                  isLast={false}
                />
              </motion.div>
              
              <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
                <ChevronRight className="w-5 h-5 text-outline/35" />
              </div>

              <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ delay: 0.15 }}>
                <PipelineStep
                  step="04. Dev"
                  icon={Terminal}
                  title="DEV Agent"
                  desc="Writes code, database schemas, and API routes."
                  color="bg-primary"
                  isLast={false}
                />
              </motion.div>

              <div className="hidden xl:flex col-span-1 items-center justify-center pt-6">
                <ChevronRight className="w-5 h-5 text-outline/35" />
              </div>

              <motion.div className="col-span-1" variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} transition={{ delay: 0.2 }}>
                <PipelineStep
                  step="05. QA"
                  icon={ShieldCheck}
                  title="QA Agent"
                  desc="Validates coverage and generates test suites."
                  color="bg-primary"
                  isLast={true}
                />
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━ CODE DEMO ━━━━━━━━━━━━ */}
      <section id="demo" className="relative z-10 py-24 px-6 max-w-7xl mx-auto border-t border-outline-variant/10">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center mb-16 space-y-2">
          <span className="text-secondary font-label text-xs uppercase tracking-widest">Live Execution</span>
          <h2 className="text-3xl md:text-4xl font-bold font-headline text-on-surface">Watch the Agents Work</h2>
          <p className="text-on-surface-variant text-sm">From a single human prompt to a comprehensive PRD output in seconds.</p>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="bg-surface border border-outline-variant/30 rounded-xl overflow-hidden shadow-lg"
        >
          {/* Terminal chrome bar */}
          <div className="flex items-center gap-2 px-5 py-3.5 bg-background border-b border-outline-variant/30">
            <div className="w-2.5 h-2.5 rounded-full bg-error" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning" />
            <div className="w-2.5 h-2.5 rounded-full bg-secondary" />
            <span className="ml-4 text-xs font-semibold tracking-wider text-on-surface-variant font-label">AIDLC_TERMINAL</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-outline-variant/30">
            {/* Left: Input */}
            <div className="bg-background/40">
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-outline-variant/30">
                <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center">
                  <UserCheck className="w-4 h-4 text-primary" />
                </div>
                <span className="text-xs font-bold text-on-surface">Human Input</span>
                <span className="ml-auto text-[9px] font-bold tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 uppercase">Intent</span>
              </div>
              <pre className="p-6 text-xs text-on-surface-variant font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{DEMO_INPUT}</pre>
            </div>

            {/* Right: Output */}
            <div className="relative bg-surface">
              <div className="flex items-center gap-3 px-6 py-3.5 border-b border-outline-variant/30">
                <div className="w-7 h-7 rounded bg-secondary/10 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-secondary" />
                </div>
                <span className="text-xs font-bold text-on-surface">PO Agent Output</span>
                <span className="ml-auto text-[9px] font-bold tracking-widest text-secondary bg-secondary/10 px-2 py-0.5 rounded border border-secondary/20 uppercase">Generated</span>
              </div>
              
              <div className="absolute top-16 right-6 flex items-center gap-1.5 text-[9px] font-bold tracking-widest text-secondary bg-secondary/15 border border-secondary/25 px-2.5 py-1 rounded-full uppercase">
                <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse" />
                Real-time
              </div>
              <pre className="p-6 text-xs text-on-surface font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{DEMO_OUTPUT}</pre>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ FEATURES CHECKLIST ━━━━━━━━━━━━ */}
      <section id="features" className="relative z-10 py-24 px-6 border-t border-outline-variant/10 bg-surface-container-lowest">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <span className="text-secondary font-label text-xs uppercase tracking-widest">Enterprise Grade</span>
              <h2 className="text-3xl md:text-4xl font-bold font-headline text-on-surface">Engineered for Industrial Scale</h2>
            </div>
            <p className="text-on-surface-variant max-w-md text-sm leading-relaxed">
              The AIDLC platform combines the raw speed of autonomous agents with the strict controls required by regulated industries.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Zap, title: 'Parallel Execution', desc: 'Simultaneously orchestrate multiple feature branches across your entire agent workforce.' },
              { icon: Shield, title: 'Risk-based Governance', desc: 'Automated security scanning and compliance checks baked into every agent interaction.' },
              { icon: Gavel, title: 'HITL Gates', desc: 'Human-In-The-Loop validation points ensure quality and architectural alignment at key stages.' },
              { icon: History, title: 'Immutable Audit Trail', desc: 'Every decision, prompt, and output is cryptographically logged for complete transparency.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-8 border border-outline-variant/30 bg-surface hover:border-primary transition-all duration-300 group rounded-sm">
                <Icon className="text-secondary w-8 h-8 mb-6 transition-transform duration-300 group-hover:scale-105" />
                <h3 className="text-base font-bold mb-3 text-on-surface">{title}</h3>
                <p className="text-on-surface-variant text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━━━━━━━━━━ CTA ━━━━━━━━━━━━ */}
      <section className="relative z-10 py-24 px-6 max-w-7xl mx-auto">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="relative rounded-2xl border border-primary/30 bg-surface overflow-hidden p-12 md:p-24 text-center space-y-10 group"
        >
          {/* subtle background glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-[100px] group-hover:bg-primary/15 transition-all duration-700 pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-secondary/5 rounded-full blur-[100px] group-hover:bg-secondary/10 transition-all duration-700 pointer-events-none" />
          
          <div className="relative z-10 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold font-headline text-on-surface leading-tight tracking-tight">
              Build Software At The <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Speed Of Thought</span>
            </h2>
            <p className="text-base text-on-surface-variant max-w-xl mx-auto leading-relaxed">
              Join the future of software engineering where AI does the heavy lifting and you provide the vision.
            </p>
          </div>
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <button
              onClick={handleCta}
              className="w-full px-8 py-4 bg-on-surface text-background font-bold text-sm rounded-sm hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              Start Your Software Factory
            </button>
            <button className="w-full px-8 py-4 border border-outline-variant text-on-surface font-bold text-sm rounded-sm hover:bg-surface-container transition-colors">
              Talk to Sales
            </button>
          </div>
        </motion.div>
      </section>

      {/* ━━━━━━━━━━━━ FOOTER ━━━━━━━━━━━━ */}
      <footer className="bg-background border-t border-outline-variant/30 pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row justify-between gap-12">
            <div className="space-y-4 max-w-xs">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-primary flex items-center justify-center text-white font-bold text-xs">
                  AI
                </div>
                <span className="font-bold text-base tracking-tight text-on-surface font-headline">AIDLC Platform</span>
              </div>
              <p className="text-on-surface-variant text-xs leading-relaxed">
                High-performance autonomous systems for the next generation of software production. Secure, scalable, and fully auditable.
              </p>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-12">
              <div className="space-y-4">
                <h4 className="font-label text-secondary text-xs uppercase tracking-wider">Platform</h4>
                <ul className="space-y-2 text-on-surface-variant text-xs">
                  <li><a className="hover:text-primary transition-colors" href="#">Agents</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Architecture</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Governance</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Security</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="font-label text-secondary text-xs uppercase tracking-wider">Resources</h4>
                <ul className="space-y-2 text-on-surface-variant text-xs">
                  <li><a className="hover:text-primary transition-colors" href="#">Documentation</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">API Reference</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Community</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Blog</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <h4 className="font-label text-secondary text-xs uppercase tracking-wider">Company</h4>
                <ul className="space-y-2 text-on-surface-variant text-xs">
                  <li><a className="hover:text-primary transition-colors" href="#">Status</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Privacy Policy</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Terms of Service</a></li>
                  <li><a className="hover:text-primary transition-colors" href="#">Security</a></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="pt-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center gap-4 text-on-surface-variant text-[11px] font-label">
            <span>© {new Date().getFullYear()} AIDLC Platform. All rights reserved.</span>
            <div className="flex gap-6">
              <a className="hover:text-secondary" href="#">Twitter</a>
              <a className="hover:text-secondary" href="#">LinkedIn</a>
              <a className="hover:text-secondary" href="#">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

