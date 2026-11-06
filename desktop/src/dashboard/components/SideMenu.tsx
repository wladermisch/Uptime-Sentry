import Box from '@mui/material/Box';
import MenuContent from './MenuContent';
import BrandMark from './BrandMark';

export const railWidth = 80;

/** The shell rail: white in light mode, matte ink in dark mode (colors in index.css), labelled icons, brand mark on top. */
export default function SideMenu() {
  return (
    <Box
      component="aside"
      sx={{
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        alignItems: 'center',
        width: railWidth,
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        backgroundColor: 'var(--rail-bg)',
        borderRight: '1px solid var(--rail-rule)',
        color: 'var(--rail-ink)',
      }}
    >
      <Box
        title="Uptime Sentry"
        sx={{ height: 56, display: 'grid', placeItems: 'center', color: 'var(--rail-brand)', '--brandmark-ink': 'var(--rail-brand-ink)' }}
      >
        <BrandMark size={30} />
      </Box>
      <MenuContent />
    </Box>
  );
}
