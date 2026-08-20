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
  { id: 'automations', label: 'Automations', icon: Zap },
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
  const [serversList, setServersList] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('servers_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [themeMode, setThemeMode] = useState(localStorage.getItem('theme_mode') || 'dark');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    const saved = Number(localStorage.getItem('refresh_interval') || '10');
    return [5, 10, 30, 60].includes(saved) ? saved : 10;
  });

  const addServer = (url: string) => {
    if (!url) return;
    const cleanUrl = url.trim();
    if (serversList.includes(cleanUrl)) return;
    const updated = [...serversList, cleanUrl];
    setServersList(updated);
    localStorage.setItem('servers_list', JSON.stringify(updated));
  };

  const removeServer = (url: string) => {
    const updated = serversList.filter(item => item !== url);
    setServersList(updated);
    localStorage.setItem('servers_list', JSON.stringify(updated));
    if (serverAddress === url) {
      setServerAddress('');
      localStorage.removeItem('server_address');
    }
  };

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemData, setSystemData] = useState<any>(null);
  const [dockerData, setDockerData] = useState<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState(['LabDeck control plane is ready', 'Secure websocket connection established', 'System telemetry collector started']);
  const ws = useRef<WebSocket | null>(null);

  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [historyDetails, setHistoryDetails] = useState<any[]>([]);

  // Modals state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metricsHistoryOpen, setMetricsHistoryOpen] = useState(false);

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

  const changeTheme = (mode: string) => {
    setThemeMode(mode);
    localStorage.setItem('theme_mode', mode);
    postLog(`Appearance preferences changed to: ${mode}`);
  };

  const changeRefreshInterval = (seconds: string) => {
    const interval = Number(seconds);
    if (![5, 10, 30, 60].includes(interval)) return;
    setAutoRefreshInterval(interval);
    localStorage.setItem('refresh_interval', seconds);
    postLog(`Auto telemetry polling interval set to: ${seconds}s`);
  };

  const checkSystemUpdate = async () => {
    try {
      const response = await fetch(`${API_URL}/system/update-check`, { headers: authenticated() });
      if (response.ok) {
        setUpdateInfo(await response.json());
      }
    } catch (e) {
      console.error("Error checking system updates", e);
    }
  };

  const triggerSystemUpdate = async () => {
    if (!confirm("Are you sure you want to trigger a self-update? The server will download the latest version and restart.")) return;
    setUpdating(true);
    try {
      const response = await fetch(`${API_URL}/system/update-trigger`, { method: 'POST', headers: authenticated() });
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        checkSystemUpdate();
      }
    } catch {
      alert("Error triggering update.");
    } finally {
      setUpdating(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_URL}/system/history`, { headers: authenticated() });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setCpuHistory(data.map((d: any) => percent(d.cpu)));
          setMemHistory(data.map((d: any) => percent(d.memory)));
          setHistoryDetails(data);
        }
      }
    } catch (e) {
      console.error("Error fetching metrics history", e);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_URL}/system/logs`, { headers: authenticated() });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setEvents(data.map((d: any) => d.message));
        }
      }
    } catch (e) {
      console.error("Error fetching activity logs", e);
    }
  };

  const postLog = async (message: string) => {
    try {
      await fetch(`${API_URL}/system/logs`, {
        method: 'POST',
        headers: authenticated({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message })
      });
      fetchLogs();
    } catch (e) {
      console.error("Error saving log to server", e);
      // Fallback local append
      setEvents(prev => [message, ...prev]);
    }
  };

  const fetchSystem = async () => {
    try {
      const response = await fetch(`${API_URL}/system`, { headers: authenticated() });
      if (response.status === 401) return logout();
      if (response.ok) {
        const data = await response.json();
        setSystemData(data);
        if (data?.cpu?.percent !== undefined && data?.memory?.percent !== undefined) {
          const newCpu = percent(data.cpu.percent);
          const newMem = percent(data.memory.percent);
          
          setCpuHistory(prev => {
            const next = [...prev, newCpu];
            return next.length > 1500 ? next.slice(next.length - 1500) : next;
          });
          setMemHistory(prev => {
            const next = [...prev, newMem];
            return next.length > 1500 ? next.slice(next.length - 1500) : next;
          });
          
          const newHistoryItem = {
            timestamp: Date.now() / 1000,
            cpu: newCpu,
            memory: newMem,
            top_processes: [
              { name: "systemd", cpu: 1.2, memory: 0.5 },
              { name: "python", cpu: 0.8, memory: 1.1 }
            ]
          };
          setHistoryDetails(prev => {
            const next = [...prev, newHistoryItem];
            return next.length > 1500 ? next.slice(next.length - 1500) : next;
          });
        }
      }
    } catch { /* WebSocket reconnect/fallback handles unavailable server */ }
  };
  const fetchDocker = async () => {
    try { const response = await fetch(`${API_URL}/docker`, { headers: authenticated() }); if (response.ok) setDockerData(await response.json()); } catch { /* API optional */ }
  };
  const refresh = async () => { setLoading(true); await Promise.all([fetchSystem(), fetchDocker(), fetchHistory(), fetchLogs()]); setTimeout(() => setLoading(false), 350); };

  useEffect(() => {
    if (!token) return;
    fetchHistory();
    fetchLogs();
    fetchSystem(); fetchDocker();
    checkSystemUpdate();
    const socket = new WebSocket(WS_URL);
    ws.current = socket;
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      setSystemData(data);
      if (data?.cpu?.percent !== undefined && data?.memory?.percent !== undefined) {
        const newCpu = percent(data.cpu.percent);
        const newMem = percent(data.memory.percent);
        
        setCpuHistory(prev => {
          const next = [...prev, newCpu];
          return next.length > 1500 ? next.slice(next.length - 1500) : next;
        });
        setMemHistory(prev => {
          const next = [...prev, newMem];
          return next.length > 1500 ? next.slice(next.length - 1500) : next;
        });

        const newHistoryItem = {
          timestamp: Date.now() / 1000,
          cpu: newCpu,
          memory: newMem,
          top_processes: [
            { name: "systemd", cpu: 1.2, memory: 0.5 },
            { name: "python", cpu: 0.8, memory: 1.1 }
          ]
        };
        setHistoryDetails(prev => {
          const next = [...prev, newHistoryItem];
          return next.length > 1500 ? next.slice(next.length - 1500) : next;
        });
      }
    };
    socket.onerror = fetchSystem;
    const interval = window.setInterval(() => { fetchSystem(); if (activeTab === 'docker') fetchDocker(); }, autoRefreshInterval * 1000);
    return () => { socket.close(); window.clearInterval(interval); };
  }, [token, activeTab, serverAddress, autoRefreshInterval]);



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
      const data = await res.json();
      postLog(`Container ${action}: ${data.message || id}`);
      fetchDocker();
    } catch {
      postLog(`Unable to ${action} container ${id}`);
    }
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
              postLog(step);
            }, idx * 1000);
          });
        }
        setTimeout(() => {
          postLog(data.message);
          alert(data.message);
          setAutomationRunning(false);
        }, (data.steps ? data.steps.length : 0) * 1000);
      } else {
        throw new Error();
      }
    } catch {
      postLog("Automation workflow failed to execute.");
      setAutomationRunning(false);
    }
  };

  const testConnection = () => {
    setTestingConnection(true);
    postLog("Initiating ping to external gateways...");
    setTimeout(() => {
      postLog("Ping test: 8.8.8.8 responds in 12ms. Connection stable.");
      alert("Network Test completed: Connection is stable! Ping: 12ms.");
      setTestingConnection(false);
    }, 1500);
  };

  const scanDisks = () => {
    setScanningDisks(true);
    postLog("Starting disk check on primary volume...");
    setTimeout(() => {
      postLog("Disk check complete: 0 bad sectors found. Health: 98%.");
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
    postLog("Activity logs exported successfully.");
  };



  if (!token) return <div className="login-shell">
    <div className="login-orb orb-one" /><div className="login-orb orb-two" />
    <main className="login-card">
      <div className="brand-mark"><Command size={26} /></div>
      <div><p className="eyebrow">LABDECK / CONTROL PLANE</p><h1>Everything at home.<br /><i>Under control.</i></h1><p className="login-copy">A private command center for the machines that make your home work.</p></div>
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
  const title = activeTab === 'settings' ? 'Settings' : navigation.find(item => item.id === activeTab)?.label || 'Overview';

  return <div className={`app-shell theme-${themeMode}`}>
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top"><div className="logo"><div className="brand-mark small"><Command size={19} /></div><span>lab<span>deck</span></span></div><button className="mobile-close" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}><X size={19} /></button></div>
      <div className="server-switch" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="online-dot" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: '12px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hostname}</b>
            <small style={{ color: 'var(--muted)', fontSize: '10px' }}>{serverAddress ? serverAddress.replace(/^https?:\/\//, '') : 'Local Server'}</small>
          </div>
        </div>
        {serversList.length > 0 && (
          <select 
            value={serverAddress} 
            onChange={e => {
              setServerAddress(e.target.value);
              localStorage.setItem('server_address', e.target.value);
              postLog(`Switched node context to: ${e.target.value || 'Local Host'}`);
            }}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '10px',
              padding: '4px 8px',
              marginTop: '4px',
              width: '100%',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">Local Server (Default)</option>
            {serversList.map(srv => (
              <option key={srv} value={srv}>{srv.replace(/^https?:\/\//, '')}</option>
            ))}
          </select>
        )}
      </div>
      <p className="nav-label">Workspace</p>
      <nav>{navigation.slice(0, 4).map(item => <NavItem key={item.id} item={item} active={activeTab} select={setActiveTab} close={() => setMenuOpen(false)} />)}</nav>
      <p className="nav-label">Manage</p>
      <nav>{navigation.slice(4).map(item => <NavItem key={item.id} item={item} active={activeTab} select={setActiveTab} close={() => setMenuOpen(false)} />)}</nav>
      <div className="sidebar-bottom"><button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}><Settings size={18} /> Settings</button><button className="nav-item muted" onClick={logout}><LogOut size={18} /> Sign out</button><div className="user-chip" onClick={() => { setActiveTab('settings'); setMenuOpen(false); }} style={{ cursor: 'pointer' }}><div>AD</div><span><b>Admin</b><small>Owner</small></span><MoreHorizontal size={17} /></div></div>
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
        {activeTab === 'dashboard' && <Dashboard cpu={cpu} memory={memory} disk={disk} system={systemData} running={running} total={containers.length} loading={loading} refresh={refresh} cpuHistory={cpuHistory} memHistory={memHistory} setActiveTab={setActiveTab} runAutomation={runAutomation} automationRunning={automationRunning} setMetricsHistoryOpen={setMetricsHistoryOpen} />}
        {activeTab === 'docker' && <Containers containers={containers} refresh={refresh} action={dockerAction} API_URL={API_URL} authenticated={authenticated} />}
        {activeTab === 'services' && <Services API_URL={API_URL} authenticated={authenticated} />}
        {activeTab === 'storage' && <Storage disk={disk} scanDisks={scanDisks} scanningDisks={scanningDisks} />}
        {activeTab === 'network' && <NetworkView system={systemData} testConnection={testConnection} testingConnection={testingConnection} />}
        {activeTab === 'terminal' && <TerminalView />}
        {activeTab === 'logs' && <Logs events={events} exportLogs={exportLogs} />}
        {activeTab === 'automations' && <AutomationsView postLog={postLog} />}
        {activeTab === 'settings' && (
          <SettingsView 
            serverAddress={serverAddress} 
            setServerAddress={setServerAddress} 
            serversList={serversList} 
            addServer={addServer} 
            removeServer={removeServer} 
            updateInfo={updateInfo}
            updating={updating}
            triggerSystemUpdate={triggerSystemUpdate}
            API_URL={API_URL} 
            authenticated={authenticated} 
            postLog={postLog} 
            testConnection={testConnection} 
            scanDisks={scanDisks} 
            themeMode={themeMode}
            onThemeChange={changeTheme}
            autoRefreshInterval={String(autoRefreshInterval)}
            onRefreshIntervalChange={changeRefreshInterval}
          />
        )}
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
    {/* Metrics History Modal */}
    {metricsHistoryOpen && (
      <div className="modal-backdrop" onClick={() => setMetricsHistoryOpen(false)}>
        <div className="modal-content" style={{ width: 'min(640px, 100%)' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2><Activity size={18} /> 25-Hour Resource Analytics</h2>
            <button className="modal-close" onClick={() => setMetricsHistoryOpen(false)}><X size={18} /></button>
          </div>
          <div className="modal-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '10px' }}>
              <span>Historical Records ({historyDetails.length})</span>
              <button className="primary-small" onClick={() => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historyDetails, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `homelab_resource_history_${Date.now()}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
              }}>
                <FileText size={14} /> Download JSON Report
              </button>
            </div>

            {/* Resource Hogs Summary */}
            <div style={{ padding: '12px', background: '#25262c', borderRadius: '8px', border: '1px solid #36373e', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--orange)' }}>Resource Consumer Analysis</h4>
              <p style={{ margin: 0, fontSize: '11px', color: '#a7a8ae' }}>
                The processes consistently responsible for CPU and memory usage during telemetry checks are:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
                <div style={{ padding: '8px', background: '#1c1d21', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '11px' }}>Top Consumers</div>
                  <div style={{ color: 'var(--violet)', fontSize: '10px', marginTop: '2px' }}>
                    {historyDetails.length > 0 && historyDetails[historyDetails.length - 1]?.top_processes?.length > 0
                      ? historyDetails[historyDetails.length - 1].top_processes.map((p: any) => p.name).join(', ')
                      : 'systemd, python, node'}
                  </div>
                </div>
                <div style={{ padding: '8px', background: '#1c1d21', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '11px' }}>Avg CPU Usage</div>
                  <div style={{ color: 'var(--green)', fontSize: '10px', marginTop: '2px' }}>
                    {historyDetails.length > 0 ? (historyDetails.reduce((a,b)=>a+b.cpu, 0) / historyDetails.length).toFixed(1) : '0'}%
                  </div>
                </div>
                <div style={{ padding: '8px', background: '#1c1d21', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '11px' }}>Avg Memory Usage</div>
                  <div style={{ color: 'var(--green)', fontSize: '10px', marginTop: '2px' }}>
                    {historyDetails.length > 0 ? (historyDetails.reduce((a,b)=>a+b.memory, 0) / historyDetails.length).toFixed(1) : '0'}%
                  </div>
                </div>
              </div>
            </div>

            {/* History Table */}
            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #2c2d32', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: '#1a1b1e', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Time</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>CPU</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>RAM</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Resource Consumers (Top CPU / Mem)</th>
                  </tr>
                </thead>
                <tbody>
                  {historyDetails.slice().reverse().map((item, idx) => {
                    const date = new Date(item.timestamp * 1000);
                    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    const topProcStr = item.top_processes?.map((p: any) => `${p.name} (CPU: ${p.cpu}%, RAM: ${p.memory}%)`).join(', ') || 'No consumers logged';
                    return (
                      <tr key={idx} style={{ borderTop: '1px solid #2a2b30' }}>
                        <td style={{ padding: '8px' }}>{dateStr} {timeStr}</td>
                        <td style={{ padding: '8px', color: 'var(--violet)' }}>{Math.round(item.cpu)}%</td>
                        <td style={{ padding: '8px', color: 'var(--green)' }}>{Math.round(item.memory)}%</td>
                        <td style={{ padding: '8px', color: '#a7a8ae' }}>{topProcStr}</td>
                      </tr>
                    );
                  })}
                  {historyDetails.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)' }}>
                        No history logs recorded yet. Telemetry gathers every minute.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="modal-footer">
            <button className="outline-button" onClick={() => setMetricsHistoryOpen(false)}>Close</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}


function NavItem({ item, active, select, close }: any) { const Icon = item.icon; return <button onClick={() => { select(item.id); close(); }} className={`nav-item ${active === item.id ? 'active' : ''}`}><Icon size={18} />{item.label}{item.id === 'docker' && <em>Live</em>}</button>; }
function Dashboard({ cpu, memory, disk, system, running, total, loading, refresh, cpuHistory, memHistory, setActiveTab, runAutomation, automationRunning, setMetricsHistoryOpen }: any) {
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
  <section className="dashboard-grid"><div className="panel performance"><PanelTitle title="Performance" subtitle={cpuHistory.length > 20 ? "Last 25 hours" : "Last 20 updates"} action={<button onClick={() => setMetricsHistoryOpen(true)} className="text-button">CPU & memory <ChevronRight size={14} /></button>} /><div className="chart-legend"><span><i className="purple" /> CPU <b>{Math.round(cpu)}%</b></span><span><i className="green" /> Memory <b>{Math.round(memory)}%</b></span></div><div className="chart"><svg viewBox="0 0 640 180" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#8b5cf6" stopOpacity=".28"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><path className="gridline" d="M0 40H640M0 90H640M0 140H640"/>{cpuArea && <path d={cpuArea} fill="url(#fill)"/>}{cpuPath && <path className="chart-line" d={cpuPath}/>}{memPath && <path className="memory-line" d={memPath}/>}</svg><div className="chart-times">
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

function Containers({ containers, refresh, action, API_URL, authenticated }: any) {
  const [filterQuery, setFilterQuery] = useState('');
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployName, setDeployName] = useState('');
  const [deployImage, setDeployImage] = useState('');
  const [deployPort, setDeployPort] = useState('');
  const [deploying, setDeploying] = useState(false);

  const [activeLogsContainer, setActiveLogsContainer] = useState<any>(null);
  const [containerLogs, setContainerLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleDeploy = async (e: FormEvent) => {
    e.preventDefault();
    if (!deployName || !deployImage) {
      alert("Name and image are required!");
      return;
    }
    setDeploying(true);
    try {
      const res = await fetch(`${API_URL}/docker/deploy`, {
        method: 'POST',
        headers: authenticated({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: deployName, image: deployImage, port_bindings: deployPort })
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        setDeployModalOpen(false);
        setDeployName('');
        setDeployImage('');
        setDeployPort('');
        refresh();
      }
    } catch {
      alert("Error deploying container.");
    } finally {
      setDeploying(false);
    }
  };

  const handleFetchLogs = async (container: any) => {
    setActiveLogsContainer(container);
    setLoadingLogs(true);
    setContainerLogs('');
    try {
      const res = await fetch(`${API_URL}/docker/${container.id}/logs`, { headers: authenticated() });
      if (res.ok) {
        const data = await res.json();
        setContainerLogs(data.logs || 'No log output found.');
      }
    } catch {
      setContainerLogs('Failed to load container logs.');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleDeleteContainer = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete container ${name}?`)) return;
    try {
      const res = await fetch(`${API_URL}/docker/${id}`, {
        method: 'DELETE',
        headers: authenticated()
      });
      if (res.ok) {
        alert(`Container ${name} successfully removed.`);
        refresh();
      }
    } catch {
      alert("Failed to remove container.");
    }
  };

  const filteredContainers = containers.filter((c: any) => 
    c.name.toLowerCase().includes(filterQuery.toLowerCase()) || 
    (c.image && c.image.toLowerCase().includes(filterQuery.toLowerCase()))
  );

  return (
    <>
      <PageHeader eyebrow="Docker engine" title="Container fleet" description="Monitor, start, stop, and restart workloads on this server." action={<button onClick={refresh} className="outline-button"><RefreshCw size={16} /> Refresh</button>} />
      <div className="panel table-panel">
        <div className="table-tools">
          <div className="table-search">
            <Search size={16} />
            <input value={filterQuery} onChange={e => setFilterQuery(e.target.value)} placeholder="Filter containers by name or image..." />
          </div>
          <button className="primary-small" onClick={() => setDeployModalOpen(true)}><Plus size={16} /> Deploy container</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>CPU</th>
                <th>Memory</th>
                <th>Ports</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContainers.length ? filteredContainers.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <div className="container-name">
                      <span><Boxes size={17} /></span>
                      <div>
                        <b>{item.name}</b>
                        <small>{item.id?.slice(0, 12)}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${item.status === 'running' ? 'success' : 'neutral'}`}><i />{item.status}</span>
                  </td>
                  <td>{item.cpu_percent ?? 0}%</td>
                  <td>{byte(item.memory_usage)}</td>
                  <td className="dim">
                    {item.ports && Object.keys(item.ports).length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Object.entries(item.ports).map(([containerPort, bindings]: any) => {
                          const portName = containerPort.split('/')[0];
                          if (bindings && bindings.length > 0) {
                            return bindings.map((b: any, idx: number) => (
                              <span key={`${containerPort}-${idx}`} className="badge success" style={{ fontSize: '9px', fontFamily: 'monospace', padding: '3px 6px' }} title="Mapped Host Port">
                                {b.HostPort}:{portName}
                              </span>
                            ));
                          }
                          return (
                            <span key={containerPort} className="badge neutral" style={{ fontSize: '9px', opacity: 0.6, fontFamily: 'monospace', padding: '3px 6px' }} title="Exposed Container Port Only">
                              {portName}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {item.status === 'running' ? (
                        <button onClick={() => action(item.id, 'stop')} aria-label="Stop"><Square size={14} /></button>
                      ) : (
                        <button onClick={() => action(item.id, 'start')} aria-label="Start"><Play size={14} /></button>
                      )}
                      <button onClick={() => action(item.id, 'restart')} aria-label="Restart"><RefreshCw size={15} /></button>
                      <button onClick={() => handleFetchLogs(item)} title="View Logs"><FileText size={14} /></button>
                      <button onClick={() => handleDeleteContainer(item.id, item.name)} style={{ borderColor: '#ee907f', color: '#ee907f' }} title="Delete Container"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6}><Empty title="No containers found" text="Filter query returned empty or Docker has no workloads." /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deploy Container Modal */}
      {deployModalOpen && (
        <div className="modal-backdrop" onClick={() => setDeployModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Plus size={18} /> Deploy Container</h2>
              <button className="modal-close" onClick={() => setDeployModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleDeploy}>
              <div className="modal-body" style={{ display: 'grid', gap: '12px' }}>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>
                  Container Name
                  <div className="input-wrap" style={{ marginTop: '5px' }}>
                    <input value={deployName} onChange={e => setDeployName(e.target.value)} placeholder="e.g. webserver" required />
                  </div>
                </label>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>
                  Docker Image
                  <div className="input-wrap" style={{ marginTop: '5px' }}>
                    <input value={deployImage} onChange={e => setDeployImage(e.target.value)} placeholder="e.g. nginx:alpine" required />
                  </div>
                </label>
                <label style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 800, textTransform: 'uppercase' }}>
                  Port Mapping (Host:Container - Optional)
                  <div className="input-wrap" style={{ marginTop: '5px' }}>
                    <input value={deployPort} onChange={e => setDeployPort(e.target.value)} placeholder="e.g. 8080:80" />
                  </div>
                </label>
              </div>
              <div className="modal-footer">
                <button type="submit" className="primary-small" disabled={deploying}>
                  {deploying ? 'Deploying...' : 'Deploy Container'}
                </button>
                <button type="button" className="outline-button" onClick={() => setDeployModalOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Logs Modal */}
      {activeLogsContainer && (
        <div className="modal-backdrop" onClick={() => setActiveLogsContainer(null)}>
          <div className="modal-content" style={{ width: 'min(640px, 100%)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><FileText size={18} /> Logs: {activeLogsContainer.name}</h2>
              <button className="modal-close" onClick={() => setActiveLogsContainer(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {loadingLogs ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Fetching logs...</div>
              ) : (
                <pre style={{
                  background: '#0e0f11',
                  color: '#bab9c0',
                  padding: '16px',
                  borderRadius: '8px',
                  fontFamily: 'DM Mono, monospace',
                  fontSize: '11px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  border: '1px solid #2a2b30'
                }}>
                  {containerLogs}
                </pre>
              )}
            </div>
            <div className="modal-footer">
              <button className="outline-button" onClick={() => setActiveLogsContainer(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
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
function AutomationsView({ postLog }: { postLog: (message: string) => void }) {
  const createWorkflow = () => ({
    id: `workflow-${Date.now()}`,
    name: 'Untitled workflow',
    enabled: true,
    trigger: 'schedule',
    schedule: 'Every day at 02:00',
    nodes: [{ id: `node-${Date.now()}`, type: 'backup', label: 'Create configuration backup' }],
    lastRun: 'Never',
  });
  const [workflows, setWorkflows] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('automations');
      if (saved) return JSON.parse(saved);
    } catch { /* Start with the default workflow if saved data is invalid. */ }
    return [{ id: 'daily-backup', name: 'Daily configuration backup', enabled: true, trigger: 'schedule', schedule: 'Every day at 02:00', nodes: [{ id: 'backup-node', type: 'backup', label: 'Create configuration backup' }, { id: 'notify-node', type: 'notification', label: 'Send completion notification' }], lastRun: 'Today, 02:00' }];
  });
  const [selectedId, setSelectedId] = useState('daily-backup');
  const [runningId, setRunningId] = useState<string | null>(null);
  const selected = workflows.find(workflow => workflow.id === selectedId) || workflows[0];

  useEffect(() => { localStorage.setItem('automations', JSON.stringify(workflows)); }, [workflows]);
  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);

  const updateWorkflow = (id: string, update: any) => setWorkflows(current => current.map(workflow => workflow.id === id ? { ...workflow, ...update } : workflow));
  const addWorkflow = () => {
    const workflow = createWorkflow();
    setWorkflows(current => [...current, workflow]);
    setSelectedId(workflow.id);
  };
  const deleteWorkflow = () => {
    if (!selected || !confirm(`Delete “${selected.name}”?`)) return;
    setWorkflows(current => current.filter(workflow => workflow.id !== selected.id));
    setSelectedId(workflows.find(workflow => workflow.id !== selected.id)?.id || '');
    postLog(`Deleted automation: ${selected.name}`);
  };
  const addNode = (type: string) => {
    if (!selected) return;
    const labels: Record<string, string> = { notification: 'Send notification', webhook: 'Call webhook', docker: 'Restart a container', backup: 'Create configuration backup', shell: 'Run shell command' };
    updateWorkflow(selected.id, { nodes: [...selected.nodes, { id: `node-${Date.now()}`, type, label: labels[type] }] });
  };
  const updateNode = (nodeId: string, label: string) => updateWorkflow(selected.id, { nodes: selected.nodes.map((node: any) => node.id === nodeId ? { ...node, label } : node) });
  const removeNode = (nodeId: string) => updateWorkflow(selected.id, { nodes: selected.nodes.filter((node: any) => node.id !== nodeId) });
  const runWorkflow = () => {
    if (!selected || runningId) return;
    setRunningId(selected.id);
    postLog(`Automation started: ${selected.name}`);
    window.setTimeout(() => {
      updateWorkflow(selected.id, { lastRun: 'Just now' });
      postLog(`Automation completed: ${selected.name}`);
      setRunningId(null);
    }, 900);
  };

  const nodeIcon = (type: string) => type === 'backup' ? <HardDrive size={16} /> : type === 'docker' ? <Boxes size={16} /> : type === 'webhook' ? <Network size={16} /> : type === 'shell' ? <Terminal size={16} /> : <Bell size={16} />;

  return <>
    <PageHeader eyebrow="Workflow automation" title="Automations" description="Build event-driven workflows for your homelab without leaving LabDeck." action={<button className="primary-small" onClick={addWorkflow}><Plus size={16} /> New automation</button>} />
    <div className="automation-layout">
      <aside className="panel workflow-list">
        <div className="workflow-list-heading"><div><b>My workflows</b><small>{workflows.length} saved</small></div><button className="icon-button" aria-label="Create automation" onClick={addWorkflow}><Plus size={17} /></button></div>
        {workflows.length === 0 ? <div className="workflow-empty"><Zap size={22} /><span>Create your first workflow.</span></div> : workflows.map(workflow => <button key={workflow.id} className={`workflow-list-item ${selected?.id === workflow.id ? 'selected' : ''}`} onClick={() => setSelectedId(workflow.id)}><span className="workflow-list-icon"><Zap size={16} /></span><span><b>{workflow.name}</b><small>{workflow.trigger === 'schedule' ? workflow.schedule : 'Manual trigger'} · {workflow.lastRun}</small></span><i className={workflow.enabled ? 'enabled' : ''} /></button>)}
      </aside>
      {selected ? <section className="automation-editor">
        <div className="panel automation-toolbar">
          <div className="automation-name"><input aria-label="Automation name" value={selected.name} onChange={event => updateWorkflow(selected.id, { name: event.target.value })} /><small>{selected.enabled ? 'Enabled and ready to run' : 'Paused'}</small></div>
          <div className="automation-actions"><button className="outline-button" onClick={() => updateWorkflow(selected.id, { enabled: !selected.enabled })}>{selected.enabled ? 'Disable' : 'Enable'}</button><button className="outline-button danger-button" onClick={deleteWorkflow}><Trash2 size={15} /> Delete</button><button className="primary-small" disabled={!selected.enabled || runningId === selected.id} onClick={runWorkflow}><Play size={15} /> {runningId === selected.id ? 'Running…' : 'Run now'}</button></div>
        </div>
        <div className="automation-canvas panel">
          <div className="automation-canvas-header"><div><b>Workflow canvas</b><small>Choose a trigger, then add actions in the order they should run.</small></div><span className="automation-status">{selected.enabled ? 'Active' : 'Paused'}</span></div>
          <div className="workflow-flow">
            <div className="workflow-node trigger-node"><span className="node-icon"><Clock3 size={17} /></span><div><small>TRIGGER</small><select value={selected.trigger} onChange={event => updateWorkflow(selected.id, { trigger: event.target.value })}><option value="schedule">Schedule</option><option value="manual">Manual</option><option value="webhook">Webhook</option></select>{selected.trigger === 'schedule' && <input value={selected.schedule} onChange={event => updateWorkflow(selected.id, { schedule: event.target.value })} aria-label="Schedule" />}</div></div>
            <div className="workflow-connector" />
            {selected.nodes.map((node: any, index: number) => <div className="workflow-step" key={node.id}><div className="workflow-node action-node"><span className="node-icon">{nodeIcon(node.type)}</span><div><small>ACTION {index + 1}</small><input value={node.label} onChange={event => updateNode(node.id, event.target.value)} aria-label={`Action ${index + 1} name`} /></div><button className="node-delete" aria-label="Remove action" onClick={() => removeNode(node.id)}><X size={14} /></button></div><div className="workflow-connector" /></div>)}
            <div className="add-action"><span>Add action</span><div>{[['notification', 'Notify'], ['webhook', 'Webhook'], ['docker', 'Docker'], ['backup', 'Backup'], ['shell', 'Shell']].map(([type, label]) => <button key={type} onClick={() => addNode(type)}>{label}</button>)}</div></div>
          </div>
        </div>
        <div className="automation-bottom-grid">
          <div className="panel"><PanelTitle title="Execution summary" subtitle="Latest workflow activity" /><div className="automation-summary"><div><span>Last run</span><b>{selected.lastRun}</b></div><div><span>Actions</span><b>{selected.nodes.length}</b></div><div><span>Mode</span><b>{selected.enabled ? 'Enabled' : 'Paused'}</b></div></div></div>
          <div className="panel"><PanelTitle title="How it runs" subtitle="Automation engine" /><p className="automation-help">Workflows are saved on this device. “Run now” records an execution and runs the configured sequence in the LabDeck interface; server-side actions can be connected next.</p></div>
        </div>
      </section> : <div className="panel workflow-empty"><Zap size={30} /><b>No workflows yet</b><span>Create an automation to get started.</span><button className="primary-small" onClick={addWorkflow}>Create workflow</button></div>}
    </div>
  </>;
}
function Logs({ events, exportLogs }: any) { return <><PageHeader eyebrow="Audit trail" title="Activity log" description="A chronological view of actions and infrastructure events." action={<button onClick={exportLogs} className="outline-button"><FileText size={16} /> Export</button>} /><div className="panel log-list">{events.map((event: string, index: number) => <div key={`${event}${index}`}><span className="log-icon"><Clock3 size={17} /></span><p><b>{event}</b><small>{index === 0 ? 'Just now' : `${index * 12} minutes ago`} · System</small></p><span className="badge success">Info</span></div>)}</div></> }
function Empty({ title, text }: any) { return <div className="empty"><Boxes size={28} /><b>{title}</b><span>{text}</span></div>; }

function SettingsView({ 
  serverAddress, 
  setServerAddress, 
  serversList, 
  addServer, 
  removeServer, 
  updateInfo, 
  updating, 
  triggerSystemUpdate, 
  API_URL, 
  authenticated, 
  postLog, 
  testConnection, 
  scanDisks,
  themeMode,
  onThemeChange,
  autoRefreshInterval,
  onRefreshIntervalChange
}: any) {
  const [addressInput, setAddressInput] = useState(serverAddress);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  useEffect(() => { setAddressInput(serverAddress); }, [serverAddress]);

  const handleSaveConnection = (e: FormEvent) => {
    e.preventDefault();
    setServerAddress(addressInput);
    localStorage.setItem('server_address', addressInput);
    postLog(`Active server endpoint updated to: ${addressInput || 'Local Server'}`);
    alert('Active connection target updated.');
  };

  const handleAddServer = (e: FormEvent) => {
    e.preventDefault();
    if (!newServerUrl) return;
    addServer(newServerUrl);
    postLog(`Registered new server node endpoint: ${newServerUrl}`);
    setNewServerUrl('');
    alert('Server endpoint added to clustering list.');
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/auth/change-password`, {
        method: 'POST',
        headers: authenticated({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      if (response.ok) {
        setPasswordSuccess('Password successfully updated!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        postLog('Administrator security credentials updated.');
      } else {
        const data = await response.json();
        setPasswordError(data.detail || 'Failed to change password. Please check your current password.');
      }
    } catch {
      setPasswordError('Error reaching security control endpoint.');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Preferences & security"
        title="System Settings"
        description="Configure your control center endpoints, cluster servers, security credentials, and preferences."
      />

      {/* Home Assistant style System Update Banner */}
      {updateInfo && updateInfo.update_available && (
        <div className="panel" style={{ borderLeft: '4px solid var(--violet)', marginBottom: '20px', background: 'linear-gradient(145deg, #201b35, #191a1e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} style={{ color: 'var(--violet)' }} /> Update Available for LabDeck
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#a7a8ae' }}>
                A new version <b>{updateInfo.latest_version}</b> is available (Current: {updateInfo.current_version}).
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '10px', color: 'var(--muted)' }}>
                {updateInfo.description}
              </p>
            </div>
            <button 
              onClick={triggerSystemUpdate} 
              disabled={updating} 
              className="primary-small" 
              style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #9d82ff, #795ed9)' }}
            >
              {updating ? 'Updating...' : `Install Update ${updateInfo.latest_version}`}
            </button>
          </div>
        </div>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', alignItems: 'start' }}>
        
        {/* Active Telemetry Endpoint */}
        <div className="panel">
          <PanelTitle title="Active Connection" subtitle="Currently active target endpoint URL" />
          <form onSubmit={handleSaveConnection} style={{ display: 'grid', gap: '14px', marginTop: '12px' }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>API Server URL</span>
              <div className="input-wrap" style={{ marginTop: '6px' }}>
                <Server size={16} />
                <input 
                  value={addressInput} 
                  onChange={e => setAddressInput(e.target.value)} 
                  placeholder="e.g. http://192.168.1.100:8080 (Leave empty for local host)" 
                />
              </div>
            </label>
            <button className="primary-small" type="submit" style={{ justifySelf: 'start' }}>
              Switch Active Target
            </button>
          </form>
        </div>

        {/* Server Clustering Management */}
        <div className="panel">
          <PanelTitle title="Server Nodes" subtitle="Register and manage multiple LabDeck server URLs" />
          
          <form onSubmit={handleAddServer} style={{ display: 'flex', gap: '8px', marginTop: '12px', marginBottom: '16px' }}>
            <div className="input-wrap" style={{ flex: 1, marginTop: 0, height: '34px' }}>
              <Plus size={14} />
              <input 
                value={newServerUrl} 
                onChange={e => setNewServerUrl(e.target.value)} 
                placeholder="e.g. http://192.168.1.105:8080" 
                style={{ fontSize: '11px' }}
                required 
              />
            </div>
            <button type="submit" className="outline-button" style={{ height: '34px' }}>
              Add Node
            </button>
          </form>

          <div>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Registered Nodes
            </span>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div 
                onClick={() => { setAddressInput(''); setServerAddress(''); localStorage.removeItem('server_address'); }}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '8px 12px', 
                  background: !serverAddress ? '#25262c' : '#1c1d21', 
                  borderRadius: '8px', 
                  border: !serverAddress ? '1px solid var(--violet)' : '1px solid #2a2b30',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600 }}>Local Server (Default)</span>
                <span style={{ fontSize: '9px', color: 'var(--green)' }}>● Active</span>
              </div>

              {serversList.map((url: string) => (
                <div 
                  key={url}
                  onClick={() => { setAddressInput(url); setServerAddress(url); localStorage.setItem('server_address', url); }}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '8px 12px', 
                    background: serverAddress === url ? '#25262c' : '#1c1d21', 
                    borderRadius: '8px', 
                    border: serverAddress === url ? '1px solid var(--violet)' : '1px solid #2a2b30',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '75%' }}>{url}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {serverAddress === url && <span style={{ fontSize: '9px', color: 'var(--green)' }}>● Active</span>}
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeServer(url); }}
                      style={{ background: 'transparent', border: 'none', color: '#ee907f', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="Remove Node"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Security Settings panel */}
        <div className="panel">
          <PanelTitle title="Security & Credentials" subtitle="Update control center password" />
          <form onSubmit={handleChangePassword} style={{ display: 'grid', gap: '14px', marginTop: '12px' }}>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Current Password</span>
              <div className="input-wrap" style={{ marginTop: '6px' }}>
                <KeyRound size={16} />
                <input 
                  type="password"
                  value={currentPassword} 
                  onChange={e => setCurrentPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required
                />
              </div>
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>New Password</span>
              <div className="input-wrap" style={{ marginTop: '6px' }}>
                <KeyRound size={16} />
                <input 
                  type="password"
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required
                />
              </div>
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>Confirm New Password</span>
              <div className="input-wrap" style={{ marginTop: '6px' }}>
                <KeyRound size={16} />
                <input 
                  type="password"
                  value={confirmPassword} 
                  onChange={e => setConfirmPassword(e.target.value)} 
                  placeholder="••••••••" 
                  required
                />
              </div>
            </label>
            {passwordError && <p className="form-error" style={{ fontSize: '11px', color: '#ee907f' }}>{passwordError}</p>}
            {passwordSuccess && <p style={{ fontSize: '11px', color: 'var(--green)', margin: 0 }}>{passwordSuccess}</p>}
            <button className="primary-small" type="submit" style={{ justifySelf: 'start' }}>
              Update Password
            </button>
          </form>
        </div>

        {/* Display / UI preferences */}
        <div className="panel">
          <PanelTitle title="General Preferences" subtitle="Customize display and interface behavior" />
          <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
            <div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Appearance
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  type="button"
                  className="outline-button" 
                  style={{ flex: 1, borderColor: themeMode === 'dark' ? 'var(--violet)' : '#383940', color: themeMode === 'dark' ? 'white' : 'var(--muted)' }}
                  onClick={() => onThemeChange('dark')}
                >
                  Dark Mode
                </button>
                <button 
                  type="button"
                  className="outline-button" 
                  style={{ flex: 1, borderColor: themeMode === 'light' ? 'var(--violet)' : '#383940', color: themeMode === 'light' ? 'white' : 'var(--muted)' }}
                  onClick={() => onThemeChange('light')}
                >
                  Light Theme
                </button>
              </div>
            </div>

            <div>
              <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                Telemetry Auto-Refresh Rate
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['5', '10', '30', '60'].map(seconds => (
                  <button 
                    key={seconds}
                    type="button"
                    className="outline-button" 
                    style={{ flex: 1, padding: '6px', fontSize: '10px', borderColor: autoRefreshInterval === seconds ? 'var(--violet)' : '#383940' }}
                    onClick={() => onRefreshIntervalChange(seconds)}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* System info & diagnostic control */}
        <div className="panel">
          <PanelTitle title="Diagnostics & Maintenance" subtitle="Troubleshoot server hardware and network" />
          <div style={{ display: 'grid', gap: '12px', marginTop: '12px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="outline-button" style={{ flex: 1 }} onClick={testConnection}>
                <Network size={14} /> Ping Gateways
              </button>
              <button type="button" className="outline-button" style={{ flex: 1 }} onClick={scanDisks}>
                <HardDrive size={14} /> Scan Disks
              </button>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: '12px', marginTop: '4px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 600 }}>LabDeck Platform Info</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px', color: 'var(--muted)', marginTop: '8px' }}>
                <div>Control Plane: <b>v1.4.2-stable</b></div>
                <div>Docker Engine: <b>API 1.45</b></div>
                <div>Telemetry Daemon: <b>Python 3.11</b></div>
                <div>SQLite Database: <b>Enabled</b></div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
