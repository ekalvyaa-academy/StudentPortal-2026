/**
 * student.js
 * Handles the public Student Portal: search by Student ID, then render
 * the student's profile, attendance percentage ring, attendance history
 * and recent test performance. No login required.
 */

import { apiGet, apiPost } from './api.js?v=3';
import { showToast, showLoading, closeLoading, formatDateDisplay, initials, statusBadgeClass, qs, qsa, applyAcademyLogo, fileToUploadPayload, downloadReport, openFileViewer } from './utils.js?v=3';
import { renderFeed } from './feed.js?v=3';

applyAcademyLogo();

const searchForm = qs('#studentSearchForm');
const studentIdInput = qs('#studentIdInput');
const searchHero = qs('#searchHero');
const dashboardWrap = qs('#studentDashboard');
const backBtn = qs('#backToSearchBtn');
const logoutBtn = qs('#studentLogoutBtn');

let currentData = null;

// Allow deep-linking via ?id=STD000001
const urlParams = new URLSearchParams(window.location.search);
const prefilledId = urlParams.get('id');
if (prefilledId) {
  studentIdInput.value = prefilledId;
  loadStudentDashboard(prefilledId);
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const studentId = studentIdInput.value.trim().toUpperCase();
  if (!studentId) {
    showToast('Please enter your Student ID.', 'warning');
    return;
  }
  loadStudentDashboard(studentId);
});

function returnToSearch() {
  dashboardWrap.classList.remove('active');
  searchHero.style.display = 'block';
  studentIdInput.value = '';
  studentIdInput.focus();
  if (logoutBtn) logoutBtn.style.display = 'none';
  // Drop any ?id= deep link so a refresh doesn't silently log back in.
  const url = new URL(window.location.href);
  if (url.searchParams.has('id')) {
    url.searchParams.delete('id');
    window.history.replaceState({}, '', url.toString());
  }
}

backBtn.addEventListener('click', returnToSearch);
if (logoutBtn) logoutBtn.addEventListener('click', returnToSearch);

// ---------------------------------------------------------------
// TABS
// ---------------------------------------------------------------

qs('#studentTabs').querySelectorAll('.student-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    qs('#studentTabs').querySelectorAll('.student-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.student-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === btn.dataset.tab));
  });
});

qs('#generateStudentReportBtn').addEventListener('click', generateStudentReport);

async function loadStudentDashboard(studentId) {
  showLoading('Fetching your profile...');
  const result = await apiGet('getStudentDashboard', { studentId });
  closeLoading();

  if (!result.success) {
    showToast(result.message || 'Student not found.', 'error');
    return;
  }

  currentData = result;
  renderProfile(result);
  renderFees(result.fees);
  renderNotices(result.notices);
  loadPracticeTests(studentId);
  loadStudentSyllabus(studentId);
  loadStudentNotes(studentId);
  loadStudentFeed(studentId);
  searchHero.style.display = 'none';
  dashboardWrap.classList.add('active');
  if (logoutBtn) logoutBtn.style.display = 'inline-flex';
}

function renderProfile(data) {
  const { student, attendance, marks } = data;

  qs('#profileAvatar').textContent = initials(student.studentName);
  qs('#profileName').textContent = student.studentName;
  qs('#profileId').textContent = student.studentId;
  qs('#profileStandard').textContent = student.standard;
  qs('#profileBoard').textContent = student.board;
  qs('#profileBatch').textContent = student.batch;

  qs('#totalDaysValue').textContent = attendance.totalDays;
  qs('#averageMarksValue').textContent = marks.average + '%';
  qs('#highestMarksValue').textContent = (marks.highest ?? 0) + '%';
  qs('#attendancePercentLabel').textContent = attendance.percent + '%';

  drawAttendanceRing(attendance.percent);
  renderAttendanceHistory(attendance.history);
  renderRecentTests(marks.recent);

  const downloadBtn = qs('#downloadFullReportBtn');
  downloadBtn.onclick = () => downloadFullReportCard(data);
}

