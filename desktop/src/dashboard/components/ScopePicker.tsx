import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import { Scope } from '../serverData';

interface ScopeValue {
  scope: Scope;
  profileId?: string | null;
  targetIds: number[];
}

/** All targets, one profile, or picked targets. */
export default function ScopePicker({ value, onChange, profiles, targets, allLabel = 'All targets' }: {
  value: ScopeValue;
  onChange: (v: ScopeValue) => void;
  profiles: { id: string; name: string }[];
  targets: { id: number; name: string; profileId: string }[];
  allLabel?: string;
}) {
  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? '';
  const picked = targets.filter((t) => value.targetIds.includes(t.id));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '220px 1fr' }, gap: 2, alignItems: 'start' }}>
      <TextField
        select
        label="Applies to"
        size="small"
        value={value.scope}
        onChange={(e) => {
          const scope = e.target.value as Scope;
          onChange({ ...value, scope, profileId: scope === 'PROFILE' ? (value.profileId || profiles[0]?.id || null) : value.profileId });
        }}
      >
        <MenuItem value="ALL">{allLabel}</MenuItem>
        <MenuItem value="PROFILE">One profile</MenuItem>
        <MenuItem value="TARGETS">Chosen targets</MenuItem>
      </TextField>
      {value.scope === 'PROFILE' && (
        <TextField select label="Profile" size="small" value={value.profileId ?? ''} onChange={(e) => { onChange({ ...value, profileId: e.target.value }); }}>
          {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
      )}
      {value.scope === 'TARGETS' && (
        <Autocomplete
          multiple
          size="small"
          options={targets}
          value={picked}
          groupBy={(t) => profileName(t.profileId)}
          getOptionLabel={(t) => t.name}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_e, list) => { onChange({ ...value, targetIds: list.map((t) => t.id) }); }}
          renderValue={(list, getItemProps) => list.map((t, index) => {
            const { key, ...rest } = getItemProps({ index });
            return <Chip key={key} size="small" label={t.name} {...rest} />;
          })}
          renderInput={(params) => (
            <TextField {...params} label="Targets" placeholder={picked.length ? '' : 'Pick one or more'} error={picked.length === 0} helperText={picked.length === 0 ? 'Pick at least one target.' : undefined} />
          )}
        />
      )}
    </Box>
  );
}

export function describeScope(v: ScopeValue, profiles: { id: string; name: string }[], targets: { id: number; name: string }[], allLabel = 'All targets'): string {
  if (v.scope === 'PROFILE') return `Profile: ${profiles.find((p) => p.id === v.profileId)?.name ?? 'removed profile'}`;
  if (v.scope === 'TARGETS') {
    const names = targets.filter((t) => v.targetIds.includes(t.id)).map((t) => t.name);
    if (names.length === 0) return 'No targets';
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }
  return allLabel;
}
