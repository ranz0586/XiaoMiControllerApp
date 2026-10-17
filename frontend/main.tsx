import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowUpRight, ChevronRight, CircleHelp, Droplets, Fan, Filter, Leaf, LoaderCircle, LockKeyhole, Plus, Power, RefreshCw, Settings2, ShieldCheck, SlidersHorizontal, Thermometer, Trash2, Volume2, Wind, X } from 'lucide-react';
import { api, demoDevices, demoHistory, demoReading, type Action, type Device, type Reading } from './api';
import './styles.css';
import { DiscoveryPanel } from './DiscoveryPanel';
import { isAndroid } from './native';
import { useAppActive } from './lifecycle';
import { App as NativeApp } from '@capacitor/app';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';

const value = (number: number | null | undefined, unit = '') => number == null ? '—' : `${number}${unit}`;
const modeLabel = (mode: string | null) => mode === 'silent' ? 'Sleep' : mode === 'favorite' ? 'Favorite' : mode === 'auto' ? 'Auto' : mode || '—';

function Purifier({ power, small = false }: { power: boolean; small?: boolean }) {
  return <div className={`purifier ${small ? 'small' : ''} ${power ? 'on' : ''}`} aria-hidden="true"><div className="purifier-top"/><div className="purifier-screen"><span className="screen-dot"/><span>mi</span></div><div className="purifier-vents"/><div className="purifier-brand">mi</div></div>;
}

