import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import FileUploadRoundedIcon from '@mui/icons-material/FileUploadRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Backup, createBackup, readBackup, recoveryCommands, restoreBackup, saveFile, summarize } from '../backup';
import { toDateInput } from '../historyStats';

/** "1 target", "3 targets". */
const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** Saves a backup file, optionally with the check history. */
export function ExportBackupButton() {
  const [open, setOpen] = React.useState(false);
  const [history, setHistory] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const backup = await createBackup(history);
      const saved = await saveFile(`UptimeSentry_Backup_${toDateInput(new Date())}.json`, JSON.stringify(backup, null, 2));
      if (saved) setOpen(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The backup failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="small" variant="outlined" startIcon={<FileDownloadRoundedIcon />} onClick={() => { setMessage(null); setOpen(true); }}>
        Export…
      </Button>
      <Dialog open={open} onClose={() => { if (!busy) setOpen(false); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>Export a backup</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            One file with your profiles, targets, settings, maintenance windows, webhooks, scheduled reports and outage notes.
            The mail password is not included; webhook addresses are, so keep the file private.
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={history} onChange={(e) => { setHistory(e.target.checked); }} />}
            label="Include the check history (larger file)"
          />
          {message && <Typography variant="body2" role="alert" sx={{ color: 'error.main', mt: 1 }}>{message}</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button size="small" onClick={() => { setOpen(false); }} disabled={busy}>Cancel</Button>
          <Button size="small" variant="contained" onClick={() => { void run(); }} disabled={busy}>{busy ? 'Exporting…' : 'Save backup'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Picks a backup file, shows what it holds, and replaces the current setup with it. */
export function ImportBackupButton({ variant = 'outlined', label = 'Import…' }: { variant?: 'outlined' | 'text' | 'contained'; label?: string }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [backup, setBackup] = React.useState<Backup | null>(null);
  const [withHistory, setWithHistory] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [trustCommands, setTrustCommands] = React.useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setTrustCommands(false);
    try {
      setBackup(await readBackup(file));
    } catch (e) {
      setBackup(null);
      setError(e instanceof Error ? e.message : 'This file could not be read.');
    }
  };

  const apply = async () => {
    if (!backup) return;
    setBusy(true);
    setError(null);
    try {
      await restoreBackup(backup, withHistory);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The backup could not be restored.');
      setBusy(false);
    }
  };

  const s = backup ? summarize(backup) : null;
  const commands = backup ? recoveryCommands(backup) : [];
  return (
    <>
      <Button size="small" variant={variant} startIcon={<FileUploadRoundedIcon />} onClick={() => { input.current?.click(); }}>{label}</Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      {error && !backup && <Typography variant="caption" role="alert" sx={{ color: 'error.main', display: 'block', mt: 0.5 }}>{error}</Typography>}
      <Dialog open={!!backup} onClose={() => { if (!busy) setBackup(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>Restore this backup?</DialogTitle>
        <DialogContent>
          {s && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Made {new Date(s.exportedAt).toLocaleString()}. It replaces the current profiles, targets, settings and everything else listed here.
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 14, lineHeight: 1.7 }}>
                <li>{n(s.profiles, 'profile')}, {n(s.targets, 'target')}</li>
                <li>{n(s.maintenance, 'maintenance window')}, {n(s.webhooks, 'webhook')}, {n(s.schedules, 'scheduled report')}</li>
                <li>Notes on {n(s.notes, 'outage')}</li>
                {s.checks > 0 && <li>{n(s.checks, 'recorded check')}</li>}
              </Box>
              {s.checks > 0 && (
                <FormControlLabel
                  sx={{ mt: 1 }}
                  control={<Checkbox checked={withHistory} onChange={(e) => { setWithHistory(e.target.checked); }} />}
                  label="Replace the check history too"
                />
              )}
              {commands.length > 0 && (
                <Box role="note" sx={{ mt: 2, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'warning.main' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <WarningAmberRoundedIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                    {n(commands.length, 'target runs a command', 'targets run commands')} on this PC
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
                    {commands.length === 1 ? 'It runs' : 'They run'} with your Windows rights when the target fails. Only restore a backup you made yourself or fully trust.
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 13, maxHeight: 160, overflowY: 'auto' }}>
                    {commands.map((c, i) => (
                      <li key={i}><strong>{c.name}</strong>: <Box component="code" className="selectable" sx={{ wordBreak: 'break-all' }}>{c.command}</Box></li>
                    ))}
                  </Box>
                  <FormControlLabel
                    sx={{ mt: 1 }}
                    control={<Checkbox checked={trustCommands} onChange={(e) => { setTrustCommands(e.target.checked); }} />}
                    label="I trust these commands"
                  />
                </Box>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                The mail password isn&apos;t part of backups; enter it again in Settings if you use email.
              </Typography>
            </>
          )}
          {error && <Typography variant="body2" role="alert" sx={{ color: 'error.main', mt: 1 }}>{error}</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button size="small" onClick={() => { setBackup(null); }} disabled={busy} autoFocus>Cancel</Button>
          <Button size="small" variant="contained" onClick={() => { void apply(); }} disabled={busy || (commands.length > 0 && !trustCommands)}>{busy ? 'Restoring…' : 'Restore'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
