import Box from '@mui/material/Box';
import MenuContent from './MenuContent';
import BrandMark from './BrandMark';
import { gray, ink, paper } from '../../shared-theme/themePrimitives';

export const railWidth = 80;

/** The shell rail: matte ink in both schemes, labelled icons, brand mark on top. */
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
        backgroundColor: ink,
        borderRight: `1px solid ${gray[800]}`,
        color: paper,
      }}
    >
      <Box
        title="Uptime Sentry"
        sx={{ height: 56, display: 'grid', placeItems: 'center', color: paper, '--brandmark-ink': ink }}
      >
        <BrandMark size={30} />
      </Box>
      <MenuContent />
    </Box>
  );
}