function downloadFullReportCard(data) {
  const { student, attendance, marks } = data;
  const title = 'Student Report Card';
  const subtitle = `${student.studentName} (${student.studentId}) &middot; ${student.standard} ${student.board} ${student.batch}`;

  const contentHtml = `
    <div class="summary-row">
      <div class="summary-chip">Attendance % <b>${attendance.percent}%</b></div>
      <div class="summary-chip">Total Days <b>${attendance.totalDays}</b></div>
      <div class="summary-chip">Average Marks <b>${marks.average}%</b></div>
      ${marks.highest !== null && marks.highest !== undefined ? `<div class="summary-chip">Highest <b>${marks.highest}%</b></div>` : ''}
    </div>
    <h4 style="font-size:13.5px; margin:14px 0 8px;">Attendance History</h4>
    <table>
      <thead><tr><th>Date</th><th>Status</th></tr></thead>
      <tbody>
        ${attendance.history.map((a) => `
          <tr><td>${formatDateDisplay(a.Date)}</td><td><span class="badge ${statusBadgeClass(a.Status)}">${escapeHtml(a.Status)}</span></td></tr>
        `).join('') || '<tr><td colspan="2">No attendance history.</td></tr>'}
      </tbody>
    </table>
    <h4 style="font-size:13.5px; margin:18px 0 8px;">Test / Marks History</h4>
    <table>
      <thead><tr><th>Test</th><th>Subject</th><th>Chapter</th><th>Date</th><th>Marks</th></tr></thead>
      <tbody>
        ${(marks.recent || []).map((m) => `
          <tr><td>${escapeHtml(m.testName)}</td><td>${escapeHtml(m.subject)}</td><td>${formatChapterLabel(m.chapterNo, m.chapterName)}</td><td>${formatDateDisplay(m.date)}</td><td>${escapeHtml(m.marks)} / ${escapeHtml(m.maximumMarks)}</td></tr>
        `).join('') || '<tr><td colspan="5">No test records yet.</td></tr>'}
      </tbody>
    </table>
  `;

  downloadReport(title, subtitle, contentHtml);
}

// Shared "Ch. 3 — Real Numbers" formatting, mirroring tests.js's helper.
function formatChapterLabel(chapterNo, chapterName) {
  if (!chapterName) return '-';
  return chapterNo ? `Ch. ${escapeHtml(chapterNo)} — ${escapeHtml(chapterName)}` : escapeHtml(chapterName);
}

