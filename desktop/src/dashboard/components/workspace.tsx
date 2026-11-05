/**
 * Layout pieces shared by the editing screens (Profiles, Targets, Analytics, Settings…),
 * built from the same parts as Home: an index column styled like the gate board, and
 * the selected item shown as a "pass" (white card, dashed segments) on the panel ground.
 */
import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import InputBase from '@mui/material/InputBase';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import type { SxProps, Theme } from '@mui/material/styles';
import { condensed, fonts, gray, ink, paper } from '../../shared-theme/themePrimitives';

export const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

/** Small mono caps label, as used for the pass fields on Home. */
export function Label({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box component="span" sx={[{ ...mono, display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Box>
  );
}

/** Outlined mono tag (HTTP, PING, PAUSED…); `solid` fills it with ink. */
export function Tag({ children, solid }: { children: React.ReactNode; solid?: boolean }) {
  return (
    <Box
      component="span"
      sx={(theme) => ({
        ...mono,
        flexShrink: 0,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.08em',
        lineHeight: '16px',
        px: 0.75,
        borderRadius: '3px',
        border: '1px solid',
        borderColor: solid ? 'text.primary' : 'divider',
        backgroundColor: solid ? (theme.vars || theme).palette.text.primary : 'transparent',
        color: solid ? (theme.vars || theme).palette.background.paper : 'text.secondary',
      })}
    >
      {children}
    </Box>
  );
}

/**
 * Full-height screen: an index column (board style) beside the main area on the panel ground.
 * `main` scrolls on its own; pass `bare` to drop the panel padding.
 */
export function Workspace({ index, children, indexWidth = 320 }: { index: React.ReactNode; children: React.ReactNode; indexWidth?: number }) {
  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      <Box
        component="nav"
        sx={(theme) => ({
          width: { xs: 260, lg: indexWidth },
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          backgroundColor: '#FFFFFF',
          borderRight: `1px solid ${(theme.vars || theme).palette.divider}`,
          ...theme.applyStyles('dark', { backgroundColor: ink }),
        })}
      >
        {index}
      </Box>
      <Box
        sx={(theme) => ({
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          backgroundColor: gray[200],
          ...theme.applyStyles('dark', { backgroundColor: gray[900] }),
        })}
      >
        {children}
      </Box>
    </Box>
  );
}

/** The ink header band of an index column, matching the board's column header. */
export function IndexHeader({ title, count, action, extra }: { title: string; count?: number; action?: { label: string; icon?: React.ReactNode; onClick: () => void }; extra?: React.ReactNode }) {
  return (
    <Box
      sx={{
        ...mono,
        height: 36,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: 2.5,
        pr: 1,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: gray[400],
        backgroundColor: 'var(--board-head-bg)',
        borderBottom: '1px solid var(--board-head-rule)',
      }}
    >
      <Box component="span" sx={{ mr: 'auto' }}>
        {title}
        {count !== undefined && <Box component="span" sx={{ color: gray[500], ml: 1 }}>{count}</Box>}
      </Box>
      {extra}
      {action && (
        <ButtonBase
          onClick={action.onClick}
          sx={{
            font: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            color: paper,
            height: 26,
            px: 1,
            gap: 0.5,
            borderRadius: '3px',
            '& svg': { fontSize: 15 },
            '&:hover': { backgroundColor: 'rgba(242, 242, 238, 0.1)' },
            '&:focus-visible': { outline: `2px solid ${paper}`, outlineOffset: 0 },
          }}
        >
          {action.icon}
          {action.label}
        </ButtonBase>
      )}
    </Box>
  );
}

/** Filter field under an index header. */
export function IndexFilter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: 32,
          px: 1.25,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
          color: 'text.secondary',
          '&:focus-within': { borderColor: 'text.primary' },
        }}
      >
        <SearchRoundedIcon sx={{ fontSize: 18 }} />
        <InputBase
          value={value}
          onChange={(e) => { onChange(e.target.value); }}
          placeholder={placeholder}
          inputProps={{ 'aria-label': placeholder }}
          sx={{ fontSize: 13, flex: 1, color: 'text.primary', '& input::placeholder': { color: 'text.secondary', opacity: 1 } }}
        />
      </Box>
    </Box>
  );
}

/** Scrolling list of index rows. */
export function IndexList({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box role="listbox" aria-label={label} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {children}
    </Box>
  );
}

/**
 * One row of an index column: numbered like the board, name over a mono meta line.
 * The selected row gets the board's ink outline.
 */
