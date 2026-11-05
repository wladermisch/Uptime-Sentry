import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import ListSubheader from '@mui/material/ListSubheader';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import FormControlLabel from '@mui/material/FormControlLabel';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import LibraryMusicOutlinedIcon from '@mui/icons-material/LibraryMusicOutlined';
import { signal } from '../../shared-theme/themePrimitives';
import { API } from '../historyStats';

export type SoundType = 'up' | 'down';

interface Library {
  up: string[];
  down: string[];
  custom: { up: string[]; down: string[] };
}

const FALLBACK: Library = {
  up: ['Up-Default.wav', 'Up2.wav', 'Up3.wav', 'Notification Modern.wav', 'Notification1.wav', 'Notification2.wav'],
  down: ['Down-Default.wav', 'Down Modern.wav', 'Down-2.wav', 'Down3.wav', 'Critical-Alert.wav', 'Error.wav', 'Notification Modern.wav', 'Notification Warning.wav', 'Notification1.wav', 'Notification2.wav'],
  custom: { up: [], down: [] },
};

const LIBRARY_CHANGED = 'sound-library-changed';

/** Sounds the monitoring service can play, refreshed when someone adds one. */
export function useSoundLibrary(): Library {
  const [lib, setLib] = React.useState<Library>(FALLBACK);
  React.useEffect(() => {
    const load = () => {
      fetch(`${API}/api/audio/list`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: Partial<Library>) => {
          setLib({
            up: d.up?.length ? d.up : FALLBACK.up,
            down: d.down?.length ? d.down : FALLBACK.down,
            custom: { up: d.custom?.up ?? [], down: d.custom?.down ?? [] },
          });
        })
        .catch(() => { /* keep the built-in list */ });
    };
    load();
    window.addEventListener(LIBRARY_CHANGED, load);
    return () => { window.removeEventListener(LIBRARY_CHANGED, load); };
  }, []);
  return lib;
}

/** "Down-Default.wav" → "Down Default". */
export function soundLabel(file: string): string {
  return file.replace(/\.wav$/i, '').replace(/[-_]+/g, ' ').trim();
}

export function previewSound(file: string, type: SoundType, volume = 0.8) {
  try {
    const audio = new Audio(`${API}/api/audio/stream?type=${type}&file=${encodeURIComponent(file)}`);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => { /* playback blocked: nothing to do */ });
  } catch {
    // Audio unavailable.
  }
}

/**
 * A pick-only sound list (no typing): an optional "inherit" choice, "No sound", the built-in sounds
 * and the ones added on this computer, with a play button to hear the current choice.
 */
export function SoundSelect({ type, label, value, onChange, inherit, allowSilent = true, library, volume }: {
  type: SoundType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** e.g. { value: 'default-profile', label: "Profile's sound" } */
  inherit?: { value: string; label: string };
  allowSilent?: boolean;
  library: Library;
  volume?: number;
}) {
  const builtIn = library[type].filter((f) => !library.custom[type].includes(f));
  const added = library.custom[type];
  const known = [inherit?.value, allowSilent ? 'no-sound' : undefined, ...library[type]].filter(Boolean);
  // Keep a saved choice visible even if its file has gone missing.
  const missing = value && !known.includes(value) ? value : null;
  const playable = value && value !== 'no-sound' && value !== inherit?.value;

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v);
          if (v !== 'no-sound' && v !== inherit?.value) previewSound(v, type, volume);
        }}
      >
        {inherit && <MenuItem value={inherit.value}>{inherit.label}</MenuItem>}
        {allowSilent && <MenuItem value="no-sound">No sound</MenuItem>}
        {missing && <MenuItem value={missing} sx={{ color: signal.downInk }}>{soundLabel(missing)} (missing)</MenuItem>}
        <ListSubheader>Built-in</ListSubheader>
        {builtIn.map((f) => <MenuItem key={f} value={f}>{soundLabel(f)}</MenuItem>)}
        {added.length > 0 && <ListSubheader>Added on this computer</ListSubheader>}
        {added.map((f) => <MenuItem key={`c-${f}`} value={f}>{soundLabel(f)}</MenuItem>)}
      </TextField>
      <Tooltip title={playable ? 'Play' : 'Pick a sound to play it'}>
        <span>
          <IconButton size="small" aria-label={`Play ${label.toLowerCase()}`} disabled={!playable} onClick={() => { previewSound(value, type, volume); }}>
            <PlayArrowRoundedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}

/** Lets people add their own WAV file to the sound list, for going down, recovering, or both. */
export function AddSoundButton({ onAdded }: { onAdded?: (name: string, types: SoundType[]) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [use, setUse] = React.useState<'down' | 'up' | 'both'>('down');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const types: SoundType[] = use === 'both' ? ['down', 'up'] : [use];
    try {
      const body = await file.arrayBuffer();
      let saved = file.name;
      for (const t of types) {
        const r = await fetch(`${API}/api/audio/upload?type=${t}&name=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav' },
          body,
        });
        if (!r.ok) throw new Error(await r.text());
        saved = ((await r.json()) as { name: string }).name;
      }
      window.dispatchEvent(new CustomEvent(LIBRARY_CHANGED));
      onAdded?.(saved, types);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Can't reach the monitoring service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".wav,audio/wav,audio/x-wav"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (!f) return;
          setError(f.size > 5 * 1024 * 1024 ? 'The file is larger than 5 MB.' : null);
          setFile(f);
        }}
      />
      <Button size="small" variant="outlined" startIcon={<LibraryMusicOutlinedIcon />} onClick={() => { input.current?.click(); }}>
        Add sound…
      </Button>
      <Dialog open={!!file} onClose={() => { if (!busy) setFile(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add a sound</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file?.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Copied into the app&apos;s sound folder on this computer. WAV files only, up to 5 MB.
          </Typography>
          <RadioGroup value={use} onChange={(e) => { setUse(e.target.value as 'down' | 'up' | 'both'); }}>
            <FormControlLabel value="down" control={<Radio size="small" />} label="For when a target goes down" />
            <FormControlLabel value="up" control={<Radio size="small" />} label="For when a target recovers" />
            <FormControlLabel value="both" control={<Radio size="small" />} label="For both" />
          </RadioGroup>
          {error && <Box role="alert" sx={{ mt: 1.5, fontSize: 13, color: signal.downInk }}>{error}</Box>}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" disabled={busy} onClick={() => { setFile(null); }}>Cancel</Button>
          <Button variant="contained" disabled={busy || !!(file && file.size > 5 * 1024 * 1024)} onClick={() => { void upload(); }}>
            {busy ? 'Adding…' : 'Add sound'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
