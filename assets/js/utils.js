/**
 * utils.js
 * Shared helper functions used across the portal: notifications,
 * session storage helpers, formatting and small DOM utilities.
 */

import { CONFIG } from './config.js?v=3';

// ---------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------

export function showToast(message, type = 'success') {
  const colors = {
    success: 'linear-gradient(135deg,#22C55E,#16a34a)',
    error: 'linear-gradient(135deg,#EF4444,#b91c1c)',
    info: 'linear-gradient(135deg,#2563EB,#1E3A8A)',
    warning: 'linear-gradient(135deg,#F59E0B,#d97706)'
  };

  Toastify({
    text: message,
    duration: 3200,
    gravity: 'top',
    position: 'right',
    stopOnFocus: true,
    style: {
      background: colors[type] || colors.info,
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
      fontFamily: 'Poppins, sans-serif',
      fontSize: '14px',
      padding: '14px 20px'
    }
  }).showToast();
}

export function showLoading(title = 'Please wait...') {
  Swal.fire({
    title,
    html: '<div class="ea-swal-spinner"></div>',
    showConfirmButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    background: '#FFFFFF',
    customClass: { popup: 'ea-swal-popup' }
  });
}

export function closeLoading() {
  Swal.close();
}

export function confirmAction({ title, text, confirmText = 'Yes, proceed', icon = 'warning' }) {
  return Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#EF4444',
    cancelButtonColor: '#94a3b8',
    reverseButtons: true,
    customClass: { popup: 'ea-swal-popup' }
  }).then((res) => res.isConfirmed);
}

export function alertSuccess(title, text = '') {
  return Swal.fire({
    title,
    text,
    icon: 'success',
    confirmButtonColor: '#2563EB',
    customClass: { popup: 'ea-swal-popup' }
  });
}

export function alertError(title, text = '') {
  return Swal.fire({
    title,
    text,
    icon: 'error',
    confirmButtonColor: '#2563EB',
    customClass: { popup: 'ea-swal-popup' }
  });
}

// ---------------------------------------------------------------
// SESSION
// ---------------------------------------------------------------

export function saveTeacherSession(teacher) {
  sessionStorage.setItem(CONFIG.STORAGE_KEYS.TEACHER, JSON.stringify(teacher));
}

export function getTeacherSession() {
  const raw = sessionStorage.getItem(CONFIG.STORAGE_KEYS.TEACHER);
  return raw ? JSON.parse(raw) : null;
}

export function clearTeacherSession() {
  sessionStorage.removeItem(CONFIG.STORAGE_KEYS.TEACHER);
}

export function requireTeacherAuth() {
  const teacher = getTeacherSession();
  if (!teacher) {
    window.location.href = 'teacher-login.html';
    return null;
  }
  return teacher;
}

// ---------------------------------------------------------------
// FORMATTING / MISC
// ---------------------------------------------------------------

// Used by the Feed (post timestamps) — short relative time like "5m ago".
export function timeAgoShort(timestamp) {
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return '';
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  if (diffSec < 604800) return Math.floor(diffSec / 86400) + 'd ago';
  return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().split('T')[0];
}

export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function statusBadgeClass(status) {
  const map = {
    Present: 'badge-success',
    Absent: 'badge-danger',
    Late: 'badge-warning',
    Leave: 'badge-info'
  };
  return map[status] || 'badge-info';
}

export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ---------------------------------------------------------------
// FILE UPLOADS
// ---------------------------------------------------------------

/**
 * Reads a File into a { base64, mimeType, fileName } object ready to send
 * to the backend. Validates type + size against CONFIG.UPLOAD_LIMITS first.
 * @param {File} file
 * @param {'image'|'pdf'} kind
 * @returns {Promise<{base64:string,mimeType:string,fileName:string}>}
 */
