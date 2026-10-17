import { useRef, useState } from 'react';
import { LoaderCircle, Plus, Radar } from 'lucide-react';
import { api, type Device } from './api';

export function DiscoveryPanel({ active, blocked, saved, start, pending, added }: {
  active: boolean; blocked: boolean; saved: Device[]; start: () => void;
  pending: (busy: boolean) => void; added: (device: Device) => Promise<void>;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const isActive = useRef(active); isActive.current = active;
  const available = devices.filter(item => !saved.some(device => device.ip === item.ip));

  async function run(candidate?: Device) {
    if (!active || blocked || inFlight.current) return;
    inFlight.current = true; setBusy(true); pending(true); setError('');
    try {
      if (candidate) {
        const device = await api<Device>(`/discovery/${candidate.id}`, { method: 'POST', body: JSON.stringify({ name: names[candidate.id] || candidate.name }) });
        setDevices(items => items.filter(item => item.id !== candidate.id));
        await added(device);
      } else {
        start(); setDevices([]); setScanned(false);
        const found = await api<Device[]>('/discovery', { method: 'POST' });
        if (isActive.current) { setDevices(found); setNames({}); setScanned(true); }
      }
    } catch (e) { setError((e as Error).message); }
    finally { inFlight.current = false; setBusy(false); pending(false); }
  }

  return <section className="panel discovery-panel" aria-label="Network discovery">
    <div className="panel-heading"><h3>Find purifiers</h3><Radar size={22}/></div>
    <p>Find new purifiers on this Wi-Fi network. Saved devices are ignored.</p>
    <button className="button primary" disabled={!active || blocked || busy} onClick={() => void run()}>{busy ? <LoaderCircle size={20} className="spin"/> : <Radar size={20}/>} {busy ? 'Checking network…' : 'Scan network'}</button>
    {error && <div className="error" role="alert">{error}</div>}
    {scanned && !available.length && <p role="status">No new purifiers with a valid token found. You can still add a device manually.</p>}
    {available.map(candidate => <div className="discovered-device" key={candidate.id}>
      <strong>{candidate.model}</strong><span>{candidate.ip} · Token verified</span>
      <label>Device name<input aria-label={`Name for ${candidate.ip}`} maxLength={60} value={names[candidate.id] ?? candidate.name} onChange={e => setNames({ ...names, [candidate.id]: e.target.value })}/></label>
      <button className="button secondary" disabled={!active || blocked || busy || !(names[candidate.id] ?? candidate.name).trim()} onClick={() => void run(candidate)}><Plus size={20}/>Add purifier</button>
    </div>)}
  </section>;
}
