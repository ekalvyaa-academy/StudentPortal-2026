/**
 * fees.js
 * Admin-only fee tracking: totals, amount paid, installments and
 * outstanding balance per student.
 */

import { apiGet, apiPost } from './api.js?v=3';
import { CONFIG } from './config.js?v=3';
import { showToast, showLoading, closeLoading, confirmAction, qs, debounce, todayISO } from './utils.js?v=3';

let allFees = [];
let allStudentsCache = [];

export function initFeesModule() {
  bindEvents();
}

function bindEvents() {
  qs('#feesSearchInput').addEventListener('input', debounce(renderFees, 250));
  qs('#feesStatusFilter').addEventListener('change', renderFees);

  qs('#closeInstallmentModal').addEventListener('click', closeInstallmentModal);
  qs('#cancelInstallmentModal').addEventListener('click', closeInstallmentModal);
  qs('#installmentModal').addEventListener('click', (e) => {
    if (e.target.id === 'installmentModal') closeInstallmentModal();
  });
  qs('#installmentForm').addEventListener('submit', handleInstallmentSubmit);
  qs('#sendBulkRemindersBtn').addEventListener('click', handleBulkReminders);
}

export async function loadFees() {
  const tbody = qs('#feesTableBody');
  tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading...</p></div></td></tr>`;

  const [feesResult, studentsResult] = await Promise.all([apiGet('getFees'), apiGet('getStudents')]);

  if (studentsResult.success) allStudentsCache = studentsResult.students;

  if (feesResult.success) {
    // Merge in students who don't have a fee record yet, shown as Pending/0.
    const feeByStudent = {};
    feesResult.fees.forEach((f) => { feeByStudent[f.StudentID] = f; });

    allFees = allStudentsCache.map((s) => {
      const existing = feeByStudent[s.StudentID];
      const base = existing || {
        StudentID: s.StudentID,
        StudentName: s.StudentName,
        TotalFee: 0,
        AmountPaid: 0,
        PaymentMode: 'Full',
        Status: 'Pending'
      };
      return { ...base, ParentMobile: s.ParentMobile || '', ParentEmail: s.ParentEmail || '' };
    });
    renderFees();
  } else {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${feesResult.message || 'Could not load fee records.'}</p></div></td></tr>`;
  }
}

