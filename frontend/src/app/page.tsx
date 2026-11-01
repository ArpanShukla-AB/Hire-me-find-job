"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileText,
  Filter,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquareText,
  Search,
  Send,
  Settings2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type ApplicationStatus =
  | "Applied"
  | "Assessment"
  | "Interview"
  | "HR round"
  | "Offer received"
  | "Rejected"
  | "No response";

type Application = {
  id: number;
  company: string;
  initials: string;
  color: string;
  role: string;
  date: string;
  status: ApplicationStatus;
  followUp?: string;
};

const starterApplications: Application[] = [
  { id: 1, company: "Linear", initials: "L", color: "#6e5de7", role: "Product Designer", date: "Oct 28, 2026", status: "Interview", followUp: "Nov 3" },
  { id: 2, company: "Stripe", initials: "S", color: "#6258d9", role: "Senior Product Designer", date: "Oct 25, 2026", status: "Assessment", followUp: "Nov 2" },
  { id: 3, company: "Notion", initials: "N", color: "#20242c", role: "Product Designer", date: "Oct 22, 2026", status: "Applied", followUp: "Nov 1" },
  { id: 4, company: "Figma", initials: "F", color: "#ef6c55", role: "UX Designer, Growth", date: "Oct 19, 2026", status: "No response", followUp: "Nov 1" },
  { id: 5, company: "Vercel", initials: "V", color: "#17191d", role: "Design Engineer", date: "Oct 16, 2026", status: "Applied" },
];

const weeklyActivity = [
  { day: "Mon", applications: 2, interviews: 1 },
  { day: "Tue", applications: 4, interviews: 0 },
  { day: "Wed", applications: 3, interviews: 1 },
  { day: "Thu", applications: 6, interviews: 1 },
  { day: "Fri", applications: 3, interviews: 0 },
  { day: "Sat", applications: 1, interviews: 0 },
  { day: "Sun", applications: 2, interviews: 1 },
];

const statusMix = [
  { name: "Applied", value: 9, color: "#7a6cf0" },
  { name: "Interview", value: 6, color: "#39a981" },
  { name: "Assessment", value: 4, color: "#e1a745" },
  { name: "No response", value: 3, color: "#a6afc0" },
  { name: "Other", value: 2, color: "#e47c69" },
];

const recentEmails = [
  { company: "Linear", subject: "Your interview is confirmed", time: "Today · 9:42 AM", kind: "Interview invite", color: "#6e5de7" },
  { company: "Stripe", subject: "Next steps: product design exercise", time: "Yesterday · 2:18 PM", kind: "Assessment", color: "#6258d9" },
  { company: "Notion", subject: "We received your application", time: "Oct 22 · 11:06 AM", kind: "Application update", color: "#20242c" },
];

const navItems = [
  { label: "Overview", href: "#overview", icon: LayoutDashboard },
  { label: "Applications", href: "#applications", icon: BriefcaseBusiness },
  { label: "Email intelligence", href: "#email-activity", icon: Mail },
  { label: "Follow-up agent", href: "#follow-ups", icon: CalendarClock },
  { label: "Analytics", href: "#analytics", icon: Activity },
];

const statusClass: Record<ApplicationStatus, string> = {
  Applied: "status-applied",
  Assessment: "status-assessment",
  Interview: "status-interview",
  "HR round": "status-hr",
  "Offer received": "status-offer",
  Rejected: "status-rejected",
  "No response": "status-no-response",
};

