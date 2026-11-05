import * as React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';


// Views
import Header from './components/Header';
import MainGrid from './components/MainGrid';
import SideMenu from './components/SideMenu';
import ProfilesTab from './components/ProfilesTab';
import TargetsTab from './components/TargetsTab';
import SettingsTab from './components/SettingsTab';
import AnalyticsTab from './components/AnalyticsTab';
import ReportsTab from './components/ReportsTab';
import AboutTab from './components/AboutTab';
import FeedbackTab from './components/FeedbackTab';

// ── Interfaces ───────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
}

interface Target {
  id?: number;
  profileId: string;
  name: string;
  type: string;
  host: string;
  timeout: number;
  recoveryAction: string;
  acceptableStatusCodes: number[];
  consecutiveFailuresLimit: number;
  profileName: string;
}

// ── Dashboard Component ───────────────────────────────────────────────────────

import OnboardingModal from './components/OnboardingModal';
import { dropDuplicateTargets, migrateTargetIds } from './targetIds';
import { syncTargetsToBackend } from './backendSync';
import { gray } from '../shared-theme/themePrimitives';

/** Screens that lay out their own columns edge to edge, like Home's board and pass. */
const FULL_BLEED_TABS = new Set(['home', 'profiles', 'targets', 'analytics', 'reports']);

export default function Dashboard() {
  const [activeTab, setActiveTab] = React.useState('home');
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  React.useEffect(() => {
    const onboarded = localStorage.getItem('uptime_sentry_onboarded');
    if (!onboarded) {
      setShowOnboarding(true);
    }
  }, []);

  const seedDefaults = React.useCallback(() => {
    // 1. Seed Profiles if empty
    if (!localStorage.getItem('uptime_sentry_profiles')) {
      const defaultProfiles: Profile[] = [
        { id: '1', name: 'Standard Profile', defaultTimeout: 5, checkInterval: 60, consecutiveFailuresLimit: 2, backgroundRunning: false },
        { id: '2', name: 'Dev Profile', defaultTimeout: 3, checkInterval: 30, consecutiveFailuresLimit: 1, backgroundRunning: false }
      ];
      localStorage.setItem('uptime_sentry_profiles', JSON.stringify(defaultProfiles));
      localStorage.setItem('uptime_sentry_active_id', '1');
    }

    // 2. Seed Targets if empty
    if (!localStorage.getItem('uptime_sentry_targets')) {
      const defaultTargets: Target[] = [
        { id: 1, profileId: '1', name: 'Google DNS', type: 'PING', host: '8.8.8.8', timeout: 5, recoveryAction: '', acceptableStatusCodes: [], consecutiveFailuresLimit: 2, profileName: 'Standard Profile' },
        { id: 2, profileId: '1', name: 'GitHub Portal', type: 'HTTP', host: 'https://github.com', timeout: 5, recoveryAction: '', acceptableStatusCodes: [200], consecutiveFailuresLimit: 2, profileName: 'Standard Profile' },
        { id: 3, profileId: '2', name: 'Local API Service', type: 'HTTP', host: 'http://localhost:8765/api/targets', timeout: 3, recoveryAction: '', acceptableStatusCodes: [200], consecutiveFailuresLimit: 1, profileName: 'Dev Profile' }
      ];
      localStorage.setItem('uptime_sentry_targets', JSON.stringify(defaultTargets));
    }

    // 3. Older versions gave targets `Date.now()` ids, which the backend's int ids can't hold.
    //    Renumber them once so they can sync and be checked.
    try {
      const stored = JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]') as Target[];
      const migrated = migrateTargetIds(stored);
      const deduped = dropDuplicateTargets(migrated.targets);
      if (migrated.changed || deduped.changed) localStorage.setItem('uptime_sentry_targets', JSON.stringify(deduped.targets));
    } catch (e) {
      console.error('Failed to migrate target ids', e);
    }
  }, []);

  const triggerSync = React.useCallback(() => {
    void syncTargetsToBackend();
  }, []);

  React.useEffect(() => {
    seedDefaults();
    triggerSync();

    const handleTab = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setActiveTab(detail);
    };

    const handleProfile = () => {
      triggerSync();
    };

    window.addEventListener('nav-tab', handleTab);
    window.addEventListener('profile-changed', handleProfile);
    window.addEventListener('profiles-updated', handleProfile);
    window.addEventListener('sync-targets', handleProfile);
    return () => {
      window.removeEventListener('sync-targets', handleProfile);
      window.removeEventListener('nav-tab', handleTab);
      window.removeEventListener('profile-changed', handleProfile);
      window.removeEventListener('profiles-updated', handleProfile);
    };
  }, [seedDefaults, triggerSync]);

  const renderContent = () => {
    switch (activeTab) {
      case 'profiles':  return <ProfilesTab />;
      case 'targets':   return <TargetsTab />;
      case 'analytics': return <AnalyticsTab />;
      case 'reports':   return <ReportsTab />;
      case 'settings':  return <SettingsTab />;
      case 'about':     return <AboutTab />;
      case 'feedback':  return <FeedbackTab />;
      case 'home':
      default:          return <MainGrid />;
    }
  };

  return (
    <>
      <CssBaseline enableColorScheme />
      <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <SideMenu />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', backgroundColor: 'background.default' }}>
          <Header activeTab={activeTab} />
          {FULL_BLEED_TABS.has(activeTab) ? (
            <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
              {renderContent()}
            </Box>
          ) : (
            <Box
              component="main"
              sx={(theme) => ({
                flex: 1,
                minHeight: 0,
                overflow: 'auto',
                backgroundColor: gray[200],
                ...theme.applyStyles('dark', { backgroundColor: gray[900] }),
              })}
            >
              <Stack sx={{ alignItems: 'center' }}>
                {renderContent()}
              </Stack>
            </Box>
          )}
        </Box>
      </Box>
      <OnboardingModal open={showOnboarding} onClose={() => { setShowOnboarding(false); }} />
    </>
  );
}
