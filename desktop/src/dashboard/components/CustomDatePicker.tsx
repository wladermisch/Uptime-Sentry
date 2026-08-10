import * as React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

export default function CustomDatePicker() {
  const [value, setValue] = React.useState<Dayjs | null>(dayjs());

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        value={value}
        onChange={(newValue) => setValue(newValue)}
        slotProps={{
          textField: {
            size: 'small',
            sx: { 
              minWidth: 150, 
              '& .MuiInputBase-root': { 
                height: 36,
                fontSize: '0.875rem'
              } 
            },
          },
        }}
      />
    </LocalizationProvider>
  );
}
