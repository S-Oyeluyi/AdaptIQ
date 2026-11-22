"use client"

import { useEffect, useRef, useState } from "react"
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Atom, Bell, BrainCircuit,
  CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  CircleHelp, CircleX, Clock3, Command, Compass, Flame, FlaskConical, Focus, Gauge,
  GraduationCap, HelpCircle, LayoutDashboard, Lightbulb, LockKeyhole, LogOut, Menu, MoreHorizontal,
  Play, Plus, RotateCcw, Search, Settings, ShieldCheck, Sparkles, Target, TrendingUp, Trophy,
  UserRound, X, Zap,
} from "lucide-react"
import {
  Area, AreaChart, CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import {
  ASSESSMENTS,
  getAssessmentById,
  getQuestionsForAssessment,
  type DiagnosticQuestion,
} from "@/lib/assessment-data"
import {
  evaluateAssessment,
  AssessmentEvaluationError,
  type AssessmentEvaluation,
} from "@/lib/assessment-engine"
import {
  computeCognitiveFingerprint,
  masteryColor,
  masteryLabel,
  sortedByMastery,
} from "@/lib/cognitive-fingerprint"
import {
  generateStudyPlan,
  type StudyRecommendation,
} from "@/lib/adaptive-study-plan"
import {
  calculateProgressAnalytics,
  type ProgressAnalytics,
  type ProgressChartPoint,
} from "@/lib/progress-analytics"
import {
  loadAssessmentAttempts,
  saveAssessmentAttempts,
  clearAssessmentAttempts,
  type AssessmentStorageError,
} from "@/lib/assessment-storage"
import {
  DEFAULT_USER_PREFERENCES,
  DAILY_STUDY_GOAL_OPTIONS,
  type UserPreferences,
} from "@/lib/user-preferences"
import {
  loadUserPreferences,
  saveUserPreferences,
  type UserPreferencesStorageError,
} from "@/lib/user-preferences-storage"
import type { DailyGoalMinutes } from "@/lib/adaptive-study-plan"

type Section = "overview" | "assessments" | "cognitive-fingerprint" | "study-plan" | "progress" | "settings"
type NavTarget = Section | "Overview" | "Assessments" | "Cognitive Fingerprint" | "Study Plan" | "Adaptive Study Plan" | "Progress" | "Progress Analytics" | "Settings"

/** Derive up to 2 uppercase initials from a display name. */
function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Return the first word of a display name for informal greetings. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

function toSectionId(val: string): Section {
  const normalized = val.toLowerCase().replace(/[\s_]+/g, "-")
  if (normalized === "overview") return "overview"
  if (normalized === "assessments") return "assessments"
  if (normalized === "cognitive-fingerprint") return "cognitive-fingerprint"
  if (normalized === "study-plan" || normalized === "adaptive-study-plan") return "study-plan"
  if (normalized === "progress" || normalized === "progress-analytics") return "progress"
  if (normalized === "settings") return "settings"
  return "overview"
}

const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "assessments", label: "Assessments", icon: Target },
  { id: "cognitive-fingerprint", label: "Cognitive Fingerprint", icon: BrainCircuit },
  { id: "study-plan", label: "Study Plan", icon: Compass },
  { id: "progress", label: "Progress", icon: TrendingUp },
  { id: "settings", label: "Settings", icon: Settings },
]

function Logo() {
  return <div className="brand"><div className="brand-mark"><svg viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M15 4.5 5 23h8l2-4 2 4h8L15 4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="15" cy="13" r="2.2" fill="currentColor"/><path d="M15 15.2v3.4M9.7 19.5l3.2-2M20.3 19.5l-3.2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></div><span>Adapt<span className="brand-iq">IQ</span></span></div>
}

