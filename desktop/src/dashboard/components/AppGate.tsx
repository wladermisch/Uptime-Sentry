import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { API } from '../historyStats';
import { navigate } from '../nav';

/** What Settings has switched on or set up, for screens whose options depend on it. */
export interface AppCapabilities {
  /** Still reading the monitoring service's settings. */
  loading: boolean;
  soundsOn: boolean;
  notificationsOn: boolean;
  emailOn: boolean;
  /** Email is on and a mail server and sender are entered. */
  emailReady: boolean;
  /** Why email isn't ready, in a sentence, or null when it is. */
  emailBlocker: string | null;
  /** A mail server and sender are entered (enough for scheduled reports). */
  mailServerReady: boolean;
  mailServerBlocker: string | null;
}

/** Fired by Settings after saving, so open screens re-read what is set up. */
export const SETTINGS_SAVED = 'settings-saved';

function readLocal(): { soundsOn: boolean; notificationsOn: boolean; emailOn: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem('uptime_sentry_settings') || '{}') as Record<string, unknown>;
    return { soundsOn: s.playSoundAlert !== false, notificationsOn: s.enableNotifications !== false, emailOn: s.emailAlertsEnabled === true };
  } catch {
    return { soundsOn: true, notificationsOn: true, emailOn: false };
  }
}

export function useAppCapabilities(): AppCapabilities {
  const [local, setLocal] = React.useState(readLocal);
  const [server, setServer] = React.useState<{ host: string; from: string } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(() => {
    setLocal(readLocal());
    fetch(`${API}/api/settings`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { smtpHost?: string; smtpFrom?: string }) => { setServer({ host: d.smtpHost ?? '', from: d.smtpFrom ?? '' }); })
      .catch(() => { setServer(null); })
      .finally(() => { setLoading(false); });
  }, []);

  React.useEffect(() => {
    refresh();
    window.addEventListener(SETTINGS_SAVED, refresh);
    return () => { window.removeEventListener(SETTINGS_SAVED, refresh); };
  }, [refresh]);

  let emailBlocker: string | null = null;
  if (!local.emailOn) emailBlocker = 'Outage emails are switched off. Turn on "Email outage details" in Settings first.';
  else if (!server) emailBlocker = "Can't reach the monitoring service to check the mail server setup.";
  else if (!server.host || !server.from) emailBlocker = 'Enter the mail server and send-from address in Settings first.';

  let mailServerBlocker: string | null = null;
  if (!server) mailServerBlocker = "Can't reach the monitoring service to check the mail server setup.";
  else if (!server.host || !server.from) mailServerBlocker = 'Reports are emailed through your own mail server. In Settings, turn on email and enter the server and send-from address first.';

  return { loading, ...local, emailReady: emailBlocker === null, emailBlocker, mailServerReady: mailServerBlocker === null, mailServerBlocker };
}

/**
 * Greys out and disables its children when `ready` is false, with a note saying what to set up
 * in Settings and a button that goes there. Disabled content is `inert`, so it can't be focused or changed.
 */
export function Gate({ ready, reason, children }: { ready: boolean; reason: string | null; children: React.ReactNode }) {
  if (ready) return <>{children}</>;
  return (
    <Box>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, mb: 2, px: 1.5, py: 1.25, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}
      >
        <LockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ flex: '1 1 260px', color: 'text.secondary' }}>{reason}</Typography>
        <Button size="small" variant="outlined" onClick={() => { navigate('settings'); }}>Open Settings</Button>
      </Stack>
      <Box inert aria-disabled sx={{ opacity: 0.45, pointerEvents: 'none', userSelect: 'none', filter: 'grayscale(1)' }}>
        {children}
      </Box>
    </Box>
  );
}

/** States plainly what leaves this computer, so nobody has to guess. */
export function LocalOnlyNote({ email = false }: { email?: boolean }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', color: 'text.secondary' }}>
      <ShieldOutlinedIcon fontSize="small" sx={{ mt: '1px' }} />
      <Typography variant="caption" sx={{ lineHeight: 1.5, fontSize: 12.5 }}>
        Uptime Sentry runs entirely on this computer. History, settings and passwords stay here; there is no account, cloud service or tracking.
        The only network traffic is the checks to your own targets and the update check on GitHub.
        {email
          ? ' Outage emails go only through the mail server you enter here, to the addresses you choose.'
          : ' Outage emails are only sent once you set up your own mail server.'}
        {' Webhooks only go to addresses you add, the status page is only shared on your network if you switch that on, and network discovery is off until you turn it on and start a search.'}
      </Typography>
    </Stack>
  );
}
