import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { arrange, navItems, secondaryNavItems, navigate, useNavLayout } from '../nav';
import { openSidebarSettings } from './SidebarSection';
import { fonts, signal } from '../../shared-theme/themePrimitives';

function RailItem(props: {
  item: { text: string; value: string; icon: React.ReactNode };
  active: boolean;
  badge?: number;
}) {
  const { item, active, badge } = props;
  const label = badge ? `${item.text}, ${badge} down` : item.text;
  return (
    <ButtonBase
        onClick={() => { navigate(item.value); }}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        sx={{
          position: 'relative',
          width: 72,
          py: 1,
          borderRadius: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
          color: active ? 'var(--rail-active-ink)' : 'var(--rail-ink)',
          backgroundColor: active ? 'var(--rail-active-bg)' : 'transparent',
          transition: 'background-color 160ms ease-out, color 160ms ease-out',
          '& svg': { fontSize: 22 },
          '&:hover': active ? {} : { color: 'var(--rail-hover-ink)', backgroundColor: 'var(--rail-hover-bg)' },
          '&:focus-visible': { outline: '2px solid var(--rail-hover-ink)', outlineOffset: 2 },
        }}
      >
        {item.icon}
        <Box component="span" sx={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, letterSpacing: '0.01em' }}>
          {item.text}
        </Box>
        {badge ? (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: 4,
              right: 8,
              minWidth: 18,
              height: 18,
              px: 0.5,
              borderRadius: 9,
              backgroundColor: signal.down,
              color: '#FFFFFF',
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 700,
              lineHeight: '18px',
              textAlign: 'center',
            }}
          >
            {badge}
          </Box>
        ) : null}
    </ButtonBase>
  );
}

export default function MenuContent() {
  const [active, setActive] = React.useState('home');
  const [downCount, setDownCount] = React.useState(0);
  const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
  const layout = useNavLayout();
  const shown = (items: typeof navItems) => arrange(items, layout).filter((i) => !layout.hidden.includes(i.value));

  React.useEffect(() => {
    const onTab = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail) setActive(detail);
    };
    const onSummary = (e: Event) => {
      const detail = (e as CustomEvent<{ down: number }>).detail;
      setDownCount(detail?.down ?? 0);
    };
    window.addEventListener('nav-tab', onTab);
    window.addEventListener('board-summary', onSummary);
    return () => {
      window.removeEventListener('nav-tab', onTab);
      window.removeEventListener('board-summary', onSummary);
    };
  }, []);

  return (
    <Box
      component="nav"
      aria-label="Main"
      onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {shown(navItems).map((item) => (
          <RailItem
            key={item.value}
            item={item}
            active={active === item.value}
            badge={item.value === 'home' ? downCount : undefined}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {shown(secondaryNavItems).map((item) => (
          <RailItem key={item.value} item={item} active={active === item.value} />
        ))}
      </Box>
      <Menu
        open={!!menu}
        onClose={() => { setMenu(null); }}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem onClick={() => { setMenu(null); openSidebarSettings(); }} sx={{ gap: 1, fontSize: 14 }}>
          <TuneRoundedIcon fontSize="small" />
          Customize sidebar…
        </MenuItem>
      </Menu>
    </Box>
  );
}
