import React from 'react';
import { isOnVacation } from '../utils/homeworkHelpers';

const VacationBanner = React.memo(function VacationBanner({ userProfile }) {
  if (!isOnVacation(userProfile)) return null;

  return (
    <div style={{ background: '#ebf8ff', border: '1px solid #3182ce', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#2b6cb0' }}>
      <span style={{ fontSize: '1.2rem' }}>🏖️</span>
      <span><strong>Vacation mode active</strong> — streaks frozen, reminders paused</span>
    </div>
  );
});

export default VacationBanner;
