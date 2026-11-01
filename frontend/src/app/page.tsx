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
  id: number | string;
  company: string;
  initials: string;
  color: string;
  role: string;
  date: string;
  status: ApplicationStatus;
  followUp?: string;
  latestUpdate?: string;
};

type GmailStatus = {
  connected: boolean;
  email?: string | null;
};

type GmailSyncStatus = {
  total_tracked: number;
  last_sync_at: string | null;
};

type GmailTrackedApplication = {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_at: string;
  latest_update: string;
};

type GmailMessageSummary = {
  id: string;
  subject: string;
  sender: string;
  received_at: string;
  snippet: string;
  company: string | null;
  role: string | null;
  status: ApplicationStatus | null;
};

type GmailMessageDetail = GmailMessageSummary & { body: string };

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

const gmailCallbackMessages: Record<string, string> = {
  denied: "Google access was not granted. You can try again whenever you’re ready.",
  state_error: "The Google sign-in expired or could not be verified. Please start again.",
  identity_error: "Google could not verify the account identity. Please try again.",
  reauthorize: "Google did not return an offline access token. Try again and approve the requested access.",
  storage_error: "Google authorized the account, but JobPilot could not save the connection. Check the database and try again.",
  connect_error: "Google sign-in did not complete. Please try again.",
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

function GmailEmailRow({ message, onOpen, onFollowUp }: { message: GmailMessageSummary; onOpen: () => void; onFollowUp: () => void }) {
  const senderName = message.company || message.sender.split("<")[0].trim() || message.sender;
  return <div className="email-row email-row-action">
    <button type="button" className="email-open-row" onClick={onOpen}>
      <span className="email-mark" style={{ backgroundColor: "#6e5de7" }}>{senderName.slice(0, 1).toUpperCase()}</span>
      <span className="email-copy">
        <span className="email-copy-heading"><strong>{senderName}</strong><time>{new Date(message.received_at).toLocaleDateString()}</time></span>
        <span className="email-subject">{message.subject}</span>
        <Badge className="email-kind">{message.status || "Job email"}</Badge>
      </span>
    </button>
    <Button variant="outline" size="sm" className="email-follow-up" onClick={onFollowUp}>Follow up</Button>
  </div>;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [dialog, setDialog] = useState<"gmail" | "mail" | "mail-list" | "follow-up" | "notifications" | "assistant" | "settings" | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);
  const [gmailError, setGmailError] = useState("");
  const [gmailNotice, setGmailNotice] = useState("");
  const [gmailTracked, setGmailTracked] = useState(0);
  const [gmailLastSync, setGmailLastSync] = useState<string | null>(null);
  const [gmailApplications, setGmailApplications] = useState<Application[]>([]);
  const [gmailMessages, setGmailMessages] = useState<GmailMessageSummary[]>([]);
  const [openedMessage, setOpenedMessage] = useState<GmailMessageDetail | null>(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState("");
  const [followUpMessage, setFollowUpMessage] = useState<GmailMessageSummary | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [followUpResume, setFollowUpResume] = useState<File | null>(null);
  const [followUpBusy, setFollowUpBusy] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [followUpSuccess, setFollowUpSuccess] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const autoSyncStarted = useRef(false);

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

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const callbackResult = params.get("gmail");
    if (callbackResult) {
      window.setTimeout(() => {
        if (!active) return;
        setDialog("gmail");
        setGmailError(callbackResult === "connected"
          ? ""
          : gmailCallbackMessages[callbackResult] || gmailCallbackMessages.connect_error);
      }, 0);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }

    void (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/auth/google/status`, { credentials: "include", cache: "no-store" });
        if (!response.ok) throw new Error("Could not read Gmail connection status.");
        const status = await response.json() as GmailStatus;
        if (!active) return;
        setGmailEmail(status.connected ? status.email || null : null);
        if (!status.connected) {
          autoSyncStarted.current = false;
          setGmailTracked(0);
          setGmailLastSync(null);
          setGmailApplications([]);
          setGmailMessages([]);
          return;
        }
        const syncResponse = await fetch(`${apiBaseUrl}/api/v1/gmail/sync/status`, { credentials: "include", cache: "no-store" });
        const syncStatus = syncResponse.ok ? await syncResponse.json() as GmailSyncStatus : null;
        if (syncStatus && active) {
          setGmailTracked(syncStatus.total_tracked);
          setGmailLastSync(syncStatus.last_sync_at);
        }
        if (!autoSyncStarted.current) {
          autoSyncStarted.current = true;
          await syncGmail();
        }
      } catch {
        if (active) setGmailEmail(null);
      }
    })();

    return () => { active = false; };
  // This mount-only effect performs one automatic sync per dashboard visit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applications = gmailEmail ? gmailApplications : starterApplications;

  const filteredApplications = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesQuery = !normalizedQuery || `${application.company} ${application.role}`.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "All statuses" || application.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [applications, query, statusFilter]);

  const totalApplications = gmailEmail ? gmailApplications.length : 24;
  const countStatus = (status: ApplicationStatus) => applications.filter((application) => application.status === status).length;
  const dashboardStatusMix = gmailEmail
    ? [
        { name: "Applied", value: countStatus("Applied"), color: "#7a6cf0" },
        { name: "Interview", value: countStatus("Interview"), color: "#39a981" },
        { name: "Assessment", value: countStatus("Assessment"), color: "#e1a745" },
        { name: "No response", value: countStatus("No response"), color: "#a6afc0" },
        { name: "Other", value: countStatus("HR round") + countStatus("Offer received") + countStatus("Rejected"), color: "#e47c69" },
      ].filter((item) => item.value > 0)
    : statusMix;

  async function loadTrackedApplications() {
    const response = await fetch(`${apiBaseUrl}/api/v1/gmail/applications`, { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { applications: GmailTrackedApplication[] };
    setGmailApplications(result.applications.map((item) => ({
      id: item.id,
      company: item.company,
      initials: item.company.slice(0, 1).toUpperCase(),
      color: "#6e5de7",
      role: item.role,
      date: new Date(item.applied_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      status: item.status,
      latestUpdate: item.latest_update,
    })));
  }

  async function loadGmailMessages() {
    const response = await fetch(`${apiBaseUrl}/api/v1/gmail/messages`, { credentials: "include", cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { messages: GmailMessageSummary[] };
    setGmailMessages(result.messages);
  }

  async function openGmailMessage(message: GmailMessageSummary) {
    setOpenedMessage({ ...message, body: "" });
    setMailError("");
    setMailLoading(true);
    setDialog("mail");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/gmail/messages/${encodeURIComponent(message.id)}`, { credentials: "include", cache: "no-store" });
      const result = await response.json() as GmailMessageDetail & { detail?: string };
      if (!response.ok) throw new Error(result.detail || "This email could not be opened.");
      setOpenedMessage(result);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "This email could not be opened.");
    } finally {
      setMailLoading(false);
    }
  }

  function startFollowUp(message: GmailMessageSummary) {
    setFollowUpMessage(message);
    setFollowUpPrompt("");
    setFollowUpResume(null);
    setFollowUpError("");
    setFollowUpSuccess("");
    setDialog("follow-up");
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!followUpMessage) return;
    setFollowUpBusy(true);
    setFollowUpError("");
    setFollowUpSuccess("");
    try {
      const form = new FormData();
      form.set("prompt", followUpPrompt);
      if (followUpResume) form.set("resume", followUpResume);
      const response = await fetch(`${apiBaseUrl}/api/v1/gmail/messages/${encodeURIComponent(followUpMessage.id)}/follow-up`, {
        method: "POST", credentials: "include", body: form,
      });
      const result = await response.json() as { detail?: string; recipient?: string };
      if (!response.ok) throw new Error(result.detail || "The follow-up could not be sent.");
      setFollowUpSuccess(`Follow-up sent to ${result.recipient || "the recipient"}.`);
      window.setTimeout(() => setDialog((current) => current === "follow-up" ? null : current), 1700);
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "The follow-up could not be sent.");
    } finally {
      setFollowUpBusy(false);
    }
  }

  async function connectGmail() {
    setGmailBusy(true);
    setGmailError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/google/connect`, {
        credentials: "include",
        cache: "no-store",
      });
      const result = await response.json() as { authorization_url?: string; detail?: string };
      if (!response.ok) throw new Error(result.detail || "Google sign-in could not start.");
      if (!result.authorization_url) throw new Error("Google sign-in returned no authorization URL.");
      window.location.assign(result.authorization_url);
    } catch (error) {
      setGmailError(error instanceof TypeError
        ? `Could not reach the JobPilot API at ${apiBaseUrl}. Start the backend and try again.`
        : error instanceof Error ? error.message : "Could not start Google sign-in.");
      setGmailBusy(false);
    }
  }

  async function disconnectGmail() {
    setGmailBusy(true);
    setGmailError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/google/disconnect`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("JobPilot could not disconnect Gmail. Please try again.");
      setGmailEmail(null);
      setGmailTracked(0);
      setGmailLastSync(null);
      setGmailApplications([]);
      setGmailMessages([]);
    } catch (error) {
      setGmailError(error instanceof Error ? error.message : "Could not disconnect Gmail.");
    } finally {
      setGmailBusy(false);
    }
  }

  async function syncGmail() {
    setGmailBusy(true);
    setGmailError("");
    setGmailNotice("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/gmail/sync`, {
        method: "POST",
        credentials: "include",
      });
      const result = await response.json() as GmailSyncStatus & { imported?: number; detail?: string; initial_sync?: boolean };
      if (!response.ok) throw new Error(result.detail || "Gmail sync could not complete.");
      setGmailTracked(result.total_tracked);
      setGmailLastSync(result.last_sync_at);
      setGmailNotice(result.initial_sync
        ? `First sync complete. ${result.imported || 0} relevant messages imported from the last 60 days.`
        : `Sync complete. ${result.imported || 0} new relevant messages imported.`);
      await loadTrackedApplications();
      await loadGmailMessages();
    } catch (error) {
      setGmailError(error instanceof TypeError
        ? `Could not reach the JobPilot API at ${apiBaseUrl}. Start the backend and try again.`
        : error instanceof Error ? error.message : "Could not sync Gmail.");
    } finally {
      setGmailBusy(false);
    }
  }

  function askAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = assistantQuestion.trim().toLowerCase();
    if (!question) return;
    if (question.includes("interview")) {
      setAssistantAnswer(gmailEmail
        ? `I found ${countStatus("Interview") + countStatus("HR round")} interview-stage roles in your Gmail tracking.`
        : "Your demo workspace has 4 interviews in progress. Sample records are shown for preview only.");
    } else if (question.includes("how many") || question.includes("total") || question.includes("application")) {
      setAssistantAnswer(gmailEmail
        ? `I found ${totalApplications} likely job application records in the Gmail messages scanned so far.`
        : `Your demo workspace has ${totalApplications} sample applications. Gmail messages and live job-search data are not loaded.`);
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
              {label === "Applications" && <span className="nav-count">{gmailEmail ? gmailApplications.length : 24}</span>}
            </a>
          ))}
          <button className="nav-link assistant-link" onClick={() => { setDialog("assistant"); setMobileNavOpen(false); }}>
            <MessageSquareText size={17} strokeWidth={1.85} /><span>Career assistant</span><span className="new-dot" />
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <div className="tip-icon"><Sparkles size={16} /></div>
          <strong>{gmailEmail ? "Gmail linked" : "Connect your inbox"}</strong>
          <p>Connect Google to link your inbox without sharing your password.</p>
          <button onClick={() => setDialog("gmail")}>{gmailEmail ? "Gmail connected" : "Connect Gmail"} <ArrowRight size={13} /></button>
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
          <div className="demo-banner"><span className="demo-indicator" /> <strong>{gmailEmail ? "Gmail tracking" : "Demo workspace"}</strong><span>{gmailEmail ? `${gmailApplications.length} roles detected from Gmail messages${gmailLastSync ? ` · last synced ${new Date(gmailLastSync).toLocaleString()}` : " · syncing your recent mail"}.` : "Connect Gmail to scan the last 60 days for application updates and detected roles."}</span><button onClick={() => setDialog("gmail")}>{gmailEmail ? "Gmail connected" : "Connect Gmail"} <ArrowUpRight size={13} /></button></div>

          <section className="welcome-row">
            <div>
              <div className="eyebrow"><CalendarDays size={14} /> SUNDAY, NOVEMBER 1, 2026</div>
              <h1>Your job search, <span>at a glance.</span></h1>
              <p className="welcome-subtitle">Keep your momentum going. Here&apos;s your progress this week.</p>
            </div>
            <div className="welcome-actions">
              <span className="sync-label"><span className="sync-dot" /> {gmailEmail ? gmailLastSync ? `Gmail synced · ${new Date(gmailLastSync).toLocaleDateString()}` : "Gmail syncing…" : "Demo data · not synced"}</span>
              <Button className="primary-action" onClick={() => setDialog("gmail")}><Mail size={15} /> {gmailEmail ? "Gmail connected" : "Connect inbox"}</Button>
            </div>
          </section>

          <section className="stats-grid" aria-label="Application statistics">
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Total applications</CardTitle><span className="stat-icon lavender"><BriefcaseBusiness size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">{totalApplications}</div><div className="stat-meta positive"><TrendingUp size={14} /><strong>12%</strong><span>vs last month</span></div></CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Interviews</CardTitle><span className="stat-icon green"><MessageSquareText size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">{String(gmailEmail ? countStatus("Interview") + countStatus("HR round") : 4).padStart(2, "0")}</div><div className="stat-meta positive"><TrendingUp size={14} /><span>{gmailEmail ? "from Gmail" : "2 new this week"}</span></div></CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Assessments</CardTitle><span className="stat-icon amber"><FileText size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">{String(gmailEmail ? countStatus("Assessment") : 3).padStart(2, "0")}</div><div className="stat-meta neutral"><Clock3 size={14} /><span>{gmailEmail ? "from Gmail" : "1 due this week"}</span></div></CardContent>
            </Card>
            <Card className="stat-card">
              <CardHeader className="stat-heading"><CardTitle>Awaiting response</CardTitle><span className="stat-icon blue"><Mail size={17} /></span></CardHeader>
              <CardContent className="stat-content"><div className="stat-value">{String(gmailEmail ? countStatus("Applied") + countStatus("No response") : 9).padStart(2, "0")}</div><div className="stat-meta due"><ArrowDownRight size={14} /><span>{gmailEmail ? "awaiting an update" : "3 need follow-up"}</span></div></CardContent>
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
                    <Pie data={dashboardStatusMix} dataKey="value" nameKey="name" innerRadius={52} outerRadius={70} paddingAngle={4} stroke="none">
                      {dashboardStatusMix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ border: "1px solid #ebeaf2", borderRadius: 10, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="donut-center"><strong>{totalApplications}</strong><span>total</span></div>
                </div>
                <div className="status-legend">
                  {dashboardStatusMix.map((item) => <div key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{item.value}</strong></div>)}
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
                  )) : <div className="empty-results"><Search size={18} /><strong>{gmailEmail && !gmailApplications.length ? "No job roles found in recent email" : "No matching applications"}</strong><span>{gmailEmail && !gmailApplications.length ? "Your connected inbox was scanned. Try Sync Gmail again after application emails arrive." : "Try another search or status filter."}</span></div>}
                </div>
                <div className="table-foot"><span>Showing {filteredApplications.length} recent {filteredApplications.length === 1 ? "application" : "applications"} {!gmailEmail && <span className="table-demo">· demo records</span>}</span><a href="#applications">View applications <ArrowRight size={14} /></a></div>
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
                <CardHeader className="panel-heading compact-heading"><div><CardTitle>Recent email activity</CardTitle><p>{gmailEmail ? `${gmailTracked} relevant messages tracked` : "Demo email activity · not synced"}</p></div><button className="icon-subtle" aria-label="Connect email" onClick={() => setDialog("gmail")}><Mail size={16} /></button></CardHeader>
                <CardContent className="email-list">
                  {gmailEmail ? gmailMessages.slice(0, 3).map((message) => <GmailEmailRow key={message.id} message={message} onOpen={() => void openGmailMessage(message)} onFollowUp={() => startFollowUp(message)} />) : recentEmails.map((email) => <div className="email-row" key={email.subject}><span className="email-mark" style={{ backgroundColor: email.color }}>{email.company.slice(0, 1)}</span><div className="email-copy"><div><strong>{email.company}</strong><time>{email.time}</time></div><p>{email.subject}</p><Badge className="email-kind">{email.kind}</Badge></div></div>)}
                  {gmailEmail && gmailMessages.length === 0 && <p className="email-empty">No job-related emails found yet. Use Sync Gmail to check again.</p>}
                  {gmailEmail && gmailMessages.length > 3 ? <button className="connect-email-link" onClick={() => setDialog("mail-list")}>View all {gmailMessages.length} job emails <ArrowRight size={14} /></button> : <button className="connect-email-link" onClick={() => setDialog("gmail")}>{gmailEmail ? `Connected as ${gmailEmail}` : "Connect Gmail with Google OAuth"} <ArrowRight size={14} /></button>}
                </CardContent>
              </Card>
            </div>
          </section>

          <footer className="page-footer"><span>Made for the next step in your career.</span><span><span className="footer-dot" /> {gmailEmail ? "Gmail connected · detected roles shown" : "Demo mode · no account connected"}</span></footer>
        </div>
      </main>

      <Dialog open={dialog === "mail-list"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="app-dialog mail-list-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Mail size={20} /></div><DialogTitle>Job related emails</DialogTitle><DialogDescription>Open an email to read it here in JobPilot.</DialogDescription></DialogHeader>
          <div className="mail-list-scroll">{gmailMessages.map((message) => <GmailEmailRow key={message.id} message={message} onOpen={() => void openGmailMessage(message)} onFollowUp={() => startFollowUp(message)} />)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setDialog(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "mail"} onOpenChange={(open) => { if (!open) { setDialog(null); setOpenedMessage(null); } }}>
        <DialogContent className="app-dialog mail-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Mail size={20} /></div><DialogTitle>{openedMessage?.subject || "Job email"}</DialogTitle><DialogDescription>{openedMessage?.sender}{openedMessage ? ` · ${new Date(openedMessage.received_at).toLocaleString()}` : ""}</DialogDescription></DialogHeader>
          {openedMessage?.company && <div className="mail-job-summary"><strong>{openedMessage.company}</strong><span>{openedMessage.role || "Role not identified"}</span>{openedMessage.status && <Badge className="email-kind">{openedMessage.status}</Badge>}</div>}
          {mailLoading && <p className="dialog-description">Loading message…</p>}
          {mailError && <div className="integration-error" role="alert">{mailError}</div>}
          {!mailLoading && !mailError && <pre className="mail-reader">{openedMessage?.body}</pre>}
          <DialogFooter><Button variant="outline" onClick={() => { setDialog(null); setOpenedMessage(null); }}>Close</Button><Button className="primary-action" onClick={() => openedMessage && startFollowUp(openedMessage)}>Follow up</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "follow-up"} onOpenChange={(open) => { if (!open && !followUpBusy) setDialog(null); }}>
        <DialogContent className="app-dialog follow-up-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Send size={20} /></div><DialogTitle>Follow up by email</DialogTitle><DialogDescription>Replying to {followUpMessage?.company || followUpMessage?.sender} · {followUpMessage?.subject}</DialogDescription></DialogHeader>
          <form className="follow-up-form" onSubmit={(event) => void submitFollowUp(event)}>
            <label htmlFor="follow-up-prompt">What would you like to ask?</label>
            <textarea id="follow-up-prompt" required minLength={3} maxLength={4000} value={followUpPrompt} onChange={(event) => setFollowUpPrompt(event.target.value)} placeholder="For example: Ask whether there is an update on my application and reiterate my interest in the role." />
            <label htmlFor="follow-up-resume">Attach a résumé (optional)</label>
            <input id="follow-up-resume" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(event) => setFollowUpResume(event.target.files?.[0] || null)} />
            {followUpResume && <span className="resume-picked">Attached: {followUpResume.name}<button type="button" onClick={() => setFollowUpResume(null)}>Remove</button></span>}
            <p className="follow-up-disclosure">Submitting asks AI to write a concise reply using this email and your request, then sends it in the same Gmail thread. The résumé, if selected, will be attached.</p>
            {followUpError && <div className="integration-error" role="alert">{followUpError}</div>}
            {followUpSuccess && <div className="integration-success" role="status">{followUpSuccess}</div>}
            <DialogFooter><Button type="button" variant="outline" disabled={followUpBusy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" className="primary-action" disabled={followUpBusy || !followUpPrompt.trim()}>{followUpBusy ? "Writing and sending…" : "Generate & send"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "gmail"} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="app-dialog simple-dialog">
          <DialogHeader><div className="dialog-hero-icon"><Mail size={20} /></div><DialogTitle>{gmailEmail ? "Gmail connected" : "Connect your Gmail"}</DialogTitle><DialogDescription>{gmailEmail ? `Connected as ${gmailEmail}.` : "Continue to Google to choose an account and approve Gmail access. JobPilot never asks for your Gmail password."}</DialogDescription></DialogHeader>
          <div className="permission-note"><strong>Gmail access for tracking and requested follow-ups</strong><p>After you connect, JobPilot scans up to the last 60 days for job-search messages and checks for updates when you reopen the dashboard. It fetches an email body only when you open it or request an AI follow-up. Message bodies and résumé contents are not stored.</p><p>When you submit a follow-up, JobPilot writes and sends the reply in that email thread. Reconnect Google to approve the Gmail send permission if your existing connection only has read access.</p></div>
          {gmailEmail && <p className="dialog-description">{gmailTracked} relevant messages tracked{gmailLastSync ? ` · last synced ${new Date(gmailLastSync).toLocaleString()}` : " · not synced yet"}.</p>}
          {gmailError && <div className="integration-error" role="alert">{gmailError}</div>}
          {gmailNotice && <div className="integration-success" role="status">{gmailNotice}</div>}
          <DialogFooter>
            {gmailEmail && <Button variant="outline" disabled={gmailBusy} onClick={disconnectGmail}>{gmailBusy ? "Disconnecting…" : "Disconnect Gmail"}</Button>}
            <Button variant="outline" disabled={gmailBusy} onClick={() => setDialog(null)}>Close</Button>
            {gmailEmail && <Button variant="outline" disabled={gmailBusy} onClick={connectGmail}>Reconnect for sending</Button>}
            {gmailEmail && <Button className="primary-action" disabled={gmailBusy} onClick={syncGmail}>{gmailBusy ? "Syncing…" : "Sync Gmail"}</Button>}
            {!gmailEmail && <Button className="primary-action" disabled={gmailBusy} onClick={connectGmail}>{gmailBusy ? "Connecting…" : "Continue with Google"}</Button>}
          </DialogFooter>
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
          <DialogHeader><div className="dialog-hero-icon assistant-icon"><Sparkles size={20} /></div><DialogTitle>Career assistant</DialogTitle><DialogDescription>{gmailEmail ? "Ask for a count from the roles detected in your connected Gmail." : "Ask about this sample workspace. Personal records and AI services are not connected."}</DialogDescription></DialogHeader>
          <div className="assistant-suggestion"><Sparkles size={14} /><span>Try: “How many applications do I have?”</span></div>
          {assistantAnswer && <div className="assistant-answer"><span className="assistant-mini-mark"><Sparkles size={13} /></span><p>{assistantAnswer}</p></div>}
          <form className="assistant-form" onSubmit={askAssistant}><Input value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="Ask about your job search..." aria-label="Ask the career assistant" /><Button type="submit" className="primary-action" size="icon" aria-label="Send question"><Send size={16} /></Button></form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
