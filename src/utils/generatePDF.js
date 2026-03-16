import { jsPDF } from 'jspdf';
import { db } from '../config/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

/**
 * Fetch all counselee data from Firestore and generate a PDF download.
 *
 * @param {string} counselorId - The counselor's UID
 * @param {string} counseleeDocId - The counselee document ID
 * @param {string} userName - Display name for the cover page
 */
export async function downloadCounseleeData(counselorId, counseleeDocId, userName) {
  if (!counselorId || !counseleeDocId) {
    throw new Error(`Missing path info: counselorId=${counselorId}, counseleeDocId=${counseleeDocId}`);
  }
  const basePath = `counselors/${counselorId}/counselees/${counseleeDocId}`;
  console.log('[PDF] Fetching data from:', basePath);

  // Fetch all subcollections in parallel — skip orderBy to avoid index issues
  const [homeworkSnap, heartJournalSnap, thinkListSnap, journalSnap, activitySnap] = await Promise.all([
    getDocs(collection(db, `${basePath}/homework`)),
    getDocs(collection(db, `${basePath}/heartJournals`)),
    getDocs(collection(db, `${basePath}/thinkLists`)),
    getDocs(collection(db, `${basePath}/journals`)),
    getDocs(collection(db, `${basePath}/activityLog`)),
  ]);

  const homework = homeworkSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const heartJournals = heartJournalSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const thinkLists = thinkListSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const journals = journalSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const activity = activitySnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log('[PDF] Found:', {
    homework: homework.length,
    heartJournals: heartJournals.length,
    thinkLists: thinkLists.length,
    journals: journals.length,
    activity: activity.length
  });

  // Sort client-side instead of via Firestore orderBy
  const sortDesc = (arr, field) => arr.sort((a, b) => {
    const aT = a[field]?.toDate?.() || new Date(0);
    const bT = b[field]?.toDate?.() || new Date(0);
    return bT - aT;
  });

  sortDesc(heartJournals, 'createdAt');
  sortDesc(thinkLists, 'createdAt');
  sortDesc(journals, 'createdAt');
  sortDesc(activity, 'timestamp');

  generatePDF({ userName, homework, heartJournals, thinkLists, journals, activity });
}

// ---- helpers ----

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '  - ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return '—'; }
}