function drawAttendanceRing(percent) {
  const canvas = qs('#attendanceRing');
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = 52;
  const lineWidth = 14;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Track
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Progress
  const color = percent >= 75 ? '#22C55E' : percent >= 50 ? '#F59E0B' : '#EF4444';
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (Math.PI * 2 * (percent / 100));

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function renderAttendanceHistory(history) {
  const container = qs('#attendanceHistoryList');
  if (!history || !history.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>No attendance records yet.</p></div>`;
    return;
  }

  container.innerHTML = history.map((h) => `
    <div class="marks-list-item">
      <div>
        <div class="m-name">${formatDateDisplay(h.Date)}</div>
      </div>
      <span class="badge ${statusBadgeClass(h.Status)}">${escapeHtml(h.Status)}</span>
    </div>
  `).join('');
}

function renderRecentTests(tests) {
  const container = qs('#recentTestsList');
  if (!tests || !tests.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-circle-xmark"></i><p>No test results yet.</p></div>`;
    return;
  }

  container.innerHTML = tests.map((t) => `
    <div class="marks-list-item">
      <div>
        <div class="m-name">${escapeHtml(t.testName)}</div>
        <div class="m-sub">${escapeHtml(t.subject)}${t.chapterName ? ` &middot; ${formatChapterLabel(t.chapterNo, t.chapterName)}` : ''} &middot; ${formatDateDisplay(t.date)}</div>
      </div>
      <div class="marks-score">${escapeHtml(t.marks)} / ${escapeHtml(t.maximumMarks)}</div>
    </div>
  `).join('');
}

function renderFees(fee) {
  const container = qs('#studentFeesArea');
  if (!fee || !Number(fee.TotalFee)) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-indian-rupee-sign"></i><p>No fee record available yet. Please check with your teacher.</p></div>`;
    return;
  }

  const total = Number(fee.TotalFee) || 0;
  const paid = Number(fee.AmountPaid) || 0;
  const balance = Math.max(total - paid, 0);
  const badgeClass = fee.Status === 'Paid' ? 'badge-success' : fee.Status === 'Partial' ? 'badge-warning' : 'badge-danger';

  let installments = [];
  try { installments = typeof fee.Installments === 'string' ? JSON.parse(fee.Installments) : (fee.Installments || []); } catch (e) { installments = []; }

  const installmentsHtml = installments.length
    ? installments.map((i) => `
        <div class="marks-list-item">
          <div>
            <div class="m-name">₹${Number(i.amount).toLocaleString('en-IN')}${i.note ? ' &middot; ' + escapeHtml(i.note) : ''}</div>
          </div>
          <div class="m-sub">${formatDateDisplay(i.date)}</div>
        </div>
      `).join('')
    : `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>No payments recorded yet.</p></div>`;

  container.innerHTML = `
    <div class="fee-summary-grid">
      <div class="fee-summary-chip"><div class="amt">₹${total.toLocaleString('en-IN')}</div><div class="lbl">Total Fee</div></div>
      <div class="fee-summary-chip"><div class="amt">₹${paid.toLocaleString('en-IN')}</div><div class="lbl">Amount Paid</div></div>
      <div class="fee-summary-chip"><div class="amt">₹${balance.toLocaleString('en-IN')}</div><div class="lbl">Balance Due</div></div>
    </div>
    <div style="margin-bottom:14px;"><span class="badge ${badgeClass}">${fee.Status}</span> <span style="font-size:12px; color:var(--text-muted); margin-left:8px;">Payment mode: ${escapeHtml(fee.PaymentMode || 'Full')}</span></div>
    <div class="card-header"><h3 style="font-size:14px;">Payment History</h3></div>
    ${installmentsHtml}
  `;
}

function renderNotices(notices) {
  const container = qs('#studentNoticesArea');
  const dot = qs('#noticesDot');

  if (!notices || !notices.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bullhorn"></i><p>Nothing here yet.</p></div>`;
    dot.style.display = 'none';
    return;
  }

  dot.style.display = 'inline-block';

  container.innerHTML = notices.map((n) => {
    const isAppreciation = n.Type === 'Appreciation';
    return `
      <div class="notice-card ${isAppreciation ? 'appreciation' : 'notice'}">
        <div class="n-icon"><i class="fa-solid ${isAppreciation ? 'fa-star' : 'fa-bullhorn'}"></i></div>
        <div>
          <div class="n-title">${escapeHtml(n.Title)}</div>
          <div class="n-message">${escapeHtml(n.Message)}</div>
          ${n.ImageURL ? `<img src="${n.ImageURL}" class="notice-image-thumb" data-view-image="${escapeHtml(n.ImageURL)}" alt="Attached image" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'notice-image-thumb',style:'display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;',textContent:'Image unavailable'}));">` : ''}
          <div class="n-meta">${escapeHtml(n.CreatedBy)} &middot; ${formatDateDisplay(n.CreatedAt)}</div>
        </div>
      </div>
    `;
  }).join('');

  qsa('[data-view-image]', container).forEach((img) => {
    img.addEventListener('click', () => openFileViewer(img.dataset.viewImage, 'Attached Image'));
  });
}

// ---------------------------------------------------------------
// PRACTICE (test papers, model answers, answer sheet upload)
// ---------------------------------------------------------------

let currentStudentId = null;

async function loadPracticeTests(studentId) {
  currentStudentId = studentId;
  const container = qs('#practiceTestsList');
  container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div>`;

  const result = await apiGet('getStudentTests', { studentId });
  if (!result.success) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load tests.')}</p></div>`;
    return;
  }

  renderPracticeTests(result.tests || []);
}