function Sidebar({ active, onChange, open, onClose, displayName }: { active: Section; onChange: (value: Section) => void; open: boolean; onClose: () => void; displayName: string }) {
  return <><button aria-label="Close navigation" className={`mobile-scrim ${open ? "is-open" : ""}`} onClick={onClose}/><aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
    <div className="sidebar-top"><Logo/><button className="icon-btn sidebar-close" aria-label="Close menu" onClick={onClose}><X/></button></div>
    <div className="workspace-label">LEARNING SPACE</div>
    <nav className="nav-list" aria-label="Main navigation">{navItems.map(({id, label, icon: Icon}) => <button key={id} onClick={() => { onChange(id); onClose() }} className={`nav-item ${active === id ? "active" : ""}`} aria-current={active === id ? "page" : undefined}><Icon/><span>{label}</span>{id === "assessments" && <span className="nav-count">2</span>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="upgrade-card"><div className="upgrade-orb"><Sparkles/></div><strong>Your next insight is close</strong><p>Complete one more assessment to sharpen your Cognitive Fingerprint.</p><button onClick={() => onChange("assessments")}>Explore assessments <ArrowRight/></button></div><button className="help-link"><CircleHelp/> Help center <ArrowUpRight/></button><div className="sidebar-profile"><div className="avatar avatar-small">{nameInitials(displayName)}</div><div className="profile-mini"><b>{displayName}</b><span>Student account</span></div><MoreHorizontal className="muted-icon"/></div></div>
  </aside></>
}

function Header({ title, eyebrow, onMenu, displayName }: { title: string; eyebrow: string; onMenu: () => void; displayName: string }) {
  const [noticeOpen, setNoticeOpen] = useState(false)
  return <header className="topbar"><div className="topbar-heading"><button className="icon-btn menu-trigger" onClick={onMenu} aria-label="Open navigation"><Menu/></button><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div></div><div className="top-actions"><div className="today-pill"><span className="live-dot"/> Learning session <span className="today-divider"/> Today, Nov 21</div><div className="notice-wrap"><button className="icon-btn notification-btn" aria-label="Notifications" aria-expanded={noticeOpen} onClick={() => setNoticeOpen(!noticeOpen)}><Bell/><i/></button>{noticeOpen && <div className="notice-pop"><div className="notice-title">You&apos;re all caught up</div><p>Your next study session is ready when you are.</p></div>}</div><button className="profile-button" onClick={() => window.dispatchEvent(new CustomEvent("adaptiq-nav", {detail: "settings"}))}><div className="avatar">{nameInitials(displayName)}</div><span>{displayName}</span><ChevronDown/></button></div></header>
}

function SectionTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="section-title"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2><p>{description}</p></div>{action && <div className="section-action">{action}</div>}</div>
}

function ProgressBar({ value, color = "cyan" }: { value: number; color?: string }) {
  return <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={`${value}% mastery`}><span className={`progress-fill ${color}`} style={{ width: `${value}%` }}/></div>
}

function StatCard({ label, value, change, icon: Icon, tone, detail }: { label: string; value: string; change: string; icon: typeof Activity; tone: string; detail: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}><Icon/></div></div><div className="stat-value">{value}</div><div className="stat-foot"><span className="change-positive"><ArrowUpRight/> {change}</span><span>{detail}</span></div></article>
}

function MasteryChart({ data = [], onNavigate }: { data?: ProgressChartPoint[]; onNavigate?: (s: NavTarget) => void }) {
  if (!data || data.length === 0) {
    return (
      <div className="overview-chart-empty">
        <div className="insight-icon"><TrendingUp/></div>
        <b>No assessment scores yet</b>
        <p>Your performance history and mastery trends will appear here after your first completed assessment.</p>
        {onNavigate && (
          <button className="button button-secondary" onClick={() => onNavigate("assessments")}>
            Take an assessment <ArrowRight/>
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="overviewMasteryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.22}/>
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#ffffff0c" vertical={false}/>
          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#708295", fontSize: 10 }}/>
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#708295", fontSize: 10 }} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}/>
          <Tooltip
            contentStyle={{ background: "#111e2d", border: "1px solid #26384a", borderRadius: 12, color: "#e8f2fa", fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(value: any, _name: any, item: any) => [`${value}% (${item?.payload?.assessmentTitle ?? "Attempt"})`, "Score"]}
          />
          <Area type="monotone" dataKey="score" stroke="#22d3ee" strokeWidth={2.5} fill="url(#overviewMasteryFill)" activeDot={{ r: 4, fill: "#22d3ee", stroke: "#101d2b", strokeWidth: 2 }}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function Overview({
  onNavigate,
  sessionAttempts = [],
  displayName,
}: {
  onNavigate: (s: NavTarget) => void
  sessionAttempts?: AssessmentEvaluation[]
  displayName: string
}) {
  const fp = computeCognitiveFingerprint(sessionAttempts)
  const plan = generateStudyPlan(fp)
  const analytics = calculateProgressAnalytics(sessionAttempts)

  const focusTopics = plan.recommendations.filter((r) => r.kind === "focus")
  const focusCount = focusTopics.length

  const topRec = plan.focusItems[0] ?? plan.reinforceItems[0] ?? plan.recommendations[0]

  // Radar chart data: only topics with evidence if >= 3, ensuring missing evidence is NEVER drawn as 0%
  const evidencedTopics = fp.topics.filter((t) => t.evidenceStatus === "sufficient")
  const canRenderRadar = evidencedTopics.length >= 3
  const radarChartData = evidencedTopics.map((t) => ({
    topic: t.topicName.length > 13 ? t.topicName.slice(0, 11) + "…" : t.topicName,
    mastery: Math.round(t.masteryEstimate!),
    full: 100,
  }))

  const topicList = sortedByMastery(fp.topics).slice(0, 4)

  const topicIconMap: Record<string, React.ElementType> = {
    "linear-equations": Atom,
    "functions": Command,
    "angles-and-lines": Focus,
    "area-and-perimeter": Compass,
    "descriptive-statistics": Activity,
    "probability": Flame,
  }

  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            SATURDAY, NOVEMBER 21, 2026 <span className="eyebrow-line"/>
          </div>
          <h2>Good morning, {firstName(displayName)}<span className="greeting-dot">.</span></h2>
          <p>
            {analytics.hasData
              ? `Your learning is gaining momentum. You have completed ${analytics.totalAttempts} assessment session${analytics.totalAttempts !== 1 ? "s" : ""}.`
              : "Welcome to AdaptIQ. Complete a diagnostic assessment to generate your personalized learning space."}
          </p>
        </div>
        <button className="button button-secondary" onClick={() => onNavigate("assessments")}>
          <Plus/> New assessment
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          label="Overall mastery"
          value={fp.overallMastery !== null ? `${Math.round(fp.overallMastery)}%` : "—"}
          change={fp.overallMastery !== null ? masteryLabel(fp.overallMastery) : "No evidence"}
          detail={fp.overallMastery !== null ? `${fp.topicsWithEvidence} of ${fp.topics.length} topics assessed` : "Awaiting first diagnostic"}
          icon={Gauge}
          tone="cyan"
        />
        <StatCard
          label="Topics assessed"
          value={String(fp.topicsWithEvidence)}
          change={`${fp.topicsWithEvidence} of ${fp.topics.length}`}
          detail={fp.topicsWithEvidence > 0 ? `${Math.round((fp.topicsWithEvidence / fp.topics.length) * 100)}% coverage` : "0% curriculum coverage"}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Needs attention"
          value={String(focusCount)}
          change={
            focusCount === 0
              ? (fp.topicsWithEvidence > 0 ? "All clear" : "No gaps")
              : `${focusCount} topic${focusCount > 1 ? "s" : ""}`
          }
          detail={
            focusCount > 0
              ? "Targeted in study plan"
              : (fp.topicsWithEvidence > 0 ? "No focus areas currently" : "Awaiting assessment")
          }
          icon={Focus}
          tone={focusCount > 0 ? "amber" : "green"}
        />
        <StatCard
          label="Assessment activity"
          value={String(analytics.totalAttempts)}
          change={analytics.totalAttempts > 0 ? `${analytics.totalQuestionsAnswered} answered` : "0 sessions"}
          detail={
            analytics.totalAttempts > 0
              ? `${analytics.totalCorrectAnswers} correct answers`
              : "Start a diagnostic"
          }
          icon={Target}
          tone="violet"
        />
      </div>

      <div className="overview-grid">
        <section className="panel performance-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">YOUR LEARNING MOMENTUM</div>
              <h3>Mastery over time</h3>
            </div>
            <span className="select-button">
              {analytics.hasData ? `${analytics.totalAttempts} session${analytics.totalAttempts !== 1 ? "s" : ""}` : "All time"}
            </span>
          </div>
          <div className="chart-legend">
            <span><i className="legend-dot cyan-dot"/> Assessment score</span>
          </div>
          <div className="overview-chart">
            <MasteryChart data={analytics.chartPoints} onNavigate={onNavigate}/>
          </div>
          <div className="chart-insight">
            <div className="insight-icon">
              {analytics.overallTrendStatus === "declining" ? <ArrowDownRight/> : <TrendingUp/>}
            </div>
            <span>
              {analytics.hasData ? (
                <>
                  <b>{analytics.isSingleAssessmentRepeated ? "Progress tracking." : "Assessment summary."}</b>{" "}
                  {analytics.overallTrendSummary}
                </>
              ) : (
                <>
                  <b>Getting started.</b> Complete your first diagnostic to start tracking learning momentum.
                </>
              )}
            </span>
            <button aria-label="View progress" onClick={() => onNavigate("progress")}>
              <ArrowRight/>
            </button>
          </div>
        </section>

        <section className="panel fingerprint-preview">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">EVIDENCE-BASED PROFILE</div>
              <h3>Cognitive Fingerprint</h3>
            </div>
            <span className="sparkle-mark"><Sparkles/></span>
          </div>
          <p className="panel-description">
            A snapshot of what you know, calculated from your assessment history.
          </p>
          <div className="radar-wrap">
            {fp.topicsWithEvidence === 0 ? (
              <div className="radar-empty-state">
                <BrainCircuit className="radar-empty-icon"/>
                <b>No fingerprint evidence yet</b>
                <p>Complete a diagnostic assessment to map your cognitive strengths and gaps.</p>
                <button className="button button-secondary" onClick={() => onNavigate("assessments")}>
                  Take diagnostic <ArrowRight/>
                </button>
              </div>
            ) : canRenderRadar ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarChartData} outerRadius="72%">
                    <PolarGrid stroke="#304153"/>
                    <PolarAngleAxis dataKey="topic" tick={{ fill: "#a2b2c3", fontSize: 10 }}/>
                    <Radar name="Mastery" dataKey="mastery" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee" fillOpacity={0.18}/>
                  </RadarChart>
                </ResponsiveContainer>
                <div className="radar-center">
                  <span>OVERALL</span>
                  <b>{Math.round(fp.overallMastery!)}%</b>
                </div>
              </>
            ) : (
              <div className="radar-mini-list">
                {fp.topics.map((t) => {
                  const isAssessed = t.evidenceStatus === "sufficient"
                  return (
                    <div className="radar-mini-row" key={t.topicId}>
                      <b>{t.topicName}</b>
                      <span className={`radar-mini-badge ${isAssessed ? "assessed" : "unassessed"}`}>
                        {isAssessed ? `${Math.round(t.masteryEstimate!)}% mastery` : "Awaiting diagnostic"}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="fingerprint-meta">
            <span>
              <i className="live-dot" style={{ background: fp.topicsWithEvidence > 0 ? "#22d3ee" : "#64748b" }}/>
              {fp.topicsWithEvidence > 0
                ? `${fp.topicsWithEvidence} of ${fp.topics.length} topics evidenced`
                : "Awaiting first assessment"}
            </span>
            <button className="text-link" onClick={() => onNavigate("cognitive-fingerprint")}>
              Explore profile <ArrowRight/>
            </button>
          </div>
        </section>
      </div>

      <div className="overview-bottom">
        <section className="panel topics-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">YOUR LEARNING PROFILE</div>
              <h3>Topic mastery</h3>
            </div>
            <button className="text-link" onClick={() => onNavigate("cognitive-fingerprint")}>
              All topics <ArrowRight/>
            </button>
          </div>
          <div className="topic-list">
            {topicList.map((t) => {
              const hasEv = t.evidenceStatus === "sufficient" && t.masteryEstimate !== null
              const scoreVal = hasEv ? Math.round(t.masteryEstimate!) : 0
              const scoreColor = hasEv ? masteryColor(t.masteryEstimate) : "muted"
              const stateLabel = hasEv ? masteryLabel(t.masteryEstimate) : "Awaiting diagnostic"
              const IconEl = topicIconMap[t.topicId] ?? Activity

              return (
                <div className="topic-row" key={t.topicId}>
                  <div className={`topic-symbol ${scoreColor}`}>
                    <IconEl/>
                  </div>
                  <div className="topic-name">
                    <b>{t.topicName}</b>
                    <span>{stateLabel}</span>
                  </div>
                  <div className="topic-meter">
                    <ProgressBar value={scoreVal} color={scoreColor}/>
                  </div>
                  <strong className={`topic-score ${hasEv ? "" : "muted"}`}>
                    {hasEv ? `${scoreVal}%` : "—"}
                  </strong>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel recommended-panel">
          <div className="recommend-tag">
            <Sparkles/>{" "}
            {!plan.hasAnyEvidence
              ? "RECOMMENDED START"
              : topRec?.kind === "focus"
                ? "HIGH PRIORITY"
                : topRec?.kind === "develop"
                  ? "BUILD MOMENTUM"
                  : "REINFORCE STRENGTH"}
          </div>
          <div className="recommend-visual">
            <div className="recommend-icon">
              {!plan.hasAnyEvidence ? (
                <Compass/>
              ) : topRec?.kind === "focus" ? (
                <Activity/>
              ) : topRec?.kind === "develop" ? (
                <Command/>
              ) : (
                <Focus/>
              )}
            </div>
            <div className="rec-duration">
              <Clock3/> {!plan.hasAnyEvidence ? "~15 min" : topRec?.kind === "focus" ? "15 min" : "10 min"}
            </div>
            <span className="visual-orbit orbit-one"/>
            <span className="visual-orbit orbit-two"/>
          </div>
          <h3>
            {!plan.hasAnyEvidence
              ? `Diagnostic: ${topRec?.assessmentTitle ?? "Algebra readiness"}`
              : topRec?.topicName ?? "Adaptive practice"}
          </h3>
          <p>
            {!plan.hasAnyEvidence
              ? "Establish your starting point across foundational curriculum topics."
              : topRec?.action ?? "Focus on your personalized learning objectives."}
          </p>
          <div className="recommend-proof">
            <span className="proof-icon"><Lightbulb/></span>
            <span>
              {!plan.hasAnyEvidence
                ? "Complete your first diagnostic to generate a tailored study plan."
                : topRec?.reason ?? "Recommended from your latest assessment evidence."}
            </span>
          </div>
          <button
            className="button button-primary full-button"
            onClick={() => onNavigate(!plan.hasAnyEvidence ? "assessments" : "study-plan")}
          >
            {!plan.hasAnyEvidence ? "Start diagnostic" : "Continue learning"} <ArrowRight/>
          </button>
        </section>
      </div>

      <div className="bottom-note">
        <ShieldCheck/> Your profile is based on assessment evidence, not learning-style labels.{" "}
        <button onClick={() => onNavigate("cognitive-fingerprint")}>
          How it works <ArrowRight/>
        </button>
      </div>
    </>
  )
}

function Assessments({
  onNavigate,
  onResult,
  sessionAttempts = [],
  onRecordAttempt,
}: {
  onNavigate: (s: NavTarget) => void
  onResult: () => void
  sessionAttempts?: AssessmentEvaluation[]
  onRecordAttempt?: (attempt: AssessmentEvaluation) => void
}) {
  const [active, setActive] = useState(false)
  const [currentAssessmentId, setCurrentAssessmentId] = useState<string | null>(null)
  const [currentQuestions, setCurrentQuestions] = useState<DiagnosticQuestion[]>([])
  const [question, setQuestion] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number | null>>({})
  const [finished, setFinished] = useState(false)
  const [evaluation, setEvaluation] = useState<AssessmentEvaluation | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [startTime, setStartTime] = useState<number>(Date.now())
  const [localAttempts, setLocalAttempts] = useState<AssessmentEvaluation[]>([])

  const allAttempts = sessionAttempts.length > 0 ? sessionAttempts : localAttempts

  const startAssessment = (assessmentId: string) => {
    const def = getAssessmentById(assessmentId)
    if (!def) return
    const qs = getQuestionsForAssessment(assessmentId)
    if (qs.length === 0) return

    const initialAnswers: Record<string, number | null> = {}
    for (const q of qs) {
      initialAnswers[q.id] = null
    }

    setCurrentAssessmentId(assessmentId)
    setCurrentQuestions(qs)
    setSelectedAnswers(initialAnswers)
    setQuestion(0)
    setActive(true)
    setFinished(false)
    setEvaluation(null)
    setEvalError(null)
    setShowConfirm(false)
    setStartTime(Date.now())
  }

  const chooseAnswer = (questionId: string, optionIndex: number) => {
    setSelectedAnswers(prev => ({
      ...prev,
      [questionId]: prev[questionId] === optionIndex ? null : optionIndex,
    }))
  }

  const handleFinalSubmit = () => {
    if (!currentAssessmentId || currentQuestions.length === 0) return
    setShowConfirm(false)
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000))

    try {
      const result = evaluateAssessment(
        currentAssessmentId,
        currentQuestions,
        selectedAnswers,
        elapsedSeconds
      )
      setEvaluation(result)
      setFinished(true)
      setEvalError(null)
      if (onRecordAttempt) {
        onRecordAttempt(result)
      } else {
        setLocalAttempts(prev => [result, ...prev])
      }
      onResult()
    } catch (err) {
      if (err instanceof AssessmentEvaluationError) {
        setEvalError(err.errors.join("; "))
      } else {
        setEvalError("An unexpected error occurred during evaluation.")
      }
    }
  }

  const currentDef = currentAssessmentId ? getAssessmentById(currentAssessmentId) : null
  const currentQ = currentQuestions[question]
  const answeredCount = Object.values(selectedAnswers).filter(val => val !== null).length
  const unansweredCount = currentQuestions.length - answeredCount

  if (active && currentQ) {
    return (
      <>
        <div className="assessment-top">
          <button className="back-link" onClick={() => { setActive(false); setFinished(false); }}>
            <ChevronLeft/> All assessments
          </button>
          <span className="assessment-session">
            <span className="live-dot"/> Diagnostic · {currentDef?.title || "Assessment"}
          </span>
        </div>

        {finished && evaluation ? (
          <div className="result-card panel">
            <div className="result-check"><Check/></div>
            <div className="eyebrow">ASSESSMENT COMPLETE · {evaluation.assessmentTitle.toUpperCase()}</div>
            <h2>Your results are ready.</h2>
            <p>Your responses have been scored using weighted evidence across curriculum topics.</p>

            <div className="result-score">
              <b>{Math.round(evaluation.overallScore)}%</b>
              <span>
                Overall weighted score · {evaluation.correctCount} of {evaluation.totalQuestions} questions correct ({evaluation.answeredQuestions} answered)
              </span>
              <span className="result-score-sub">
                Earned {Math.round(evaluation.earnedWeightedScore)} of {Math.round(evaluation.maximumWeightedScore)} maximum weighted points
              </span>
            </div>

            <div className="result-breakdown-section">
              <div className="eyebrow">TOPIC-BY-TOPIC BREAKDOWN</div>
              <div className="result-breakdown-cards">
                {Object.values(evaluation.topicBreakdown).map((tRes) => {
                  const hasMastery = tRes.masteryScore !== null
                  const barColor = hasMastery && tRes.masteryScore! >= 75 ? "green" : hasMastery && tRes.masteryScore! >= 50 ? "cyan" : "amber"
                  return (
                    <div className="topic-result-card" key={tRes.topicId}>
                      <div className="topic-result-header">
                        <b>{tRes.topicName}</b>
                        <span className="topic-result-mastery">
                          {hasMastery ? (
                            <><b>{Math.round(tRes.masteryScore!)}%</b> provisional mastery</>
                          ) : (
                            <span className="muted-pill">Not enough evidence yet</span>
                          )}
                        </span>
                      </div>
                      <div className="topic-result-bar">
                        <ProgressBar value={hasMastery ? tRes.masteryScore! : 0} color={barColor}/>
                      </div>
                      <div className="topic-result-metrics">
                        <span><b>Question Accuracy:</b> {tRes.correctQuestions} / {tRes.totalQuestions} correct ({Math.round(tRes.accuracy)}%)</span>
                        <span><b>Weighted score:</b> {Math.round(tRes.weightedScore)} / {Math.round(tRes.maximumWeightedScore)} pts</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="answer-review">
              <div className="eyebrow">ANSWER REVIEW &amp; EXPLANATIONS</div>
              {evaluation.responses.map((resp, idx) => {
                const q = currentQuestions.find(item => item.id === resp.questionId) || currentQuestions[idx]
                const isAnswered = resp.selectedOptionIndex !== null
                const isCorrect = resp.isCorrect

                return (
                  <div className="answer-review-row" key={resp.questionId}>
                    <span className={isCorrect ? "review-correct" : !isAnswered ? "review-unanswered" : "review-incorrect"}>
                      {isCorrect ? <CheckCircle2/> : !isAnswered ? <HelpCircle/> : <CircleX/>}
                    </span>
                    <div>
                      <div className="review-question-header">
                        <b>Question {idx + 1} · {q?.topicLabel || resp.topicId}</b>
                        <span className="review-meta">{q?.difficulty.toUpperCase()} · {resp.earnedScore}/{resp.maxScore} pts</span>
                      </div>
                      <span>
                        <b>Your answer:</b> {isAnswered && q ? q.options[resp.selectedOptionIndex!] : <em className="unanswered-text">Unanswered (skipped)</em>}
                        {" · "}
                        <b>Correct answer:</b> {q ? q.options[q.correctIndex] : "N/A"}
                      </span>
                      {q?.explanation && (
                        <div className="answer-explanation">
                          <strong>Why:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="result-actions">
              <button className="button button-secondary retake-btn" onClick={() => startAssessment(evaluation.assessmentId)}>
                <RotateCcw/> Retake assessment
              </button>
              <button className="button button-secondary" onClick={() => { setActive(false); onNavigate("cognitive-fingerprint") }}>
                View Cognitive Fingerprint <ArrowRight/>
              </button>
              <button className="button button-primary" onClick={() => setActive(false)}>
                All assessments <ArrowRight/>
              </button>
            </div>
          </div>
        ) : (
          <div className="question-shell">
            <div className="question-header">
              <div>
                <div className="eyebrow">DIAGNOSTIC ASSESSMENT</div>
                <h2>{currentDef?.title}</h2>
              </div>
              <span className="question-time">
                <Clock3/> Question {question + 1} of {currentQuestions.length}
              </span>
            </div>

            <div className="question-progress">
              <div>
                <span>Question {question + 1} <span className="muted-text">of {currentQuestions.length}</span></span>
                <span>{answeredCount} of {currentQuestions.length} answered</span>
              </div>
              <ProgressBar value={((question + 1) / currentQuestions.length) * 100}/>
            </div>

            <div className="question-card panel">
              <div className="question-topic">
                <span className="topic-pill">{currentQ.topicLabel}</span>
                <span className="difficulty"><span/> {currentQ.difficulty.toUpperCase()} · {currentQ.weight} pts</span>
              </div>
              <h3>{currentQ.text}</h3>
              <div className="answer-list" role="radiogroup" aria-label="Answer choices">
                {currentQ.options.map((option, index) => {
                  const isSelected = selectedAnswers[currentQ.id] === index
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`answer-option ${isSelected ? "selected" : ""}`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => chooseAnswer(currentQ.id, index)}
                    >
                      <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                      <span>{option}</span>
                      {isSelected && <Check className="answer-check"/>}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="question-footer">
              <button
                className="button button-quiet"
                disabled={question === 0}
                onClick={() => setQuestion(question - 1)}
              >
                <ChevronLeft/> Previous
              </button>
              <span className="question-dots">
                {currentQuestions.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setQuestion(i)}
                    className={`dot-btn ${i === question ? "current" : selectedAnswers[item.id] !== null ? "done" : "unanswered"}`}
                    aria-label={`Go to question ${i + 1}${selectedAnswers[item.id] !== null ? " (answered)" : " (unanswered)"}`}
                    title={`Question ${i + 1}: ${selectedAnswers[item.id] !== null ? "Answered" : "Unanswered"}`}
                  />
                ))}
              </span>
              {question < currentQuestions.length - 1 ? (
                <button className="button button-primary" onClick={() => setQuestion(question + 1)}>
                  Next question <ChevronRight/>
                </button>
              ) : (
                <button className="button button-primary" onClick={() => setShowConfirm(true)}>
                  Submit assessment <ChevronRight/>
                </button>
              )}
            </div>

            {showConfirm && (
              <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-heading">
                <div className="confirm-modal panel">
                  <div className="eyebrow">READY FOR SUBMISSION</div>
                  <h3 id="confirm-heading">Submit {currentDef?.title}?</h3>
                  <p>
                    You have answered <b>{answeredCount}</b> of <b>{currentQuestions.length}</b> questions.
                    {unansweredCount > 0 ? (
                      <span className="unanswered-warning">
                        âš ï¸ {unansweredCount} question{unansweredCount > 1 ? "s remain" : " remains"} unanswered. Unanswered questions earn 0 points and will not count towards positive topic evidence.
                      </span>
                    ) : (
                      <span className="all-answered-note">
                        ✓ All questions answered! Your responses will be evaluated using weighted scoring across topics.
                      </span>
                    )}
                  </p>
                  {evalError && <div className="eval-error-box">{evalError}</div>}
                  <div className="confirm-actions">
                    <button className="button button-secondary" onClick={() => setShowConfirm(false)}>
                      Review questions
                    </button>
                    <button className="button button-primary" onClick={handleFinalSubmit}>
                      Confirm &amp; Submit <Check/>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <SectionTitle
        eyebrow="ASSESSMENT CENTER"
        title="Assessments"
        description="Measure what you know and help your learning profile adapt."
        action={
          <button
            className="button button-secondary"
            onClick={() => {
              if (allAttempts.length > 0) {
                const latest = allAttempts[0]
                const qs = getQuestionsForAssessment(latest.assessmentId)
                setCurrentAssessmentId(latest.assessmentId)
                setCurrentQuestions(qs)
                setEvaluation(latest)
                setActive(true)
                setFinished(true)
              }
            }}
          >
            <Clock3/> History{allAttempts.length > 0 ? ` (${allAttempts.length})` : ""}
          </button>
        }
      />
      <div className="assessment-banner">
        <div className="banner-content">
          <div className="banner-kicker"><span className="live-dot"/> START WITH A BASELINE</div>
          <h3>Get a clearer picture<br/>of what you know.</h3>
          <p>A short diagnostic helps AdaptIQ identify your strengths and where to focus next.</p>
          <button className="button button-primary" onClick={() => startAssessment("statistics-foundations")}>
            Start diagnostic <ArrowRight/>
          </button>
          <div className="banner-meta">
            <span><Clock3/> 12–15 min</span>
            <span><Target/> 6 questions</span>
            <span><Sparkles/> Updates your profile</span>
          </div>
        </div>
        <div className="banner-art">
          <div className="banner-rings">
            <div className="ring ring-a"/><div className="ring ring-b"/><div className="ring ring-c"/>
            <div className="ring-core"><BrainCircuit/></div>
            <span className="ring-node node-a"/><span className="ring-node node-b"/><span className="ring-node node-c"/>
          </div>
          <div className="banner-float">EVIDENCE <span>+</span> INSIGHT</div>
        </div>
      </div>
      <div className="subsection-heading">
        <div>
          <div className="eyebrow">READY WHEN YOU ARE</div>
          <h3>Available assessments</h3>
        </div>
        <button className="filter-button">All subjects <ChevronDown/></button>
      </div>
      <div className="assessment-grid">
        {ASSESSMENTS.map((a) => {
          const qCount = getQuestionsForAssessment(a.id).length
          const iconMap: Record<string, typeof Atom> = {
            "algebra-readiness": Atom,
            "geometry-essentials": Focus,
            "statistics-foundations": Activity,
          }
          const colorMap: Record<string, string> = {
            "algebra-readiness": "cyan",
            "geometry-essentials": "violet",
            "statistics-foundations": "amber",
          }
          const timeMap: Record<string, string> = {
            "algebra-readiness": "15 min",
            "geometry-essentials": "20 min",
            "statistics-foundations": "12 min",
          }
          const tagMap: Record<string, string[]> = {
            "algebra-readiness": ["Algebra", "Functions"],
            "geometry-essentials": ["Geometry", "Reasoning"],
            "statistics-foundations": ["Statistics", "Probability"],
          }
          const Icon = iconMap[a.id] || Atom
          const color = colorMap[a.id] || "cyan"
          const tags = tagMap[a.id] || a.topicIds
          const time = timeMap[a.id] || "15 min"
          const difficultyLabel = a.level.charAt(0).toUpperCase() + a.level.slice(1)

          return (
            <article className="assessment-card panel" key={a.id}>
              <div className={`assessment-icon ${color}`}><Icon/></div>
              <span className="difficulty-pill">{difficultyLabel}</span>
              <h3>{a.title}</h3>
              <p>{a.description}</p>
              <div className="tag-row">{tags.map(t => <span className="topic-pill" key={t}>{t}</span>)}</div>
              <div className="assessment-card-meta">
                <span><Clock3/>{time}</span>
                <span><Target/>{qCount} questions</span>
              </div>
              <button className="assessment-start" onClick={() => startAssessment(a.id)}>
                Begin assessment <ArrowRight/>
              </button>
            </article>
          )
        })}
      </div>
      <div className="recent-assessment panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">YOUR RECENT ACTIVITY</div>
            <h3>Recent assessments</h3>
          </div>
          {allAttempts.length > 0 && <span className="small-count">{allAttempts.length} attempt{allAttempts.length > 1 ? "s" : ""}</span>}
        </div>
        {allAttempts.length > 0 ? (
          <div className="recent-list">
            {allAttempts.slice(0, 4).map((att) => {
              const isStrong = att.overallScore >= 75
              const isModerate = att.overallScore >= 50
              const dateStr = new Date(att.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div className="recent-row" key={att.id}>
                  <div className="recent-icon"><FlaskConical/></div>
                  <div className="recent-name">
                    <b>{att.assessmentTitle}</b>
                    <span>Today at {dateStr} · {att.answeredQuestions} of {att.totalQuestions} answered ({att.correctCount} correct)</span>
                  </div>
                  <strong>{Math.round(att.overallScore)}%</strong>
                  <span className="result-status">{isStrong ? "Strong result" : isModerate ? "Developing" : "Needs review"}</span>
                  <button
                    className="icon-btn"
                    aria-label={`View ${att.assessmentTitle} results`}
                    onClick={() => {
                      const qs = getQuestionsForAssessment(att.assessmentId)
                      setCurrentAssessmentId(att.assessmentId)
                      setCurrentQuestions(qs)
                      setEvaluation(att)
                      setActive(true)
                      setFinished(true)
                    }}
                  >
                    <ArrowRight/>
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="recent-row">
            <div className="recent-icon"><FlaskConical/></div>
            <div className="recent-name">
              <b>Algebra readiness</b>
              <span>Baseline sample · 6 questions</span>
            </div>
            <strong>82%</strong>
            <span className="result-status">Sample result</span>
          </div>
        )}
      </div>
    </>
  )
}

function Fingerprint({
  onNavigate,
  sessionAttempts,
}: {
  onNavigate: (s: NavTarget) => void
  sessionAttempts: AssessmentEvaluation[]
}) {
  const fp = computeCognitiveFingerprint(sessionAttempts)
  const hasEvidence = fp.overallMastery !== null

  // Build radar data: topics with evidence use their mastery; others use 0
  // so the chart shape still renders — the legend explains the limitation.
  const liveRadarData = fp.topics.map((t) => ({
    topic: t.topicName,
    mastery: t.masteryEstimate ?? 0,
    full: 100,
  }))

  // For the "Updated" label
  const updatedLabel = fp.lastUpdated
    ? new Date(fp.lastUpdated).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null

  // Strengths: topics with evidence sorted best â†’ worst, top 2 with mastery â‰¥ 60
  const withEvidence = fp.topics.filter((t) => t.masteryEstimate !== null)
  const sorted = sortedByMastery(fp.topics)
  const strengths = sorted.filter((t) => t.masteryEstimate !== null && t.masteryEstimate >= 60).slice(0, 2)
  const needsAttention = sorted.filter((t) => t.masteryEstimate !== null && t.masteryEstimate < 60).slice(-2).reverse()

  // Map topicId â†’ assessmentId for "Take assessment" links
  const topicToAssessment: Record<string, string> = {}
  for (const a of ASSESSMENTS) {
    for (const tid of a.topicIds) {
      topicToAssessment[tid] = a.id
    }
  }

  return (
    <>
      <SectionTitle
        eyebrow="YOUR LEARNING PROFILE"
        title="Cognitive Fingerprint"
        description="An explainable view of your topic mastery, grounded in assessment evidence."
        action={
          updatedLabel ? (
            <span className="updated-label"><span className="live-dot"/> Updated {updatedLabel}</span>
          ) : (
            <span className="updated-label">No assessments yet</span>
          )
        }
      />

      <div className="fingerprint-summary-grid">
        {/* Mastery hero */}
        <div className="panel mastery-hero">
          <div className="eyebrow">OVERALL MASTERY ESTIMATE</div>
          {hasEvidence ? (
            <>
              <div className="mastery-big">
                {Math.round(fp.overallMastery!)}<span>%</span>
              </div>
              <div className="mastery-sub">
                Provisional estimate · {fp.totalAnsweredQuestions} question{fp.totalAnsweredQuestions !== 1 ? "s" : ""} answered
              </div>
              <ProgressBar value={Math.round(fp.overallMastery!)} />
              <div className="hero-foot">
                <span>{fp.topicsWithEvidence} topic{fp.topicsWithEvidence !== 1 ? "s" : ""} assessed</span>
                <span>Updated {updatedLabel}</span>
              </div>
            </>
          ) : (
            <>
              <div className="mastery-big fp-no-data">—</div>
              <div className="mastery-sub">Complete an assessment to generate your profile.</div>
              <ProgressBar value={0} />
              <div className="hero-foot">
                <span>No evidence yet</span>
                <button className="text-link" onClick={() => onNavigate("assessments")}>
                  Start an assessment <ArrowRight/>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Radar chart */}
        <div className="panel profile-chart-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">TOPIC COVERAGE</div>
              <h3>Your mastery map</h3>
            </div>
            <span className="sparkle-mark"><Sparkles/></span>
          </div>
          <div className="fingerprint-radar">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={liveRadarData} outerRadius="72%">
                <PolarGrid stroke="#304153"/>
                <PolarAngleAxis dataKey="topic" tick={{ fill: "#a2b2c3", fontSize: 11 }}/>
                <Radar name="Mastery" dataKey="mastery" stroke="#22d3ee" strokeWidth={2} fill="#22d3ee" fillOpacity={0.18}/>
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {!hasEvidence && (
            <p className="fp-radar-note">Complete assessments to populate this chart.</p>
          )}
        </div>
      </div>

      <div className="fingerprint-lower">
        {/* Topic-by-topic evidence list */}
        <section className="panel mastery-details">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">TOPIC-BY-TOPIC EVIDENCE</div>
              <h3>What the evidence shows</h3>
            </div>
            <span className="small-count">{fp.topics.length} topics</span>
          </div>
          <div className="topic-evidence-list">
            {fp.topics.map((t) => {
              const color = masteryColor(t.masteryEstimate)
              const hasData = t.evidenceStatus === "sufficient"
              const label = hasData ? masteryLabel(t.masteryEstimate) : "Awaiting diagnostic"
              const scoreDisplay = hasData ? Math.round(t.masteryEstimate!) : "—"
              const assessmentId = topicToAssessment[t.topicId]

              return (
                <article className={`evidence-row ${hasData ? "" : "is-unassessed"}`} key={t.topicId}>
                  <div className={`evidence-score ${hasData ? color : "muted"}`} title={hasData ? `${scoreDisplay}% mastery` : "Awaiting diagnostic assessment"}>
                    {scoreDisplay}
                  </div>
                  <div className="evidence-info">
                    <div className="evidence-title">
                      <b>{t.topicName}</b>
                      <span className={`mastery-state ${hasData ? color : "muted"}`}>{label}</span>
                    </div>
                    {hasData ? (
                      <>
                        <ProgressBar value={Math.round(t.masteryEstimate!)} color={color}/>
                        <p>
                          <ShieldCheck/>
                          {t.correctAnswers} of {t.answeredQuestions} question{t.answeredQuestions !== 1 ? "s" : ""} correct
                          {" · "}
                          {Math.round(t.accuracy!)}% accuracy
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="progress-track unassessed-track" role="note" aria-label="Awaiting diagnostic assessment" title="No diagnostic evidence yet"/>
                        <p className="fp-no-evidence-note">
                          <CircleHelp/>
                          No assessment data yet.{" "}
                          {assessmentId && (
                            <button
                              className="text-link"
                              onClick={() => onNavigate("assessments")}
                            >
                              Take assessment <ArrowRight/>
                            </button>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                  <div className={`evidence-change ${hasData ? (t.masteryEstimate! >= 50 ? "change-positive" : "change-negative") : "muted-text"}`}>
                    {hasData ? (
                      <>
                        {t.masteryEstimate! >= 50 ? <ArrowUpRight/> : <ArrowDownRight/>}
                        {Math.round(t.masteryEstimate!)} pts
                      </>
                    ) : (
                      <span className="unassessed-pill">Awaiting test</span>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="fingerprint-aside">
          {/* How it's calculated */}
          <section className="panel evidence-callout">
            <div className="callout-heading">
              <div className="callout-icon"><ShieldCheck/></div>
              <div>
                <div className="eyebrow">HOW THIS IS CALCULATED</div>
                <h3>Built from evidence</h3>
              </div>
            </div>
            <p>
              Mastery estimates use your accuracy and question difficulty across answered questions.
              Retakes use your most recent answered response — skipped questions never erase prior evidence.
              These are provisional estimates, not ability scores.
            </p>
            <div className="callout-foot"><LockKeyhole/> Your assessment data stays yours.</div>
          </section>

          {/* Profile highlights */}
          <section className="panel highlights-panel">
            <div className="eyebrow">PROFILE HIGHLIGHTS</div>
            {strengths.length > 0 ? (
              <div className="highlight-item">
                <span className="highlight-mark strong"><CheckCircle2/></span>
                <div>
                  <b>Strong understanding</b>
                  <p>{strengths.map((t) => t.topicName).join(" and ")} {strengths.length === 1 ? "is" : "are"} your current strength{strengths.length !== 1 ? "s" : ""}.</p>
                </div>
              </div>
            ) : (
              <div className="highlight-item">
                <span className="highlight-mark focus"><Focus/></span>
                <div>
                  <b>No strengths identified yet</b>
                  <p>Complete assessments to see your strongest topics here.</p>
                </div>
              </div>
            )}
            {needsAttention.length > 0 ? (
              <div className="highlight-item">
                <span className="highlight-mark focus"><Focus/></span>
                <div>
                  <b>Needs attention</b>
                  <p>{needsAttention.map((t) => t.topicName).join(" and ")} {needsAttention.length === 1 ? "has" : "have"} the most room to grow.</p>
                </div>
              </div>
            ) : withEvidence.length > 0 ? (
              <div className="highlight-item">
                <span className="highlight-mark strong"><CheckCircle2/></span>
                <div>
                  <b>All topics looking strong</b>
                  <p>No topics are below the threshold right now.</p>
                </div>
              </div>
            ) : null}
            <button
              className="button button-secondary full-button"
              onClick={() => onNavigate("study-plan")}
            >
              See your study plan <ArrowRight/>
            </button>
          </section>
        </aside>
      </div>

      <div className="profile-disclaimer">
        <CircleHelp/>{" "}
        <span>
          Mastery is a provisional estimate based on your diagnostic responses.
          Topics with limited assessment data are marked <b>Insufficient assessment data</b>.
          These are not scientifically validated ability scores.
        </span>
      </div>
    </>
  )
}

function StudyPlan({ onNavigate, sessionAttempts, dailyGoalMinutes }: { onNavigate: (s: NavTarget) => void; sessionAttempts: AssessmentEvaluation[]; dailyGoalMinutes: DailyGoalMinutes }) {
  const [completed, setCompleted] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const fp = computeCognitiveFingerprint(sessionAttempts)
  const plan = generateStudyPlan(fp, undefined, dailyGoalMinutes)

  // Icon + colour mapping by recommendation kind
  const kindMeta: Record<string, { icon: React.ElementType; color: string }> = {
    focus:            { icon: Activity,  color: "amber"  },
    develop:          { icon: Command,   color: "cyan"   },
    reinforce:        { icon: Focus,     color: "violet" },
    "run-diagnostic": { icon: Compass,   color: "cyan"   },
  }

  const mainItems = plan.recommendations.filter(r => r.kind !== "run-diagnostic").slice(0, 6)
  const totalMain = mainItems.length

  if (!plan.hasAnyEvidence) {
    return <>
      <SectionTitle
        eyebrow="PERSONALISED NEXT STEPS"
        title="Your study plan"
        description="A focused path based on your assessment evidence—not a one-size-fits-all curriculum."
        action={<span className="plan-progress"><span>0 of 0 complete</span><ProgressBar value={0}/></span>}
      />
      <div className="sp-no-evidence-banner panel">
        <div className="plan-banner-icon"><Compass/></div>
        <div>
          <div className="eyebrow">NO EVIDENCE YET</div>
          <h3>Complete a diagnostic to get started.</h3>
          <p>Your personalised study plan will appear here once you complete at least one assessment. It takes around 10–15 minutes.</p>
        </div>
        <button className="button button-primary" onClick={() => onNavigate("assessments")}>
          Go to Assessments <ArrowRight/>
        </button>
      </div>
      <div className="plan-footnote"><ShieldCheck/> Recommendations are generated from your assessment evidence. No data yet.</div>
    </>
  }

  return <>
    <SectionTitle
      eyebrow="PERSONALISED NEXT STEPS"
      title="Your study plan"
      description="A focused path based on your assessment evidence—not a one-size-fits-all curriculum."
      action={<span className="plan-progress"><span>{completed.length} of {totalMain} complete</span><ProgressBar value={totalMain > 0 ? completed.length / totalMain * 100 : 0}/></span>}
    />
    <div className="plan-banner">
      <div className="plan-banner-icon"><Compass/></div>
      <div>
        <div className="eyebrow">A LITTLE FOCUS GOES A LONG WAY</div>
        <h3>Your next {plan.estimatedMinutes} minutes, thoughtfully planned.</h3>
        <p>{totalMain} {totalMain === 1 ? "activity" : "activities"} selected based on your diagnostic results{plan.dailyGoalMinutes ? ` · ${plan.dailyGoalMinutes}-min daily goal` : ""}.</p>
      </div>
      <div className="plan-ring"><span>{plan.estimatedMinutes}</span><small>MIN</small></div>
    </div>

    <div className="plan-list">
      {mainItems.map((item, idx) => {
        const meta = kindMeta[item.kind] ?? { icon: Activity, color: "cyan" }
        const IconEl = meta.icon
        const done = completed.includes(item.topicId)
        const open = expanded === item.topicId
        const numLabel = String(idx + 1).padStart(2, "0")
        const totalLabel = String(totalMain).padStart(2, "0")
        const masteryPct = item.masteryEstimate !== null ? Math.round(item.masteryEstimate) : null
        return (
          <article className={`plan-card panel ${done ? "plan-done" : ""}`} key={item.topicId}>
            <div className="plan-card-main">
              <div className={`plan-activity-icon ${meta.color}`}>{done ? <Check/> : <IconEl/>}</div>
              <div className="plan-activity-body">
                <div className="plan-label-row">
                  <span className="plan-number">{numLabel} / {totalLabel}</span>
                  <span className={`priority-label ${meta.color}`}>{item.priorityLabel}</span>
                  {masteryPct !== null && <span className="sp-mastery-pill">{masteryPct}%</span>}
                </div>
                <h3>{item.topicName}</h3>
                <div className="plan-topic-meta">
                  <span>{item.domain}</span>
                  <i/>
                  <span className="sp-evidence-note">{item.evidenceCount} question{item.evidenceCount !== 1 ? "s" : ""} answered</span>
                  {item.suggestedMinutes !== null && <><i/><span className="sp-evidence-note"><Clock3 style={{display:"inline",width:11,height:11,verticalAlign:"-1px"}}/> {item.suggestedMinutes} min</span></>}
                </div>
              </div>
              <button
                className="icon-btn expand-btn"
                aria-label={`${open ? "Collapse" : "Expand"} ${item.topicName}`}
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : item.topicId)}
              >
                {open ? <ChevronDown/> : <ChevronRight/>}
              </button>
            </div>
            {open && (
              <div className="plan-detail">
                <div className="objective-block">
                  <span className="detail-label">LEARNING OBJECTIVE</span>
                  <p>{item.action}</p>
                </div>
                <div className="why-block">
                  <span className="detail-label"><Sparkles/> WHY THIS RECOMMENDATION?</span>
                  <p>{item.reason}</p>
                </div>
                {item.suggestedDifficulty && (
                  <div className="resource-row">
                    <div className="resource-icon"><Play/></div>
                    <div>
                      <b>{item.suggestedDifficulty} practice</b>
                      <span>Diagnostic questions · AdaptIQ</span>
                    </div>
                    <button className="button button-secondary" onClick={() => onNavigate("assessments")}>
                      {item.assessmentId ? "Reassess topic" : "Take assessment"} <ArrowRight/>
                    </button>
                  </div>
                )}
                <div className="plan-actions">
                  <button
                    className={`button ${done ? "button-completed" : "button-primary"}`}
                    onClick={() => setCompleted(done ? completed.filter(id => id !== item.topicId) : [...completed, item.topicId])}
                  >
                    {done ? <><CheckCircle2/> Completed</> : <>Mark as complete <Check/></>}
                  </button>
                  <button className="text-link" onClick={() => onNavigate("assessments")}>
                    Reassess topic <ArrowRight/>
                  </button>
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>

    {plan.diagnosticItems.length > 0 && (
      <div className="sp-diagnostic-section">
        <div className="eyebrow">AWAITING DIAGNOSTICS</div>
        <p>Complete these assessments to include the following topics in your plan.</p>
        <div className="plan-list">
          {plan.diagnosticItems.map(item => (
            <div className="sp-diagnostic-row panel" key={item.topicId}>
              <div className={`plan-activity-icon cyan`}><Compass/></div>
              <div className="plan-activity-body">
                <h3>{item.topicName}</h3>
                <span>{item.domain}</span>
              </div>
              <button className="button button-secondary" onClick={() => onNavigate("assessments")}>
                {item.assessmentTitle ?? "Take assessment"} <ArrowRight/>
              </button>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="plan-footnote">
      <ShieldCheck/> Recommendations are generated from your assessment evidence and update as you complete more assessments.
    </div>
  </>
}

function Progress({
  onNavigate,
  sessionAttempts,
}: {
  onNavigate: (s: NavTarget) => void
  sessionAttempts: AssessmentEvaluation[]
}) {
  const analytics = calculateProgressAnalytics(sessionAttempts)

  if (!analytics.hasData) {
    return <>
      <SectionTitle
        eyebrow="YOUR LEARNING JOURNEY"
        title="Progress"
        description="See how your understanding is changing over time."
      />
      <div className="sp-no-evidence-banner panel">
        <div className="plan-banner-icon"><TrendingUp/></div>
        <div>
          <div className="eyebrow">NO ASSESSMENT EVIDENCE YET</div>
          <h3>Complete a diagnostic to begin tracking your progress.</h3>
          <p>Your assessment attempt history, performance trends, and topic-level progression will appear here as soon as you complete your first assessment.</p>
        </div>
        <button className="button button-primary" onClick={() => onNavigate("assessments")}>
          Go to Assessments <ArrowRight/>
        </button>
      </div>
      <div className="plan-footnote">
        <ShieldCheck/> Progress analytics are generated strictly from completed assessments. No data recorded yet.
      </div>
    </>
  }

  const isDirectlyComparable = analytics.hasMultipleAttempts && analytics.isSingleAssessmentRepeated && analytics.overallScoreGrowth !== null
  const isGrowthPositive = isDirectlyComparable && analytics.overallScoreGrowth! > 0
  const isGrowthNegative = isDirectlyComparable && analytics.overallScoreGrowth! < 0

  return <>
    <SectionTitle
      eyebrow="YOUR LEARNING JOURNEY"
      title="Progress"
      description="See how your understanding is changing over time."
      action={
        <button className="button button-secondary" onClick={() => onNavigate("assessments")}>
          <Plus/> New assessment
        </button>
      }
    />

    <div className="progress-stats">
      <StatCard
        label={isDirectlyComparable ? "Score change" : analytics.hasMultipleAttempts ? "Latest score" : "Baseline score"}
        value={
          isDirectlyComparable
            ? `${analytics.overallScoreGrowth! > 0 ? "+" : ""}${analytics.overallScoreGrowth} pts`
            : `${analytics.latestScore}%`
        }
        change={
          isDirectlyComparable
            ? `${analytics.latestScore}% latest`
            : analytics.hasMultipleAttempts
              ? "Cross-domain"
              : "Baseline"
        }
        detail={
          isDirectlyComparable
            ? `vs ${analytics.initialScore}% initial`
            : analytics.hasMultipleAttempts
              ? `${analytics.totalAttempts} assessments taken`
              : "1 assessment complete"
        }
        icon={isGrowthNegative ? ArrowDownRight : TrendingUp}
        tone={isGrowthNegative ? "amber" : "cyan"}
      />
      <StatCard
        label="Assessments taken"
        value={String(analytics.totalAttempts)}
        change={analytics.isSingleAssessmentRepeated ? "Repeated test" : `${analytics.totalAttempts} total`}
        detail={analytics.totalAttempts === 1 ? "Initial baseline" : `${analytics.totalAttempts} completed sessions`}
        icon={Target}
        tone="violet"
      />
      <StatCard
        label="Questions answered"
        value={String(analytics.totalQuestionsAnswered)}
        change={analytics.overallAccuracy !== null ? `${analytics.overallAccuracy}% acc` : "—"}
        detail={`${analytics.totalCorrectAnswers} correct answers`}
        icon={CheckCircle2}
        tone="green"
      />
      <StatCard
        label="Time learning"
        value={analytics.totalTimeFormatted}
        change={`${Math.max(1, Math.round(analytics.totalTimeSeconds / 60))} min`}
        detail="across assessments"
        icon={Clock3}
        tone="amber"
      />
    </div>

    <section className="panel progress-main-chart">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">PERFORMANCE HISTORY</div>
          <h3>Assessment scores over time</h3>
          <p>Recorded weighted scores across completed assessment attempts.</p>
        </div>
        <div className="chart-legend progress-legend">
          <span><i className="legend-dot cyan-dot"/> Weighted score</span>
        </div>
      </div>
      <div className="large-progress-chart">
        <div className="chart-box">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.chartPoints} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="progressScoreFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ffffff0c" vertical={false}/>
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "#708295", fontSize: 10 }}/>
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#708295", fontSize: 10 }} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}/>
              <Tooltip
                contentStyle={{ background: "#111e2d", border: "1px solid #26384a", borderRadius: 12, color: "#e8f2fa", fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value: any, _name: any, item: any) => [`${value}% (${item?.payload?.assessmentTitle ?? "Attempt"})`, "Weighted score"]}
              />
              <Area
                type="monotone"
                dataKey="score"
                stroke="#22d3ee"
                strokeWidth={2.5}
                fill="url(#progressScoreFill)"
                activeDot={{ r: 4, fill: "#22d3ee", stroke: "#101d2b", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="chart-callout">
        <span className="chart-callout-icon">
          {isGrowthNegative ? <ArrowDownRight/> : <TrendingUp/>}
        </span>
        <span>
          {analytics.mostImprovedTopic ? (
            <><b>Strongest growth: {analytics.mostImprovedTopic.topicName} (+{analytics.mostImprovedTopic.scoreChange} pts).</b> {analytics.overallTrendSummary}</>
          ) : (
            <><b>Assessment summary:</b> {analytics.overallTrendSummary}</>
          )}
        </span>
      </div>
    </section>

    <div className="analytics-bottom">
      <section className="panel improvement-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">TOPIC PROGRESSION</div>
            <h3>Where you&apos;ve grown</h3>
          </div>
        </div>
        {analytics.topicProgress.map(t => {
          const hasComparison = t.comparableEvidence && t.previousScore !== null && t.currentScore !== null
          const isBaseline = t.status === "baseline" && t.currentScore !== null
          const isUnassessed = t.status === "unassessed"
          const changeClass = t.scoreChange !== null && t.scoreChange > 0
            ? "change-positive"
            : t.scoreChange !== null && t.scoreChange < 0
              ? "change-negative"
              : "change-neutral"

          return (
            <div className="improvement-row" key={t.topicId}>
              <div className="improvement-topic-name">
                <span>{t.topicName}</span>
                {t.retakeImprovementNote && <small className="retake-tag">{t.retakeImprovementNote}</small>}
              </div>
              <div className="compare-bars">
                {hasComparison && <span style={{ width: `${Math.max(5, Math.min(100, t.previousScore!))}%` }}/>}
                {isBaseline && <span style={{ width: `${Math.max(5, Math.min(100, t.currentScore!))}%`, opacity: 0.3 }}/>}
                <i style={{ width: `${t.currentScore !== null ? Math.max(5, Math.min(100, t.currentScore)) : 0}%`, opacity: isUnassessed ? 0 : 1 }}/>
              </div>
              <b>{t.currentScore !== null ? `${t.currentScore}%` : "—"}</b>
              <span className={`evidence-change ${changeClass}`}>
                {hasComparison ? (
                  t.scoreChange! > 0 ? `+${t.scoreChange}` : `${t.scoreChange}`
                ) : isBaseline ? (
                  "Baseline"
                ) : (
                  "No data"
                )}
              </span>
            </div>
          )
        })}
        <div className="compare-legend">
          <span><i/> Prior attempt</span>
          <span><i style={{ background: "#22d3ee" }}/> Latest attempt</span>
        </div>
      </section>

      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">RECENT ASSESSMENTS</div>
            <h3>Attempt history</h3>
          </div>
          <button className="text-link" onClick={() => onNavigate("assessments")}>
            New assessment <ArrowRight/>
          </button>
        </div>
        {analytics.attemptHistory.slice(0, 5).map(attempt => (
          <div className="activity-row" key={attempt.id}>
            <span className={`activity-score ${attempt.color}`}>
              {attempt.scorePercentage}%
            </span>
            <div>
              <b>{attempt.assessmentTitle}</b>
              <span>{attempt.dateLabel} · {attempt.durationFormatted} · {attempt.correctCount}/{attempt.answeredQuestions} correct</span>
            </div>
            <ChevronRight/>
          </div>
        ))}
      </section>
    </div>

    <div className="plan-footnote">
      <ShieldCheck/> Progress analytics are calculated directly from your completed assessment attempts in this session.
    </div>
  </>
}

function SettingsPage({
  preferences,
  onUpdatePreferences,
  attemptCount = 0,
  onClearData,
  prefSaveError,
}: {
  preferences: UserPreferences
  onUpdatePreferences: (patch: Partial<UserPreferences>) => void
  attemptCount?: number
  onClearData?: () => void
  prefSaveError?: UserPreferencesStorageError | null
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(preferences.displayName)
  const [nameError, setNameError] = useState<string | null>(null)

  // Keep nameInput in sync when preferences load from storage after mount
  useEffect(() => {
    if (!editingName) setNameInput(preferences.displayName)
  }, [preferences.displayName, editingName])

  function commitName() {
    const trimmed = nameInput.trim()
    if (trimmed.length === 0) { setNameError("Display name must not be empty."); return }
    if (trimmed.length > 80) { setNameError("Display name must be 80 characters or fewer."); return }
    setNameError(null)
    setEditingName(false)
    onUpdatePreferences({ displayName: trimmed })
  }

  return (
    <>
      <SectionTitle eyebrow="YOUR ACCOUNT" title="Settings" description="Manage your profile, preferences, and notifications."/>
      {prefSaveError && (
        <div className="inline-notice storage-warning">
          <CircleHelp/>
          <span>Preferences could not be saved ({prefSaveError.code}). Changes are active for this session only.</span>
        </div>
      )}
      <div className="settings-layout">
        <nav className="settings-nav panel" aria-label="Settings sections">
          <a className="settings-nav-active"><UserRound/> Profile</a>
          <a><GraduationCap/> Learning preferences</a>
          <a><Bell/> Notifications</a>
          <a><LockKeyhole/> Account &amp; privacy</a>
        </nav>
        <div className="settings-content">

          {/* Profile */}
          <section className="panel settings-panel">
            <div className="settings-panel-title">
              <div><div className="eyebrow">YOUR PROFILE</div><h3>Personal information</h3></div>
              {!editingName && (
                <button className="button button-secondary" onClick={() => { setNameInput(preferences.displayName); setNameError(null); setEditingName(true) }}>
                  Edit name
                </button>
              )}
            </div>
            <div className="settings-profile">
              <div className="avatar avatar-large">{nameInitials(preferences.displayName)}</div>
              <div><h4>{preferences.displayName}</h4><span>Student account · AdaptIQ Learning</span></div>
            </div>
            {editingName ? (
              <div className="settings-fields">
                <label>
                  Display name
                  <div style={{display:"flex",gap:"0.5rem",alignItems:"center",flexWrap:"wrap"}}>
                    <input
                      className="settings-name-input"
                      type="text"
                      value={nameInput}
                      maxLength={80}
                      autoFocus
                      onChange={e => { setNameInput(e.target.value); setNameError(null) }}
                      onKeyDown={e => { if (e.key === "Enter") commitName(); if (e.key === "Escape") setEditingName(false) }}
                      aria-label="Display name"
                    />
                    <button className="button button-primary" onClick={commitName}>Save</button>
                    <button className="button button-secondary" onClick={() => setEditingName(false)}>Cancel</button>
                  </div>
                  {nameError && <span className="settings-field-error">{nameError}</span>}
                </label>
              </div>
            ) : (
              <div className="settings-fields">
                <label>Display name<span>{preferences.displayName}</span></label>
              </div>
            )}
          </section>

          {/* Learning preferences */}
          <section className="panel settings-panel">
            <div className="eyebrow">LEARNING PREFERENCES</div>
            <h3>Make AdaptIQ work for you</h3>
            <div className="preference-row">
              <div>
                <b>Daily study goal</b>
                <span>A realistic target helps build a steady routine and shapes your personalised study plan.</span>
              </div>
              <select
                aria-label="Daily study goal"
                value={preferences.dailyStudyGoalMinutes}
                onChange={e => onUpdatePreferences({ dailyStudyGoalMinutes: Number(e.target.value) as typeof DAILY_STUDY_GOAL_OPTIONS[number] })}
              >
                {DAILY_STUDY_GOAL_OPTIONS.map(m => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </div>
          </section>

          {/* Assessment history */}
          <section className="panel settings-panel">
            <div className="eyebrow">ASSESSMENT HISTORY STORAGE</div>
            <h3>Local browser storage</h3>
            <div className="preference-row">
              <div>
                <b>Stored assessment sessions</b>
                <span>{attemptCount} completed attempt{attemptCount !== 1 ? "s" : ""} saved in browser localStorage.</span>
              </div>
              {onClearData && (
                <button className="button button-secondary" onClick={onClearData} disabled={attemptCount === 0}>
                  Clear stored attempts
                </button>
              )}
            </div>
          </section>

          {/* Notifications */}
          <section className="panel settings-panel">
            <div className="eyebrow">NOTIFICATIONS</div>
            <h3>Stay in the loop</h3>
            {([
              { key: "studyRemindersEnabled" as const, title: "Study reminders", desc: "A nudge when it's time for your next activity." },
              { key: "progressNotificationsEnabled" as const, title: "Progress updates", desc: "Let me know when an assessment updates my profile." },
            ]).map(item => (
              <div className="notification-setting" key={item.key}>
                <div><b>{item.title}</b><span>{item.desc}</span></div>
                <button
                  role="switch"
                  aria-checked={preferences[item.key]}
                  aria-label={item.title}
                  className={`switch ${preferences[item.key] ? "switch-on" : ""}`}
                  onClick={() => onUpdatePreferences({ [item.key]: !preferences[item.key] })}
                ><i/></button>
              </div>
            ))}
            <p className="settings-notification-note">These are preference settings only. Browser or push notifications are not implemented in this version.</p>
          </section>

          <div className="profile-disclaimer"><ShieldCheck/> Your profile is private and only visible to you.</div>
        </div>
      </div>
    </>
  )
}

export default function AdaptIQDashboard() {
  const [active, setActive] = useState<Section>("overview")
  const [menuOpen, setMenuOpen] = useState(false)
  const [resultNotice, setResultNotice] = useState(false)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<AssessmentStorageError | null>(null)
  const [saveError, setSaveError] = useState<AssessmentStorageError | null>(null)
  const [storageHydrated, setStorageHydrated] = useState(false)
  const [sessionAttempts, setSessionAttempts] = useState<AssessmentEvaluation[]>([])

  // User preferences — separate domain from assessment attempts
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({ ...DEFAULT_USER_PREFERENCES })
  const [prefHydrated, setPrefHydrated] = useState(false)
  const [prefSaveError, setPrefSaveError] = useState<UserPreferencesStorageError | null>(null)
  const hasPrefHydratedRef = useRef(false)
  const lastSavedPrefKeyRef = useRef<string | null>(null)

  const hasHydratedRef = useRef(false)
  const lastSavedFingerprintRef = useRef<string | null>(null)

  // 1. Initial hydration from storage (runs once after mount in browser)
  useEffect(() => {
    if (hasHydratedRef.current) return
    hasHydratedRef.current = true

    const result = loadAssessmentAttempts()
    if (result.ok) {
      if (result.status === "loaded" && result.attempts.length > 0) {
        setSessionAttempts(result.attempts)
        lastSavedFingerprintRef.current = result.attempts
          .map((a) => `${a.id}:${a.completedAt}`)
          .join(",")
      } else {
        lastSavedFingerprintRef.current = ""
      }
    } else {
      setStorageError(result.error)
      // Do not set lastSavedFingerprintRef to empty so auto-save won't overwrite corrupt data
    }
    setStorageHydrated(true)
  }, [])

  // 1b. User preferences hydration (runs once after mount, independent of assessments)
  useEffect(() => {
    if (hasPrefHydratedRef.current) return
    hasPrefHydratedRef.current = true

    const result = loadUserPreferences()
    if (result.ok) {
      setUserPreferences(result.preferences)
      lastSavedPrefKeyRef.current = JSON.stringify(result.preferences)
    } else {
      // Load failed (corrupt / unsupported). Keep the in-memory default.
      // Do NOT overwrite corrupt storage automatically.
      setPrefSaveError(result.error)
      lastSavedPrefKeyRef.current = null // signals: don't auto-save over corrupt data
    }
    setPrefHydrated(true)
  }, [])

  // 2. Automatic saving whenever sessionAttempts changes after hydration
  useEffect(() => {
    if (!hasHydratedRef.current || !storageHydrated) return

    // Never overwrite corrupt/unsupported data with an empty array if initial load failed
    if (storageError && sessionAttempts.length === 0) return

    const fingerprint = sessionAttempts
      .map((a) => `${a.id}:${a.completedAt}`)
      .join(",")

    // Avoid unnecessary writes if nothing has changed or if it matches what was loaded
    if (lastSavedFingerprintRef.current === fingerprint) return

    const saveRes = saveAssessmentAttempts(sessionAttempts)
    if (saveRes.ok) {
      lastSavedFingerprintRef.current = fingerprint
      setSaveError(null)
    } else {
      setSaveError(saveRes.error)
    }
  }, [sessionAttempts, storageHydrated, storageError])

  // 2b. Auto-save user preferences whenever they change after hydration
  useEffect(() => {
    if (!prefHydrated) return
    // If initial load failed and we haven't been given a valid save key, don't auto-save
    // the defaults over what might be corrupt-but-recoverable storage content.
    if (lastSavedPrefKeyRef.current === null) return

    const key = JSON.stringify(userPreferences)
    if (lastSavedPrefKeyRef.current === key) return

    const result = saveUserPreferences(userPreferences)
    if (result.ok) {
      lastSavedPrefKeyRef.current = key
      setPrefSaveError(null)
    } else {
      setPrefSaveError(result.error)
    }
  }, [userPreferences, prefHydrated])

  /**
   * Apply a partial preferences update immediately (optimistic UI).
   * The auto-save effect above will persist it.
   */
  const handleUpdatePreferences = (patch: Partial<UserPreferences>) => {
    setUserPreferences(prev => ({ ...prev, ...patch }))
  }

  const handleClearHistory = () => {
    const clearRes = clearAssessmentAttempts()
    if (clearRes.ok) {
      lastSavedFingerprintRef.current = ""
      setSessionAttempts([])
      setStorageError(null)
      setSaveError(null)
      setStorageNotice("Assessment history has been cleared from local storage.")
    } else {
      setStorageError(clearRes.error)
    }
  }

  const handleNavigate = (target: string) => {
    const next = toSectionId(target)
    setActive(next)
    if (typeof window !== "undefined" && window.location.hash !== `#${next}`) {
      window.history.pushState(null, "", `#${next}`)
    }
  }

  useEffect(() => {
    const syncFromLocation = () => {
      if (typeof window !== "undefined" && window.location.hash) {
        const hash = window.location.hash.replace(/^#/, "")
        if (hash) {
          setActive(toSectionId(hash))
        }
      }
    }
    syncFromLocation()

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail) {
        handleNavigate(detail)
      }
    }

    window.addEventListener("adaptiq-nav", handler)
    window.addEventListener("hashchange", syncFromLocation)
    window.addEventListener("popstate", syncFromLocation)

    return () => {
      window.removeEventListener("adaptiq-nav", handler)
      window.removeEventListener("hashchange", syncFromLocation)
      window.removeEventListener("popstate", syncFromLocation)
    }
  }, [])

  const titles: Record<Section, { title: string; eyebrow: string }> = {
    "overview": { title: "Overview", eyebrow: "YOUR PERSONAL LEARNING SPACE" },
    "assessments": { title: "Assessments", eyebrow: "ADAPTIQ LEARNING SPACE" },
    "cognitive-fingerprint": { title: "Cognitive Fingerprint", eyebrow: "ADAPTIQ LEARNING SPACE" },
    "study-plan": { title: "Study Plan", eyebrow: "ADAPTIQ LEARNING SPACE" },
    "progress": { title: "Progress", eyebrow: "ADAPTIQ LEARNING SPACE" },
    "settings": { title: "Settings", eyebrow: "ADAPTIQ LEARNING SPACE" },
  }

  const { title, eyebrow } = titles[active] || titles["overview"]

  return (
    <div className="app-shell">
      <Sidebar active={active} onChange={handleNavigate} open={menuOpen} onClose={() => setMenuOpen(false)} displayName={userPreferences.displayName}/>
      <div className="main-column">
        <Header title={title} eyebrow={eyebrow} onMenu={() => setMenuOpen(true)} displayName={userPreferences.displayName}/>
        <main className="main-content" key={active}>
          {resultNotice && (
            <div className="inline-notice">
              <CheckCircle2/>
              Your assessment results have been added to your sample learning profile.
              <button aria-label="Dismiss" onClick={() => setResultNotice(false)}><X/></button>
            </div>
          )}
          {storageNotice && (
            <div className="inline-notice">
              <CheckCircle2/>
              <span>{storageNotice}</span>
              <button aria-label="Dismiss" onClick={() => setStorageNotice(null)}><X/></button>
            </div>
          )}
          {storageError && (
            <div className="inline-notice storage-warning">
              <CircleHelp/>
              <span>Saved assessment history could not be restored ({storageError.code}: {storageError.message}). Existing storage data was preserved.</span>
              <button aria-label="Dismiss" onClick={() => setStorageError(null)}><X/></button>
            </div>
          )}
          {saveError && (
            <div className="inline-notice storage-warning">
              <CircleHelp/>
              <span>Assessment history could not be saved to browser storage ({saveError.code}: {saveError.message}). Your session data is active in memory.</span>
              <button aria-label="Dismiss" onClick={() => setSaveError(null)}><X/></button>
            </div>
          )}
          {!storageHydrated ? (
            <div className="app-restoring">
              <div className="restoring-orb"><Sparkles/></div>
              <p>Restoring your learning profile...</p>
            </div>
          ) : (
            <>
              {active === "overview" && <Overview onNavigate={handleNavigate} sessionAttempts={sessionAttempts} displayName={userPreferences.displayName}/>}
              {active === "assessments" && (
                <Assessments
                  onNavigate={handleNavigate}
                  onResult={() => setResultNotice(true)}
                  sessionAttempts={sessionAttempts}
                  onRecordAttempt={(attempt) => setSessionAttempts((prev) => [attempt, ...prev])}
                />
              )}
              {active === "cognitive-fingerprint" && <Fingerprint onNavigate={handleNavigate} sessionAttempts={sessionAttempts}/>}
              {active === "study-plan" && <StudyPlan onNavigate={handleNavigate} sessionAttempts={sessionAttempts} dailyGoalMinutes={userPreferences.dailyStudyGoalMinutes}/>}
              {active === "progress" && <Progress onNavigate={handleNavigate} sessionAttempts={sessionAttempts}/>}
              {active === "settings" && (
                <SettingsPage
                  preferences={userPreferences}
                  onUpdatePreferences={handleUpdatePreferences}
                  attemptCount={sessionAttempts.length}
                  onClearData={handleClearHistory}
                  prefSaveError={prefSaveError}
                />
              )}
            </>
          )}
          <footer className="app-footer">
            <span>AdaptIQ <i/> Sample data for demonstration</span>
            <span>Thoughtful learning, built around you.</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
