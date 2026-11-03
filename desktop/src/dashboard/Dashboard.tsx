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

  const syncTargetsToBackend = React.useCallback(async (allTargets: Target[], allProfiles: Profile[], activeId: string) => {
    const activeTargets = allTargets.filter(
      (t) => t.profileId === activeId || allProfiles.find((p) => p.id === t.profileId)?.backgroundRunning
    );

    try {
      await fetch('http://127.0.0.1:8765/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          activeTargets.map((t, idx) => ({
            id: t.id || idx + 1,
            name: t.name,
            type: t.type,
            host: t.host,
            timeout: t.timeout,
            recoveryAction: t.recoveryAction,
            acceptableStatusCodes: t.acceptableStatusCodes,
            consecutiveFailuresLimit: t.consecutiveFailuresLimit,
            profileName: t.profileName
          }))
        ),
      });
    } catch (e) {
      console.error('Failed to sync targets to Java backend:', e);
    }
  }, []);

  const triggerSync = React.useCallback(() => {
    const storedProfiles = localStorage.getItem('uptime_sentry_profiles');
    const storedTargets = localStorage.getItem('uptime_sentry_targets');
    const activeId = localStorage.getItem('uptime_sentry_active_id');
    if (storedProfiles && storedTargets && activeId) {
      void syncTargetsToBackend(JSON.parse(storedTargets), JSON.parse(storedProfiles), activeId);
    }
  }, [syncTargetsToBackend]);

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
          {activeTab === 'home' ? (
            <Box component="main" sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <MainGrid />
            </Box>
          ) : (
            <Box component="main" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <Stack spacing={2} sx={{ alignItems: 'center', mx: 3, py: 3 }}>
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