function renderPracticeTests(tests) {
  const container = qs('#practiceTestsList');

  if (!tests.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-pdf"></i><p>No tests available for your class yet.</p></div>`;
    return;
  }

  container.innerHTML = tests.map((t) => `
    <div class="marks-list-item" data-practice-row="${t.TestID}">
      <div>
        <div class="m-name">${escapeHtml(t.TestName)}</div>
        <div class="m-sub">${escapeHtml(t.Subject)}${t.ChapterName ? ` &middot; ${formatChapterLabel(t.ChapterNo, t.ChapterName)}` : ''} &middot; ${formatDateDisplay(t.Date)}</div>
      </div>
      <div class="answer-sheet-cell">
        ${t.TestPaperURL ? `<button type="button" class="file-link-btn" data-view-file="${escapeHtml(t.TestPaperURL)}" data-view-title="${escapeHtml(t.TestName)} — Question Paper"><i class="fa-solid fa-file-pdf"></i> Question Paper</button>` : ''}
        ${t.ModelAnswerURL ? `<button type="button" class="file-link-btn" data-view-file="${escapeHtml(t.ModelAnswerURL)}" data-view-title="${escapeHtml(t.TestName)} — Model Answer"><i class="fa-solid fa-file-pdf"></i> Model Answer</button>` : ''}
        ${t.MyAnswerSheetURL
          ? `<button type="button" class="file-link-btn" data-view-file="${escapeHtml(t.MyAnswerSheetURL)}" data-view-title="${escapeHtml(t.TestName)} — Your Answer Sheet"><i class="fa-solid fa-check"></i> Your Answer Sheet</button>`
          : `<button type="button" class="file-link-btn pending" data-upload-my-sheet="${t.TestID}" data-test-name="${escapeHtml(t.TestName)}"><i class="fa-solid fa-upload"></i> Upload Your Answer Sheet</button>`}
        <input type="file" class="attachment-input-hidden" accept="application/pdf" data-my-sheet-input="${t.TestID}">
      </div>
    </div>
  `).join('');

  qsa('[data-upload-my-sheet]').forEach((btn) => {
    btn.addEventListener('click', () => triggerMyAnswerSheetUpload(btn.dataset.uploadMySheet, btn.dataset.testName));
  });
  qsa('[data-view-file]', container).forEach((btn) => {
    btn.addEventListener('click', () => openFileViewer(btn.dataset.viewFile, btn.dataset.viewTitle));
  });
}

function triggerMyAnswerSheetUpload(testId, testName) {
  const input = qsa(`[data-my-sheet-input="${testId}"]`)[0];
  input.onchange = async () => {
    const file = input.files[0];
    if (!file || !currentStudentId) return;

    let upload;
    try {
      upload = await fileToUploadPayload(file, 'pdf');
    } catch (err) {
      showToast(err.message, 'warning');
      return;
    }

    showLoading('Uploading your answer sheet...');
    const result = await apiPost('uploadAnswerSheet', {
      testId,
      testName,
      studentId: currentStudentId,
      studentName: currentData ? currentData.student.studentName : '',
      fileBase64: upload.base64,
      mimeType: upload.mimeType,
      fileName: upload.fileName,
      uploadedBy: currentData ? currentData.student.studentName : 'Student',
      uploaderRole: 'Student'
    });
    closeLoading();

    if (result.success) {
      showToast('Answer sheet uploaded. Your teacher can now review it.', 'success');
      loadPracticeTests(currentStudentId);
    } else {
      showToast(result.message || 'Could not upload answer sheet.', 'error');
    }
  };
  input.click();
}