function CompanyMark({ application }: { application: Application }) {
  return (
    <span className="company-mark" style={{ backgroundColor: application.color }} aria-hidden="true">
      {application.initials}
    </span>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge className={`status-badge ${statusClass[status]}`}>{status}</Badge>;
}

export default function Home() {
  const applications = starterApplications;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [dialog, setDialog] = useState<"gmail" | "notifications" | "assistant" | "settings" | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const filteredApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesQuery = !normalizedQuery || `${application.company} ${application.role}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "All statuses" || application.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [applications, query, statusFilter]);

  const totalApplications = 24;

  function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = assistantQuestion.trim().toLowerCase();
    if (!question) return;
    if (question.includes("interview")) {
      setAssistantAnswer("Your demo workspace has 4 interviews in progress. Sample records are shown for preview only.");
    } else if (question.includes("how many") || question.includes("total") || question.includes("application")) {
      setAssistantAnswer(`Your demo workspace has ${totalApplications} sample applications. No personal Gmail or job-search data is connected.`);
    } else {
      setAssistantAnswer("The career assistant is in demo mode. Connect the backend and configure an AI provider to get answers grounded in your own application records.");
    }
  }

  return (
    <div className={`app-shell ${mobileNavOpen ? "nav-open" : ""}`} id="overview">
      <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="JobPilot AI home">
          <span className="brand-mark"><Sparkles size={19} strokeWidth={2.3} /></span>
          <span className="brand-name">jobpilot<span>AI</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">A</span>
          <span className="workspace-copy"><strong>Alex Morgan</strong><small>Personal workspace</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, href, icon: Icon }, index) => (
            <a key={label} href={href} className={`nav-link ${index === 0 ? "active" : ""}`} onClick={() => setMobileNavOpen(false)}>
              <Icon size={17} strokeWidth={1.85} />
              <span>{label}</span>
              {label === "Applications" && <span className="nav-count">24</span>}
            </a>
          ))}
          <button className="nav-link assistant-link" onClick={() => { setDialog("assistant"); setMobileNavOpen(false); }}>
            <MessageSquareText size={17} strokeWidth={1.85} /><span>Career assistant</span><span className="new-dot" />
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <div className="tip-icon"><Sparkles size={16} /></div>
          <strong>Your search, in sync</strong>
          <p>Connect Gmail to spot application updates automatically.</p>
          <button onClick={() => setDialog("gmail")}>Connect Gmail <ArrowRight size={13} /></button>
        </div>
        <button className="nav-link settings-link" onClick={() => setDialog("settings")}><Settings2 size={17} /><span>Settings & support</span><CircleHelp size={15} className="settings-help" /></button>
        <div className="profile-row">
          <div className="profile-avatar">AM</div>
          <div className="profile-copy"><strong>Alex Morgan</strong><small>Free plan</small></div>
          <button className="profile-more" aria-label="Account options" onClick={() => setDialog("settings")}><ChevronDown size={15} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div>
          <div className="topbar-actions">
            <label className="global-search">
              <Search size={16} />
              <Input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search applications..." aria-label="Search applications" />
              <kbd>⌘ K</kbd>
            </label>
            <Button variant="ghost" size="icon" className="notification-button" aria-label="Notifications" onClick={() => setDialog("notifications")}><Bell size={18} /><span /></Button>
            <div className="top-avatar" aria-label="Alex Morgan">AM</div>
          </div>
        </header>

        <div className="content-wrap">
          <div className="demo-banner"><span className="demo-indicator" /> <strong>Demo workspace</strong><span>Sample data is shown. Connect an account to enable live sync.</span><button onClick={() => setDialog("gmail")}>Learn more <ArrowUpRight size={13} /></button></div>

          <section className="welcome-row">
            <div>
              <div className="eyebrow"><CalendarDays size={14} /> SUNDAY, NOVEMBER 1, 2026</div>
              <h1>Your job search, <span>at a glance.</span></h1>
              <p className="welcome-subtitle">Keep your momentum going. Here&apos;s your progress this week.</p>
            </div>
            <div className="welcome-actions">
              <span className="sync-label"><span className="sync-dot" /> Demo data · not synced</span>
              <Button className="primary-action" onClick={() => setDialog("gmail")}><Mail size={15} /> Connect inbox</Button>
            </div>
          </section>

          <section className="stats-grid" aria-label="Application statistics">
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Total applications</CardTitle><span className="stat-icon lavender"><BriefcaseBusiness size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">{totalApplications}</div><div className="stat-meta positive"><TrendingUp size={14} /><strong>12%</strong><span>vs last month</span></div></CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Interviews</CardTitle><span className="stat-icon green"><MessageSquareText size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">04</div><div className="stat-meta positive"><TrendingUp size={14} /><strong>2</strong><span>new this week</span></div></CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Assessments</CardTitle><span className="stat-icon amber"><FileText size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">03</div><div className="stat-meta neutral"><Clock3 size={14} /><span>1 due this week</span></div></CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Awaiting response</CardTitle><span className="stat-icon blue"><Mail size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">09</div><div className="stat-meta due"><ArrowDownRight size={14} /><strong>3</strong><span>need follow-up</span></div></CardContent>
            </Card>
          </section>

          <section className="chart-grid" id="analytics" aria-label="Job search analytics">
            <Card className="panel activity-panel">
              <CardHeader className="panel-heading">
                <div><CardTitle>Application activity</CardTitle><p>Applications and interviews this week</p></div>
                <span className="range-button" aria-label="Activity range: this week">This week <ChevronDown size={14} /></span>
              </CardHeader>
              <CardContent className="activity-chart-wrap">
                <div className="chart-legend"><span><i className="legend-square purple-square" /> Applications</span><span><i className="legend-square green-square" /> Interviews</span></div>
                <div className="activity-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyActivity} margin={{ top: 8, right: 8, left: -20, bottom: 0 }} barGap={5}>
                      <CartesianGrid vertical={false} stroke="#eef0f5" strokeDasharray="4 5" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#98a0af", fontSize: 11 }} dy={12} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#a4aab6", fontSize: 10 }} allowDecimals={false} />
                      <Tooltip cursor={{ fill: "#f7f7fc" }} contentStyle={{ border: "1px solid #ebeaf2", borderRadius: 10, fontSize: 12, boxShadow: "0 8px 24px #20243a14" }} />
                      <Bar dataKey="applications" name="Applications" fill="#8879f4" radius={[5, 5, 1, 1]} maxBarSize={20} />
                      <Bar dataKey="interviews" name="Interviews" fill="#52b994" radius={[5, 5, 1, 1]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="panel status-panel">
              <CardHeader className="panel-heading">
                <div><CardTitle>Application status</CardTitle><p>Where things stand right now</p></div>
                <button className="icon-subtle" aria-label="Filter status chart" onClick={() => { document.getElementById("applications")?.scrollIntoView({ behavior: "smooth" }); }}><Filter size={16} /></button>
              </CardHeader>
              <CardContent className="status-content">
                <div className="donut-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={70} paddingAngle={4} stroke="none">
                        {statusMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ border: "1px solid #ebeaf2", borderRadius: 10, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center"><strong>{totalApplications}</strong><span>total</span></div>
                </div>
                <div className="status-legend">
                  {statusMix.map((item) => <div key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{item.value}</strong></div>)}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="bottom-grid">
            <Card className="panel applications-panel" id="applications">
              <CardHeader className="panel-heading applications-heading">
                <div><CardTitle>Recent applications</CardTitle><p>Your latest job search activity</p></div>
                <div className="table-controls">
                  <label className="filter-select-label"><Filter size={14} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter applications by status"><option>All statuses</option>{["Applied", "Assessment", "Interview", "HR round", "Offer received", "Rejected", "No response"].map((status) => <option key={status}>{status}</option>)}</select><ChevronDown size={13} /></label>
                </div>
              </CardHeader>
              <CardContent className="table-content">
                <div className="application-table" role="table" aria-label="Recent applications">
                  <div className="table-head" role="row"><span>Company & role</span><span>Applied</span><span>Status</span><span>Follow-up</span></div>
                  {filteredApplications.length > 0 ? filteredApplications.map((application) => (
                    <div className="table-row" role="row" key={application.id}>
                      <div className="company-cell"><CompanyMark application={application} /><span><strong>{application.company}</strong><small>{application.role}</small></span></div>
                      <span className="applied-date">{application.date}</span>
                      <span><StatusBadge status={application.status} /></span>
                      <span className={`follow-date ${application.followUp ? "has-follow-up" : ""}`}>{application.followUp ? <><CalendarDays size={13} />{application.followUp}</> : <span className="no-follow-up">—</span>}</span>
                    </div>
                  )) : <div className="empty-results"><Search size={18} /><strong>No matching applications</strong><span>Try another search or status filter.</span></div>}
                </div>
                <div className="table-foot"><span>Showing {filteredApplications.length} recent {filteredApplications.length === 1 ? "application" : "applications"} <span className="table-demo">· demo records</span></span><a href="#applications">View applications <ArrowRight size={14} /></a></div>
              </CardContent>
            </Card>

            <div className="right-column">
              <Card className="panel followup-panel" id="follow-ups">
                <CardHeader className="panel-heading compact-heading"><div><CardTitle>Needs a follow-up</CardTitle><p>Keep the conversation moving</p></div><Badge className="due-count">3 due</Badge></CardHeader>
                <CardContent className="followup-list">
                  {[
                    { company: "Notion", role: "Product Designer", when: "Today", initials: "N", color: "#20242c" },
                    { company: "Figma", role: "UX Designer, Growth", when: "Today", initials: "F", color: "#ef6c55" },
                    { company: "Stripe", role: "Senior Product Designer", when: "Tomorrow", initials: "S", color: "#6258d9" },
                  ].map((item) => <div className="followup-row" key={item.company}><span className="company-mark small-mark" style={{ backgroundColor: item.color }}>{item.initials}</span><span className="followup-copy"><strong>{item.company}</strong><small>{item.role}</small></span><span className={`followup-when ${item.when === "Today" ? "today" : ""}`}>{item.when}</span></div>)}
                  <Button variant="outline" className="followup-cta" onClick={() => setDialog("assistant")}><Sparkles size={15} /> Draft a follow-up <ArrowRight size={14} /></Button>
                </CardContent>
              </Card>

              <Card className="panel email-panel" id="email-activity">
                <CardHeader className="panel-heading compact-heading"><div><CardTitle>Recent email activity</CardTitle><p>Job-related messages detected</p></div><button className="icon-subtle" aria-label="Connect email" onClick={() => setDialog("gmail")}><Mail size={16} /></button></CardHeader>
                <CardContent className="email-list">
                  {recentEmails.map((email) => <div className="email-row" key={email.subject}><span className="email-mark" style={{ backgroundColor: email.color }}>{email.company.slice(0, 1)}</span><div className="email-copy"><div><strong>{email.company}</strong><time>{email.time}</time></div><p>{email.subject}</p><Badge className="email-kind">{email.kind}</Badge></div></div>)}
                  <button className="connect-email-link" onClick={() => setDialog("gmail")}>Connect Gmail for live updates <ArrowRight size={14} /></button>
                </CardContent>
              </Card>
            </div>
          </section>

          <footer className="page-footer"><span>Made for the next step in your career.</span><span><span className="footer-dot" /> Demo mode · No account connected</span></footer>
        </div>
      </main>

      <Dialog open={dialog === "gmail"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="app-dialog simple-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Mail size={20} /></div><DialogTitle>Connect your Gmail</DialogTitle><DialogDescription>Gmail OAuth is not configured in this starter yet. No email account has been accessed.</DialogDescription></DialogHeader>
          <div className="permission-note"><strong>Import your recent job search</strong><p>After you authorize Google OAuth, JobPilot will scan up to the last 60 days of relevant mail and keep new application updates in sync. It will never ask for or store your Gmail password.</p><p>AI drafts for a conversation will require separate permission. JobPilot will save drafts for you to review and will not send them.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Got it</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "notifications"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="app-dialog simple-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Bell size={20} /></div><DialogTitle>You&apos;re all caught up</DialogTitle><DialogDescription>Notifications will appear here when live email sync and account settings are available.</DialogDescription></DialogHeader>
          <DialogFooter><Button onClick={() => setDialog(null)} className="primary-action">Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "settings"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="app-dialog simple-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Settings2 size={20} /></div><DialogTitle>Workspace settings</DialogTitle><DialogDescription>Profile, privacy, and account settings will be available after sign-in is implemented. This demo has no connected account.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "assistant"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="app-dialog assistant-dialog">
          <DialogHeader><div className="dialog-hero-icon assistant-icon"><Sparkles size={20} /></div><DialogTitle>Career assistant</DialogTitle><DialogDescription>Ask about this sample workspace. Personal records and AI services are not connected.</DialogDescription></DialogHeader>
          <div className="assistant-suggestion"><Sparkles size={14} /><span>Try: “How many applications do I have?”</span></div>
          {assistantAnswer && <div className="assistant-answer"><span className="assistant-mini-mark"><Sparkles size={13} /></span><p>{assistantAnswer}</p></div>}
          <form className="assistant-form" onSubmit={askAssistant}><Input value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask about your job search..." aria-label="Ask the career assistant" /><Button type="submit" className="primary-action" size="icon" aria-label="Send question"><Send size={16} /></Button></form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
