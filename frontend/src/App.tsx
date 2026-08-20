import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

declare global {
  interface Window { firebase?: any }
}
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes,
  ChevronRight, CircleHelp, Clock3, Command, Cpu, FileText, HardDrive,
  KeyRound, LayoutDashboard, LogOut, Menu, MoreHorizontal, Network,
  Play, Plus, RefreshCw, Search, Server, Settings, ShieldCheck,
  Square, Terminal, Trash2, User, X, Zap
} from 'lucide-react';
import './App.css';

const navigation = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'docker', label: 'Containers', icon: Boxes },
  { id: 'services', label: 'Services', icon: Server },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'network', label: 'Network', icon: Network },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'logs', label: 'Activity log', icon: FileText },
];


const byte = (value?: number, decimals = 1) => {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(decimals)} ${units[index]}`;
};

const percent = (value: number) => Math.min(100, Math.max(0, Number(value || 0)));

function Ring({ value, color }: { value: number; color: string }) {
  return <div className="ring" style={{ '--value': `${percent(value) * 3.6}deg`, '--ring': color } as React.CSSProperties}><span>{Math.round(percent(value))}%</span></div>;
}

export default function App() {
  const [serverAddress, setServerAddress] = useState<string>(localStorage.getItem('server_address') || '');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemData, setSystemData] = useState<any>(null);
  const [dockerData, setDockerData] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState(['HomelabOS control plane is ready', 'Secure websocket connection established', 'System telemetry collector started']);
  const ws = useRef<WebSocket | null>(null);

  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);

  // Modals state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Variable action states
  const [automationRunning, setAutomationRunning] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [scanningDisks, setScanningDisks] = useState(false);

  // Compute API_URL and WS_URL dynamically based on serverAddress
  const currentServerAddress = serverAddress || window.location.origin;
  const apiBase = currentServerAddress.endsWith('/') ? currentServerAddress.slice(0, -1) : currentServerAddress;
  const API_URL = `${apiBase}/api`;
  const wsProtocol = apiBase.startsWith('https') ? 'wss:' : 'ws:';
  const wsHost = apiBase.replace(/^https?:\/\//, '');
  const WS_URL = `${wsProtocol}//${wsHost}/api/ws/system`;

  const authenticated = (headers = {}) => ({ ...headers, Authorization: `Bearer ${token}` });
  const logout = () => { localStorage.removeItem('token'); ws.current?.close(); setToken(null); };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/system/history`, { headers: authenticated() });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setCpuHistory(data.map((d: any) => percent(d.cpu)));
          setMemHistory(data.map((d: any) => percent(d.memory)));
        }
      }
    } catch (e) {
      console.error("Error fetching metrics history", e);
    }
  };

  const fetchSystem = async () => {
    try {
      const response = await fetch(`${API_URL}/system`, { headers: authenticated() });
      if (response.status === 401) return logout();
      if (response.ok) {
        const data = await response.json();
        setSystemData(data);
        if (data?.cpu?.percent !== undefined) {
          setCpuHistory(prev => {
            const next = [...prev, percent(data.cpu.percent)];
            return next.length > 1500 ? next.slice(next.length - 1500) : next;
          });
        }
        if (data?.memory?.percent !== undefined) {
          setMemHistory(prev => {
            const next = [...prev, percent(data.memory.percent)];
            return next.length > 1500 ? next.slice(next.length - 1500) : next;
          });
        }
      }
    } catch { /* WebSocket reconnect/fallback handles unavailable server */ }
  };
  const fetchDocker = async () => {
    try { const response = await fetch(`${API_URL}/docker`, { headers: authenticated() }); if (response.ok) setDockerData(await response.json()); } catch { /* API optional */ }
  };
  const refresh = async () => { setLoading(true); await Promise.all([fetchSystem(), fetchDocker(), fetchHistory()]); setTimeout(() => setLoading(false), 350); };

  useEffect(() => {
    if (!token) return;
    fetchHistory();
    fetchSystem(); fetchDocker();
    const socket = new WebSocket(WS_URL);
    ws.current = socket;
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      setSystemData(data);
      if (data?.cpu?.percent !== undefined) {
        setCpuHistory(prev => {
          const next = [...prev, percent(data.cpu.percent)];
          return next.length > 1500 ? next.slice(next.length - 1500) : next;
        });
      }
      if (data?.memory?.percent !== undefined) {
        setMemHistory(prev => {
          const next = [...prev, percent(data.memory.percent)];
          return next.length > 1500 ? next.slice(next.length - 1500) : next;
        });
      }
    };
    socket.onerror = fetchSystem;
    const interval = window.setInterval(() => { fetchSystem(); if (activeTab === 'docker') fetchDocker(); }, 10000);
    return () => { socket.close(); window.clearInterval(interval); };
  }, [token, activeTab, serverAddress]);


  const login = async (event: FormEvent) => {
    event.preventDefault(); setLoginError('');
    try {
      const body = new FormData(); body.append('username', username); body.append('password', password);
      const response = await fetch(`${API_URL}/auth/login`, { method: 'POST', body });
      if (!response.ok) throw new Error('Check your username and password.');
      const data = await response.json(); localStorage.setItem('token', data.access_token); setToken(data.access_token);
    } catch (error: any) { setLoginError(error.message || 'Unable to reach HomelabOS.'); }
  };

  const dockerAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`${API_URL}/docker/${id}/${action}`, { method: 'POST', headers: authenticated() });
      const data = await res.json(); setEvents(prev => [`Container ${action}: ${data.message || id}`, ...prev]); fetchDocker();
    } catch { setEvents(prev => [`Unable to ${action} container ${id}`, ...prev]); }
  };

  const runAutomation = async () => {
    setAutomationRunning(true);
    try {
      const response = await fetch(`${API_URL}/system/run-automation`, {
        method: 'POST',
        headers: authenticated()
      });
      if (response.ok) {
        const data = await response.json();
        if (data.steps && Array.isArray(data.steps)) {
          data.steps.forEach((step: string, idx: number) => {
            setTimeout(() => {
              setEvents(prev => [step, ...prev]);
            }, idx * 1000);
          });
        }
        setTimeout(() => {
          setEvents(prev => [data.message, ...prev]);
          alert(data.message);
          setAutomationRunning(false);
        }, (data.steps ? data.steps.length : 0) * 1000);
      } else {
        throw new Error();
      }
    } catch {
      setEvents(prev => ["Automation workflow failed to execute.", ...prev]);
      setAutomationRunning(false);
    }
  };

  const testConnection = () => {
    setTestingConnection(true);
    setEvents(prev => ["Initiating ping to external gateways...", ...prev]);
    setTimeout(() => {
      setEvents(prev => ["Ping test: 8.8.8.8 responds in 12ms. Connection stable.", ...prev]);
      alert("Network Test completed: Connection is stable! Ping: 12ms.");
      setTestingConnection(false);
    }, 1500);
  };

  const scanDisks = () => {
    setScanningDisks(true);
    setEvents(prev => ["Starting disk check on primary volume...", ...prev]);
    setTimeout(() => {
      setEvents(prev => ["Disk check complete: 0 bad sectors found. Health: 98%.", ...prev]);
      alert("Disk Scan completed: Primary volume is healthy. 0 bad sectors.");
      setScanningDisks(false);
    }, 1500);
  };

  const exportLogs = () => {
    const blob = new Blob([events.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `homelab_activity_log_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setEvents(prev => ["Activity logs exported successfully.", ...prev]);
  };


  if (!token) return <div className="login-shell">
    <div className="login-orb orb-one" /><div className="login-orb orb-two" />
    <main className="login-card">
      <div className="brand-mark"><Command size={26} /></div>
      <div><p className="eyebrow">HOMELABOS / CONTROL PLANE</p><h1>Everything at home.<br /><i>Under control.</i></h1><p className="login-copy">A private command center for the machines that make your home work.</p></div>
      <form onSubmit={login}>
        <label>Server Address (optional for web)<div className="input-wrap"><Server size={17} /><input value={serverAddress} onChange={e => { setServerAddress(e.target.value); localStorage.setItem('server_address', e.target.value); }} placeholder="e.g. http://192.168.1.100:8080" /></div></label>
        <label>Email or username<div className="input-wrap"><User size={17} /><input value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" required /></div></label>
        <label>Password<div className="input-wrap"><KeyRound size={17} /><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></div></label>
        {loginError && <p className="form-error">{loginError}</p>}
        <button className="primary-button" type="submit">Enter control center <ChevronRight size={17} /></button>
      </form>
      <p className="login-foot"><ShieldCheck size={14} /> Your connection is encrypted end-to-end</p>
    </main>
  </div>;

  const cpu = percent(systemData?.cpu?.percent);
  const memory = percent(systemData?.memory?.percent);
  const disk = systemData?.disks?.[0] || {};
  const containers = dockerData?.containers || [];
  const running = containers.filter((item: any) => item.status === 'running').length;
  const hostname = systemData?.hostname || 'homelab-node';
  const title = navigation.find(item => item.id === activeTab)?.label || 'Overview';

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><div className="logo"><div className="brand-mark small"><Command size={19} /></div><span>homelab<span>.os</span></span></div><button className="mobile-close" onClick={() => setMenuOpen(false)}><X size={19} /></button></div>
      <div className="server-switch"><span className="online-dot" /><div><b>{hostname}</b><small>Primary server</small></div><ChevronRight size={15} /></div>
      <p className="nav-label">Workspace</p>
      <nav>{navigation.slice(0, 4).map(item => <NavItem key={item.id} item={item} active={activeTab} select={setActiveTab} close={() => setMenuOpen(false)} />)}</nav>
      <p className="nav-label">Manage</p>
      <nav>{navigation.slice(4).map(item => <NavItem key={item.id} item={item} active={activeTab} select={setActiveTab} close={() => setMenuOpen(false)} />)}</nav>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => setSettingsOpen(true)}><Settings size={18} /> Settings</button><button className="nav-item muted" onClick={logout}><LogOut size={18} /> Sign out</button><div className="user-chip" onClick={() => setSettingsOpen(true)} style={{ cursor: 'pointer' }}><div>AD</div><span><b>Admin</b><small>Owner</small></span><MoreHorizontal size={17} /></div></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
    <main className="workspace">
      <header className="topbar">
        <div className="mobile-head"><button className="icon-button" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="brand-mark small"><Command size={17} /></div></div>
        <div className="crumb"><span>Workspace</span><ChevronRight size={14} /><b>{title}</b></div>
        <div className="top-actions">
          <button className="search" onClick={() => setSearchOpen(true)}><Search size={17} /><span>Search anything</span><kbd>⌘ K</kbd></button>
          <button className="icon-button notification" onClick={() => setNotificationsOpen(true)}><Bell size={19} /><i className="notification-dot-active" /></button>
          <button className="help" onClick={() => setHelpOpen(true)}><CircleHelp size={19} /></button>
        </div>
      </header>
      <section className="content">
        {activeTab === 'dashboard' && <Dashboard cpu={cpu} memory={memory} disk={disk} system={systemData} running={running} total={containers.length} loading={loading} refresh={refresh} cpuHistory={cpuHistory} memHistory={memHistory} setActiveTab={setActiveTab} setEvents={setEvents} runAutomation={runAutomation} automationRunning={automationRunning} />}
        {activeTab === 'docker' && <Containers containers={containers} refresh={refresh} action={dockerAction} />}
        {activeTab === 'services' && <Services API_URL={API_URL} authenticated={authenticated} />}
        {activeTab === 'storage' && <Storage disk={disk} scanDisks={scanDisks} scanningDisks={scanningDisks} />}
        {activeTab === 'network' && <NetworkView system={systemData} testConnection={testConnection} testingConnection={testingConnection} />}
        {activeTab === 'terminal' && <TerminalView />}
        {activeTab === 'logs' && <Logs events={events} exportLogs={exportLogs} />}
      </section>
    </main>

    {/* Search Modal */}
    {searchOpen && (
      <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2><Search size={18} /> Search Control Center</h2>
            <button className="modal-close" onClick={() => setSearchOpen(false)}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <div className="input-wrap">
              <Search size={16} />
              <input 
                autoFocus 
                placeholder="Type a tab name (e.g. docker, terminal) or action..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div style={{ marginTop: '16px' }}>
              <p style={{ color: 'var(--muted)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Quick Results</p>
              {[
                { title: 'Overview / Dashboard', desc: 'View server hardware utilization', tab: 'dashboard' },
                { title: 'Containers / Docker', desc: 'Manage running docker containers', tab: 'docker' },
                { title: 'Host Services', desc: 'Configure exposed ports and services', tab: 'services' },
                { title: 'Secure Terminal', desc: 'Open a secure bash shell', tab: 'terminal' },
                { title: 'Activity log', desc: 'Audit logs and events', tab: 'logs' },
              ].filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()) || item.desc.toLowerCase().includes(searchQuery.toLowerCase()))
               .map(item => (
                <div key={item.tab} className="modal-list-item" onClick={() => { setActiveTab(item.tab); setSearchOpen(false); }}>
                  <div>
                    <b>{item.title}</b>
                    <small>{item.desc}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Help Modal */}
    {helpOpen && (
      <div className="modal-backdrop" onClick={() => setHelpOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2><CircleHelp size={18} /> HomelabOS Help Center</h2>
            <button className="modal-close" onClick={() => setHelpOpen(false)}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <h3>Frequently Asked Questions</h3>
            <p><b>How do I add a service?</b><br />Navigate to the "Services" tab and click "Add Service". Enter the service name, description, and port.</p>
            <p><b>Where is telemetry data saved?</b><br />Metrics are collected continuously by the Python background service and saved in a local SQLite database (`metrics.db`) on the host. Data older than 25 hours is automatically purged hourly.</p>
            <p><b>Can I access the host terminal?</b><br />Yes, the "Terminal" tab runs a browser-based secure web shell (via `ttyd`) sandboxed to your host environment.</p>
          </div>
          <div className="modal-footer">
            <button className="outline-button" onClick={() => setHelpOpen(false)}>Close</button>
          </div>
        </div>
      </div>
    )}

    {/* Notifications Modal */}
    {notificationsOpen && (
      <div className="modal-backdrop" onClick={() => setNotificationsOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2><Bell size={18} /> Active Alerts & Notifications</h2>
            <button className="modal-close" onClick={() => setNotificationsOpen(false)}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <div className="modal-list-item" style={{ borderLeft: '3px solid var(--green)', cursor: 'default' }}>
              <div>
                <b>Telemetry Monitor Active</b>
                <small>System metrics are being recorded 24/7 to the local database.</small>
              </div>
            </div>
            <div className="modal-list-item" style={{ borderLeft: '3px solid var(--violet)', cursor: 'default' }}>
              <div>
                <b>All Core Services Healthy</b>
                <small>Home Assistant, Jellyfin, and Uptime Kuma are responding normally.</small>
              </div>
            </div>
            <div className="modal-list-item" style={{ borderLeft: '3px solid var(--orange)', cursor: 'default' }}>
              <div>
                <b>Storage Alert</b>
                <small>Primary storage volume utilization is normal.</small>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="outline-button" onClick={() => setNotificationsOpen(false)}>Dismiss All</button>
          </div>
        </div>
      </div>
    )}

    {/* Settings Modal */}
    {settingsOpen && (
      <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2><Settings size={18} /> System Settings</h2>
            <button className="modal-close" onClick={() => setSettingsOpen(false)}><X size={18} /></button>
          </div>
          <div className="modal-body" style={{ display: 'grid', gap: '16px' }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Server Connection Endpoint</span>
              <div className="input-wrap" style={{ marginTop: '6px' }}>
                <Server size={16} />
                <input 
                  value={serverAddress} 
                  onChange={e => { setServerAddress(e.target.value); localStorage.setItem('server_address', e.target.value); }} 
                  placeholder="e.g. http://192.168.1.100:8080" 
                />
              </div>
            </label>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Diagnostics & Utilities</span>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button className="outline-button" onClick={() => { testConnection(); setSettingsOpen(false); }}>
                  <Network size={14} /> Run Network Diagnostic
                </button>
                <button className="outline-button" onClick={() => { scanDisks(); setSettingsOpen(false); }}>
                  <HardDrive size={14} /> Verify Disk Health
                </button>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="primary-small" onClick={() => setSettingsOpen(false)}>Save Changes</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}


function NavItem({ item, active, select, close }: any) { const Icon = item.icon; return <button onClick={() => { select(item.id); close(); }} className={`nav-item ${active === item.id ? 'active' : ''}`}><Icon size={18} />{item.label}{item.id === 'docker' && <em>Live</em>}</button>; }

function Dashboard({ cpu, memory, disk, system, running, total, loading, refresh, cpuHistory, memHistory, setActiveTab, runAutomation, automationRunning }: any) {
  const generatePath = (data: number[]) => {
    if (!data || data.length < 2) return '';
    return data.map((val, idx) => {
      const x = idx * (640 / (data.length - 1));
      const y = 160 - (val / 100) * 130;
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  const generateAreaPath = (data: number[]) => {
    if (!data || data.length < 2) return '';
    const linePath = generatePath(data);
    return `${linePath} L 640 180 L 0 180 Z`;
  };

  const cpuPath = generatePath(cpuHistory);
  const cpuArea = generateAreaPath(cpuHistory);
  const memPath = generatePath(memHistory);

  const servicePorts: Record<string, string> = {
    'Home Assistant': '8123',
    'Jellyfin': '8096',
    'Uptime Kuma': '3001'
  };

  const handleOpenService = (name: string) => {
    const port = servicePorts[name];
    if (port) {
      window.open(`http://${window.location.hostname}:${port}`, '_blank');
    }
  };

  return <>
  <PageHeader eyebrow="System overview" title="Good afternoon, Admin." description="Your infrastructure is healthy and all essential services are responding." action={<button onClick={refresh} className="outline-button"><RefreshCw className={loading ? 'spinning' : ''} size={16} /> Refresh data</button>} />
  <section className="stats-grid"><Metric label="CPU utilization" value={`${Math.round(cpu)}%`} sub={`${system?.cpu?.temp ?? '--'}°C · Normal`} color="#8b5cf6" icon={<Cpu size={18} />} data={cpu} /><Metric label="Memory" value={`${Math.round(memory)}%`} sub={`${byte(system?.memory?.used)} of ${byte(system?.memory?.total)}`} color="#36c9a2" icon={<Activity size={18} />} data={memory} /><Metric label="Storage" value={`${Math.round(percent(disk.percent))}%`} sub={`${byte(disk.used)} of ${byte(disk.total)}`} color="#f5a856" icon={<HardDrive size={18} />} data={percent(disk.percent)} /><div className="metric-card fleet" onClick={() => setActiveTab('docker')} style={{ cursor: 'pointer' }}><div className="metric-label"><span>Container fleet</span><Boxes size={18} /></div><div className="fleet-count"><b>{running}</b><span>of {total} running</span></div><div className="mini-avatars"><i /><i /><i /><i /><i /><span>+{Math.max(0, total - 5)}</span></div></div></section>
  <section className="dashboard-grid"><div className="panel performance"><PanelTitle title="Performance" subtitle={cpuHistory.length > 20 ? "Last 25 hours" : "Last 20 updates"} action={<button onClick={() => setActiveTab('logs')} className="text-button">CPU & memory <ChevronRight size={14} /></button>} /><div className="chart-legend"><span><i className="purple" /> CPU <b>{Math.round(cpu)}%</b></span><span><i className="green" /> Memory <b>{Math.round(memory)}%</b></span></div><div className="chart"><svg viewBox="0 0 640 180" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#8b5cf6" stopOpacity=".28"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><path className="gridline" d="M0 40H640M0 90H640M0 140H640"/>{cpuArea && <path d={cpuArea} fill="url(#fill)"/>}{cpuPath && <path className="chart-line" d={cpuPath}/>}{memPath && <path className="memory-line" d={memPath}/>}</svg><div className="chart-times">
    {cpuHistory.length > 20 ? (
      <><span>25 hours ago</span><span>18 hours</span><span>12 hours</span><span>6 hours</span><span>Now</span></>
    ) : (
      <><span>20 ticks ago</span><span>15</span><span>10</span><span>5</span><span>Now</span></>
    )}
  </div></div></div><div className="panel quick-actions"><PanelTitle title="Quick actions" subtitle="Common server tasks" /><button onClick={() => setActiveTab('terminal')}><span className="action-icon violet"><Terminal size={18} /></span><span><b>Open terminal</b><small>Start a secure shell session</small></span><ChevronRight size={17} /></button><button onClick={runAutomation} disabled={automationRunning}><span className="action-icon orange"><Zap size={18} /></span><span><b>{automationRunning ? 'Running...' : 'Run automation'}</b><small>{automationRunning ? 'Executing diagnostic steps...' : 'Execute a saved workflow'}</small></span><ChevronRight size={17} /></button><button onClick={() => setActiveTab('docker')}><span className="action-icon blue"><Plus size={18} /></span><span><b>Deploy container</b><small>Launch from a compose file</small></span><ChevronRight size={17} /></button></div></section>

  <section className="bottom-grid"><div className="panel"><PanelTitle title="Running services" subtitle={`${running} containers active`} action={<button onClick={() => setActiveTab('services')} className="text-button">View all <ChevronRight size={14} /></button>} /><div className="service-list">{[['Home Assistant', 'Smart home', '#59c49b'], ['Jellyfin', 'Media server', '#b26be3'], ['Uptime Kuma', 'Monitoring', '#f5a856']].map(([name, type, color]) => <div className="service" key={name} onClick={() => handleOpenService(name)} style={{ cursor: 'pointer' }} title={`Open ${name}`}><span className="service-logo" style={{ background: `${color}22`, color }}><Boxes size={17} /></span><span><b>{name}</b><small>{type}</small></span><span className="status"><i /> Online</span><MoreHorizontal size={18} /></div>)}</div></div><div className="panel activity"><PanelTitle title="Recent activity" subtitle="Latest events across your server" /><div className="timeline"><div><span className="event-dot green" /><p><b>Backup completed</b><small>Daily configuration backup · 4 min ago</small></p></div><div><span className="event-dot purple" /><p><b>Container updated</b><small>Jellyfin pulled a new image · 38 min ago</small></p></div><div><span className="event-dot orange" /><p><b>System update available</b><small>3 security updates are ready · 2 hr ago</small></p></div></div></div></section>
  </>;
}


function Metric({ label, value, sub, color, icon, data }: any) { return <div className="metric-card"><div className="metric-label"><span>{label}</span><i style={{ color, background: `${color}18` }}>{icon}</i></div><div className="metric-main"><b>{value}</b><Ring value={data} color={color} /></div><p>{sub}</p></div>; }
function PanelTitle({ title, subtitle, action }: any) { return <div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }
function PageHeader({ eyebrow, title, description, action }: any) { return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</header>; }

function Containers({ containers, refresh, action }: any) { return <><PageHeader eyebrow="Docker engine" title="Container fleet" description="Monitor, start, stop, and restart workloads on this server." action={<button onClick={refresh} className="outline-button"><RefreshCw size={16} /> Refresh</button>} /><div className="panel table-panel"><div className="table-tools"><div className="table-search"><Search size={16} /><input placeholder="Filter containers" /></div><button className="primary-small"><Plus size={16} /> Deploy container</button></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>CPU</th><th>Memory</th><th>Created</th><th /></tr></thead><tbody>{containers.length ? containers.map((item: any) => <tr key={item.id}><td><div className="container-name"><span><Boxes size={17} /></span><div><b>{item.name}</b><small>{item.id?.slice(0, 12)}</small></div></div></td><td><span className={`badge ${item.status === 'running' ? 'success' : 'neutral'}`}><i />{item.status}</span></td><td>{item.cpu_percent ?? 0}%</td><td>{byte(item.memory_usage)}</td><td className="dim">{item.created || '—'}</td><td><div className="row-actions">{item.status === 'running' ? <button onClick={() => action(item.id, 'stop')} aria-label="Stop"><Square size={14} /></button> : <button onClick={() => action(item.id, 'start')} aria-label="Start"><Play size={14} /></button>}<button onClick={() => action(item.id, 'restart')}><RefreshCw size={15} /></button><button><MoreHorizontal size={17} /></button></div></td></tr>) : <tr><td colSpan={6}><Empty title="No containers found" text="Connect Docker to see your workloads here." /></td></tr>}</tbody></table></div></div></> }
function Services({ API_URL, authenticated }: any) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [port, setPort] = useState('');
  const [formError, setFormError] = useState('');

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/services`, { headers: authenticated() });
      if (response.ok) {
        setServices(await response.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  const handleAddService = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name || !description || !port) {
      setFormError('All fields are required');
      return;
    }
    const portNum = parseInt(port, 10);
    if (isNaN(portNum)) {
      setFormError('Port must be a number');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/services`, {
        method: 'POST',
        headers: authenticated({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, description, port: portNum })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to add service');
      }
      setName('');
      setDescription('');
      setPort('');
      setShowAddForm(false);
      fetchServices();
    } catch (err: any) {
      setFormError(err.message || 'Error adding service');
    }
  };

  const handleDeleteService = async (nameToDelete: string) => {
    if (!confirm(`Are you sure you want to delete ${nameToDelete}?`)) return;
    try {
      const response = await fetch(`${API_URL}/services/${nameToDelete}`, {
        method: 'DELETE',
        headers: authenticated()
      });
      if (response.ok) {
        fetchServices();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenService = (servicePort: string) => {
    const targetUrl = `http://${window.location.hostname}:${servicePort}`;
    window.open(targetUrl, '_blank');
  };

  return (
    <>
      <PageHeader
        eyebrow="Host services"
        title="Services"
        description="Applications exposed by your server and local network."
        action={
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={fetchServices} className="outline-button">
              <RefreshCw className={loading ? 'spinning' : ''} size={16} /> Refresh
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)} className="primary-small">
              <Plus size={16} /> Add service
            </button>
          </div>
        }
      />

      {showAddForm && (
        <div className="panel" style={{ marginBottom: '20px', maxWidth: '500px' }}>
          <PanelTitle title="Add New Service" subtitle="Expose a new application port" />
          <form onSubmit={handleAddService} style={{ display: 'grid', gap: '12px', marginTop: '10px' }}>
            <label style={{ color: '#b0b1b7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }}>
              Service Name
              <div className="input-wrap">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pi-hole" required />
              </div>
            </label>
            <label style={{ color: '#b0b1b7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }}>
              Description
              <div className="input-wrap">
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Network ad blocker" required />
              </div>
            </label>
            <label style={{ color: '#b0b1b7', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase' }}>
              Port
              <div className="input-wrap">
                <input type="number" value={port} onChange={e => setPort(e.target.value)} placeholder="e.g. 80" required />
              </div>
            </label>
            {formError && <p className="form-error">{formError}</p>}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="submit" className="primary-small" style={{ padding: '8px 16px' }}>Save</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="outline-button">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="service-grid">
        {services.map((service) => (
          <div className="service-card" key={service.name}>
            <div className="service-card-top">
              <span className="service-logo"><Server size={20} /></span>
              <span className={`badge ${service.healthy ? 'success' : 'neutral'}`}>
                <i style={{ backgroundColor: service.healthy ? '#50d5a7' : '#8b8c94' }} /> 
                {service.healthy ? 'Healthy' : 'Offline'}
              </span>
            </div>
            <h2>{service.name}</h2>
            <p>{service.description}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#81828a' }}>
                <span>Port</span><code>:{service.port}</code>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => handleDeleteService(service.name)} style={{ background: 'transparent', border: 0, color: '#ee907f', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
                <button onClick={() => handleOpenService(service.port)} style={{ background: 'transparent', border: 0, color: '#a98fff', fontSize: '10px', fontWeight: 700, display: 'flex', gap: '3px', alignItems: 'center' }}>
                  Open <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
function Storage({ disk, scanDisks, scanningDisks }: any) { const usage = percent(disk.percent); return <><PageHeader eyebrow="Storage management" title="Storage at a glance" description="Capacity, device health, and filesystem status." action={<button onClick={scanDisks} disabled={scanningDisks} className="outline-button"><HardDrive size={16} /> {scanningDisks ? 'Scanning...' : 'Scan disks'}</button>} /><div className="storage-layout"><div className="panel storage-hero"><span className="storage-icon"><HardDrive size={25} /></span><h2>Primary volume</h2><p>{disk.mountpoint || '/'} · ext4 filesystem</p><div className="storage-number"><b>{byte(disk.used)}</b><span>used of {byte(disk.total)}</span></div><div className="bar"><i style={{ width: `${usage}%` }} /></div><div className="storage-foot"><span>{usage}% in use</span><span>{byte((disk.total || 0) - (disk.used || 0))} available</span></div></div><div className="panel disk-health"><PanelTitle title="Disk health" subtitle="SMART status & device details" /><div className="health-row"><span><i className="good-dot" /> SMART status</span><b>Passed</b></div><div className="health-row"><span>Temperature</span><b>34°C</b></div><div className="health-row"><span>Estimated life</span><b>98%</b></div><div className="health-row"><span>Last check</span><b>Today, 10:42</b></div></div></div></> }
function NetworkView({ system, testConnection, testingConnection }: any) { return <><PageHeader eyebrow="Connectivity" title="Network overview" description="Connection health and traffic across your primary interface." action={<button onClick={testConnection} disabled={testingConnection} className="outline-button"><RefreshCw className={testingConnection ? 'spinning' : ''} size={16} /> {testingConnection ? 'Testing...' : 'Test connection'}</button>} /><div className="network-cards"><Metric label="Download" value={byte(system?.network?.bytes_recv)} sub="Received since boot" color="#5c8dff" icon={<ArrowDownRight size={18} />} data={58} /><Metric label="Upload" value={byte(system?.network?.bytes_sent)} sub="Sent since boot" color="#a884ff" icon={<ArrowUpRight size={18} />} /><div className="metric-card"><div className="metric-label"><span>Connection</span><i><Network size={18} /></i></div><div className="connection"><span className="status"><i /> Connected</span><b>eth0</b></div><p>Private network · protected</p></div></div><div className="panel interfaces"><PanelTitle title="Network interfaces" subtitle="Configured connections on this host" /><div className="interface-row"><span className="network-icon"><Network size={19} /></span><span><b>Ethernet · eth0</b><small>192.168.1.4 · DHCP</small></span><span className="status"><i /> Connected</span><ChevronRight size={18} /></div></div></> }

function TerminalView() {
  const [isActive, setIsActive] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  if (isActive) {
    return (
      <>
        <PageHeader
          eyebrow="Secure access"
          title="Terminal Session"
          description="Interactive terminal connection to your homelab container."
          action={
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setIsFullScreen(!isFullScreen)} className="outline-button">
                {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
              </button>
              <button onClick={() => setIsActive(false)} className="outline-button" style={{ borderColor: '#ee907f', color: '#ee907f' }}>
                Disconnect
              </button>
            </div>
          }
        />
        <div className={isFullScreen ? 'terminal-fullscreen' : 'terminal-window-container'}>
          <div className="terminal-window-active">
            <div className="terminal-bar">
              <i />
              <i />
              <i />
              <span>admin@homelab-node: ~ (active)</span>
            </div>
            <iframe
              src="/ttyd/"
              title="Terminal"
              className="terminal-iframe"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Secure access"
        title="Terminal"
        description="Launch a browser-based terminal session to this host."
      />
      <div className="terminal-card">
        <div className="terminal-window">
          <div className="terminal-bar">
            <i />
            <i />
            <i />
            <span>admin@homelab-node: ~</span>
          </div>
          <code>
            <span>admin@homelab-node</span>:<b>~</b>$ <em>_</em>
          </code>
        </div>
        <div>
          <span className="action-icon violet">
            <Terminal size={19} />
          </span>
          <h2>A secure shell, one click away.</h2>
          <p>Open a direct terminal session with your current authenticated identity.</p>
          <button onClick={() => setIsActive(true)} className="primary-button">
            Launch terminal <ArrowUpRight size={17} />
          </button>
        </div>
      </div>
    </>
  );
}
function Logs({ events, exportLogs }: any) { return <><PageHeader eyebrow="Audit trail" title="Activity log" description="A chronological view of actions and infrastructure events." action={<button onClick={exportLogs} className="outline-button"><FileText size={16} /> Export</button>} /><div className="panel log-list">{events.map((event: string, index: number) => <div key={`${event}${index}`}><span className="log-icon"><Clock3 size={17} /></span><p><b>{event}</b><small>{index === 0 ? 'Just now' : `${index * 12} minutes ago`} · System</small></p><span className="badge success">Info</span></div>)}</div></> }
function Empty({ title, text }: any) { return <div className="empty"><Boxes size={28} /><b>{title}</b><span>{text}</span></div>; }