export function fileToUploadPayload(file, kind = 'image') {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file selected.')); return; }

    const allowedTypes = kind === 'pdf' ? CONFIG.UPLOAD_LIMITS.PDF_TYPES : CONFIG.UPLOAD_LIMITS.IMAGE_TYPES;
    const maxMb = kind === 'pdf' ? CONFIG.UPLOAD_LIMITS.PDF_MAX_MB : CONFIG.UPLOAD_LIMITS.IMAGE_MAX_MB;

    if (allowedTypes.indexOf(file.type) === -1) {
      reject(new Error(kind === 'pdf' ? 'Please choose a PDF file.' : 'Please choose a JPG, PNG or WEBP image.'));
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      reject(new Error(`File is too large. Maximum allowed size is ${maxMb} MB.`));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // reader.result looks like "data:application/pdf;base64,AAAA..."
      const base64 = String(reader.result).split(',')[1] || '';
      resolve({ base64, mimeType: file.type, fileName: file.name });
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------
// ACADEMY LOGO
// ---------------------------------------------------------------

/**
 * Replaces every .logo-badge element on the page with the academy logo
 * image if one has been uploaded (Settings.LogoURL). Leaves the existing
 * "EA" text badge untouched if no logo is set yet, or on error.
 */
export async function applyAcademyLogo() {
  const renderLogo = (url) => {
    qsa('.logo-badge').forEach((badge) => {
      badge.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.alt = CONFIG.ACADEMY_NAME;
      // If even this URL fails to load, fall back to the plain text badge
      // instead of showing a broken-image icon.
      img.onerror = () => {
        badge.innerHTML = '';
        badge.textContent = CONFIG.ACADEMY_NAME.charAt(0);
      };
      badge.appendChild(img);
    });
  };

  try {
    const { apiGet } = await import('./api.js?v=3');
    const result = await apiGet('getSettings');
    const logoUrl = result && result.success && result.settings ? result.settings.LogoURL : '';
    // Use the Admin-uploaded logo if one exists, otherwise fall back to the
    // logo hosted on GitHub so the badge is never empty/broken.
    renderLogo(logoUrl || CONFIG.FALLBACK_LOGO_URL);
  } catch (err) {
    // Backend unreachable (e.g. not deployed yet) — still show the GitHub logo.
    console.warn('Could not load academy logo from backend, using fallback:', err);
    renderLogo(CONFIG.FALLBACK_LOGO_URL);
  }
}

export function populateSelect(selectEl, options, placeholder) {
  selectEl.innerHTML = '';
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }
  options.forEach((value) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    selectEl.appendChild(opt);
  });
}

// ---------------------------------------------------------------
// IN-APP FILE / REPORT VIEWER
//
// Installed (standalone) PWAs have no address bar, no browser "Back"
// button and no download tray. Previously, opening a report or an
// external file (test paper, model answer, answer sheet, notice image)
// used window.open()/target="_blank", which — inside a standalone PWA —
// often navigates the *same* app window away with nothing to tap back
// to, forcing the user to force-close and relaunch the app.
//
// The fix: never truly navigate away. Everything opens in an in-app
// overlay with its own visible Close button and Download/Print button,
// and a history entry is pushed so the phone's system Back gesture/
// button closes the overlay instead of exiting the app.
// ---------------------------------------------------------------

let viewerPoppedByUs = false;

function handleViewerPopState() {
  viewerPoppedByUs = true;
  closeFileViewer();
}