function generateStudentReport() {
  if (!currentData) return;
  const type = qs('#studentReportType').value;
  const month = qs('#studentReportMonth').value; // YYYY-MM
  const resultArea = qs('#studentReportResultArea');
  const student = currentData.student;

  if (type === 'attendance') {
    let rows = currentData.attendance.history;
    if (month) rows = rows.filter((r) => String(r.Date).startsWith(month));
    if (!rows.length) {
      resultArea.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>No attendance records for this period.</p></div>`;
      return;
    }
    const present = rows.filter((r) => r.Status === 'Present' || r.Status === 'Late').length;
    const pct = Math.round((present / rows.length) * 100);
    const contentHtml = `
      <div class="summary-row">
        <div class="summary-chip">Days Recorded <b>${rows.length}</b></div>
        <div class="summary-chip">Present <b>${present}</b></div>
        <div class="summary-chip">Attendance % <b>${pct}%</b></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Status</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td>${formatDateDisplay(r.Date)}</td><td><span class="badge ${statusBadgeClass(r.Status)}">${escapeHtml(r.Status)}</span></td></tr>`).join('')}
        </tbody>
      </table>
    `;
    resultArea.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:10px;">
        <button class="btn btn-outline btn-sm" id="downloadStudentReportBtn"><i class="fa-solid fa-download"></i> Download PDF</button>
      </div>
      <div class="fee-summary-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="fee-summary-chip"><div class="amt">${rows.length}</div><div class="lbl">Days Recorded</div></div>
        <div class="fee-summary-chip"><div class="amt">${present}</div><div class="lbl">Present</div></div>
        <div class="fee-summary-chip"><div class="amt">${pct}%</div><div class="lbl">Attendance %</div></div>
      </div>
      ${rows.map((r) => `
        <div class="marks-list-item">
          <div class="m-name">${formatDateDisplay(r.Date)}</div>
          <span class="badge ${statusBadgeClass(r.Status)}">${escapeHtml(r.Status)}</span>
        </div>
      `).join('')}
    `;
    qs('#downloadStudentReportBtn').addEventListener('click', () =>
      downloadReport('Attendance Summary', `${student.studentName} (${student.studentId}) &middot; ${month || 'All time'}`, contentHtml)
    );
  } else {
    let rows = currentData.marks.recent;
    if (month) rows = rows.filter((r) => String(r.date).startsWith(month));
    if (!rows.length) {
      resultArea.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-circle-xmark"></i><p>No test results for this period.</p></div>`;
      return;
    }
    const contentHtml = `
      <table>
        <thead><tr><th>Test</th><th>Subject</th><th>Date</th><th>Marks</th></tr></thead>
        <tbody>
          ${rows.map((t) => `<tr><td>${escapeHtml(t.testName)}</td><td>${escapeHtml(t.subject)}</td><td>${formatDateDisplay(t.date)}</td><td>${escapeHtml(t.marks)} / ${escapeHtml(t.maximumMarks)}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
    resultArea.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:10px;">
        <button class="btn btn-outline btn-sm" id="downloadStudentReportBtn"><i class="fa-solid fa-download"></i> Download PDF</button>
      </div>
      ${rows.map((t) => `
        <div class="marks-list-item">
          <div>
            <div class="m-name">${escapeHtml(t.testName)}</div>
            <div class="m-sub">${escapeHtml(t.subject)} &middot; ${formatDateDisplay(t.date)}</div>
          </div>
          <div class="marks-score">${escapeHtml(t.marks)} / ${escapeHtml(t.maximumMarks)}</div>
        </div>
      `).join('')}
    `;
    qs('#downloadStudentReportBtn').addEventListener('click', () =>
      downloadReport('Marks Summary', `${student.studentName} (${student.studentId}) &middot; ${month || 'All time'}`, contentHtml)
    );
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadStudentFeed(studentId) {
  const area = qs('#studentFeedArea');
  const result = await apiGet('getFeedPosts', { viewerId: studentId });

  if (!result.success) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load feed.')}</p></div>`;
    return;
  }

  const studentName = currentData ? currentData.student.studentName : 'Student';
  renderFeed(result.posts || [], area, {
    isAdmin: false,
    likedBy: studentId,
    authorName: studentName,
    authorType: 'Student',
    reload: () => loadStudentFeed(studentId)
  });
}

