import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Switch from '@mui/material/Switch';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { Label, PassSection } from './workspace';
import {
  DEFAULT_LAYOUT, LOCKED_NAV, NavItem, NavLayout, arrange, navItems, navigate, saveNavLayout, secondaryNavItems, useNavLayout,
} from '../nav';

const SECTION_ID = 'settings-sidebar';

/** Goes to Settings and brings this section into view (used by the rail's right-click menu). */
export function openSidebarSettings() {
  navigate('settings');
  // Sections above load their data after mounting and push this one down, so jump again as they settle.
  [80, 400, 900].forEach((ms) => {
    setTimeout(() => { document.getElementById(SECTION_ID)?.scrollIntoView({ block: 'start' }); }, ms);
  });
}

/** Settings: which screens the sidebar shows, and in what order. Changes apply at once. */
export default function SidebarSection() {
  const layout = useNavLayout();
  const isDefault = JSON.stringify(arrange([...navItems, ...secondaryNavItems], layout).map((i) => i.value)) === JSON.stringify(DEFAULT_LAYOUT.order)
    && layout.hidden.length === 0;

  const update = (next: NavLayout) => { saveNavLayout(next); };

  /** Swaps an item with its neighbour inside its own group. */
  const move = (group: NavItem[], value: string, by: -1 | 1) => {
    const list = arrange(group, layout).map((i) => i.value);
    const i = list.indexOf(value);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const top = group === navItems ? list : arrange(navItems, layout).map((x) => x.value);
    const bottom = group === secondaryNavItems ? list : arrange(secondaryNavItems, layout).map((x) => x.value);
    update({ ...layout, order: [...top, ...bottom] });
  };

  const setShown = (value: string, on: boolean) => {
    update({ ...layout, hidden: on ? layout.hidden.filter((v) => v !== value) : [...layout.hidden, value] });
  };

  const group = (title: string, items: NavItem[]) => {
    const list = arrange(items, layout);
    return (
      <Box sx={{ mb: 2 }}>
        <Label sx={{ mb: 0.75 }}>{title}</Label>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
          {list.map((item, i) => {
            const locked = LOCKED_NAV.has(item.value);
            const visible = !layout.hidden.includes(item.value);
            return (
              <Box
                key={item.value}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5, pl: 1.5, pr: 1, py: 0.5,
                  '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' },
                  '& > svg': { fontSize: 20, color: visible ? 'text.primary' : 'text.disabled' },
                }}
              >
                {item.icon}
                <Box sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: visible ? 'text.primary' : 'text.secondary' }}>
                  {item.text}
                  {!visible && <Box component="span" sx={{ fontWeight: 400, ml: 1, fontSize: 12.5 }}>hidden</Box>}
                </Box>
                <IconButton size="small" aria-label={`Move ${item.text} up`} disabled={i === 0} onClick={() => { move(items, item.value, -1); }} sx={{ border: 'none' }}>
                  <ArrowUpwardRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" aria-label={`Move ${item.text} down`} disabled={i === list.length - 1} onClick={() => { move(items, item.value, 1); }} sx={{ border: 'none' }}>
                  <ArrowDownwardRoundedIcon fontSize="small" />
                </IconButton>
                <Box title={locked ? 'Always shown' : undefined} sx={{ display: 'flex' }}>
                  <Switch
                    size="small"
                    checked={visible}
                    disabled={locked}
                    onChange={(e) => { setShown(item.value, e.target.checked); }}
                    slotProps={{ input: { 'aria-label': locked ? `${item.text} is always shown` : `Show ${item.text}` } }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  return (
    <Box id={SECTION_ID} sx={{ scrollMarginTop: 16 }}>
      <PassSection
        label="Sidebar"
        hint="Choose which screens the sidebar shows and in what order. Home and Settings always stay. Right-click the sidebar to get here."
        aside={(
          <Button size="small" startIcon={<RestartAltRoundedIcon />} disabled={isDefault} onClick={() => { update(DEFAULT_LAYOUT); }}>
            Reset
          </Button>
        )}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 2 }}>
          {group('Top', navItems)}
          {group('Bottom', secondaryNavItems)}
        </Box>
      </PassSection>
    </Box>
  );
}
