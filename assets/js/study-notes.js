/**
 * study-notes.js
 * Teacher/Admin side of the Notes Library: upload PDF notes scoped to a
 * Standard + Board + Subject, and browse/delete what's been shared so
 * far, grouped by subject. Students see the same notes read-only,
 * scoped to their own class, from student.js.
 */

import { apiGet, apiPost } from './api.js?v=3';
import { CONFIG } from './config.js?v=3';
import {
  showToast, showLoading, closeLoading, confirmAction, getTeacherSession,
  qs, qsa, populateSelect, fileToUploadPayload, openFileViewer
} from './utils.js?v=3';

export function initStudyNotesModule() {
  populateSelect(qs('#noteStandard'), CONFIG.STANDARDS, 'Select standard');
  populateSelect(qs('#noteBoard'), CONFIG.BOARDS, 'Select board');
  populateSelect(qs('#noteFilterStandard'), CONFIG.STANDARDS, 'All standards');
  populateSelect(qs('#noteFilterBoard'), CONFIG.BOARDS, 'All boards');

  qs('#uploadNoteForm').addEventListener('submit', handleUploadNote);
  qs('#loadNotesBtn').addEventListener('click', loadNotesLibrary);
}

async function handleUploadNote(e) {
  e.preventDefault();
  const teacher = getTeacherSession();

  const standard = qs('#noteStandard').value;
  const board = qs('#noteBoard').value;
  const subject = qs('#noteSubject').value.trim();
  const title = qs('#noteTitle').value.trim();
  const file = qs('#noteFileInput').files[0];

  if (!standard || !board || !subject || !title) {
    showToast('Please fill in standard, board, subject and title.', 'warning');
    return;
  }
  if (!file) {
    showToast('Please attach a PDF file.', 'warning');
    return;
  }

  let upload;
  try {
    upload = await fileToUploadPayload(file, 'pdf');
  } catch (err) {
    showToast(err.message, 'warning');
    return;
  }

  showLoading('Uploading note...');
  const result = await apiPost('addStudyNote', {
    standard,
    board,
    subject,
    title,
    fileBase64: upload.base64,
    fileMimeType: upload.mimeType,
    fileFileName: upload.fileName,
    uploadedBy: teacher ? teacher.name : 'Teacher',
    uploaderRole: teacher ? teacher.role : 'Teacher'
  });
  closeLoading();

  if (result.success) {
    showToast('Note uploaded.', 'success');
    qs('#uploadNoteForm').reset();
    qs('#noteFilterStandard').value = standard;
    qs('#noteFilterBoard').value = board;
    loadNotesLibrary();
  } else {
    showToast(result.message || 'Could not upload note.', 'error');
  }
}

async function loadNotesLibrary() {
  const standard = qs('#noteFilterStandard').value;
  const board = qs('#noteFilterBoard').value;
  const area = qs('#notesLibraryArea');

  if (!standard || !board) {
    showToast('Please choose both a standard and a board.', 'warning');
    return;
  }

  area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading notes...</p></div>`;

  const result = await apiGet('getStudyNotes', { standard, board });
  if (!result.success) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load notes.')}</p></div>`;
    return;
  }

  renderNotesLibrary(result.subjects || []);
}

function renderNotesLibrary(subjects) {
  const area = qs('#notesLibraryArea');

  if (!subjects.length) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-lines"></i><p>No notes uploaded yet for this class. Use the form above to add one.</p></div>`;
    return;
  }

  area.innerHTML = subjects.map((s) => `
    <div class="syllabus-subject-block">
      <div class="syllabus-subject-header">
        <div>
          <div class="syllabus-subject-name">${escapeHtml(s.subject)}</div>
          <div class="syllabus-subject-sub">${s.notes.length} note${s.notes.length === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="syllabus-table-wrap">
        <table class="syllabus-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Uploaded By</th>
              <th>Date</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${s.notes.map((n) => `
              <tr>
                <td class="chapter-name-cell">${escapeHtml(n.Title)}</td>
                <td>${escapeHtml(n.UploadedBy)}</td>
                <td>${escapeHtml(n.CreatedAt)}</td>
                <td><button type="button" class="file-link-btn" data-view-note="${escapeHtml(n.FileURL)}" data-view-title="${escapeHtml(n.Title)}"><i class="fa-solid fa-file-pdf"></i> View</button></td>
                <td>
                  <button class="btn-icon" data-delete-note="${escapeHtml(n.NoteID)}" data-note-title="${escapeHtml(n.Title)}" title="Delete note">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');

  qsa('[data-view-note]', area).forEach((btn) => {
    btn.addEventListener('click', () => openFileViewer(btn.dataset.viewNote, btn.dataset.viewTitle));
  });
  qsa('[data-delete-note]', area).forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteNote(btn.dataset.deleteNote, btn.dataset.noteTitle));
  });
}

async function handleDeleteNote(noteId, noteTitle) {
  const confirmed = await confirmAction({
    title: 'Delete this note?',
    text: `"${noteTitle}" will be permanently removed and students will no longer see it.`,
    confirmText: 'Yes, delete'
  });
  if (!confirmed) return;

  showLoading('Deleting note...');
  const result = await apiPost('deleteStudyNote', { noteId });
  closeLoading();

  if (result.success) {
    showToast('Note removed.', 'success');
    loadNotesLibrary();
  } else {
    showToast(result.message || 'Could not delete note.', 'error');
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
