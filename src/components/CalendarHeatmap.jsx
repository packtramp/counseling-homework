import { useState, useMemo } from 'react';
import { getDayDetails } from '../utils/homeworkHelpers';

/**
 * Calendar Heatmap - Week-by-week homework compliance view
 *
 * Props:
 * - homework: array of homework items (for color computation)
 * - activityLog: array of activity entries (for day-click detail)
 */
export default function CalendarHeatmap({ homework = [], activityLog = [] }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const weeksToShow = 5;

  // Build the date range: 5 weeks ending with current week (Sun-Sat)
  const { weeks, monthLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find Sunday of current week
    const currentSunday = new Date(today);
    currentSunday.setDate(currentSunday.getDate() - currentSunday.getDay());

    // Start from (weeksToShow - 1) weeks before current Sunday
    const startSunday = new Date(currentSunday);
    startSunday.setDate(startSunday.getDate() - (weeksToShow - 1) * 7);

    const weeks = [];
    const monthLabels = {};
    const todayStr = today.toDateString();

    for (let w = 0; w < weeksToShow; w++) {
      const weekStart = new Date(startSunday);
      weekStart.setDate(weekStart.getDate() + w * 7);
      const days = [];

      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + d);
        const isFuture = date > today;
        const isToday = date.toDateString() === todayStr;

        const dayInfo = isFuture ? { status: 'future', behindItems: [] } : getDayDetails(homework, date);
        days.push({
          date: new Date(date),
          dayNum: date.getDate(),
          isFuture,
          isToday,
          status: dayInfo.status,
          behindItems: dayInfo.behindItems || []
        });

        // Track month labels - show when month changes
        if (d === 0 || date.getDate() === 1) {
          const monthKey = `${w}-${d}`;
          const isNewMonth = d === 0 && w === 0 || date.getDate() <= 7 && d === 0 || date.getDate() === 1;
          if (isNewMonth) {
            monthLabels[`${w}`] = date.toLocaleDateString('en-US', { month: 'short' });
          }
        }
      }
      weeks.push(days);
    }

    return { weeks, monthLabels };
  }, [homework, weeksToShow]);

  // Filter activity log entries for selected date
  const selectedEntries = useMemo(() => {
    if (!selectedDate) return [];
    const targetStr = selectedDate.toDateString();
    return activityLog.filter(entry => {
      if (!entry.timestamp) return false;
      const entryDate = entry.timestamp.toDate ? entry.timestamp.toDate() : new Date(entry.timestamp);
      return entryDate.toDateString() === targetStr;
    });
  }, [selectedDate, activityLog]);

  const formatLogTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const handleDayClick = (day) => {
    if (day.isFuture) return;
    if (selectedDate && selectedDate.toDateString() === day.date.toDateString()) {
      setSelectedDate(null); // toggle off
    } else {
      setSelectedDate(day.date);
    }
  };

  return (
    <div className="calendar-heatmap">
      {/* Weekday header */}
      <div className="calendar-weekday-header">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="calendar-weekday-label">{d}</span>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((days, weekIdx) => (
        <div key={weekIdx} className="calendar-week-row">
          <span className="calendar-month-label">{monthLabels[`${weekIdx}`] || ''}</span>
          {days.map((day, dayIdx) => {
            const isSelected = selectedDate && selectedDate.toDateString() === day.date.toDateString();
            return (
              <button
                key={dayIdx}
                className={`calendar-day ${day.status} ${day.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                onClick={() => handleDayClick(day)}
                disabled={day.isFuture}
                title={day.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              >
                {day.dayNum}
              </button>
            );
          })}
        </div>
      ))}

      {/* Legend */}
      <div className="calendar-legend">
        <span className="calendar-legend-item"><span className="calendar-legend-dot green"></span> On track</span>
        <span className="calendar-legend-item"><span className="calendar-legend-dot red"></span> Behind</span>
        <span className="calendar-legend-item"><span className="calendar-legend-dot gray"></span> No activity</span>
      </div>

      {/* Day detail panel */}
      {selectedDate && (() => {
        // Find the selected day object to get behindItems
        const selectedDay = weeks.flat().find(d => d.date.toDateString() === selectedDate.toDateString());
        const behindItems = selectedDay?.behindItems || [];
        return (
          <div className="calendar-day-detail">
            <h4 className="calendar-detail-date">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h4>
            {behindItems.length > 0 && (
              <div className="calendar-behind-reason">
                <strong>Behind on:</strong>
                <ul>
                  {behindItems.map((item, i) => (
                    <li key={i}>{item.title} — {item.current}/{item.target} done, can't catch up (week ending {item.weekEnd.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })})</li>
                  ))}
                </ul>
              </div>
            )}
            {selectedEntries.length === 0 ? (
              <p className="empty-list">No activity this day.</p>
            ) : (
              <ul className="ah-full-list">
                {selectedEntries.map(entry => (
                  <li key={entry.id} className="ah-entry">
                    {entry.details} <span className="ah-time">— {formatLogTime(entry.timestamp)}</span>
                    {entry.actorName && <span className="ah-actor"> by {entry.actorName}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}
    </div>
  );
}