export function IndexRow({ n, title, meta, badge, selected, onSelect, marker }: {
  n: number;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  /** Optional fill for the number block, e.g. the signal red for a target that is down. */
  marker?: { bg: string; fg: string };
}) {
  return (
    <ButtonBase
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      sx={(theme) => ({
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 56,
        pl: 2,
        pr: 2,
        py: 1,
        textAlign: 'left',
        borderBottom: `1px solid ${(theme.vars || theme).palette.divider}`,
        outline: selected ? `2px solid ${(theme.vars || theme).palette.text.primary}` : 'none',
        outlineOffset: -2,
        '&:hover': { backgroundColor: (theme.vars || theme).palette.action.hover },
        '&:focus-visible': { outline: `2px solid ${(theme.vars || theme).palette.text.primary}`, outlineOffset: -2 },
      })}
    >
      <Box
        sx={(theme) => ({
          ...mono,
          flexShrink: 0,
          width: 32,
          height: 24,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '4px',
          fontSize: 12,
          fontWeight: 600,
          color: marker ? marker.fg : (theme.vars || theme).palette.text.secondary,
          backgroundColor: marker ? marker.bg : 'transparent',
        })}
      >
        {String(n).padStart(2, '0')}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box component="span" sx={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </Box>
          {badge}
        </Box>
        {meta && (
          <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {meta}
          </Box>
        )}
      </Box>
    </ButtonBase>
  );
}

export function IndexEmpty({ children }: { children: React.ReactNode }) {
  return <Box sx={{ px: 2.5, py: 3, fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>{children}</Box>;
}

/** The pass: a white card on the panel ground, split into dashed segments. */
export function Pass({ children, component = 'section', maxWidth = 820, ...rest }: {
  children: React.ReactNode;
  component?: React.ElementType;
  maxWidth?: number;
  onSubmit?: (e: React.FormEvent) => void;
  'aria-label'?: string;
  noValidate?: boolean;
}) {
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, width: '100%' }}>
      <Box
        component={component}
        {...rest}
        sx={(theme) => ({
          maxWidth,
          mx: 'auto',
          backgroundColor: '#FFFFFF',
          border: `1px solid ${(theme.vars || theme).palette.divider}`,
          borderRadius: 2.5,
          boxShadow: 'var(--template-palette-baseShadow)',
          ...theme.applyStyles('dark', { backgroundColor: ink }),
        })}
      >
        {children}
      </Box>
    </Box>
  );
}

/** First segment of a pass: condensed headline, mono meta line (or a sentence of description) and actions. */
export function PassHead({ title, meta, description, actions }: { title: React.ReactNode; meta?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Box sx={{ px: 3, pt: 2.5, pb: 2, display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
      <Box sx={{ mr: 'auto', minWidth: 0 }}>
        <Box component="h2" sx={{ m: 0, ...condensed, fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.005em', overflowWrap: 'anywhere' }}>
          {title}
        </Box>
        {meta && (
          <Box sx={{ ...mono, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 0.75, fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
            {meta}
          </Box>
        )}
        {description && (
          <Box sx={{ mt: 0.75, fontSize: 14, lineHeight: 1.55, color: 'text.secondary', maxWidth: '72ch' }}>{description}</Box>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{actions}</Box>}
    </Box>
  );
}

/** A labelled pass segment, separated from the one above by the perforated rule. */
export function PassSection({ label, hint, children, aside }: { label: string; hint?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  const id = React.useId();
  return (
    <Box component="section" aria-labelledby={id} sx={{ borderTop: '1px dashed', borderColor: 'divider', px: 3, pt: 2, pb: 2.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: hint ? 0.5 : 1.75 }}>
        <Box component="h3" id={id} sx={{ m: 0 }}>
          <Label>{label}</Label>
        </Box>
        {aside}
      </Box>
      {hint && <Box sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5, mb: 1.75, maxWidth: '68ch' }}>{hint}</Box>}
      {children}
    </Box>
  );
}

/** Two-column field grid inside a section; collapses to one column when narrow. */
export function FieldGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${columns}, minmax(0, 1fr))` }, columnGap: 2, rowGap: 2.5 }}>
      {children}
    </Box>
  );
}

/** Sticky footer of a pass, holding its primary actions. */
export function PassFooter({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        px: 3,
        py: 1.75,
        borderTop: '1px dashed',
        borderColor: 'divider',
        borderRadius: '0 0 10px 10px',
        backgroundColor: '#FFFFFF',
        ...theme.applyStyles('dark', { backgroundColor: ink }),
      })}
    >
      {children}
    </Box>
  );
}

/** A big mono figure with a caption, for summary rows inside a pass. */
export function Figure({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <Box sx={{ ...mono, mt: 0.5, fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Box>
      {sub && <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{sub}</Box>}
    </Box>
  );
}
