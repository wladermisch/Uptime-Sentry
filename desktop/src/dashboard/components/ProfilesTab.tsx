import * as React from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  FieldGrid, IndexEmpty, IndexFilter, IndexHeader, IndexList, IndexRow, Pass, PassFooter, PassHead, PassSection, Tag, Workspace,
} from './workspace';
import { EmailRule, INHERIT_RULE, describeEmail, readAppEmailSettings, resolveEmail } from '../emailAlerts';
import { EmailRuleEditor } from './EmailAlertFields';
import { Gate, useAppCapabilities } from './AppGate';
import { AddSoundButton, SoundSelect, useSoundLibrary } from './SoundPicker';

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number; // in seconds
  checkInterval: number; // in seconds
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
  upSound?: string;
  downSound?: string;
  email?: EmailRule;
}

export default function ProfilesTab() {
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const sounds = useSoundLibrary();
  const caps = useAppCapabilities();

  // Form State
  const [name, setName] = React.useState('');
  const [interval, setIntervalVal] = React.useState(60);
  const [timeout, setTimeoutVal] = React.useState(5);
  const [failuresLimit, setFailuresLimit] = React.useState(2);
  const [bgRunning, setBgRunning] = React.useState(false);
  const [upSound, setUpSound] = React.useState('default-app');
  const [downSound, setDownSound] = React.useState('default-app');
  const [email, setEmail] = React.useState<EmailRule>(INHERIT_RULE);
  // Re-read when Settings is saved, so the summary matches what applies now.
  const appEmail = React.useMemo(() => readAppEmailSettings(), [caps.emailOn, caps.emailReady]);

  const loadProfiles = React.useCallback(() => {
    const stored = localStorage.getItem('uptime_sentry_profiles');
    if (stored) {
      const list = JSON.parse(stored) as Profile[];
      setProfiles(list);
      
      const active = localStorage.getItem('uptime_sentry_active_id');
      if (active && list.some(p => p.id === active)) {
        setSelectedId(active);
        const activeProfile = list.find(p => p.id === active)!;
        fillForm(activeProfile);
      } else if (list.length > 0) {
        setSelectedId(list[0].id);
        fillForm(list[0]);
      }
    }
  }, []);

  React.useEffect(() => {
    loadProfiles();
    
  }, [loadProfiles]);

  const fillForm = (p: Profile) => {
    setName(p.name);
    setIntervalVal(p.checkInterval);
    setTimeoutVal(p.defaultTimeout);
    setFailuresLimit(p.consecutiveFailuresLimit);
    setBgRunning(p.backgroundRunning);
    setUpSound(p.upSound || 'default-app');
    setDownSound(p.downSound || 'default-app');
    setEmail(p.email ?? INHERIT_RULE);
  };

  const saveProfilesToStorage = (updated: Profile[]) => {
    localStorage.setItem('uptime_sentry_profiles', JSON.stringify(updated));
    setProfiles(updated);
    window.dispatchEvent(new CustomEvent('profiles-updated'));
  };

  const handleSelectProfile = (p: Profile) => {
    setSelectedId(p.id);
    fillForm(p);
  };

  const handleNewProfileClick = () => {
    setSelectedId('temp-new-profile');
    setName('');
    setIntervalVal(60);
    setTimeoutVal(5);
    setFailuresLimit(2);
    setBgRunning(false);
    setUpSound('default-app');
    setDownSound('default-app');
    setEmail(INHERIT_RULE);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (selectedId && selectedId !== 'temp-new-profile') {
      // Edit mode
      const updated = profiles.map((p) =>
        p.id === selectedId
          ? {
              ...p,
              name,
              checkInterval: Number(interval),
              defaultTimeout: Number(timeout),
              consecutiveFailuresLimit: Number(failuresLimit),
              backgroundRunning: bgRunning,
              upSound,
              downSound,
              email,
            }
          : p
      );
      saveProfilesToStorage(updated);
    } else {
      // Create mode
      const newId = Date.now().toString();
      const newProfile: Profile = {
        id: newId,
        name,
        checkInterval: Number(interval),
        defaultTimeout: Number(timeout),
        consecutiveFailuresLimit: Number(failuresLimit),
        backgroundRunning: bgRunning,
        upSound,
        downSound,
        email,
      };
      const updated = [...profiles, newProfile];
      saveProfilesToStorage(updated);
      setSelectedId(newId);
    }
  };

  const handleDelete = (id: string) => {
    if (id === 'temp-new-profile') {
      if (profiles.length > 0) {
        setSelectedId(profiles[0].id);
        fillForm(profiles[0]);
      } else {
        handleNewProfileClick();
      }
      return;
    }

    const updated = profiles.filter((p) => p.id !== id);
    saveProfilesToStorage(updated);

    // Update active profile switcher fallback
    const activeId = localStorage.getItem('uptime_sentry_active_id');
    if (activeId === id) {
      const nextActive = updated[0]?.id || '';
      localStorage.setItem('uptime_sentry_active_id', nextActive);
      window.dispatchEvent(new CustomEvent('profile-changed', { detail: nextActive }));
    }

    if (updated.length > 0) {
      setSelectedId(updated[0].id);
      fillForm(updated[0]);
    } else {
      handleNewProfileClick();
    }
  };

  // Compute reactive display list including temp profile if active
  const displayProfiles = React.useMemo(() => {
    const list = [...profiles];
    if (selectedId === 'temp-new-profile') {
      list.push({
        id: 'temp-new-profile',
        name: name || 'New Profile',
        checkInterval: interval,
        defaultTimeout: timeout,
        consecutiveFailuresLimit: failuresLimit,
        backgroundRunning: bgRunning,
        upSound,
        downSound,
      });
    }
    return list;
  }, [profiles, selectedId, name, interval, timeout, failuresLimit, bgRunning, upSound, downSound]);

  // Filter profiles list based on search
  const filteredProfiles = displayProfiles.filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // How many targets each profile holds, for the index meta line.
  const targetCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    try {
      const stored = JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]') as { profileId?: string }[];
      stored.forEach((t) => { if (t.profileId) counts.set(t.profileId, (counts.get(t.profileId) ?? 0) + 1); });
    } catch {
      // Unreadable storage: show no counts.
    }
    return counts;
  }, [profiles]);

  const activeId = localStorage.getItem('uptime_sentry_active_id');
  const isNew = selectedId === 'temp-new-profile';
  const selectedCount = selectedId ? targetCounts.get(selectedId) ?? 0 : 0;

  return (
    <Workspace
      index={
        <>
          <IndexHeader title="Profiles" count={profiles.length} action={{ label: 'New', icon: <AddIcon />, onClick: handleNewProfileClick }} />
          {profiles.length > 4 && <IndexFilter value={searchQuery} onChange={setSearchQuery} placeholder="Filter profiles" />}
          <IndexList label="Profiles">
            {filteredProfiles.map((p, i) => {
              const count = targetCounts.get(p.id) ?? 0;
              return (
                <IndexRow
                  key={p.id}
                  n={i + 1}
                  selected={selectedId === p.id}
                  onSelect={() => { handleSelectProfile(p); }}
                  title={p.name}
                  badge={p.id === activeId ? <Tag solid>ACTIVE</Tag> : p.backgroundRunning ? <Tag>BACKGROUND</Tag> : undefined}
                  meta={p.id === 'temp-new-profile' ? 'not saved yet' : `${count} ${count === 1 ? 'target' : 'targets'} · every ${p.checkInterval} s`}
                />
              );
            })}
            {filteredProfiles.length === 0 && <IndexEmpty>No profile matches “{searchQuery}”.</IndexEmpty>}
          </IndexList>
        </>
      }
    >
      <Pass component="form" onSubmit={handleSave} aria-label={isNew ? 'New profile' : `${name} profile`} maxWidth={760}>
        <PassHead
          title={isNew ? 'New profile' : name || 'Untitled profile'}
          description={isNew ? 'Group targets that are checked together, e.g. “Home network” or “Client sites”.' : undefined}
          meta={
            isNew ? undefined : (
              <>
                {selectedId === activeId && <Tag solid>ACTIVE</Tag>}
                <span>{selectedCount} {selectedCount === 1 ? 'target' : 'targets'} · every {interval} s · timeout {timeout} s</span>
              </>
            )
          }
          actions={
            !isNew && selectedId ? (
              <Button variant="outlined" size="small" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => { handleDelete(selectedId); }}>
                Delete
              </Button>
            ) : undefined
          }
        />

        <PassSection label="Name">
          <TextField
            label="Profile name"
            size="small"
            fullWidth
            required
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            helperText="Shown in the profile switcher in the header."
          />
        </PassSection>

        <PassSection label="Checks" hint="Defaults for every target in this profile. A target can override the timeout and failure threshold.">
          <FieldGrid columns={3}>
            <TextField
              label="Check every (s)"
              type="number"
              size="small"
              fullWidth
              required
              value={interval}
              onChange={(e) => { setIntervalVal(Number(e.target.value)); }}
              slotProps={{ htmlInput: { min: 5 } }}
            />
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
          </FieldGrid>
          <FormControlLabel
            sx={{ mt: 2, ml: -0.75, alignItems: 'flex-start' }}
            control={<Checkbox checked={bgRunning} onChange={(e) => { setBgRunning(e.target.checked); }} sx={{ mt: -0.5 }} />}
            label={
              <Box>
                <Box sx={{ fontSize: 14 }}>Keep checking in the background</Box>
                <Box sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>Its targets are still checked while another profile is active.</Box>
              </Box>
            }
          />
        </PassSection>

        <PassSection label="Sounds" hint="Played when one of this profile's targets goes down or recovers." aside={<AddSoundButton />}>
          <Gate ready={caps.soundsOn} reason='Sounds are switched off. Turn on "Play a sound" in Settings to choose them here.'>
            <FieldGrid>
              <SoundSelect
                type="up"
                label="When a target recovers"
                value={upSound}
                onChange={setUpSound}
                inherit={{ value: 'default-app', label: 'App default (from Settings)' }}
                library={sounds}
              />
              <SoundSelect
                type="down"
                label="When a target goes down"
                value={downSound}
                onChange={setDownSound}
                inherit={{ value: 'default-app', label: 'App default (from Settings)' }}
                library={sounds}
              />
            </FieldGrid>
          </Gate>
        </PassSection>

        <PassSection label="Email alerts" hint="Who gets an email when one of this profile's targets goes down. A target can still choose its own.">
          <Gate ready={caps.emailReady || caps.loading} reason={caps.emailBlocker}>
            <EmailRuleEditor
              value={email}
              onChange={setEmail}
              inheritLabel="App default"
              inheritSummary={describeEmail(resolveEmail(undefined, undefined, appEmail), appEmail)}
              inheritedTemplate={appEmail.emailTemplate}
              inheritedRecipients={appEmail.emailRecipients}
              appEnabled={appEmail.emailAlertsEnabled}
            />
          </Gate>
        </PassSection>

        <PassFooter>
          <Button type="submit" variant="contained" size="small" disabled={!name.trim()}>
            {isNew ? 'Create profile' : 'Save profile'}
          </Button>
          {isNew && profiles.length > 0 && (
            <Button variant="text" size="small" onClick={() => { handleDelete('temp-new-profile'); }}>Cancel</Button>
          )}
        </PassFooter>
      </Pass>
    </Workspace>
  );
}
