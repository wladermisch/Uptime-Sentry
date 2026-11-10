import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import RadarRoundedIcon from '@mui/icons-material/RadarRounded';
import Stack from '@mui/material/Stack';
import { openDiscovery } from './DiscoveryDialog';
import { PassSection } from './workspace';
import { API } from '../historyStats';
import { SETTINGS_SAVED } from './AppGate';

/** Fired when discovery is switched on or off, so the Targets screen updates its button. */
export const DISCOVERY_CHANGED = 'discovery-changed';

/** Network discovery: off by default, switched on only after reading what it does. */
export default function DiscoverySection() {
  const [enabled, setEnabled] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`${API}/api/settings`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { discoveryEnabled?: boolean }) => { setEnabled(!!d.discoveryEnabled); })
      .catch(() => { setError("Can't reach the monitoring service at 127.0.0.1:8765."); });
  }, []);

  const save = async (on: boolean) => {
    try {
      const r = await fetch(`${API}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discoveryEnabled: on }) });
      if (!r.ok) throw new Error(String(r.status));
      setEnabled(on);
      setError(null);
      window.dispatchEvent(new CustomEvent(DISCOVERY_CHANGED));
      window.dispatchEvent(new CustomEvent(SETTINGS_SAVED));
    } catch {
      setError("Can't reach the monitoring service, so the change wasn't saved.");
    }
  };

  return (
    <PassSection label="Network discovery" hint="Finds services on your own network so you can add them as targets in a few clicks.">
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <FormControlLabel
          sx={{ ml: -1, mr: 'auto' }}
          control={<Switch checked={enabled} onChange={(e) => { if (e.target.checked) setAsking(true); else void save(false); }} />}
          label={<Box component="span" sx={{ fontSize: 14 }}>{enabled ? 'On' : 'Off'}</Box>}
        />
        <Button size="small" variant="outlined" startIcon={<RadarRoundedIcon />} disabled={!enabled} onClick={openDiscovery}>
          Find services now
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, maxWidth: '72ch', lineHeight: 1.5 }}>
        It never runs on its own. You can also start it from the Targets screen. Each search is started by you, stays on this computer&apos;s private networks, and only suggests targets.
      </Typography>
      {error && <Typography variant="body2" role="alert" sx={{ mt: 1 }}>{error}</Typography>}

      <Dialog open={asking} onClose={() => { setAsking(false); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberRoundedIcon sx={{ color: 'warning.main' }} />
          Turn on network discovery?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, mb: 1.5 }}>A search does two things, and only when you start it:</DialogContentText>
          <Box component="ol" sx={{ m: 0, pl: 2.5, fontSize: 14, lineHeight: 1.6, color: 'text.secondary' }}>
            <li>Asks the network which devices announce themselves (mDNS and UPnP), like printers, NAS boxes or media servers. Nothing is scanned.</li>
            <li>If you tick it, knocks on about 30 common ports (web, SSH, file shares, databases) on the addresses of your own network.</li>
          </Box>
          <DialogContentText sx={{ fontSize: 14, mt: 2 }}>
            The second part is a port scan of your network. Antivirus software, a router or a company&apos;s network monitoring may flag it.
            Only use it on networks that are yours or that you have permission to check. Nothing leaves this computer.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button size="small" onClick={() => { setAsking(false); }} autoFocus>Keep it off</Button>
          <Button size="small" variant="contained" onClick={() => { setAsking(false); void save(true); }}>Turn on discovery</Button>
        </DialogActions>
      </Dialog>
    </PassSection>
  );
}
