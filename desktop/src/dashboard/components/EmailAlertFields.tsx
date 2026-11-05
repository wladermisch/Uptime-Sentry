import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { fonts, signal } from '../../shared-theme/themePrimitives';
import { API } from '../historyStats';
import {
  DEFAULT_TEMPLATE, EmailMode, EmailRule, EmailTemplate, PLACEHOLDERS, isEmail, renderSample, splitAddresses,
} from '../emailAlerts';
import { Label } from './workspace';

const mono = { fontFamily: fonts.mono } as const;

/** Address list as chips. Typing a comma, semicolon, space or Enter adds the address; pasted lists are split. */
export function RecipientsInput({ value, onChange, label = 'Send to', helperText }: {
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
  helperText?: string;
}) {
  const [input, setInput] = React.useState('');
  const invalid = value.filter((v) => !isEmail(v));

  const add = (text: string) => {
    const parts = splitAddresses(text);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setInput('');
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      options={[]}
      value={value}
      inputValue={input}
      onInputChange={(_e, v, reason) => {
        if (reason === 'reset') return;
        if (/[\s,;]/.test(v)) add(v);
        else setInput(v);
      }}
      onChange={(_e, v) => { onChange(v.flatMap((x) => splitAddresses(String(x)))); }}
      onBlur={() => { if (input.trim()) add(input); }}
      renderValue={(selected, getItemProps) =>
        selected.map((option, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          const bad = !isEmail(option);
          return (
            <Chip
              key={key}
              {...itemProps}
              size="small"
              label={option}
              variant="outlined"
              sx={{ ...mono, fontSize: 12.5, ...(bad && { borderColor: signal.down, color: signal.downInk }) }}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          size="small"
          placeholder={value.length ? '' : 'name@example.com, team@example.com'}
          error={invalid.length > 0}
          helperText={invalid.length ? `Not an email address: ${invalid.join(', ')}` : helperText ?? 'Separate addresses with commas. Each person gets the same message.'}
        />
      )}
    />
  );
}

/** Subject and message fields for one event, with clickable placeholders and a live preview. */
function MessageFields({ event, subject, body, onSubject, onBody, defaults }: {
  event: 'DOWN' | 'UP';
  subject: string;
  body: string;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  defaults: { subject: string; body: string };
}) {
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const lastFocus = React.useRef<'subject' | 'body'>('body');
  const [preview, setPreview] = React.useState(false);

  const insert = (key: string) => {
    const token = `{${key}}`;
    const target = lastFocus.current;
    const el = target === 'subject' ? subjectRef.current : bodyRef.current;
    const current = target === 'subject' ? subject : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    (target === 'subject' ? onSubject : onBody)(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const changed = subject !== defaults.subject || body !== defaults.body;

  return (
    <Stack spacing={1.5}>
      <TextField
        label="Subject"
        size="small"
        fullWidth
        value={subject}
        inputRef={subjectRef}
        onFocus={() => { lastFocus.current = 'subject'; }}
        onChange={(e) => { onSubject(e.target.value); }}
      />
      <TextField
        label="Message"
        size="small"
        fullWidth
        multiline
        minRows={6}
        maxRows={16}
        value={body}
        inputRef={bodyRef}
        onFocus={() => { lastFocus.current = 'body'; }}
        onChange={(e) => { onBody(e.target.value); }}
        slotProps={{ htmlInput: { style: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 1.55 } } }}
      />
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
          Insert details at the cursor:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {PLACEHOLDERS.map((p) => (
            <ButtonBase
              key={p.key}
              title={p.label}
              aria-label={`Insert ${p.label}`}
              onMouseDown={(e) => { e.preventDefault(); }}
              onClick={() => { insert(p.key); }}
              sx={{
                ...mono,
                fontSize: 12,
                px: 0.875,
                height: 24,
                borderRadius: '4px',
                border: '1px dashed',
                borderColor: 'divider',
                color: 'text.secondary',
                '&:hover': { borderStyle: 'solid', borderColor: 'text.primary', color: 'text.primary' },
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 1 },
              }}
            >
              {`{${p.key}}`}
            </ButtonBase>
          ))}
        </Box>
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Button size="small" variant="text" onClick={() => { setPreview((v) => !v); }} aria-expanded={preview}>
          {preview ? 'Hide preview' : 'Preview with example values'}
        </Button>
        {changed && (
          <Button size="small" variant="text" onClick={() => { onSubject(defaults.subject); onBody(defaults.body); }}>
            Reset to default text
          </Button>
        )}
      </Stack>
      {preview && (
        <Box
          sx={(theme) => ({
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1.5,
            backgroundColor: (theme.vars || theme).palette.background.default,
            overflow: 'hidden',
          })}
        >
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px dashed', borderColor: 'divider' }}>
            <Label>Subject</Label>
            <Typography sx={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{renderSample(subject, event)}</Typography>
          </Box>
          <Box component="pre" className="selectable" sx={{ ...mono, fontSize: 12.5, lineHeight: 1.6, m: 0, px: 2, py: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {renderSample(body, event)}
          </Box>
        </Box>
      )}
    </Stack>
  );
}

/** Down message, plus the optional recovery message. */
export function TemplateFields({ value, onChange }: { value: EmailTemplate; onChange: (v: EmailTemplate) => void }) {
  return (
    <Stack spacing={2.5}>
      <Box>
        <Label>When a target goes down</Label>
        <Box sx={{ mt: 1 }}>
          <MessageFields
            event="DOWN"
            subject={value.downSubject}
            body={value.downBody}
            onSubject={(v) => { onChange({ ...value, downSubject: v }); }}
            onBody={(v) => { onChange({ ...value, downBody: v }); }}
            defaults={{ subject: DEFAULT_TEMPLATE.downSubject, body: DEFAULT_TEMPLATE.downBody }}
          />
        </Box>
      </Box>
      <Box>
        <FormControlLabel
          control={<Checkbox checked={value.onRecovery} onChange={(e) => { onChange({ ...value, onRecovery: e.target.checked }); }} />}
          label="Also send an email when it's back up"
          sx={{ ml: -1, '& .MuiFormControlLabel-label': { fontSize: 14 } }}
        />
        {value.onRecovery && (
          <Box sx={{ mt: 1 }}>
            <MessageFields
              event="UP"
              subject={value.upSubject}
              body={value.upBody}
              onSubject={(v) => { onChange({ ...value, upSubject: v }); }}
              onBody={(v) => { onChange({ ...value, upBody: v }); }}
              defaults={{ subject: DEFAULT_TEMPLATE.upSubject, body: DEFAULT_TEMPLATE.upBody }}
            />
          </Box>
        )}
      </Box>
    </Stack>
  );
}

/** Mail server fields a test can use before they are saved. Password is only sent when typed. */
export interface SmtpDraft {
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: string;
  smtpUsername: string;
  smtpPassword?: string;
  smtpFrom: string;
  smtpFromName: string;
}

/** Sends a sample message to the given recipients and shows what the mail server said. */
export function TestEmailButton({ recipients, template, smtp, disabledReason }: {
  recipients: string[];
  template: EmailTemplate;
  smtp?: SmtpDraft;
  disabledReason?: string;
}) {
  const [state, setState] = React.useState<{ kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; ok: boolean; message: string }>({ kind: 'idle' });
  const valid = recipients.filter(isEmail);
  const reason = disabledReason ?? (valid.length === 0 ? 'Add at least one address to send a test.' : undefined);

  const send = async () => {
    setState({ kind: 'sending' });
    try {
      const r = await fetch(`${API}/api/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients: valid, subject: template.downSubject, body: template.downBody, smtp }),
      });
      const data = (await r.json()) as { ok: boolean; message: string };
      setState({ kind: 'done', ok: data.ok, message: data.message });
    } catch {
      setState({ kind: 'done', ok: false, message: "Can't reach the monitoring service at 127.0.0.1:8765." });
    }
  };

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}>
      <Button
        size="small"
        variant="outlined"
        disabled={!!reason || state.kind === 'sending'}
        startIcon={state.kind === 'sending' ? <CircularProgress size={14} color="inherit" /> : <SendRoundedIcon />}
        onClick={() => { void send(); }}
        sx={{ flexShrink: 0 }}
      >
        {state.kind === 'sending' ? 'Sending…' : 'Send test email'}
      </Button>
      <Typography
        role="status"
        variant="body2"
        sx={(theme) => ({
          pt: 0.5,
          flex: '1 1 240px',
          color: state.kind === 'done' && !state.ok ? signal.downInk : 'text.secondary',
          ...theme.applyStyles('dark', { color: state.kind === 'done' && !state.ok ? signal.downOnDark : undefined }),
        })}
      >
        {state.kind === 'done' ? state.message : reason ?? 'Sends the "goes down" message with example values.'}
      </Typography>
    </Stack>
  );
}

const MODE_LABEL: Record<EmailMode, string> = { inherit: '', custom: 'Custom', off: "Don't email" };

/**
 * Email rule for a profile or target: inherit from the level above, custom recipients and message, or no email.
 * `inheritLabel` names the level above; `inheritSummary` says what that currently does.
 */
export function EmailRuleEditor({ value, onChange, inheritLabel, inheritSummary, inheritedTemplate, inheritedRecipients, appEnabled }: {
  value: EmailRule;
  onChange: (v: EmailRule) => void;
  inheritLabel: string;
  inheritSummary: string;
  inheritedTemplate: EmailTemplate;
  inheritedRecipients: string[];
  appEnabled: boolean;
}) {
  const setMode = (mode: EmailMode | null) => {
    if (!mode) return;
    if (mode === 'custom' && value.mode !== 'custom' && value.recipients.length === 0) {
      // Start from what applies now, so a small change doesn't mean retyping everything.
      onChange({ ...value, ...inheritedTemplate, recipients: inheritedRecipients, mode });
    } else {
      onChange({ ...value, mode });
    }
  };

  return (
    <Stack spacing={2}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value.mode}
        onChange={(_e, v: EmailMode | null) => { setMode(v); }}
        aria-label="Outage emails"
        sx={{ flexWrap: 'wrap' }}
      >
        <ToggleButton value="inherit">{inheritLabel}</ToggleButton>
        <ToggleButton value="custom">{MODE_LABEL.custom}</ToggleButton>
        <ToggleButton value="off">{MODE_LABEL.off}</ToggleButton>
      </ToggleButtonGroup>

      {value.mode === 'inherit' && (
        <Typography variant="body2" color="text.secondary">{inheritSummary}</Typography>
      )}
      {value.mode === 'off' && (
        <Typography variant="body2" color="text.secondary">No outage emails for this {inheritLabel.includes('profile') ? 'target' : 'profile'}.</Typography>
      )}
      {value.mode === 'custom' && (
        <>
          {!appEnabled && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Outage emails are switched off in Settings, so nothing is sent until you switch them on there.
            </Typography>
          )}
          <RecipientsInput value={value.recipients} onChange={(recipients) => { onChange({ ...value, recipients }); }} />
          <TemplateFields value={value} onChange={(t) => { onChange({ ...value, ...t }); }} />
          <TestEmailButton recipients={value.recipients} template={value} />
        </>
      )}
    </Stack>
  );
}
