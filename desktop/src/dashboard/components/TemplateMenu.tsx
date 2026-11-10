import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import BookmarksOutlinedIcon from '@mui/icons-material/BookmarksOutlined';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Template, deleteTemplate, loadTemplates, saveTemplate } from '../templates';
import { mono } from './workspace';

/**
 * "Templates" button: load a saved setup into the form, save the current one under a name,
 * or remove one. `current()` is read only when saving.
 */
export default function TemplateMenu<T>({ kind, current, onLoad, suggestName, describe, disabled }: {
  kind: string;
  current: () => T;
  onLoad: (data: T, name: string) => void;
  suggestName?: string;
  /** One line under each template's name. */
  describe?: (data: T) => string;
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [list, setList] = React.useState<Template<T>[]>(() => loadTemplates<T>(kind));
  const [naming, setNaming] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<string | null>(null);

  const open = (e: React.MouseEvent<HTMLElement>) => { setList(loadTemplates<T>(kind)); setAnchor(e.currentTarget); };
  const say = (text: string) => { setFlash(text); setTimeout(() => { setFlash(null); }, 2000); };

  const exists = naming !== null && list.some((t) => t.name.toLowerCase() === naming.trim().toLowerCase());

  const confirmSave = () => {
    if (!naming?.trim()) return;
    setList(saveTemplate(kind, naming, current()));
    say(`Saved “${naming.trim()}”`);
    setNaming(null);
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<BookmarksOutlinedIcon />}
        onClick={open}
        disabled={disabled}
        aria-haspopup="menu"
      >
        {flash ?? `Templates${list.length ? ` · ${list.length}` : ''}`}
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => { setAnchor(null); }}
        slotProps={{ paper: { sx: { minWidth: 280, maxWidth: 380 } } }}
      >
        {list.length === 0 && (
          <Box sx={{ px: 2, py: 1.25, maxWidth: 320 }}>
            <Typography variant="body2" sx={{ color: 'text.primary' }}>No templates yet.</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Save the current setup to reuse it in one click.</Typography>
          </Box>
        )}
        {list.map((t) => (
          <MenuItem
            key={t.name}
            onClick={() => { onLoad(t.data, t.name); setAnchor(null); say(`Loaded “${t.name}”`); }}
            sx={{ gap: 1, alignItems: 'center', pr: 1 }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</Box>
              {describe && (
                <Box sx={{ ...mono, fontSize: 11.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describe(t.data)}</Box>
              )}
            </Box>
            <IconButton
              size="small"
              aria-label={`Delete template ${t.name}`}
              title="Delete template"
              onClick={(e) => { e.stopPropagation(); setList(deleteTemplate<T>(kind, t.name)); }}
              sx={{ border: 'none' }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); setNaming(suggestName ?? ''); }} sx={{ gap: 1 }}>
          <BookmarkAddOutlinedIcon fontSize="small" />
          <Box sx={{ fontSize: 14 }}>Save current as template…</Box>
        </MenuItem>
      </Menu>

      <Dialog open={naming !== null} onClose={() => { setNaming(null); }} maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); confirmSave(); }}>
          <DialogTitle sx={{ fontSize: 17, fontWeight: 700 }}>Save as template</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Template name"
              value={naming ?? ''}
              onChange={(e) => { setNaming(e.target.value); }}
              helperText={exists ? 'A template with this name exists and will be replaced.' : ' '}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button size="small" onClick={() => { setNaming(null); }}>Cancel</Button>
            <Button size="small" variant="contained" type="submit" disabled={!naming?.trim()}>{exists ? 'Replace' : 'Save'}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
