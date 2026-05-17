/**
 * Behavioral Interview Guide page — proper React implementation.
 * Replaces raw HTML injection with stateful components, keyboard navigation,
 * and full integration with the app's theme system.
 */

import { useState, useCallback } from 'react';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';

type Section = 'philosophy' | 'intro' | 'stories' | 'common' | 'questions' | 'mindset';
type Story = 'npe' | 'appt' | 'rcs' | 'sec' | 'ai';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'intro', label: 'Tell me about yourself' },
  { id: 'stories', label: 'Story bank' },
  { id: 'common', label: 'Common questions' },
  { id: 'questions', label: 'Your questions' },
  { id: 'mindset', label: 'Final mindset' },
];

interface TagProps {
  variant: 'blue' | 'teal' | 'amber' | 'coral' | 'purple';
  children: React.ReactNode;
}

function Tag({ variant, children }: TagProps) {
  return <span className={`bg-tag bg-tag--${variant}`}>{children}</span>;
}

interface CollapsibleCardProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleCard({ title, children, defaultOpen = false }: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-card">
      <button
        className="bg-card__header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <h3 className="bg-card__title">{title}</h3>
        <svg
          className={`bg-card__chevron ${open ? 'bg-card__chevron--open' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="bg-card__body">{children}</div>}
    </div>
  );
}

interface ScriptBoxProps {
  label: string;
  children: React.ReactNode;
}

function ScriptBox({ label, children }: ScriptBoxProps) {
  return (
    <div className="bg-script">
      <div className="bg-script__label">{label}</div>
      <div className="bg-script__content">{children}</div>
    </div>
  );
}

function PhilosophySection() {
  return (
    <div>
      <div className="bg-section-title">Core framework</div>
      <div className="bg-rule">
        <strong>The natural STAR formula.</strong> Don't think Situation → Task → Action → Result. Think:
        <ol className="bg-rule__list">
          <li>What was happening?</li>
          <li>What was the problem?</li>
          <li>What did <em>I</em> actually do?</li>
          <li>What happened after?</li>
        </ol>
      </div>

      <div className="bg-do-dont">
        <div className="bg-do-dont__do">
          <div className="bg-do-dont__label">Good answers sound like</div>
          <ul>
            <li>Reflective, not rehearsed</li>
            <li>Include tradeoffs</li>
            <li>Explain your thinking</li>
            <li>Engineer talking naturally</li>
            <li>Structured without sounding it</li>
          </ul>
        </div>
        <div className="bg-do-dont__dont">
          <div className="bg-do-dont__label">Bad answers sound like</div>
          <ul>
            <li>Memorized scripts</li>
            <li>Over-polished</li>
            <li>Buzzword soup</li>
            <li>Too much detail</li>
            <li>No clear outcome</li>
          </ul>
        </div>
      </div>

      <div className="bg-section-title">Delivery rules</div>
      <CollapsibleCard title="Slow down">
        <p>Speak 15–20% slower than feels natural. Pause more. Simplify explanations. Avoid over-explaining.</p>
        <p>You naturally think quickly and deeply — in interviews that can come across as rapid-fire technical dumping. Calm and measured always reads stronger than fast and thorough.</p>
      </CollapsibleCard>
      <CollapsibleCard title="Don't try to sound senior">
        <p>You already sound stronger than your years of experience because you think systemically, understand production systems, understand operational risk, and understand architecture.</p>
        <p>Your only goal is: <strong>communicate clearly and calmly.</strong> That alone separates you from most candidates at your level.</p>
      </CollapsibleCard>
      <CollapsibleCard title="Be conversational, not corporate">
        <p>No fake enthusiasm. No buzzword soup. No over-rehearsed answers.</p>
        <p>Aim for: <strong>conversational · confident · grounded · slightly technical · concise · adaptable.</strong></p>
      </CollapsibleCard>
    </div>
  );
}

function IntroSection() {
  return (
    <div>
      <div className="bg-section-title">Phone screen version</div>
      <ScriptBox label="Say this">
        <p>I'm a software engineer — most of my recent work has been backend-focused around Java 21, Spring Boot, Kafka, RabbitMQ, and Kubernetes, supporting production on a large distributed platform processing millions of messages daily across SMS, email, and IVR.</p>
        <p>I started more full-stack — React, Angular, Next.js — but over time I realized I genuinely enjoy backend systems, debugging, and understanding how large-scale systems behave in production. A lot of what I've done recently: incident investigation, microservice architecture, deployments, SQL analysis, and security remediation.</p>
        <p>I'm now looking for backend or strong full-stack roles where I can keep growing technically while working on systems at scale.</p>
      </ScriptBox>

      <div className="bg-section-title">Why are you looking?</div>
      <ScriptBox label="Say this">
        <p>I've learned a lot in my current role — distributed systems, production debugging, cloud infrastructure, enterprise-scale backend work. At this point I'm looking for somewhere I can take on more ownership and work more directly within a long-term engineering team.</p>
      </ScriptBox>

      <div className="bg-section-title">Why do you want this role?</div>
      <ScriptBox label="Say this">
        <p>A few things stood out. The technical stack aligns closely with the kind of work I enjoy — backend engineering, distributed systems, cloud infrastructure, modern Java. I like roles where engineering teams are working on systems that operate at real scale with real business impact. And honestly, I'm looking for a team where I can keep leveling up by working around strong engineers and larger technical challenges.</p>
      </ScriptBox>

      <div className="bg-section-title">Greatest strength</div>
      <ScriptBox label="Say this">
        <p>Debugging and system-level investigation. I'm good at tracing issues across services, logs, configs, infrastructure, and code paths without jumping to assumptions. A lot of my recent work has involved diagnosing production problems in distributed systems where the root cause wasn't obvious at first glance.</p>
      </ScriptBox>

      <div className="bg-section-title">Weakness</div>
      <ScriptBox label="Say this">
        <p>Earlier in my career I sometimes focused too much on implementation before fully stepping back to understand the broader architectural context. As I've gotten more experience in enterprise systems, I've gotten much better at slowing down upfront, validating assumptions, and making sure I understand the bigger picture before diving into code.</p>
      </ScriptBox>
    </div>
  );
}

interface StoryData {
  id: Story;
  title: string;
  tags: { label: string; variant: TagProps['variant'] }[];
  rows: { label: string; content: string }[];
  useFor: string;
}

const STORIES: StoryData[] = [
  {
    id: 'npe',
    title: '1. Production NPE dropping messages',
    tags: [
      { label: 'debugging', variant: 'blue' },
      { label: 'ownership', variant: 'teal' },
      { label: 'distributed systems', variant: 'coral' },
      { label: 'production support', variant: 'amber' },
    ],
    rows: [
      { label: 'What was happening', content: 'Messages were silently failing in one of our communication flows — and the difficult part was that failures weren\'t surfacing clearly in monitoring because they crossed async execution boundaries.' },
      { label: 'The problem', content: 'An NPE in MapStruct-based mapping logic under a specific edge case — causing around 16,000 messages per hour to fail silently.' },
      { label: 'What I did', content: 'Traced execution flow through logs, event mappings, and downstream processing behavior until I identified the crash vector. Validated the fix carefully against edge cases.' },
      { label: 'Outcome', content: 'Fixed and deployed. The biggest takeaway was how critical observability and execution tracing are in distributed async systems — and it directly influenced how I approach instrumentation now.' },
    ],
    useFor: 'debugging, production incidents, attention to detail, ownership, working under pressure',
  },
  {
    id: 'appt',
    title: '2. Appointment Service extraction',
    tags: [
      { label: 'architecture', variant: 'blue' },
      { label: 'ownership', variant: 'teal' },
      { label: 'modernization', variant: 'coral' },
      { label: 'communication', variant: 'purple' },
    ],
    rows: [
      { label: 'What was happening', content: 'Appointment Service was tightly coupled inside a much larger monolithic codebase — Kafka, S3, batch processing all bundled in, even though the service only needed a fraction of that.' },
      { label: 'The problem', content: 'Every deploy touched shared dependencies. Tightly coupled logic made independent scaling and maintenance impossible.' },
      { label: 'What I did', content: 'Identified true service boundaries, removed unused dependencies, rebuilt integrations around REST APIs and RabbitMQ. A big part of the work was documentation and assumption validation — not just coding.' },
      { label: 'Outcome', content: 'Standalone Spring Boot microservice, demoed successfully to the Director of Engineering. Reduced technical debt and gave the service clean deployment independence.' },
    ],
    useFor: 'architecture decisions, taking initiative, technical leadership, refactoring, communication with leadership',
  },
  {
    id: 'rcs',
    title: '3. RCS duplicate record issue',
    tags: [
      { label: 'SQL', variant: 'blue' },
      { label: 'production debugging', variant: 'amber' },
      { label: 'risk management', variant: 'coral' },
      { label: 'careful deployment', variant: 'teal' },
    ],
    rows: [
      { label: 'What was happening', content: 'RCS channel fallback behavior was creating duplicate database records, which was causing query conflicts in production.' },
      { label: 'The problem', content: 'Multi-row query conflict from duplicate records — needed a fix that wouldn\'t cause downtime on a high-traffic system.' },
      { label: 'What I did', content: 'Analyzed production data patterns, query behavior, and fallback execution logic. Designed a zero-downtime SQL fix, validated against live prod data, and coordinated deployment across 7 environment-specific config files.' },
      { label: 'Outcome', content: 'Resolved cleanly. Reinforced how important operational caution is when making changes on high-traffic systems — the fix itself was straightforward; the careful execution was the hard part.' },
    ],
    useFor: 'problem-solving, careful judgment, SQL/data skills, deployment risk, working in production',
  },
  {
    id: 'sec',
    title: '4. CVE security remediation',
    tags: [
      { label: 'security', variant: 'coral' },
      { label: 'operations', variant: 'blue' },
      { label: 'ownership', variant: 'teal' },
    ],
    rows: [
      { label: 'What was happening', content: 'Log4Shell (CVE-2021-44228) and Spring Cloud Function RCE (CVE-2022-22963) vulnerabilities flagged across multiple services and environments.' },
      { label: 'The problem', content: '14 Logstash services across 5 environments — and distinguishing actual exploitable vulnerabilities from false positives caused by stale Docker overlay layers was non-trivial.' },
      { label: 'What I did', content: 'Rebuilt Docker images, updated dependencies, coordinated deployments, and verified remediation results through Qualys scans. Carefully separated real vulnerabilities from false positives before acting.' },
      { label: 'Outcome', content: 'Full remediation verified. Gave me a much stronger understanding of how security remediation works operationally at enterprise scale — not just the CVE, but the deployment mechanics around it.' },
    ],
    useFor: 'security awareness, handling ambiguity, enterprise operations, initiative, breadth of experience',
  },
  {
    id: 'ai',
    title: '5. AI engineering workflow',
    tags: [
      { label: 'innovation', variant: 'purple' },
      { label: 'systems thinking', variant: 'blue' },
      { label: 'process improvement', variant: 'teal' },
    ],
    rows: [
      { label: 'What was happening', content: 'LLM tools were generating inaccurate code suggestions on a large, complex codebase because they lacked reliable context about service architecture and dependencies.' },
      { label: 'The problem', content: 'Generic AI tooling hallucinated on enterprise codebases. Needed a way to give LLMs accurate, verifiable context without manual re-explanation every session.' },
      { label: 'What I did', content: 'Built a structured knowledge base of service architecture and repository overviews as verified context for LLM tools. Designed a CI pipeline to detect documentation drift when service code changes.' },
      { label: 'Outcome', content: 'More accurate reasoning and planning from LLM tools. The insight: this is less about "AI coding" and more about designing reliable context and verification systems around engineering workflows.' },
    ],
    useFor: 'innovation, self-directed learning, process improvement, going beyond the job description',
  },
];

function StoriesSection() {
  const [activeStory, setActiveStory] = useState<Story>('npe');
  const story = STORIES.find(s => s.id === activeStory)!;

  return (
    <div>
      <div className="bg-section-title">Your 5 strongest stories — know these cold</div>
      <div className="bg-story-grid" role="tablist" aria-label="Story bank">
        {STORIES.map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={activeStory === s.id}
            className={`bg-story-btn ${activeStory === s.id ? 'bg-story-btn--active' : ''}`}
            onClick={() => setActiveStory(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={story.title} className="bg-story-detail">
        <div className="bg-story-detail__tags">
          {story.tags.map(t => (
            <Tag key={t.label} variant={t.variant}>{t.label}</Tag>
          ))}
        </div>
        {story.rows.map(row => (
          <div key={row.label} className="bg-star-row">
            <span className="bg-star-row__label">{row.label}</span>
            <span className="bg-star-row__content">{row.content}</span>
          </div>
        ))}
        <div className="bg-rule bg-rule--use-for">
          <strong>Use when asked about:</strong> {story.useFor}
        </div>
      </div>
    </div>
  );
}

interface CommonQuestion {
  title: string;
  label: string;
  content: string;
}

const COMMON_QUESTIONS: CommonQuestion[] = [
  {
    title: 'Conflict with a coworker',
    label: 'Say this',
    content: 'I haven\'t had major interpersonal conflict, but I\'ve had situations where engineers disagreed on implementation approaches or priorities. I try to focus discussions around tradeoffs — maintainability, operational risk, delivery timelines, long-term scalability — rather than who\'s right. Keeping it technical and collaborative usually resolves things quickly.',
  },
  {
    title: 'Failure or mistake',
    label: 'Say this',
    content: 'I\'ve had situations where I started investigating in the wrong area because I made assumptions too early about where an issue was. Over time I\'ve become much more methodical — validating logs, payloads, configs, database state, and execution flow before narrowing in. I now treat assumption validation as part of the debugging process, not a step you skip to save time.',
  },
  {
    title: 'Working under pressure / tight deadline',
    label: 'Use story 1 or 3 here',
    content: 'The NPE story (16k messages/hour dropping silently) or the RCS zero-downtime SQL fix are both strong here. Both involved real production pressure, clear stakes, and deliberate execution over panic.',
  },
  {
    title: 'Took ownership beyond your role',
    label: 'Use story 2 or 4 here',
    content: 'Appointment Service extraction (ended with a director demo) or the CVE remediation across 14 services show you picked up work that wasn\'t handed to you and saw it through end-to-end.',
  },
  {
    title: 'Explain a technical concept to a non-technical person',
    label: 'Tip',
    content: 'Pick a concept from your work — like what a microservice is, or what an NPE means — and explain it plainly without jargon. Demonstrate awareness of your audience. The point isn\'t the answer, it\'s showing you can adjust your communication register.',
  },
];

function CommonSection() {
  return (
    <div>
      <div className="bg-section-title">Situational & behavioral</div>
      {COMMON_QUESTIONS.map(q => (
        <CollapsibleCard key={q.title} title={q.title}>
          <ScriptBox label={q.label}>
            <p>{q.content}</p>
          </ScriptBox>
        </CollapsibleCard>
      ))}
    </div>
  );
}

function QuestionsSection() {
  const recruiterQuestions = [
    'What does success look like in this role during the first 6–12 months?',
    'What kinds of projects would this engineer likely work on first?',
    'How is the engineering organization structured?',
    'What\'s the balance between new development versus operational and support work?',
    'What are the biggest technical challenges the team is currently dealing with?',
  ];

  const managerQuestions = [
    'How are architectural decisions typically made on the team?',
    'How does the team approach ownership and production support?',
    'What does onboarding usually look like for engineers joining the platform?',
    'How much collaboration is there between backend, platform, and infrastructure teams?',
    'What kinds of engineers tend to do well on this team long-term?',
  ];

  return (
    <div>
      <div className="bg-section-title">For recruiters</div>
      <ol className="bg-q-list">
        {recruiterQuestions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>

      <div className="bg-section-title">For engineering managers</div>
      <ol className="bg-q-list">
        {managerQuestions.map((q, i) => (
          <li key={i}>{q}</li>
        ))}
      </ol>
    </div>
  );
}

function MindsetSection() {
  const cards = [
    {
      title: 'You already have the substance',
      content: 'You\'ve debugged production NPEs dropping 16k messages/hour. You\'ve extracted microservices and demoed to directors. You\'ve remediated CVEs across 14 services. You don\'t need to fake depth — just communicate it clearly.',
    },
    {
      title: 'Calm > fast',
      content: 'Slow answers that show thinking always outperform fast answers that show nerves. If you need a second to think, take it. "Let me think about that for a second" is a green flag, not a red one.',
    },
    {
      title: 'Tradeoffs > certainty',
      content: 'The best engineers talk about tradeoffs, not perfect solutions. "We chose X over Y because of Z" shows more seniority than "X was the right answer."',
    },
    {
      title: 'Story > resume',
      content: 'Your resume lists what you did. Your stories explain how you think. The interview is about the thinking, not the bullet points.',
    },
  ];

  return (
    <div>
      <div className="bg-mindset-grid">
        {cards.map(card => (
          <div key={card.title} className="bg-mindset-card">
            <div className="bg-mindset-card__title">{card.title}</div>
            <p>{card.content}</p>
          </div>
        ))}
      </div>

      <div className="bg-rule bg-rule--final">
        <strong>The final rule:</strong> Communicate clearly and calmly. That alone separates you from most candidates at your level.
      </div>
    </div>
  );
}

export default function BehavioralGuidePage() {
  const [activeSection, setActiveSection] = useState<Section>('philosophy');

  useDocumentMeta({
    title: 'Behavioral Interview Guide — CS Reference Guide',
    description: 'Personal behavioral interview preparation guide with STAR stories, common questions, and mindset tips.',
  });

  const handleSectionChange = useCallback((section: Section) => {
    setActiveSection(section);
  }, []);

  return (
    <div className="page-behavioral-guide">
      <h2 className="page-behavioral-guide__title">Behavioral Interview Guide</h2>
      <p className="page-behavioral-guide__subtitle">STAR stories, scripts, and mindset for your next interview.</p>

      <nav className="bg-nav" aria-label="Guide sections">
        {SECTIONS.map(section => (
          <button
            key={section.id}
            className={`bg-nav__btn ${activeSection === section.id ? 'bg-nav__btn--active' : ''}`}
            onClick={() => handleSectionChange(section.id)}
            aria-current={activeSection === section.id ? 'true' : undefined}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="bg-content">
        {activeSection === 'philosophy' && <PhilosophySection />}
        {activeSection === 'intro' && <IntroSection />}
        {activeSection === 'stories' && <StoriesSection />}
        {activeSection === 'common' && <CommonSection />}
        {activeSection === 'questions' && <QuestionsSection />}
        {activeSection === 'mindset' && <MindsetSection />}
      </div>
    </div>
  );
}