function fmtDateTime(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

// ---- PDF generation ----

const PAGE_W = 210; // A4 mm
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const LINE_H = 5;

function generatePDF({ userName, homework, heartJournals, thinkLists, journals, activity }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // ---- utilities ----
  function checkPage(needed = 20) {
    if (y + needed > 280) {
      pdf.addPage();
      y = MARGIN;
    }
  }

  function sectionTitle(text) {
    checkPage(20);
    y += 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(44, 82, 130); // #2c5282
    pdf.text(text, MARGIN, y);
    y += 2;
    pdf.setDrawColor(44, 82, 130);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6;
    pdf.setTextColor(0, 0, 0);
  }

  function label(text) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(text, MARGIN, y);
  }

  function value(text, xOffset = 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(String(text || '—'), CONTENT_W - xOffset);
    lines.forEach(line => {
      checkPage(LINE_H);
      pdf.text(line, MARGIN + xOffset, y);
      y += LINE_H;
    });
  }

  function labelValue(lbl, val) {
    checkPage(LINE_H + 2);
    label(lbl + ': ');
    const lblW = pdf.getTextWidth(lbl + ': ');
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(String(val || '—'), CONTENT_W - lblW);
    pdf.text(lines[0] || '—', MARGIN + lblW, y);
    y += LINE_H;
    // remaining lines indented
    for (let i = 1; i < lines.length; i++) {
      checkPage(LINE_H);
      pdf.text(lines[i], MARGIN + lblW, y);
      y += LINE_H;
    }
  }

  function wrappedBlock(text) {
    const clean = stripHtml(text);
    if (!clean) { value('(none)'); return; }
    const lines = pdf.splitTextToSize(clean, CONTENT_W - 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    lines.forEach(line => {
      checkPage(LINE_H);
      pdf.text(line, MARGIN + 4, y);
      y += LINE_H;
    });
  }

  // ---- Cover page ----
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  pdf.setTextColor(44, 82, 130);
  y = 60;
  pdf.text('Counseling Homework', PAGE_W / 2, y, { align: 'center' });
  y += 10;
  pdf.setFontSize(16);
  pdf.text('Data Export', PAGE_W / 2, y, { align: 'center' });
  y += 20;
  pdf.setFontSize(13);
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.text(userName, PAGE_W / 2, y, { align: 'center' });
  y += 8;
  pdf.setFontSize(10);
  pdf.text('Generated: ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), PAGE_W / 2, y, { align: 'center' });

  // ---- Homework ----
  pdf.addPage();
  y = MARGIN;
  sectionTitle(`Homework (${homework.length})`);

  if (homework.length === 0) {
    value('No homework assigned.');
  } else {
    // Sort: active first, then by assignedDate
    const sorted = [...homework].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      const aDate = a.assignedDate?.toDate?.() || new Date(0);
      const bDate = b.assignedDate?.toDate?.() || new Date(0);
      return bDate - aDate;
    });

    sorted.forEach((hw, i) => {
      checkPage(30);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(`${i + 1}. ${hw.title || 'Untitled'}`, MARGIN, y);
      // Status badge
      const statusText = (hw.status || 'active').toUpperCase();
      const statusX = MARGIN + pdf.getTextWidth(`${i + 1}. ${hw.title || 'Untitled'}  `);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      if (hw.status === 'active') pdf.setTextColor(34, 139, 34);
      else if (hw.status === 'cancelled') pdf.setTextColor(200, 0, 0);
      else pdf.setTextColor(100, 100, 100);
      pdf.text(`[${statusText}]`, statusX, y);
      pdf.setTextColor(0, 0, 0);
      y += LINE_H;

      pdf.setFontSize(9);
      if (hw.description) {
        labelValue('Description', stripHtml(hw.description));
      }
      labelValue('Type', hw.type || 'task');
      labelValue('Assigned', fmtDate(hw.assignedDate));
      if (hw.weeklyTarget) labelValue('Weekly target', `${hw.weeklyTarget}x/week`);
      if (hw.durationWeeks) labelValue('Duration', `${hw.durationWeeks} weeks`);
      if (hw.expiresAt) labelValue('Expires', fmtDate(hw.expiresAt));

      // Completions
      const completions = hw.completions || [];
      labelValue('Completions', `${completions.length} total`);
      if (completions.length > 0) {
        const dates = completions.map(c => fmtDate(c.date || c)).join(', ');
        pdf.setFontSize(8);
        const lines = pdf.splitTextToSize(dates, CONTENT_W - 8);
        lines.forEach(line => {
          checkPage(LINE_H);
          pdf.text(line, MARGIN + 8, y);
          y += LINE_H;
        });
        pdf.setFontSize(9);
      }
      y += 3;
    });
  }

  // ---- Heart Journals ----
  sectionTitle(`Heart Journal Entries (${heartJournals.length})`);

  if (heartJournals.length === 0) {
    value('No heart journal entries.');
  } else {
    heartJournals.forEach((hj, i) => {
      checkPage(40);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(`Entry ${i + 1} — ${fmtDateTime(hj.eventDateTime || hj.createdAt)}`, MARGIN, y);
      y += LINE_H + 1;
      pdf.setFontSize(9);

      if (hj.situation) labelValue('Situation', hj.situation);
      if (hj.feeling) labelValue('What I felt', hj.feeling);
      if (hj.thinking) labelValue('What I was thinking', hj.thinking);
      if (hj.wanted) labelValue('What I wanted', hj.wanted);
      if (hj.action) labelValue('What I did', hj.action);
      if (Array.isArray(hj.decisionsLeadingUp) && hj.decisionsLeadingUp.length) labelValue('Decisions leading up', hj.decisionsLeadingUp.join(', '));
      if (Array.isArray(hj.heartIdolsWanted) && hj.heartIdolsWanted.length) labelValue('Heart idols (wanted)', hj.heartIdolsWanted.join(', '));
      if (Array.isArray(hj.heartIdolsNotWanted) && hj.heartIdolsNotWanted.length) labelValue('Heart idols (not wanted)', hj.heartIdolsNotWanted.join(', '));
      if (Array.isArray(hj.fruitOfSpiritToGrow) && hj.fruitOfSpiritToGrow.length) labelValue('Fruit of Spirit to grow', hj.fruitOfSpiritToGrow.join(', '));
      if (hj.howOthersFelt) labelValue('How others felt', hj.howOthersFelt);
      if (hj.glorifyGodBy) labelValue('Glorify God by', hj.glorifyGodBy);
      if (hj.godHonoringThoughts) labelValue('God-honoring thoughts', hj.godHonoringThoughts);
      if (hj.couldHaveDone) labelValue('Could have done', hj.couldHaveDone);
      if (hj.expectedFeeling) labelValue('Expected feeling', hj.expectedFeeling);
      if (hj.bibleVerse) labelValue('Bible verse', hj.bibleVerse);
      if (hj.changeStatement) labelValue('Change statement', hj.changeStatement);
      if (hj.commitToPray) labelValue('Commit to pray', 'Yes');
      if (hj.confessToOther) labelValue('Confess to other', 'Yes');
      if (hj.repentedBeforeGod) labelValue('Repented before God', 'Yes');
      if (hj.repentedBeforeOthers) labelValue('Repented before others', 'Yes');
      y += 4;
    });
  }

  // ---- Think Lists ----
  sectionTitle(`Think Lists (${thinkLists.length})`);

  if (thinkLists.length === 0) {
    value('No think lists.');
  } else {
    thinkLists.forEach((tl, i) => {
      checkPage(25);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(`${i + 1}. ${tl.title || 'Untitled'}`, MARGIN, y);
      y += LINE_H + 1;
      pdf.setFontSize(9);

      if (tl.instructions) labelValue('Instructions', tl.instructions);
      if (tl.timesPerDay) labelValue('Frequency', `${tl.timesPerDay}x/day, ${tl.daysPerWeek || 7} days/week`);
      if (tl.durationWeeks) labelValue('Duration', `${tl.durationWeeks} weeks`);
      labelValue('Status', tl.status || 'active');
      labelValue('Created', fmtDate(tl.createdAt));

      // Content (may be rich text)
      if (tl.content) {
        checkPage(10);
        label('Content:');
        y += LINE_H;
        wrappedBlock(tl.content);
      }
      y += 4;
    });
  }

  // ---- Journals ----
  sectionTitle(`Journals (${journals.length})`);

  if (journals.length === 0) {
    value('No journal entries.');
  } else {
    journals.forEach((jn, i) => {
      checkPage(25);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(`${i + 1}. ${jn.title || 'Untitled'}`, MARGIN, y);
      y += LINE_H + 1;
      pdf.setFontSize(9);

      if (jn.goal) labelValue('Goal', jn.goal);
      if (jn.instructions) labelValue('Instructions', stripHtml(jn.instructions));
      labelValue('Status', jn.status || 'active');
      labelValue('Created', fmtDate(jn.createdAt));

      // Content (entries stored as rich HTML with <hr> separators)
      if (jn.content) {
        checkPage(10);
        label('Entries:');
        y += LINE_H;
        wrappedBlock(jn.content);
      } else {
        labelValue('Entries', 'None yet');
      }
      y += 4;
    });
  }

  // ---- Activity History (last 100) ----
  const activitySlice = activity.slice(0, 100);
  sectionTitle(`Activity History (${activitySlice.length}${activity.length > 100 ? ' of ' + activity.length : ''})`);

  if (activitySlice.length === 0) {
    value('No activity recorded.');
  } else {
    // Table header
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('Date', MARGIN, y);
    pdf.text('Action', MARGIN + 40, y);
    pdf.text('Details', MARGIN + 80, y);
    y += 1;
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += LINE_H;

    pdf.setFont('helvetica', 'normal');
    activitySlice.forEach(a => {
      checkPage(LINE_H + 2);
      pdf.setFontSize(8);
      pdf.text(fmtDate(a.timestamp), MARGIN, y);
      pdf.text((a.action || '').replace(/_/g, ' '), MARGIN + 40, y);
      const detailLines = pdf.splitTextToSize(a.details || '', CONTENT_W - 80);
      pdf.text(detailLines[0] || '', MARGIN + 80, y);
      y += LINE_H;
      // overflow lines
      for (let i = 1; i < detailLines.length; i++) {
        checkPage(LINE_H);
        pdf.text(detailLines[i], MARGIN + 80, y);
        y += LINE_H;
      }
    });
  }

  // ---- Footer on every page ----
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Counseling Homework — ${userName} — Page ${i} of ${pageCount}`, PAGE_W / 2, 292, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  // ---- Download ----
  const safeName = userName.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  pdf.save(`CounselingData_${safeName}_${dateStr}.pdf`);
}
