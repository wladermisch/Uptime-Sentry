import * as React from 'react';
import { ink, signal } from '../../shared-theme/themePrimitives';
import { nextTargetId } from '../targetIds';
import { navigate } from '../nav';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import AddIcon from '@mui/icons-material/Add';
import ButtonBase from '@mui/material/ButtonBase';
import RadarRoundedIcon from '@mui/icons-material/RadarRounded';
import DiscoveryDialog, { DiscoveredTarget, takePendingDiscovery } from './DiscoveryDialog';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  FieldGrid, IndexEmpty, IndexFilter, IndexHeader, IndexList, IndexRow, Pass, PassFooter, PassHead, PassSection, Tag, Workspace, mono,
} from './workspace';
import { EmailRule, INHERIT_RULE, describeEmail, readAppEmailSettings, resolveEmail } from '../emailAlerts';
import { requestSync } from '../backendSync';
import { EmailRuleEditor } from './EmailAlertFields';
import { Gate, useAppCapabilities } from './AppGate';
import { AddSoundButton, SoundSelect, useSoundLibrary } from './SoundPicker';

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
  upSound?: string;
  downSound?: string;
  email?: EmailRule;
}

interface Target {
  id?: number;
  profileId: string;
  name: string;
  type: string; // HTTP, PING, TCP, DNS or SSL
  host: string;
  timeout: number;
  recoveryAction: string;
  acceptableStatusCodes: number[];
  degradedStatusCodes?: number[];
  degradedLatencyThreshold?: number;
  consecutiveFailuresLimit: number;
  profileName: string;
  upSound?: string;
  downSound?: string;
  keyword?: string;
  keywordRule?: string; // MUST_CONTAIN, MUST_NOT_CONTAIN, DISABLED
  paused?: boolean;
  email?: EmailRule;
  port?: number;
  dnsExpected?: string;
  sslWarnDays?: number;
  slowAlertAfter?: number;
}

/** What each check type asks for. */
const CHECK_TYPES: Record<string, { label: string; host: string; placeholder: string; help: string }> = {
  HTTP: { label: 'HTTP(S) · website or API', host: 'URL', placeholder: 'https://example.com', help: 'Up when the page answers with an accepted status code (and, optionally, contains some text).' },
  PING: { label: 'Ping · server or device', host: 'IP address or hostname', placeholder: '192.168.1.1', help: 'Up when the device answers a ping.' },
  TCP: { label: 'TCP port · database, mail, SSH…', host: 'IP address or hostname', placeholder: 'db.example.com', help: 'Up when a connection to the port opens. Good for services without a web page.' },
  DNS: { label: 'DNS · name resolution', host: 'Domain name', placeholder: 'example.com', help: "Up when the name resolves through this computer's DNS, optionally to the addresses you expect." },
  SSL: { label: 'SSL certificate · expiry', host: 'Domain name', placeholder: 'example.com', help: 'Checks the HTTPS certificate is trusted and matches the name, and warns before it expires.' },
};