function renderFees() {
  const tbody = qs('#feesTableBody');
  const search = qs('#feesSearchInput').value.trim().toLowerCase();
  const status = qs('#feesStatusFilter').value;

  let rows = allFees.filter((f) => {
    const matchesSearch = !search ||
      String(f.StudentName).toLowerCase().includes(search) ||
      String(f.StudentID).toLowerCase().includes(search);
    const matchesStatus = !status || String(f.Status) === status;
    return matchesSearch && matchesStatus;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-indian-rupee-sign"></i><p>No matching fee records.</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((f) => {
    const total = Number(f.TotalFee) || 0;
    const paid = Number(f.AmountPaid) || 0;
    const balance = Math.max(total - paid, 0);
    const badgeClass = f.Status === 'Paid' ? 'badge-success' : f.Status === 'Partial' ? 'badge-warning' : 'badge-danger';

    return `
      <tr>
        <td>${escapeHtml(f.StudentName)}</td>
        <td>${escapeHtml(f.StudentID)}</td>
        <td>₹${total.toLocaleString('en-IN')}</td>
        <td>₹${paid.toLocaleString('en-IN')}</td>
        <td>₹${balance.toLocaleString('en-IN')}</td>
        <td><span class="badge ${badgeClass}">${f.Status}</span></td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-outline btn-icon" title="Set total fee" data-action="set-total" data-id="${f.StudentID}" data-name="${escapeHtml(f.StudentName)}" data-total="${total}"><i class="fa-solid fa-sliders"></i></button>
            <button class="btn btn-solid-primary btn-icon" title="Record payment" data-action="pay" data-id="${f.StudentID}"><i class="fa-solid fa-money-bill-wave"></i></button>
            <button class="btn btn-outline btn-icon" title="${paid > 0 ? 'Email receipt' : 'No payment recorded yet'}" data-action="receipt" data-id="${f.StudentID}" ${paid <= 0 ? 'disabled' : ''}><i class="fa-solid fa-envelope-circle-check"></i></button>
            <button class="btn btn-outline btn-icon" title="${balance > 0 ? 'Email reminder' : 'No balance due'}" data-action="reminder" data-id="${f.StudentID}" ${balance <= 0 ? 'disabled' : ''}><i class="fa-solid fa-bell"></i></button>
            <button class="btn btn-outline btn-icon" title="${f.ParentMobile ? 'Share via WhatsApp' : 'No parent mobile on file'}" data-action="whatsapp" data-id="${f.StudentID}" ${!f.ParentMobile ? 'disabled' : ''}><i class="fa-brands fa-whatsapp"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action="pay"]').forEach((btn) => {
    btn.addEventListener('click', () => openInstallmentModal(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-action="set-total"]').forEach((btn) => {
    btn.addEventListener('click', () => setTotalFeePrompt(btn.dataset.id, btn.dataset.name, btn.dataset.total));
  });
  tbody.querySelectorAll('[data-action="receipt"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSendReceipt(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-action="reminder"]').forEach((btn) => {
    btn.addEventListener('click', () => handleSendReminder(btn.dataset.id));
  });
  tbody.querySelectorAll('[data-action="whatsapp"]').forEach((btn) => {
    btn.addEventListener('click', () => shareViaWhatsApp(btn.dataset.id));
  });
}

async function setTotalFeePrompt(studentId, studentName, currentTotal) {
  const { value: totalFee } = await Swal.fire({
    title: 'Set Total Fee',
    input: 'number',
    inputLabel: studentName,
    inputValue: currentTotal || 0,
    inputAttributes: { min: 0 },
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: '#2563EB',
    customClass: { popup: 'ea-swal-popup' }
  });

  if (totalFee === undefined) return;

  const existing = allFees.find((f) => f.StudentID === studentId) || {};
  showLoading('Saving...');
  const result = await apiPost('saveFees', {
    studentId,
    studentName,
    totalFee: Number(totalFee),
    amountPaid: Number(existing.AmountPaid) || 0,
    paymentMode: existing.PaymentMode || 'Full',
    installments: existing.Installments || [],
    teacher: 'Admin'
  });
  closeLoading();

  if (result.success) {
    showToast('Total fee updated.', 'success');
    loadFees();
  } else {
    showToast(result.message || 'Could not save.', 'error');
  }
}

function openInstallmentModal(studentId) {
  qs('#installmentStudentId').value = studentId;
  qs('#installmentAmount').value = '';
  qs('#installmentDate').value = todayISO();
  qs('#installmentNote').value = '';
  qs('#installmentModal').classList.add('active');
}

function closeInstallmentModal() {
  qs('#installmentModal').classList.remove('active');
}

async function handleInstallmentSubmit(e) {
  e.preventDefault();
  const studentId = qs('#installmentStudentId').value;
  const amount = Number(qs('#installmentAmount').value);
  const date = qs('#installmentDate').value;
  const note = qs('#installmentNote').value.trim();

  const existing = allFees.find((f) => f.StudentID === studentId);
  if (!existing || !Number(existing.TotalFee)) {
    showToast('Set a total fee for this student before recording a payment.', 'warning');
    return;
  }

  showLoading('Saving payment...');
  const result = await apiPost('addFeeInstallment', { studentId, amount, date, note, teacher: 'Admin' });
  closeLoading();

  if (result.success) {
    if (result.receiptSent) {
      showToast('Payment recorded. Receipt emailed to parent.', 'success');
    } else if (result.hasParentEmail === false) {
      showToast('Payment recorded. No parent email on file — receipt not sent.', 'warning');
    } else {
      showToast('Payment recorded.', 'success');
    }
    closeInstallmentModal();
    loadFees();
  } else {
    showToast(result.message || 'Could not save payment.', 'error');
  }
}

async function handleSendReceipt(studentId) {
  showLoading('Sending receipt...');
  const result = await apiPost('sendFeeReceipt', { studentId });
  closeLoading();
  showToast(result.message, result.success ? 'success' : 'error');
}

async function handleSendReminder(studentId) {
  showLoading('Sending reminder...');
  const result = await apiPost('sendFeeReminder', { studentId });
  closeLoading();
  showToast(result.message, result.success ? 'success' : 'error');
}

async function handleBulkReminders() {
  const confirmed = await confirmAction({
    title: 'Send reminders to all pending?',
    text: 'This will email every student with an outstanding balance and a parent email on file.',
    confirmText: 'Yes, send reminders',
    icon: 'question'
  });
  if (!confirmed) return;

  showLoading('Sending reminders...');
  const result = await apiPost('sendBulkFeeReminders', {});
  closeLoading();
  showToast(result.message, result.success ? 'success' : 'error');
}

function shareViaWhatsApp(studentId) {
  const f = allFees.find((row) => row.StudentID === studentId);
  if (!f || !f.ParentMobile) {
    showToast('No parent mobile number on file for this student.', 'warning');
    return;
  }

  const total = Number(f.TotalFee) || 0;
  const paid = Number(f.AmountPaid) || 0;
  const balance = Math.max(total - paid, 0);

  const message = balance > 0
    ? `Dear Parent, this is a reminder from ${CONFIG.ACADEMY_NAME} regarding pending fees for ${f.StudentName} (${f.StudentID}). Total Fee: Rs. ${total}, Paid: Rs. ${paid}, Balance Due: Rs. ${balance}. Kindly clear the dues at your earliest convenience. Thank you.`
    : `Dear Parent, this is to confirm fees for ${f.StudentName} (${f.StudentID}) at ${CONFIG.ACADEMY_NAME} are fully paid. Total Fee: Rs. ${total}. Thank you.`;

  // Strip everything except digits, then default to India's country code
  // if the stored number doesn't already include one.
  let phone = String(f.ParentMobile).replace(/\D/g, '');
  if (phone.length === 10) phone = '91' + phone;

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