function buildViewerShell(title) {
  closeFileViewer(); // remove any existing viewer first

  const overlay = document.createElement('div');
  overlay.className = 'file-viewer-overlay';
  overlay.id = 'fileViewerOverlay';
  overlay.innerHTML = `
    <div class="file-viewer-bar">
      <button type="button" class="file-viewer-btn file-viewer-close" id="fileViewerCloseBtn">
        <i class="fa-solid fa-arrow-left"></i><span>Close</span>
      </button>
      <div class="file-viewer-title">${escapeHtmlUtil(title || 'Preview')}</div>
      <span class="file-viewer-actions" id="fileViewerActions"></span>
    </div>
    <div class="file-viewer-body" id="fileViewerBody"></div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('file-viewer-open');

  qs('#fileViewerCloseBtn').addEventListener('click', () => closeFileViewer());
  // Push a history entry so the device's Back button/gesture closes this
  // overlay first, instead of exiting the whole installed app.
  viewerPoppedByUs = false;
  history.pushState({ fileViewer: true }, '', location.href);
  window.addEventListener('popstate', handleViewerPopState);

  return overlay;
}

export function closeFileViewer() {
  const overlay = qs('#fileViewerOverlay');
  if (!overlay) return;
  overlay.remove();
  document.body.classList.remove('file-viewer-open');
  window.removeEventListener('popstate', handleViewerPopState);
  if (!viewerPoppedByUs && history.state && history.state.fileViewer) {
    history.back();
  }
  viewerPoppedByUs = false;
}

/**
 * Opens an external file (Google Drive test paper/model answer/answer
 * sheet, a notice image, etc.) inside the app instead of navigating the
 * whole PWA window away. Always shows an explicit Close button and an
 * explicit Download/Open button, since standalone PWAs hide all normal
 * browser chrome (no download tray, no address bar, no Back button).
 * @param {string} url    File/image URL to preview
 * @param {string} title  Shown in the header bar
 */
export function openFileViewer(url, title = 'File') {
  if (!url) { showToast('No file available to open.', 'warning'); return; }

  buildViewerShell(title);
  qs('#fileViewerActions').innerHTML = `
    <a class="file-viewer-btn file-viewer-download" href="${url}" target="_blank" rel="noopener noreferrer">
      <i class="fa-solid fa-download"></i><span>Download</span>
    </a>
  `;

  const isImage = /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
  const body = qs('#fileViewerBody');
  if (isImage) {
    body.innerHTML = `<img src="${url}" class="file-viewer-image" alt="${escapeHtmlUtil(title)}">`;
  } else {
    body.innerHTML = `<iframe src="${url}" class="file-viewer-frame" title="${escapeHtmlUtil(title)}"></iframe>`;
  }
}

/**
 * Renders a clean, branded, print-ready report inside the in-app viewer
 * (instead of window.open, which standalone PWAs often can't reliably
 * pop or return from). The visible "Print / Save as PDF" button in the
 * header triggers the browser print dialog scoped to that iframe, so
 * "Save as PDF" still produces a proper downloadable file — but the user
 * always has a Close button to get straight back to the app.
 *
 * @param {string} title     Main report heading, e.g. "Daily Attendance Report"
 * @param {string} subtitle  Secondary line, e.g. student name or date range
 * @param {string} bodyHtml  Pre-built HTML for the report body (summary + table)
 */
export async function downloadReport(title, subtitle, bodyHtml) {
  let logoUrl = CONFIG.FALLBACK_LOGO_URL;
  try {
    const { apiGet } = await import('./api.js?v=3');
    const result = await apiGet('getSettings');
    if (result && result.success && result.settings && result.settings.LogoURL) {
      logoUrl = result.settings.LogoURL;
    }
  } catch (err) {
    // Backend unreachable — fall back to the GitHub-hosted logo.
  }

  const generatedOn = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const reportHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title} — ${CONFIG.ACADEMY_NAME}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          color: #0F172A;
          padding: 24px;
          margin: 0 auto;
        }
        .report-header {
          display: flex;
          align-items: center;
          gap: 16px;
          border-bottom: 3px solid #1E3A8A;
          padding-bottom: 16px;
          margin-bottom: 22px;
        }
        .report-logo { width: 62px; height: 62px; border-radius: 12px; object-fit: cover; flex-shrink: 0; }
        .academy-name { font-size: 20px; font-weight: 700; color: #1E3A8A; }
        .report-title { font-size: 15px; font-weight: 600; margin-top: 2px; }
        .report-subtitle { font-size: 12.5px; color: #64748B; margin-top: 2px; }
        .summary-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
        .summary-chip {
          background: #F1F5F9;
          border-radius: 10px;
          padding: 8px 16px;
          font-size: 12.5px;
          font-weight: 600;
        }
        .summary-chip b { margin-left: 4px; color: #1E3A8A; }
        table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 8px; }
        thead th {
          background: #1E3A8A;
          color: #fff;
          text-align: left;
          padding: 9px 12px;
          font-weight: 600;
        }
        tbody td { padding: 8px 12px; border-bottom: 1px solid #E2E8F0; }
        tbody tr:nth-child(even) { background: #F8FAFC; }
        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }
        .badge-success { background: #DCFCE7; color: #166534; }
        .badge-danger { background: #FEE2E2; color: #991B1B; }
        .badge-warning { background: #FEF3C7; color: #92400E; }
        .badge-info { background: #DBEAFE; color: #1E40AF; }
        .report-footer {
          margin-top: 28px;
          padding-top: 12px;
          border-top: 1px solid #E2E8F0;
          font-size: 11px;
          color: #94A3B8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <img class="report-logo" src="${logoUrl}" onerror="this.style.display='none'">
        <div>
          <div class="academy-name">${CONFIG.ACADEMY_NAME}</div>
          <div class="report-title">${title}</div>
          ${subtitle ? `<div class="report-subtitle">${subtitle}</div>` : ''}
        </div>
      </div>
      ${bodyHtml}
      <div class="report-footer">Generated on ${generatedOn} &middot; ${CONFIG.ACADEMY_NAME} Portal</div>
    </body>
    </html>
  `;

  buildViewerShell(title);
  qs('#fileViewerActions').innerHTML = `
    <button type="button" class="file-viewer-btn file-viewer-download" id="fileViewerPrintBtn">
      <i class="fa-solid fa-download"></i><span>Print / Save as PDF</span>
    </button>
  `;
  qs('#fileViewerBody').innerHTML = `<iframe class="file-viewer-frame" id="fileViewerReportFrame" title="${escapeHtmlUtil(title)}"></iframe>`;

  const frame = qs('#fileViewerReportFrame');
  frame.srcdoc = reportHtml;

  qs('#fileViewerPrintBtn').addEventListener('click', () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      showToast('Could not open the print dialog. Please try again.', 'error');
    }
  });
}