export default function TargetsTab() {
  const [activeProfile, setActiveProfile] = React.useState<Profile | null>(null);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const sounds = useSoundLibrary();
  const caps = useAppCapabilities();
  // Settings can send the person here with the search already open.
  const [discoverOpen, setDiscoverOpen] = React.useState(takePendingDiscovery);

  // Form State
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('HTTP');
  const [host, setHost] = React.useState('');
  const [timeout, setTimeoutVal] = React.useState(5);
  const [failuresLimit, setFailuresLimit] = React.useState(2);
  const [recoveryAction, setRecoveryAction] = React.useState('');
  const [statusCodesStr, setStatusCodesStr] = React.useState('200');
  const [degradedCodesStr, setDegradedCodesStr] = React.useState('404, 503');
  const [degradedLatency, setDegradedLatency] = React.useState(1500);
  const [upSound, setUpSound] = React.useState('default-profile');
  const [downSound, setDownSound] = React.useState('default-profile');
  const [keyword, setKeyword] = React.useState('');
  const [keywordRule, setKeywordRule] = React.useState('DISABLED');
  const [paused, setPaused] = React.useState(false);
  const [email, setEmail] = React.useState<EmailRule>(INHERIT_RULE);
  const [port, setPort] = React.useState<number | ''>('');
  const [dnsExpected, setDnsExpected] = React.useState('');
  const [sslWarnDays, setSslWarnDays] = React.useState(14);
  const [slowAlertAfter, setSlowAlertAfter] = React.useState(0);
  // Re-read when Settings is saved, so the summary matches what applies now.
  const appEmail = React.useMemo(() => readAppEmailSettings(), [caps.emailOn, caps.emailReady]);

  // Live Dry Check State
  const [checking, setChecking] = React.useState(false);
  const [dryRunResult, setDryRunResult] = React.useState<{
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
    responseTime: number;
    message: string;
  } | null>(null);

  const runLiveTest = React.useCallback(async (targetHost: string, targetType: string, timeLimit: number, statusCodes: string, extra: Partial<Target> = {}) => {
    // Nothing to test until a host is typed (a new target starts with just "https://").
    if (!targetHost.trim() || /^https?:\/\/$/i.test(targetHost.trim())) {
      setDryRunResult(null);
      return;
    }
    setChecking(true);
    try {
      const parsedOk = statusCodes.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
      const res = await fetch('http://127.0.0.1:8765/api/check/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: targetType,
          host: targetHost,
          timeout: timeLimit,
          acceptableStatusCodes: parsedOk.length > 0 ? parsedOk : [200],
          ...extra,
        }),
      });

      if (res.ok) {
        // The backend answers with a CheckResult: { success, durationMillis, message }.
        const data = (await res.json()) as { success?: boolean; durationMillis?: number; message?: string };
        const online = data.success === true;
        const latency = Math.max(0, data.durationMillis ?? 0);
        let status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = online ? 'ONLINE' : 'OFFLINE';
        if (online && latency > degradedLatency) {
          status = 'DEGRADED';
        }
        setDryRunResult({
          status,
          responseTime: latency,
          message: data.message || (status === 'ONLINE' ? 'Target responded successfully.' : 'Check failed.'),
        });
      } else {
        setDryRunResult({
          status: 'OFFLINE',
          responseTime: 0,
          message: 'Local verification daemon returned an error code.',
        });
      }
    } catch {
      setDryRunResult({
        status: 'OFFLINE',
        responseTime: 0,
        message: 'Could not connect to local verification daemon.',
      });
    } finally {
      setChecking(false);
    }
  }, [degradedLatency]);

  const fillForm = (t: Target) => {
    setName(t.name);
    setType(t.type);
    setHost(t.host);
    setTimeoutVal(t.timeout);
    setFailuresLimit(t.consecutiveFailuresLimit);
    setRecoveryAction(t.recoveryAction || '');
    setStatusCodesStr(t.acceptableStatusCodes.join(', ') || '200');
    setDegradedCodesStr(t.degradedStatusCodes?.join(', ') || '404, 503');
    setDegradedLatency(t.degradedLatencyThreshold || 1500);
    setUpSound(t.upSound || 'default-profile');
    setDownSound(t.downSound || 'default-profile');
    setKeyword(t.keyword || '');
    setKeywordRule(t.keywordRule || 'DISABLED');
    setPaused(!!t.paused);
    setEmail(t.email ?? INHERIT_RULE);
    setPort(t.port || '');
    setDnsExpected(t.dnsExpected ?? '');
    setSslWarnDays(t.sslWarnDays ?? 14);
    setSlowAlertAfter(t.slowAlertAfter ?? 0);

    void runLiveTest(t.host, t.type, t.timeout, t.acceptableStatusCodes?.join(', ') || '200', {
      port: t.port, dnsExpected: t.dnsExpected, sslWarnDays: t.sslWarnDays, keyword: t.keyword, keywordRule: t.keywordRule,
    });
  };

  const loadActiveProfileAndTargets = React.useCallback(() => {
    try {
      const storedProfiles = localStorage.getItem('uptime_sentry_profiles');
      const activeId = localStorage.getItem('uptime_sentry_active_id');
      const storedTargets = localStorage.getItem('uptime_sentry_targets');

      if (storedProfiles && activeId) {
        const profilesList = JSON.parse(storedProfiles) as Profile[];
        const found = profilesList.find((p) => p.id === activeId) || null;
        setActiveProfile(found);

        if (found && !selectedId) {
          setTimeoutVal(found.defaultTimeout);
          setFailuresLimit(found.consecutiveFailuresLimit);
        }
      }

      if (storedTargets) {
        const list = JSON.parse(storedTargets) as Target[];
        setTargets(list);

        const currentProfileTargets = list.filter((t) => t.profileId === activeId);
        if (currentProfileTargets.length > 0 && selectedId === null) {
          setSelectedId(currentProfileTargets[0].id || null);
          fillForm(currentProfileTargets[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load profile targets', e);
    }
  }, [selectedId]);

  React.useEffect(() => {
    loadActiveProfileAndTargets();

    const handleProfile = () => { loadActiveProfileAndTargets(); };

    window.addEventListener('profile-changed', handleProfile);
    window.addEventListener('profiles-updated', handleProfile);

    return () => {
      window.removeEventListener('profile-changed', handleProfile);
      window.removeEventListener('profiles-updated', handleProfile);
    };
  }, [loadActiveProfileAndTargets]);

  const liveExtra = React.useMemo<Partial<Target>>(
    () => ({ port: port === '' ? 0 : port, dnsExpected, sslWarnDays, keyword, keywordRule }),
    [port, dnsExpected, sslWarnDays, keyword, keywordRule],
  );

  // Re-test half a second after the last change.
  React.useEffect(() => {
    if (!host.trim()) return;
    const timer = setTimeout(() => {
      void runLiveTest(host, type, timeout, statusCodesStr, liveExtra);
    }, 500);
    return () => { clearTimeout(timer); };
  }, [host, type, timeout, statusCodesStr, liveExtra, runLiveTest]);

  const handleSelectTarget = (t: Target) => {
    setSelectedId(t.id || null);
    fillForm(t);
  };

  const handleNewTargetClick = () => {
    setSelectedId(-1);
    setName('New Target');
    setType('HTTP');
    setHost('https://');
    if (activeProfile) {
      setTimeoutVal(activeProfile.defaultTimeout);
      setFailuresLimit(activeProfile.consecutiveFailuresLimit);
    } else {
      setTimeoutVal(5);
      setFailuresLimit(2);
    }
    setRecoveryAction('');
    setStatusCodesStr('200');
    setDegradedCodesStr('404, 503');
    setDegradedLatency(1500);
    setUpSound('default-profile');
    setDownSound('default-profile');
    setKeyword('');
    setKeywordRule('DISABLED');
    setPaused(false);
    setEmail(INHERIT_RULE);
    setPort('');
    setDnsExpected('');
    setSslWarnDays(14);
    setSlowAlertAfter(0);
    setDryRunResult(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;

    const parsedStatusCodes = statusCodesStr
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));

    const parsedDegradedCodes = degradedCodesStr
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));

    let updatedTargets: Target[];

    if (selectedId && selectedId !== -1) {
      // Update mode
      updatedTargets = targets.map((t) =>
        t.id === selectedId
          ? {
              ...t,
              name,
              type,
              host,
              timeout: Number(timeout),
              consecutiveFailuresLimit: Number(failuresLimit),
              recoveryAction,
              acceptableStatusCodes: parsedStatusCodes,
              degradedStatusCodes: parsedDegradedCodes,
              degradedLatencyThreshold: Number(degradedLatency),
              upSound,
              downSound,
              keyword,
              keywordRule,
              paused,
              email,
              port: port === '' ? undefined : Number(port),
              dnsExpected,
              sslWarnDays: Number(sslWarnDays),
              slowAlertAfter: Number(slowAlertAfter),
            }
          : t
      );
    } else {
      // Add mode
      const newTarget: Target = {
        id: nextTargetId(targets),
        profileId: activeProfile.id,
        name,
        type,
        host,
        timeout: Number(timeout),
        consecutiveFailuresLimit: Number(failuresLimit),
        recoveryAction,
        acceptableStatusCodes: parsedStatusCodes,
        degradedStatusCodes: parsedDegradedCodes,
        degradedLatencyThreshold: Number(degradedLatency),
        profileName: activeProfile.name,
        upSound,
        downSound,
        keyword,
        keywordRule,
        paused,
        email,
        port: port === '' ? undefined : Number(port),
        dnsExpected,
        sslWarnDays: Number(sslWarnDays),
        slowAlertAfter: Number(slowAlertAfter),
      };
      updatedTargets = [...targets, newTarget];
      setSelectedId(newTarget.id!);
    }

    localStorage.setItem('uptime_sentry_targets', JSON.stringify(updatedTargets));
    setTargets(updatedTargets);

    // Sync to backend
    requestSync();
  };

  const handleDelete = (id: number) => {
    if (!activeProfile) return;
    if (id === -1) {
      const currentProfileTargets = targets.filter((t) => t.profileId === activeProfile.id);
      if (currentProfileTargets.length > 0) {
        setSelectedId(currentProfileTargets[0].id || null);
        fillForm(currentProfileTargets[0]);
      } else {
        handleNewTargetClick();
      }
      return;
    }

    const updated = targets.filter((t) => t.id !== id);
    localStorage.setItem('uptime_sentry_targets', JSON.stringify(updated));
    setTargets(updated);

    // Sync to backend
    requestSync();

    const currentProfileTargets = updated.filter((t) => t.profileId === activeProfile.id);
    if (currentProfileTargets.length > 0) {
      setSelectedId(currentProfileTargets[0].id || null);
      fillForm(currentProfileTargets[0]);
    } else {
      handleNewTargetClick();
    }
  };

  /** Found services become ordinary targets in the active profile, with its defaults. */
  const addDiscovered = (found: DiscoveredTarget[]) => {
    if (!activeProfile || found.length === 0) return;
    let all = [...targets];
    for (const f of found) {
      const t: Target = {
        id: nextTargetId(all),
        profileId: activeProfile.id,
        name: f.name,
        type: f.type,
        host: f.host,
        port: f.port,
        timeout: activeProfile.defaultTimeout || 5,
        consecutiveFailuresLimit: activeProfile.consecutiveFailuresLimit || 2,
        recoveryAction: '',
        // A login page or a redirect to HTTPS still means the device answers.
        acceptableStatusCodes: f.type === 'HTTP' ? [200, 301, 302, 401, 403] : [],
        degradedLatencyThreshold: 1500,
        profileName: activeProfile.name,
        upSound: 'default-profile',
        downSound: 'default-profile',
        keyword: '',
        keywordRule: 'DISABLED',
        paused: false,
        email: INHERIT_RULE,
      };
      all = [...all, t];
    }
    localStorage.setItem('uptime_sentry_targets', JSON.stringify(all));
    setTargets(all);
    requestSync();
    const first = all[all.length - found.length];
    setSelectedId(first.id ?? null);
    fillForm(first);
  };

  const displayTargets = React.useMemo(() => {
    const list = [...targets];
    if (selectedId === -1 && activeProfile) {
      list.push({
        id: -1,
        profileId: activeProfile.id,
        name: name || 'New Target',
        type,
        host,
        timeout,
        consecutiveFailuresLimit: failuresLimit,
        recoveryAction,
        acceptableStatusCodes: [200],
        profileName: activeProfile.name,
        upSound,
        downSound,
        keyword,
        keywordRule,
        paused,
      });
    }
    return list;
  }, [targets, selectedId, activeProfile, name, type, host, timeout, failuresLimit, recoveryAction, upSound, downSound, keyword, keywordRule, paused]);

  const filteredTargets = displayTargets.filter(
    (t) =>
      t.profileId === activeProfile?.id &&
      (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.host.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (!activeProfile) {
    return (
      <Workspace index={<><IndexHeader title="Targets" /><IndexEmpty>No profile is active.</IndexEmpty></>}>
        <Pass maxWidth={560}>
          <PassHead title="No active profile" description="Targets belong to a profile. Pick one in the header, or create one first." />
          <PassFooter>
            <Button variant="contained" size="small" onClick={() => { navigate('profiles'); }}>Open profiles</Button>
          </PassFooter>
        </Pass>
      </Workspace>
    );
  }

  const isNew = selectedId === -1;
  const profileTargetCount = targets.filter((t) => t.profileId === activeProfile.id).length;
  const testTone = dryRunResult?.status === 'OFFLINE' ? 'down' : dryRunResult?.status === 'DEGRADED' ? 'degraded' : 'up';

  return (
    <>
    <DiscoveryDialog
      open={discoverOpen}
      onClose={() => { setDiscoverOpen(false); }}
      existing={targets.filter((t) => t.profileId === activeProfile.id).map((t) => ({ type: t.type, host: t.host, port: t.port }))}
      onAdd={addDiscovered}
    />
    <Workspace
      index={
        <>
          <IndexHeader
            title={`Targets · ${activeProfile.name}`}
            count={profileTargetCount}
            action={{ label: 'Add', icon: <AddIcon />, onClick: handleNewTargetClick }}
            extra={(
              <ButtonBase
                onClick={() => { setDiscoverOpen(true); }}
                aria-label="Find services on my network"
                title="Find services on my network"
                sx={{
                  font: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: 'var(--board-head-ink)',
                  height: 26, width: 30, borderRadius: '3px', '& svg': { fontSize: 17 },
                  '&:hover': { backgroundColor: 'var(--board-head-hover)' },
                  '&:focus-visible': { outline: '2px solid var(--board-head-ink)', outlineOffset: 0 },
                }}
              >
                <RadarRoundedIcon />
              </ButtonBase>
            )}
          />
          {profileTargetCount > 6 && <IndexFilter value={searchQuery} onChange={setSearchQuery} placeholder="Filter by name or host" />}
          <IndexList label="Targets">
            {filteredTargets.map((t, i) => (
              <IndexRow
                key={t.id}
                n={i + 1}
                selected={selectedId === t.id}
                onSelect={() => { handleSelectTarget(t); }}
                title={t.name || 'Untitled target'}
                badge={t.paused ? <Tag>PAUSED</Tag> : undefined}
                meta={`${t.type} · ${t.host}`}
              />
            ))}
            {filteredTargets.length === 0 && (
              <IndexEmpty>
                {searchQuery ? `No target matches “${searchQuery}”.` : `${activeProfile.name} has no targets yet. Add a website, server or device to monitor.`}
              </IndexEmpty>
            )}
          </IndexList>
        </>
      }
    >
      {selectedId === null ? (
        <Pass maxWidth={560}>
          <PassHead title="No target selected" description="Pick a target on the left, or add one." />
          <PassFooter>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleNewTargetClick}>Add a target</Button>
          </PassFooter>
        </Pass>
      ) : (
        <Pass component="form" onSubmit={handleSave} aria-label={isNew ? 'New target' : `${name} target`}>
          <PassHead
            title={isNew ? 'New target' : name || 'Untitled target'}
            meta={
              <>
                <Tag>{type}</Tag>
                <span>{host || 'no host yet'}</span>
              </>
            }
            actions={
              <>
                <FormControlLabel
                  sx={{ mr: 0.5 }}
                  control={
                    <Switch
                      checked={!paused}
                      onChange={(e) => { setPaused(!e.target.checked); }}
                      size="small"
                      slotProps={{ input: { 'aria-label': 'Monitor this target' } }}
                    />
                  }
                  label={<Box component="span" sx={{ fontSize: 13 }}>{paused ? 'Paused' : 'Monitoring'}</Box>}
                />
                {!isNew && (
                  <Button variant="outlined" size="small" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { handleDelete(selectedId); }}>
                    Remove
                  </Button>
                )}
              </>
            }
          />

          <PassSection label="What to check">
            <FieldGrid>
              <TextField
                label="Name"
                size="small"
                fullWidth
                required
                value={name}
                onChange={(e) => { setName(e.target.value); }}
              />
              <TextField
                select
                label="Check type"
                size="small"
                fullWidth
                required
                value={type}
                onChange={(e) => {
                  const next = e.target.value;
                  // Moving between URL and host-name types: drop the scheme so the field fits.
                  if (next !== 'HTTP' && /^https?:\/\//i.test(host)) setHost(host.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''));
                  if (next === 'HTTP' && host && !/^https?:\/\//i.test(host)) setHost(`https://${host}`);
                  setType(next);
                }}
              >
                {Object.entries(CHECK_TYPES).map(([value, t]) => <MenuItem key={value} value={value}>{t.label}</MenuItem>)}
              </TextField>
            </FieldGrid>
            <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: type === 'TCP' || type === 'SSL' ? { xs: '1fr', sm: '1fr 140px' } : '1fr', gap: 2.5 }}>
              <TextField
                label={(CHECK_TYPES[type] ?? CHECK_TYPES.HTTP).host}
                placeholder={(CHECK_TYPES[type] ?? CHECK_TYPES.HTTP).placeholder}
                size="small"
                fullWidth
                required
                value={host}
                onChange={(e) => { setHost(e.target.value); }}
                helperText={(CHECK_TYPES[type] ?? CHECK_TYPES.HTTP).help}
                slotProps={{ htmlInput: { style: { fontFamily: mono.fontFamily } } }}
              />
              {(type === 'TCP' || type === 'SSL') && (
                <TextField
                  label="Port"
                  type="number"
                  size="small"
                  required={type === 'TCP'}
                  placeholder={type === 'SSL' ? '443' : 'e.g. 5432'}
                  value={port}
                  onChange={(e) => { setPort(e.target.value === '' ? '' : Number(e.target.value)); }}
                  slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                />
              )}
            </Box>
            {type === 'DNS' && (
              <TextField
                sx={{ mt: 2.5 }}
                label="Expected addresses (optional)"
                placeholder="e.g. 93.184.215.14, 2606:2800::1"
                size="small"
                fullWidth
                value={dnsExpected}
                onChange={(e) => { setDnsExpected(e.target.value); }}
                helperText="Counts as down if the name resolves to none of these. Leave empty to accept any answer."
                slotProps={{ htmlInput: { style: { fontFamily: mono.fontFamily } } }}
              />
            )}
            {type === 'SSL' && (
              <TextField
                sx={{ mt: 2.5, maxWidth: 280 }}
                label="Warn days before expiry"
                type="number"
                size="small"
                value={sslWarnDays}
                onChange={(e) => { setSslWarnDays(Math.max(0, Number(e.target.value))); }}
                helperText="Counts as down from this many days before the certificate expires."
                slotProps={{ htmlInput: { min: 0, max: 365 } }}
              />
            )}
          </PassSection>

          <PassSection
            label="Live test"
            hint="Runs the check with the values above as you type. Nothing is saved or recorded."
            aside={
              <Button variant="text" size="small" disabled={checking || !host.trim()} onClick={() => { void runLiveTest(host, type, timeout, statusCodesStr, liveExtra); }}>
                Run again
              </Button>
            }
          >
            <Box aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', minHeight: 26 }}>
              {checking ? (
                <>
                  <CircularProgress size={14} />
                  <Box component="span" sx={{ ...mono, fontSize: 13, color: 'text.secondary' }}>checking {host || 'target'}…</Box>
                </>
              ) : dryRunResult ? (
                <>
                  <Box
                    component="span"
                    sx={(theme) => ({
                      ...mono,
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      lineHeight: '22px',
                      px: 1,
                      borderRadius: '3px',
                      ...(testTone === 'down'
                        ? { backgroundColor: signal.down, color: '#FFFFFF' }
                        : testTone === 'degraded'
                          ? { backgroundColor: signal.change, color: ink }
                          : { border: '1px solid', borderColor: (theme.vars || theme).palette.text.primary }),
                    })}
                  >
                    {testTone === 'up' ? 'UP' : testTone === 'degraded' ? 'SLOW' : 'DOWN'}
                  </Box>
                  {testTone !== 'down' && (
                    <Box component="span" sx={{ ...mono, fontSize: 15, fontWeight: 600 }}>{dryRunResult.responseTime} ms</Box>
                  )}
                  <Box component="span" sx={{ ...mono, fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>{dryRunResult.message}</Box>
                </>
              ) : (
                <Box component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>Enter a host to test it.</Box>
              )}
            </Box>
          </PassSection>

          <PassSection label="When it counts as down" hint={`Defaults come from the ${activeProfile.name} profile.`}>
            <FieldGrid columns={3}>
              <TextField
                label="Timeout (s)"
                type="number"
                size="small"
                fullWidth
                required
                value={timeout}
                onChange={(e) => { setTimeoutVal(Number(e.target.value)); }}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                label="Alert after failures"
                type="number"
                size="small"
                fullWidth
                required
                value={failuresLimit}
                onChange={(e) => { setFailuresLimit(Number(e.target.value)); }}
                slotProps={{ htmlInput: { min: 1 } }}
              />
              <TextField
                label="Slow above (ms)"
                type="number"
                size="small"
                fullWidth
                value={degradedLatency}
                onChange={(e) => { setDegradedLatency(Number(e.target.value)); }}
                slotProps={{ htmlInput: { min: 1 } }}
              />
            </FieldGrid>
            <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, gap: 2, alignItems: 'start' }}>
              <FormControlLabel
                sx={{ ml: -1, mr: 0 }}
                control={<Switch size="small" checked={slowAlertAfter > 0} onChange={(e) => { setSlowAlertAfter(e.target.checked ? 3 : 0); }} />}
                label={<Box component="span" sx={{ fontSize: 14 }}>Alert when it gets slow</Box>}
              />
              {slowAlertAfter > 0 ? (
                <TextField
                  label="Slow checks in a row before alerting"
                  type="number"
                  size="small"
                  value={slowAlertAfter}
                  onChange={(e) => { setSlowAlertAfter(Math.max(1, Number(e.target.value) || 1)); }}
                  helperText={`Alerts after ${slowAlertAfter} ${slowAlertAfter === 1 ? 'check' : 'checks in a row'} over ${degradedLatency} ms, and again when it is fast. Slow isn't counted as downtime.`}
                  slotProps={{ htmlInput: { min: 1, max: 100 } }}
                  sx={{ maxWidth: 320 }}
                />
              ) : (
                <Box sx={{ fontSize: 12.5, color: 'text.secondary', pt: 0.75 }}>Off: slow responses only show on the board.</Box>
              )}
            </Box>
            {type === 'HTTP' && (
              <Box sx={{ mt: 2.5 }}>
                <FieldGrid>
                  <TextField
                    label="Status codes that mean up"
                    size="small"
                    fullWidth
                    required
                    value={statusCodesStr}
                    onChange={(e) => { setStatusCodesStr(e.target.value); }}
                    helperText="Comma separated, e.g. 200, 201, 204"
                  />
                  <TextField
                    label="Status codes that mean slow"
                    size="small"
                    fullWidth
                    value={degradedCodesStr}
                    onChange={(e) => { setDegradedCodesStr(e.target.value); }}
                    helperText="Counted as degraded instead of down, e.g. 404, 503"
                  />
                  <TextField
                    select
                    label="Page content check"
                    size="small"
                    fullWidth
                    value={keywordRule}
                    onChange={(e) => { setKeywordRule(e.target.value); }}
                  >
                    <MenuItem value="DISABLED">Off · status code only</MenuItem>
                    <MenuItem value="MUST_CONTAIN">Page must contain the text</MenuItem>
                    <MenuItem value="MUST_NOT_CONTAIN">Page must not contain the text</MenuItem>
                  </TextField>
                  <TextField
                    label="Text to look for"
                    size="small"
                    fullWidth
                    disabled={keywordRule === 'DISABLED'}
                    value={keyword}
                    onChange={(e) => { setKeyword(e.target.value); }}
                    placeholder='e.g. "status":"operational"'
                  />
                </FieldGrid>
              </Box>
            )}
          </PassSection>

          <PassSection label="Alerts and recovery" aside={<AddSoundButton />}>
            <Gate ready={caps.soundsOn} reason='Sounds are switched off. Turn on "Play a sound" in Settings to choose them here.'>
              <FieldGrid>
                <SoundSelect
                  type="up"
                  label="Sound when it recovers"
                  value={upSound}
                  onChange={setUpSound}
                  inherit={{ value: 'default-profile', label: "Profile's sound" }}
                  library={sounds}
                />
                <SoundSelect
                  type="down"
                  label="Sound when it goes down"
                  value={downSound}
                  onChange={setDownSound}
                  inherit={{ value: 'default-profile', label: "Profile's sound" }}
                  library={sounds}
                />
              </FieldGrid>
            </Gate>
            <TextField
              sx={{ mt: 2.5 }}
              label="Recovery command"
              size="small"
              fullWidth
              value={recoveryAction}
              onChange={(e) => { setRecoveryAction(e.target.value); }}
              placeholder="e.g. C:\scripts\restart_apache.bat"
              helperText={`Runs after ${failuresLimit} failed ${failuresLimit === 1 ? 'check' : 'checks'} in a row. Leave empty to only alert.`}
            />
          </PassSection>

          <PassSection label="Email alerts" hint="Who gets an email when this target goes down.">
            <Gate ready={caps.emailReady || caps.loading} reason={caps.emailBlocker}>
              <EmailRuleEditor
                value={email}
                onChange={setEmail}
                inheritLabel="Same as profile"
                inheritSummary={describeEmail(resolveEmail(undefined, activeProfile.email, appEmail), appEmail)}
                inheritedTemplate={activeProfile.email?.mode === 'custom' ? activeProfile.email : appEmail.emailTemplate}
                inheritedRecipients={activeProfile.email?.mode === 'custom' ? activeProfile.email.recipients : activeProfile.email?.mode === 'off' ? [] : appEmail.emailRecipients}
                appEnabled={appEmail.emailAlertsEnabled}
              />
            </Gate>
          </PassSection>

          <PassFooter>
            <Button type="submit" variant="contained" size="small" disabled={!name.trim() || !host.trim() || (type === 'TCP' && !port)}>
              {isNew ? 'Add target' : 'Save target'}
            </Button>
            {isNew && (
              <Button variant="text" size="small" onClick={() => { handleDelete(-1); }}>Cancel</Button>
            )}
          </PassFooter>
        </Pass>
      )}
    </Workspace>
    </>
  );
}
