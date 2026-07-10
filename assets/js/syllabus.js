/**
 * syllabus.js
 * Teacher-side Syllabus Coverage Tracker: add chapters per
 * Standard + Board + Subject, mark them Completed/Pending with a date,
 * and see per-subject completion progress. Students/parents see the
 * same data read-only from student.js.
 */

import { apiGet, apiPost } from './api.js?v=3';
import { CONFIG } from './config.js?v=3';
import {
  showToast, showLoading, closeLoading, confirmAction, getTeacherSession,
  todayISO, qs, qsa, populateSelect
} from './utils.js?v=3';

export function initSyllabusModule() {
  populateSelect(qs('#syllabusStandard'), CONFIG.STANDARDS, 'All standards');
  populateSelect(qs('#syllabusBoard'), CONFIG.BOARDS, 'All boards');
  populateSelect(qs('#chapterStandard'), CONFIG.STANDARDS, 'Select standard');
  populateSelect(qs('#chapterBoard'), CONFIG.BOARDS, 'Select board');

  qs('#loadSyllabusBtn').addEventListener('click', loadSyllabus);
  qs('#addChapterBtn').addEventListener('click', openAddChapterModal);
  qs('#closeAddChapterModal').addEventListener('click', closeAddChapterModal);
  qs('#cancelAddChapterModal').addEventListener('click', closeAddChapterModal);
  qs('#addChapterModal').addEventListener('click', (e) => {
    if (e.target.id === 'addChapterModal') closeAddChapterModal();
  });
  qs('#addChapterForm').addEventListener('submit', handleAddChapter);
}

function openAddChapterModal() {
  // Pre-fill standard/board from the current filter, if one is selected —
  // saves a step when adding several chapters for the same class in a row.
  qs('#chapterStandard').value = qs('#syllabusStandard').value || '';
  qs('#chapterBoard').value = qs('#syllabusBoard').value || '';
  qs('#chapterSubject').value = qs('#syllabusSubjectFilter').value || '';
  qs('#chapterNo').value = '';
  qs('#chapterName').value = '';
  qs('#chapterPlannedDate').value = '';
  qs('#addChapterModal').classList.add('active');
}

function closeAddChapterModal() {
  qs('#addChapterModal').classList.remove('active');
}

async function handleAddChapter(e) {
  e.preventDefault();
  const teacher = getTeacherSession();

  const standard = qs('#chapterStandard').value;
  const board = qs('#chapterBoard').value;
  const subject = qs('#chapterSubject').value.trim();
  const chapterName = qs('#chapterName').value.trim();

  if (!standard || !board || !subject || !chapterName) {
    showToast('Please fill standard, board, subject and chapter name.', 'warning');
    return;
  }

  showLoading('Adding chapter...');
  const result = await apiPost('addSyllabusChapter', {
    standard,
    board,
    subject,
    chapterNo: qs('#chapterNo').value,
    chapterName,
    plannedDate: qs('#chapterPlannedDate').value,
    updatedBy: teacher ? teacher.name : 'Teacher'
  });
  closeLoading();

  if (result.success) {
    showToast('Chapter added.', 'success');
    closeAddChapterModal();
    // Reflect the newly added chapter's class in the filter bar and reload.
    qs('#syllabusStandard').value = standard;
    qs('#syllabusBoard').value = board;
    loadSyllabus();
  } else {
    showToast(result.message || 'Could not add chapter.', 'error');
  }
}

async function loadSyllabus() {
  const standard = qs('#syllabusStandard').value;
  const board = qs('#syllabusBoard').value;
  const subject = qs('#syllabusSubjectFilter').value.trim();
  const area = qs('#syllabusResultArea');

  if (!standard || !board) {
    showToast('Please choose both a standard and a board.', 'warning');
    return;
  }

  area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading syllabus...</p></div>`;

  const result = await apiGet('getSyllabus', { standard, board, subject });
  if (!result.success) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load syllabus.')}</p></div>`;
    return;
  }

  renderSyllabus(result.subjects || []);
}

function renderSyllabus(subjects) {
  const area = qs('#syllabusResultArea');

  if (!subjects.length) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-book-open"></i><p>No chapters added yet for this class. Click "Add Chapter" to get started.</p></div>`;
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${s.chapters.map((c) => renderChapterRow(c)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');

  qsa('[data-syllabus-status]').forEach((select) => {
    select.addEventListener('change', () => updateChapterStatus(select.dataset.syllabusStatus, select.value, select));
  });
  qsa('[data-delete-syllabus]').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteChapter(btn.dataset.deleteSyllabus, btn.dataset.chapterName));
  });
}

const STATUS_OPTIONS = ['Not Started', 'In Progress', 'Completed'];

function renderChapterRow(c) {
  const status = STATUS_OPTIONS.indexOf(c.Status) !== -1 ? c.Status : 'Not Started';
  return `
    <tr>
      <td>${c.ChapterNo ? escapeHtml(c.ChapterNo) : '-'}</td>
      <td class="chapter-name-cell">${escapeHtml(c.ChapterName)}</td>
      <td>${c.PlannedDate ? escapeHtml(c.PlannedDate) : '-'}</td>
      <td>${status === 'Completed' && c.CompletedDate ? escapeHtml(c.CompletedDate) : '-'}</td>
      <td>
        <select class="status-select" data-syllabus-status="${escapeHtml(c.SyllabusID)}" data-status="${status}">
          ${STATUS_OPTIONS.map((opt) => `<option value="${opt}" ${opt === status ? 'selected' : ''}>${opt}</option>`).join('')}
        </select>
      </td>
      <td>
        <button class="btn-icon" data-delete-syllabus="${escapeHtml(c.SyllabusID)}" data-chapter-name="${escapeHtml(c.ChapterName)}" title="Delete chapter">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `;
}

async function updateChapterStatus(syllabusId, newStatus, selectEl) {
  const teacher = getTeacherSession();

  const result = await apiPost('updateSyllabusStatus', {
    syllabusId,
    status: newStatus,
    completedDate: newStatus === 'Completed' ? todayISO() : '',
    updatedBy: teacher ? teacher.name : 'Teacher'
  });

  if (result.success) {
    selectEl.dataset.status = newStatus;
    loadSyllabus();
  } else {
    showToast(result.message || 'Could not update chapter.', 'error');
  }
}

async function handleDeleteChapter(syllabusId, chapterName) {
  const confirmed = await confirmAction({
    title: 'Delete this chapter?',
    text: `"${chapterName}" will be permanently removed from the syllabus tracker.`,
    confirmText: 'Yes, delete'
  });
  if (!confirmed) return;

  showLoading('Deleting chapter...');
  const result = await apiPost('deleteSyllabusChapter', { syllabusId });
  closeLoading();

  if (result.success) {
    showToast('Chapter removed.', 'success');
    loadSyllabus();
  } else {
    showToast(result.message || 'Could not delete chapter.', 'error');
  }
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