async function loadStudentSyllabus(studentId) {
  const area = qs('#studentSyllabusArea');
  const result = await apiGet('getSyllabus', { studentId });

  if (!result.success) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load syllabus.')}</p></div>`;
    return;
  }

  const subjects = result.subjects || [];
  if (!subjects.length) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-book-open"></i><p>Your teacher hasn't added the syllabus for your class yet.</p></div>`;
    return;
  }

  area.innerHTML = subjects.map((s) => `
    <div class="syllabus-subject-block">
      <div class="syllabus-subject-header">
        <div>
          <div class="syllabus-subject-name">${escapeHtml(s.subject)}</div>
          <div class="syllabus-subject-sub">${s.completed} of ${s.total} chapters completed</div>
        </div>
        <div class="syllabus-progress-pct">${s.percent}%</div>
      </div>
      <div class="syllabus-progress-track">
        <div class="syllabus-progress-fill" style="width:${s.percent}%;"></div>
      </div>
      <div class="syllabus-table-wrap">
        <table class="syllabus-table">
          <thead>
            <tr>
              <th>Ch.</th>
              <th>Chapter Name</th>
              <th>Planned Date</th>
              <th>Completed Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${s.chapters.map((c) => {
              const status = ['Not Started', 'In Progress', 'Completed'].indexOf(c.Status) !== -1 ? c.Status : 'Not Started';
              const badgeClass = status === 'Completed' ? 'badge-status-completed' : (status === 'In Progress' ? 'badge-status-in-progress' : 'badge-status-not-started');
              return `
                <tr>
                  <td>${c.ChapterNo ? escapeHtml(c.ChapterNo) : '-'}</td>
                  <td class="chapter-name-cell">${escapeHtml(c.ChapterName)}</td>
                  <td>${c.PlannedDate ? escapeHtml(c.PlannedDate) : '-'}</td>
                  <td>${status === 'Completed' && c.CompletedDate ? escapeHtml(c.CompletedDate) : '-'}</td>
                  <td><span class="badge ${badgeClass}">${status}</span></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------------------------
// NOTES (subject-wise PDF notes shared by teachers/admin)
// ---------------------------------------------------------------

let notesBySubject = [];

async function loadStudentNotes(studentId) {
  const pillsArea = qs('#studentNotesSubjectPills');
  const listArea = qs('#studentNotesArea');
  const result = await apiGet('getStudyNotes', { studentId });

  if (!result.success) {
    pillsArea.innerHTML = '';
    listArea.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load notes.')}</p></div>`;
    return;
  }

  notesBySubject = result.subjects || [];
  if (!notesBySubject.length) {
    pillsArea.innerHTML = '';
    listArea.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-lines"></i><p>No notes have been shared for your class yet.</p></div>`;
    return;
  }

  pillsArea.innerHTML = notesBySubject.map((s, i) => `
    <button type="button" class="subject-pill ${i === 0 ? 'active' : ''}" data-notes-subject="${escapeHtml(s.subject)}">${escapeHtml(s.subject)}</button>
  `).join('');

  qsa('[data-notes-subject]', pillsArea).forEach((btn) => {
    btn.addEventListener('click', () => {
      qsa('.subject-pill', pillsArea).forEach((b) => b.classList.toggle('active', b === btn));
      renderNotesList(btn.dataset.notesSubject);
    });
  });

  renderNotesList(notesBySubject[0].subject);
}

function renderNotesList(subject) {
  const listArea = qs('#studentNotesArea');
  const group = notesBySubject.find((s) => s.subject === subject);
  const notes = group ? group.notes : [];

  if (!notes.length) {
    listArea.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-lines"></i><p>No notes yet for ${escapeHtml(subject)}.</p></div>`;
    return;
  }

  listArea.innerHTML = notes.map((n) => `
    <div class="note-card">
      <div class="note-info">
        <div class="note-icon"><i class="fa-solid fa-file-pdf"></i></div>
        <div>
          <div class="note-title">${escapeHtml(n.Title)}</div>
          <div class="note-meta">${escapeHtml(n.UploadedBy)} &middot; ${escapeHtml(n.CreatedAt)}</div>
        </div>
      </div>
      <button type="button" class="file-link-btn" data-view-note="${escapeHtml(n.FileURL)}" data-view-title="${escapeHtml(n.Title)}"><i class="fa-solid fa-eye"></i> View</button>
    </div>
  `).join('');

  qsa('[data-view-note]', listArea).forEach((btn) => {
    btn.addEventListener('click', () => openFileViewer(btn.dataset.viewNote, btn.dataset.viewTitle));
  });
}