function History({ readings }: { readings: Reading[] }) {
  const points = readings.filter(item => item.aqi != null);
  const maximum = Math.max(40, ...points.map(item => item.aqi!));
  const coords = points.map((item, i) => `${40 + i / Math.max(1, points.length - 1) * 620},${145 - item.aqi! / maximum * 120}`);
  return <section className="panel history"><div className="panel-heading"><div><h3>Air quality over time</h3><p>PM2.5 concentration · µg/m³</p></div><span className="tag neutral">Last {readings.length} readings</span></div>
    {points.length < 2 ? <div className="chart-empty">Your chart will appear after two readings.</div> : <><p className="chart-range">Scale: 0–{maximum} µg/m³</p><svg viewBox="0 0 690 175" role="img" aria-label={`PM2.5 history from ${points[0].aqi} to ${points.at(-1)?.aqi} micrograms per cubic meter`}>
      <defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#84a87d" stopOpacity=".28"/><stop offset="100%" stopColor="#84a87d" stopOpacity="0"/></linearGradient></defs>
      {[0, 1, 2].map(i => <g key={i}><line x1="40" x2="660" y1={25 + i * 60} y2={25 + i * 60} stroke="#eaede7" strokeDasharray="4 5"/><text x="6" y={29 + i * 60} fill="#959b91" fontSize="11">{Math.round(maximum * (1 - i / 2))}</text></g>)}
      <polygon points={`40,145 ${coords.join(' ')} 660,145`} fill="url(#chart-fill)"/><polyline points={coords.join(' ')} fill="none" stroke="#75986c" strokeWidth="2.5" strokeLinejoin="round"/><circle cx="660" cy={145 - points.at(-1)!.aqi! / maximum * 120} r="4" fill="#75986c"/>
    </svg><div className="chart-times"><span>{new Date(points[0].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>{new Date(points.at(-1)!.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div></>}
  </section>;
}

function DeviceForm({ device, close, saved }: { device: Device | null; close: () => void; saved: () => void }) {
  const [models, setModels] = useState<{ model: string; protocol: string }[]>([]);
  const [form, setForm] = useState({ name: device?.name || '', ip: device?.ip || '', token: '', model: device?.model || 'zhimi.airpurifier.mb3' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    api<typeof models>('/models').then(setModels).catch(e => setError(e.message));
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(device ? `/devices/${device.id}` : '/devices', { method: device ? 'PUT' : 'POST', body: JSON.stringify(form) }); saved(); close(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <dialog ref={dialog} onCancel={close} className="device-dialog"><form onSubmit={submit}>
    <div className="dialog-title"><div><span className="eyebrow">YOUR HOME, CONNECTED</span><h2>{device ? 'Device settings' : 'Add a purifier'}</h2></div><button type="button" className="icon-button" onClick={close} aria-label="Close"><X size={20}/></button></div>
    <p>Use your purifier’s local IP address and 32-character miIO token. {isAndroid() ? 'Your phone and purifier must share a Wi-Fi network.' : 'Your computer and purifier must share a network.'}</p>
    <label>Room or device name<input autoFocus required maxLength={60} placeholder="e.g. Living room" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
    <label>Local IPv4 address<input required placeholder="192.168.1.42" value={form.ip} onChange={e => setForm({ ...form, ip: e.target.value.trim() })}/></label>
    <label>Device model<select value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}>{!models.length && <option>{form.model}</option>}{models.map(item => <option key={item.model} value={item.model}>{item.model} · {item.protocol}</option>)}</select></label>
    <label>miIO token<input type="password" required autoComplete="new-password" pattern="[0-9a-fA-F]{32}" minLength={32} maxLength={32} placeholder={device ? 'Re-enter token to save changes' : '32 hexadecimal characters'} value={form.token} onChange={e => setForm({ ...form, token: e.target.value.trim() })}/></label>
    <p className="form-note"><ShieldCheck size={15}/> {isAndroid() ? 'Credentials are encrypted on this phone using Android Keystore.' : 'Credentials stay in the local Python backend.'}</p>
    {error && <div role="alert" className="error">{error}</div>}
    <div className="dialog-actions"><button className="button secondary" type="button" onClick={close}>Cancel</button><button className="button primary" disabled={busy || !models.length}>{busy ? 'Saving…' : device ? 'Save changes' : 'Add device'}</button></div>
  </form></dialog>;
}

function App() {
  const [view, setView] = useState<'overview' | 'controls' | 'history' | 'device'>('overview');
  const viewNames = { overview: 'Overview', controls: 'Controls', history: 'History', device: 'Device' };
  function changeView(next: typeof view) {
    setView(next); setRemoving(false); setResettingFilter(false); document.querySelector('main')?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 });
  }
  const [initializing, setInitializing] = useState(true);
  const [demo, setDemo] = useState(false); const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState('');
  const [readings, setReadings] = useState<Record<string, Reading>>({});
  const [history, setHistory] = useState<Reading[]>([]);
  const [deviceErrors, setDeviceErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{ device: Device | null } | null>(null); const [help, setHelp] = useState(false);
  const [removing, setRemoving] = useState(false); const [notice, setNotice] = useState(''); const [level, setLevel] = useState(5);
  const [resettingFilter, setResettingFilter] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const version = useRef(0); const commandPending = useRef(false); const revision = useRef(0);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const suspend = useCallback(() => { revision.current++; }, []);
  const active = useAppActive(suspend);
  const device = devices.find(item => item.id === selected); const reading = readings[selected];
  const offline = Boolean(deviceErrors[selected]); const canControl = Boolean(reading) && active && !offline && !busy && !loading && !networkBusy;

  useEffect(() => {
    if (!isAndroid()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (resettingFilter) setResettingFilter(false);
      else if (form) setForm(null);
      else if (help) setHelp(false);
      else if (removing) setRemoving(false);
      else if (view !== 'overview') changeView('overview');
      else void NativeApp.exitApp();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [form, help, removing, resettingFilter, view]);
  useEffect(() => { setResettingFilter(false); }, [selected, active, demo]);

  async function loadDevices(initial = false) {
    const current = version.current; setLoading(true); setError('');
    try { const list = await api<Device[]>('/devices'); if (version.current !== current) return;
      if (initial) setInitializing(false);
      if (initial && !list.length) { switchDemo(true); return; }
      setDevices(list); setSelected(id => list.some(d => d.id === id) ? id : list[0]?.id || '');
    } catch (e) { if (version.current === current) { setError((e as Error).message); if (initial) setInitializing(false); } }
    finally { if (version.current === current) setLoading(false); }
  }
  function switchDemo(next: boolean) {
    version.current++; setDemo(next); setReadings({}); setHistory([]); setDeviceErrors({}); setError(''); setNotice(''); setRemoving(false); setBusy(false); setLoading(false);
    if (next) { setDevices(demoDevices); setSelected(demoDevices[0].id); setReadings({ [demoDevices[0].id]: demoReading(0), [demoDevices[1].id]: demoReading(1) }); }
    else { setDevices([]); setSelected(''); }
  }
  useEffect(() => { if (!demo && active) void loadDevices(initializing); }, [demo, active]);
  useEffect(() => {
    if (!device || !active || networkBusy) return;
    if (demo) { setHistory(demoHistory(readings[selected] || demoReading(0))); return; }
    let cancelled = false; let inFlight = false;
    async function poll() {
      if (inFlight || commandPending.current) return;
      inFlight = true;
      const currentRevision = revision.current;
      try {
        const savedItems = await api<Reading[]>(`/devices/${selected}/history`);
        if (!cancelled && currentRevision === revision.current) {
          setHistory(savedItems);
          const last = savedItems.at(-1);
          if (last) setReadings(prev => prev[selected] ? prev : { ...prev, [selected]: last });
        }
        const status = await api<Reading>(`/devices/${selected}/status`);
        if (!cancelled && currentRevision === revision.current) { setReadings(prev => ({ ...prev, [selected]: status })); setDeviceErrors(prev => ({ ...prev, [selected]: '' })); }
        const items = await api<Reading[]>(`/devices/${selected}/history`);
        if (!cancelled && currentRevision === revision.current) setHistory(items);
      } catch (e) { if (!cancelled && currentRevision === revision.current) setDeviceErrors(prev => ({ ...prev, [selected]: (e as Error).message })); }
      finally { inFlight = false; }
    }
    setHistory([]); setDeviceErrors(prev => ({ ...prev, [selected]: 'Connecting to purifier…' }));
    void poll(); const timer = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [demo, selected, devices, active, networkBusy]);
  useEffect(() => { setLevel(reading?.favorite_level ?? 5); }, [reading?.favorite_level, selected]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);

  function applyLevel(value: string) {
    const next = Number(value);
    if (canControl && next !== reading?.favorite_level) void command('favorite_level', next);
  }

  async function command(action: Action, newValue: boolean | string | number) {
    if (!device || !active || commandPending.current) return;
    const current = version.current; const id = selected;
    revision.current++;
    setBusy(true); setError(''); commandPending.current = true;
    try {
      let next: Reading;
      if (demo) { next = { ...reading, ...(action === 'reset_filter' ? { filter_life_remaining: 100, filter_hours_used: 0 } : { [action]: newValue }), timestamp: new Date().toISOString() }; }
      else { next = await api<Reading>(`/devices/${id}/commands`, { method: 'POST', body: JSON.stringify({ action, value: newValue }) }); }
      if (current !== version.current) return;
      setReadings(prev => ({ ...prev, [id]: next }));
      if (action === 'favorite_level' && selectedRef.current === id) setLevel(next.favorite_level ?? 5);
      if (selectedRef.current === id) setHistory(prev => [...prev.slice(-719), next]);
      setNotice(demo ? 'Demo updated · no hardware command sent' : 'Command sent and device state refreshed');
    } catch (e) { if (current === version.current) { if (action === 'favorite_level' && selectedRef.current === id) setLevel(reading?.favorite_level ?? 5); setError((e as Error).message); setDeviceErrors(prev => ({ ...prev, [id]: 'Refresh the device to verify its current state.' })); } }
    finally { revision.current++; commandPending.current = false; if (current === version.current) setBusy(false); }
  }
  async function refresh() {
    if (!active || commandPending.current) return;
    if (!device) { if (!demo) await loadDevices(); return; }
    if (demo) { setNotice('Demo readings refreshed'); return; }
    const current = version.current; const id = selected; setLoading(true); setError('');
    const currentRevision = ++revision.current;
    try {
      const next = await api<Reading>(`/devices/${id}/status`); const items = await api<Reading[]>(`/devices/${id}/history`);
      if (current !== version.current || selectedRef.current !== id || currentRevision !== revision.current) return;
      setReadings(prev => ({ ...prev, [id]: next })); setDeviceErrors(prev => ({ ...prev, [id]: '' })); setHistory(items);
    } catch (e) { if (current === version.current && currentRevision === revision.current) setDeviceErrors(prev => ({ ...prev, [id]: (e as Error).message })); }
    finally { if (current === version.current) setLoading(false); }
  }
  async function remove() {
    if (!device) return; setBusy(true); setError('');
    try { await api(`/devices/${device.id}`, { method: 'DELETE' }); setRemoving(false); await loadDevices(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (initializing) return <div className="empty" role="status"><LoaderCircle size={28} className="spin"/><p>Loading saved purifiers…</p></div>;

  return <div className="app-shell" data-view={view}>
    <aside className="sidebar"><a className="brand" href="#"><span className="brand-icon"><Wind size={25}/></span>air<span>studio</span><span className="brand-period">.</span></a>
      <div className="workspace"><div className="home-icon"><Leaf size={18}/></div><div><strong>My home</strong><span>A little room to breathe</span></div></div>
      <span className="nav-label">WORKSPACE</span><a className="nav-item active" href="#"><Activity size={18}/>Overview<span className="nav-dot"/></a><button className="nav-item" onClick={() => setHelp(true)}><CircleHelp size={18}/>Connection guide</button>
      <div className="device-heading"><span className="nav-label">YOUR PURIFIERS</span><span>{devices.length.toString().padStart(2, '0')}</span></div>
      <div className="device-list">{devices.map(item => <button key={item.id} className={`device-nav ${selected === item.id ? 'selected' : ''}`} onClick={() => { setSelected(item.id); setRemoving(false); setError(''); }}><div className="device-mini"><Fan size={18}/></div><div><strong>{item.name}</strong><span>{readings[item.id]?.power == null ? 'Awaiting connection' : readings[item.id].power ? 'Purifying' : 'Standby'}</span></div><i className={deviceErrors[item.id] ? 'offline-dot' : readings[item.id] ? 'online-dot' : 'pending-dot'}/></button>)}</div>
      <button className="add-device" onClick={() => { if (demo) switchDemo(false); setForm({ device: null }); }}><Plus size={17}/>Add a purifier</button>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={18}/><div><strong>Local by design</strong><span>Connected through python-miio</span></div></div><div className="profile"><span>H</span><div><strong>Home workspace</strong><small>Personal dashboard</small></div><Settings2 size={17}/></div></div>
    </aside>
    <main><header className="topbar"><label className="mobile-device-select">Purifier<select aria-label="Selected purifier" value={selected} disabled={!devices.length} onChange={e => { setSelected(e.target.value); setRemoving(false); setError(''); }}>{!devices.length && <option value="">No saved devices</option>}{devices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div>My home <ChevronRight size={14}/><strong>Overview</strong></div><span><i className={demo ? 'pending-dot' : 'online-dot'}/>{demo ? 'Demo workspace' : 'Local workspace'}</span></header>
    <div className="main-content"><div className="mobile-view-heading"><h1>{viewNames[view]}</h1><button className="icon-button" aria-label="Connection guide" onClick={() => setHelp(true)}><CircleHelp size={22}/></button></div><div className="page-heading"><div><span className="eyebrow">BREATHE A LITTLE EASIER</span><h1>Your air, at a glance<span>.</span></h1><p>A comfortable home starts with the air around you.</p></div><button className="button secondary" onClick={refresh} disabled={loading || busy || networkBusy}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Refreshing' : 'Refresh'}</button></div>
      <div className={`demo-banner ${demo ? 'is-demo' : 'is-live'}`}><div><span className="banner-icon"><SlidersHorizontal size={16}/></span><p><strong>{demo ? 'You’re exploring demo mode.' : 'You’re in live mode.'}</strong> {demo ? 'Sample readings, real possibilities. Connect your purifier when you’re ready.' : 'Readings and controls use your saved purifier credentials.'}</p></div><button onClick={() => switchDemo(!demo)} disabled={busy || networkBusy}>{demo ? 'Connect my devices' : 'Explore demo'}<ArrowUpRight size={15}/></button></div>
      {error && <div className="error" role="alert">{error}</div>}
      {deviceErrors[selected] && <div className="error" role="alert">{deviceErrors[selected]} {reading && 'Showing the last successful reading.'}</div>}
      <DiscoveryPanel saved={demo ? [] : devices} active={active} blocked={busy || loading} pending={setNetworkBusy} start={() => { revision.current++; if (demo) switchDemo(false); }} added={async addedDevice => { await loadDevices(); setSelected(addedDevice.id); changeView('overview'); setNotice('Purifier added with verified token'); }}/>
      {!device ? <section className="panel empty"><Wind size={46}/><h2>Make room for fresher air.</h2><p>{loading ? 'Loading your devices…' : 'Add your Xiaomi purifier to start monitoring and controlling it.'}</p><button className="button primary" onClick={() => setForm({ device: null })}><Plus size={17}/>Add your first purifier</button></section> : <>
      <div className="section-heading"><div><h2>{device.name}</h2><span className={`tag ${offline ? 'warning' : 'good'}`}><i className={offline ? 'offline-dot' : 'online-dot'}/>{offline ? 'Unavailable' : reading ? 'Connected' : 'Connecting…'}</span></div><span className="updated">{reading ? `${demo ? 'Sample data' : 'Last updated'} · ${new Date(reading.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for the first reading'}</span></div>
      <div className="device-tools"><button className="button secondary" disabled={demo || busy} onClick={() => setForm({ device })}><Settings2 size={20}/>Device settings</button></div><div className="dashboard-grid"><section className="panel air-panel"><div className="panel-heading"><h3>Air quality</h3><Wind size={19}/></div><div className="air-reading"><span className="air-number">{value(reading?.aqi)}</span><div><span className={`quality ${reading?.aqi != null && reading.aqi > 35 ? 'elevated' : ''}`}>{reading?.aqi == null ? 'Awaiting reading' : reading.aqi <= 15 ? 'Low particles' : reading.aqi <= 35 ? 'Moderate particles' : 'Elevated particles'}</span><p>PM2.5 <span>µg/m³</span></p></div></div><div className="air-scale"><i/><i/><i/><i/><i/></div><div className="scale-labels"><span>Lower</span><span>Higher</span></div><p className="air-caption"><Leaf size={16}/> {reading?.aqi != null && reading.aqi <= 15 ? 'A fresh start for your space.' : 'Keep an eye on your indoor air.'}</p><div className="environment"><div><Thermometer size={20}/><span>Temperature<strong>{value(reading?.temperature, '°C')}</strong></span></div><div><Droplets size={20}/><span>Humidity<strong>{value(reading?.humidity, '%')}</strong></span></div></div></section>
      <section className="panel purifier-panel"><div className="panel-heading"><div><h3>Your purifier</h3><p>{device.model}</p></div><button className="icon-button" aria-label="Device settings" disabled={demo || busy} onClick={() => setForm({ device })}><Settings2 size={19}/></button></div><div className="purifier-stage"><div className="air-orbit orbit-one"/><div className="air-orbit orbit-two"/><Purifier power={reading?.power ?? false}/><div className="purifier-state"><i className={reading?.power ? 'online-dot' : 'pending-dot'}/>{reading?.power == null ? 'Power unknown' : reading.power ? 'Making good air' : 'Taking a breather'}</div></div><div className="purifier-footer"><div><span>POWER</span><strong>{reading?.power == null ? 'Power unknown' : reading.power ? 'Purifying your space' : 'Standby'}</strong></div><button className={`power-button ${reading?.power ? 'powered' : ''}`} aria-label={reading?.power ? 'Turn purifier off' : 'Turn purifier on'} disabled={!canControl || reading?.power == null} onClick={() => command('power', !reading.power)}>{busy ? <LoaderCircle size={20} className="spin"/> : <Power size={20}/>}</button></div></section>
      <section className="panel controls"><div className="panel-heading"><h3>Purifier controls</h3><SlidersHorizontal size={18}/></div><label className="control-label">OPERATING MODE</label><div className="mode-buttons">{(['auto', 'silent', 'favorite'] as const).map(mode => <button key={mode} className={reading?.mode === mode ? 'chosen' : ''} disabled={!canControl || !reading?.modes?.includes(mode)} onClick={() => command('mode', mode)}>{mode === 'auto' ? <Wind size={19}/> : mode === 'silent' ? <span className="moon" aria-hidden="true">☾</span> : <Fan size={19}/>}<span>{modeLabel(mode)}</span></button>)}</div><p className="mode-description">{reading?.mode == null ? 'Operating mode unknown.' : reading.mode === 'silent' ? 'Quieter airflow for a restful room.' : reading?.mode === 'favorite' ? 'Your preferred airflow, your way.' : 'Airflow adjusts with your indoor air quality.'}</p>
      {reading?.capabilities.includes('favorite_level') && <div className="favorite-control"><div><span>Favorite fan level</span><strong>{level}</strong></div><input aria-label="Favorite fan level" type="range" min="0" max="14" value={level} disabled={!canControl} onChange={e => setLevel(Number(e.target.value))} onPointerUp={e => applyLevel(e.currentTarget.value)} onKeyUp={e => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) applyLevel(e.currentTarget.value); }} onBlur={e => applyLevel(e.currentTarget.value)}/></div>}
      <div className="toggle-row"><div><LockKeyhole size={17}/><span>Child lock<small>{reading?.child_lock == null ? 'Unknown or unavailable on this model' : 'Keep little hands from changing settings'}</small></span></div><button role="switch" aria-label="Child lock" aria-checked={reading?.child_lock ?? false} className={`toggle ${reading?.child_lock ? 'enabled' : ''}`} disabled={!canControl || !reading?.capabilities.includes('child_lock')} onClick={() => command('child_lock', !reading.child_lock)}><span/></button></div>
      <div className="toggle-row"><div><Volume2 size={17}/><span>Notification sounds<small>{reading?.buzzer == null ? 'Unknown or unavailable on this model' : 'A gentle beep when settings change'}</small></span></div><button role="switch" aria-label="Notification sounds" aria-checked={reading?.buzzer ?? false} className={`toggle ${reading?.buzzer ? 'enabled' : ''}`} disabled={!canControl || !reading?.capabilities.includes('buzzer')} onClick={() => command('buzzer', !reading.buzzer)}><span/></button></div></section>
      <History readings={history}/><section className="panel filter-panel"><div className="panel-heading"><h3>Filter care</h3><Filter size={19}/></div><div className="filter-reading"><div className="filter-ring" style={{ '--progress': `${(reading?.filter_life_remaining ?? 0) * 3.6}deg` } as React.CSSProperties}><span>{value(reading?.filter_life_remaining)}<small>%</small></span></div><div><strong>Filter life remaining</strong><p>{reading?.filter_life_remaining == null ? 'Awaiting filter reading' : reading.filter_life_remaining <= 15 ? 'Time to plan a replacement.' : 'Your filter is doing its thing.'}</p><span>{value(reading?.filter_hours_used)} hours used</span></div></div><div className="filter-tip"><Leaf size={16}/><p>A clean filter helps keep your air fresh. Check it regularly for the best performance.</p></div><button className="button secondary" disabled={!canControl || !reading?.capabilities.includes('reset_filter')} onClick={() => setResettingFilter(true)}>Reset filter</button>{!reading?.capabilities.includes('reset_filter') && <p>Filter reset is unavailable on this model.</p>}{resettingFilter && <div className="remove-confirm" role="alert"><p>Reset filter usage for <strong>{device.name}</strong>? Only reset after replacing the filter. This clears the purifier?s filter usage counters.</p><button className="button secondary" onClick={() => setResettingFilter(false)}>Cancel</button><button className="button danger-button" disabled={!canControl || !reading?.capabilities.includes('reset_filter')} onClick={() => { setResettingFilter(false); void command('reset_filter', true); }}>Confirm filter reset</button></div>}</section></div>
      <div className="device-details"><span><ShieldCheck size={14}/> {demo ? 'Demo · simulated device' : 'Local connection'} · {device.ip}</span><span>Fan speed {value(reading?.motor_speed, ' rpm')}</span>{!demo && <button className="text-button danger" disabled={busy} onClick={() => setRemoving(true)}><Trash2 size={13}/>Remove device</button>}</div>
      {removing && <div className="remove-confirm" role="alert"><p>Remove <strong>{device.name}</strong> and its saved credentials and readings?</p><button className="button secondary" onClick={() => setRemoving(false)}>Cancel</button><button className="button danger-button" disabled={busy} onClick={remove}>Remove device</button></div>}
      </>}
      <footer><span>Better air. A quieter mind.</span><span>Air Studio <span className="footer-dot">·</span> Powered by python-miio</span></footer>
    </div></main>
    <nav className="mobile-navigation" aria-label="App sections">{([['overview', Activity], ['controls', SlidersHorizontal], ['history', Activity], ['device', Settings2]] as const).map(([section, Icon]) => <button key={section} aria-current={view === section ? 'page' : undefined} onClick={() => changeView(section)}><Icon size={22}/><span>{viewNames[section]}</span></button>)}</nav>
    {notice && <div className="toast" role="status"><ShieldCheck size={18}/>{notice}</div>}
    {form && <DeviceForm device={form.device} close={() => setForm(null)} saved={() => { revision.current++; setReadings({}); setDeviceErrors({}); void loadDevices(); }}/>} 
    {help && <Help close={() => setHelp(false)}/>}
  </div>;
}

function Help({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null); useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={close} className="device-dialog help-dialog"><div className="dialog-title"><div><span className="eyebrow">GET CONNECTED</span><h2>A breath of fresh air.</h2></div><button className="icon-button" onClick={close} aria-label="Close"><X size={20}/></button></div><ol><li><strong>Connect to the same network</strong><p>{isAndroid() ? 'Connect this phone to the same Wi-Fi network. No computer or backend is needed.' : 'Run the Python backend on a computer on the same Wi-Fi network.'} Local miIO traffic uses UDP port 54321.</p></li><li><strong>Find your IP, model, and token</strong><p>Use your router for the IP address. The python-miio command <code>miiocli cloud</code> can retrieve model identifiers and tokens from your Xiaomi account.</p></li><li><strong>Add your purifier</strong><p>Switch to live mode and enter the device details. Readings refresh every 10 seconds while the device is selected.</p></li></ol><p>{isAndroid() ? 'Tokens and saved history are encrypted on this phone. Tokens are never returned by the native adapter. The app connects directly to your purifier.' : 'Tokens are saved in a local SQLite database and are never returned to the browser. This dashboard is intended to run on localhost.'}</p><a className="help-link" href="https://github.com/rytilahti/python-miio" target="_blank" rel="noreferrer">Read the python-miio documentation <ArrowUpRight size={15}/></a><button className="button primary" onClick={close}>Got it</button></dialog>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
