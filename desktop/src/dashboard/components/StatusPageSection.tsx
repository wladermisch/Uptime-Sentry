import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { PassSection, FieldGrid } from './workspace';
import { API } from '../historyStats';
import { StatusInfo, getStatusInfo, readProfilesAndTargets } from '../serverData';
import { fonts } from '../../shared-theme/themePrimitives';

interface StatusSettings {
  statusPageEnabled: boolean;
  statusPageTitle: string;
  statusPageShowHosts: boolean;
  statusPageNetwork: boolean;
  statusPagePort: number;
  statusPageProfileIds: string[];
}

const DEFAULTS: StatusSettings = {
  statusPageEnabled: false, statusPageTitle: 'Service status', statusPageShowHosts: false,
  statusPageNetwork: false, statusPagePort: 8766, statusPageProfileIds: [],
};

/** A read-only status page served by the app, on this computer or the local network. */
export default function StatusPageSection() {
  const [s, setS] = React.useState<StatusSettings>(DEFAULTS);
  const [info, setInfo] = React.useState<StatusInfo | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [offline, setOffline] = React.useState(false);
  const { profiles } = React.useMemo(readProfilesAndTargets, []);

  const refreshInfo = React.useCallback(() => {
    getStatusInfo().then(setInfo).catch(() => { setInfo(null); });
  }, []);

  React.useEffect(() => {
    fetch(`${API}/api/settings`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Partial<StatusSettings>) => {
        setS({
          statusPageEnabled: !!d.statusPageEnabled,
          statusPageTitle: d.statusPageTitle ?? DEFAULTS.statusPageTitle,
          statusPageShowHosts: !!d.statusPageShowHosts,
          statusPageNetwork: !!d.statusPageNetwork,
          statusPagePort: d.statusPagePort || 8766,
          statusPageProfileIds: d.statusPageProfileIds ?? [],
        });
      })
      .catch(() => { setOffline(true); });
    refreshInfo();
  }, [refreshInfo]);

  const change = (patch: Partial<StatusSettings>) => { setS((cur) => ({ ...cur, ...patch })); setDirty(true); setMessage(null); };

  const save = async () => {
    try {
      const r = await fetch(`${API}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
      if (!r.ok) throw new Error(String(r.status));
      setDirty(false);
      setMessage('Status page settings saved.');
      setTimeout(refreshInfo, 500);
    } catch {
      setMessage("Can't reach the monitoring service, so the status page settings weren't saved.");
    }
  };

  const open = async () => {
    try {
      const r = await fetch(`${API}/api/status/open`, { method: 'POST' });
      const d = (await r.json()) as { ok: boolean; message: string };
      if (!d.ok) setMessage(d.message);
    } catch {
      setMessage("Can't reach the monitoring service.");
    }
  };

  const mono = { fontFamily: fonts.mono, fontSize: 13 };
  return (
    <PassSection label="Status page" hint="A simple page with the current state, 30 days of availability, planned maintenance and recent outages.">
      {offline && <Typography variant="body2" role="alert" sx={{ mb: 1.5 }}>Can&apos;t reach the monitoring service at 127.0.0.1:8765.</Typography>}
      <FormControlLabel
        sx={{ ml: -1 }}
        control={<Switch checked={s.statusPageEnabled} onChange={(e) => { change({ statusPageEnabled: e.target.checked }); }} />}
        label={<Box component="span" sx={{ fontSize: 14 }}>Serve a status page</Box>}
      />
      {s.statusPageEnabled && (
        <Stack spacing={2} sx={{ mt: 1.5 }}>
          <FieldGrid>
            <TextField label="Page title" size="small" value={s.statusPageTitle} onChange={(e) => { change({ statusPageTitle: e.target.value }); }} />
            <TextField
              select
              label="Show"
              size="small"
              value={s.statusPageProfileIds}
              onChange={(e) => { const v = e.target.value as unknown as string[]; change({ statusPageProfileIds: v.includes('*') ? [] : v }); }}
              slotProps={{
                select: {
                  multiple: true,
                  displayEmpty: true,
                  renderValue: (v) => ((v as string[]).length === 0 ? 'All monitored targets' : (v as string[]).map((id) => profiles.find((p) => p.id === id)?.name ?? '?').join(', ')),
                },
                inputLabel: { shrink: true },
              }}
            >
              <MenuItem value="*">All monitored targets</MenuItem>
              {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>
          </FieldGrid>
          <FormControlLabel
            sx={{ ml: -1 }}
            control={<Switch size="small" checked={s.statusPageShowHosts} onChange={(e) => { change({ statusPageShowHosts: e.target.checked }); }} />}
            label={<Box component="span" sx={{ fontSize: 14 }}>Show addresses (URLs, IPs) next to names</Box>}
          />
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>On this computer</Typography>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
              <Box component="span" className="selectable" sx={mono}>{info?.localUrl ?? 'http://127.0.0.1:8765/status'}</Box>
              <Button size="small" variant="outlined" startIcon={<OpenInNewRoundedIcon />} onClick={() => { void open(); }} disabled={dirty}>Open in browser</Button>
            </Stack>
          </Box>
          <Box>
            <FormControlLabel
              sx={{ ml: -1 }}
              control={<Switch size="small" checked={s.statusPageNetwork} onChange={(e) => { change({ statusPageNetwork: e.target.checked }); }} />}
              label={<Box component="span" sx={{ fontSize: 14 }}>Share it with other devices on this network</Box>}
            />
            {s.statusPageNetwork && (
              <Box sx={{ pl: 4.5 }}>
                <TextField
                  label="Port"
                  type="number"
                  size="small"
                  value={s.statusPagePort}
                  onChange={(e) => { change({ statusPagePort: Number(e.target.value) }); }}
                  slotProps={{ htmlInput: { min: 1024, max: 65535 } }}
                  sx={{ width: 140, mt: 1 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, lineHeight: 1.5, maxWidth: '68ch' }}>
                  Anyone on your network can then read the page (only the page: settings and the app&apos;s controls stay on this computer).
                  Windows may ask once whether to allow Java through the firewall; allow it for private networks.
                </Typography>
                {!dirty && info?.networkRunning && info.networkUrls.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    {info.networkUrls.map((u) => <Box key={u} className="selectable" sx={mono}>{u}</Box>)}
                  </Box>
                )}
                {!dirty && info?.networkError && <Typography variant="body2" role="alert" sx={{ color: 'error.main', mt: 1 }}>{info.networkError}</Typography>}
              </Box>
            )}
          </Box>
        </Stack>
      )}
      {(dirty || message) && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center' }}>
          {dirty && <Button size="small" variant="contained" onClick={() => { void save(); }}>Save status page</Button>}
          {message && <Typography variant="body2" role="status">{message}</Typography>}
        </Stack>
      )}
    </PassSection>
  );
}