// ---------------------------------------------------------------
// STUDENT ID CARD
// ---------------------------------------------------------------

/**
 * Renders a printable Student ID card in the same in-app viewer used for
 * reports/files — shown right after a student is registered, and
 * reachable any time after from the Students table ("ID Card" action).
 * @param {{studentId:string, studentName:string, standard:string, board:string,
 *          batch:string, rollNo?:string, parentName?:string, parentMobile?:string}} student
 */
export async function openIdCard(student) {
  let logoUrl = CONFIG.FALLBACK_LOGO_URL;
  try {
    const { apiGet } = await import('./api.js?v=3');
    const result = await apiGet('getSettings');
    if (result && result.success && result.settings && result.settings.LogoURL) {
      logoUrl = result.settings.LogoURL;
    }
  } catch (err) {
    // Backend unreachable — fall back to the GitHub-hosted logo.
  }

  const initialsText = initials(student.studentName || '');
  const validThru = (() => {
    const d = new Date();
    // Academic-year style validity: valid through 31 March of next year.
    const year = d.getMonth() >= 3 ? d.getFullYear() + 1 : d.getFullYear();
    return `31 Mar ${year}`;
  })();

  const cardHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>ID Card — ${escapeHtmlUtil(student.studentName || '')}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Arial, sans-serif;
          background: #EEF2F7;
          padding: 28px;
          display: flex;
          justify-content: center;
        }
        .id-card {
          width: 338px;
          border-radius: 16px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 10px 30px rgba(15,23,42,0.18);
          border: 1px solid #E2E8F0;
        }
        .id-head {
          background: linear-gradient(135deg, #2563EB, #1E3A8A);
          color: #fff;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .id-head img { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .id-head .academy-name { font-size: 13.5px; font-weight: 700; line-height: 1.2; }
        .id-head .card-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; margin-top: 1px; }
        .id-body { padding: 20px 18px 16px; display: flex; gap: 14px; }
        .id-avatar {
          width: 72px; height: 72px;
          border-radius: 12px;
          background: linear-gradient(135deg, #F59E0B, #d97706);
          color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 24px; font-weight: 700;
          flex-shrink: 0;
        }
        .id-fields { flex: 1; min-width: 0; }
        .id-name { font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 6px; word-break: break-word; }
        .id-row { font-size: 11.5px; color: #334155; margin-bottom: 3px; }
        .id-row b { color: #0F172A; }
        .id-footer {
          border-top: 1px dashed #CBD5E1;
          padding: 12px 18px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10.5px;
          color: #64748B;
        }
        .id-studentid {
          font-family: 'Courier New', monospace;
          font-size: 13px;
          font-weight: 700;
          color: #1E3A8A;
          letter-spacing: 0.05em;
        }
        .print-hint { text-align: center; font-size: 12px; color: #64748B; margin-top: 14px; }
        @media print {
          body { background: #fff; padding: 0; }
          .print-hint { display: none; }
        }
      </style>
    </head>
    <body>
      <div>
        <div class="id-card">
          <div class="id-head">
            <img src="${logoUrl}" onerror="this.style.display='none'">
            <div>
              <div class="academy-name">${escapeHtmlUtil(CONFIG.ACADEMY_NAME)}</div>
              <div class="card-label">Student Identity Card</div>
            </div>
          </div>
          <div class="id-body">
            <div class="id-avatar">${escapeHtmlUtil(initialsText)}</div>
            <div class="id-fields">
              <div class="id-name">${escapeHtmlUtil(student.studentName || '')}</div>
              <div class="id-row"><b>Standard:</b> ${escapeHtmlUtil(student.standard || '-')} &nbsp; <b>Board:</b> ${escapeHtmlUtil(student.board || '-')}</div>
              <div class="id-row"><b>Batch:</b> ${escapeHtmlUtil(student.batch || '-')}</div>
              ${student.rollNo ? `<div class="id-row"><b>Roll No:</b> ${escapeHtmlUtil(student.rollNo)}</div>` : ''}
              ${student.parentMobile ? `<div class="id-row"><b>Parent Contact:</b> ${escapeHtmlUtil(student.parentMobile)}</div>` : ''}
            </div>
          </div>
          <div class="id-footer">
            <div>Student ID<br><span class="id-studentid">${escapeHtmlUtil(student.studentId || '')}</span></div>
            <div style="text-align:right;">Valid through<br><b>${validThru}</b></div>
          </div>
        </div>
        <div class="print-hint">Use the Print button above to print or save this card as a PDF.</div>
      </div>
    </body>
    </html>
  `;

  buildViewerShell(`ID Card — ${student.studentName || ''}`);
  qs('#fileViewerActions').innerHTML = `
    <button type="button" class="file-viewer-btn file-viewer-download" id="fileViewerPrintBtn">
      <i class="fa-solid fa-print"></i><span>Print / Save as PDF</span>
    </button>
  `;
  qs('#fileViewerBody').innerHTML = `<iframe class="file-viewer-frame" id="fileViewerReportFrame" title="ID Card"></iframe>`;

  const frame = qs('#fileViewerReportFrame');
  frame.srcdoc = cardHtml;

  qs('#fileViewerPrintBtn').addEventListener('click', () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (err) {
      showToast('Could not open the print dialog. Please try again.', 'error');
    }
  });
}

function escapeHtmlUtil(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
