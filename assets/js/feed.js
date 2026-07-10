/**
 * feed.js
 * Class Feed: Admin posts photos/updates; any teacher (and, from
 * student.js, students) can like, comment and share them.
 */

import { apiGet, apiPost } from './api.js?v=3';
import { CONFIG } from './config.js?v=3';
import {
  showToast, showLoading, closeLoading, confirmAction,
  qs, qsa, fileToUploadPayload, timeAgoShort, openFileViewer
} from './utils.js?v=3';

let teacherRef = null;

export function initFeedModule(teacher) {
  teacherRef = teacher;
  const form = qs('#feedPostForm');
  if (form) form.addEventListener('submit', handleCreatePost);
}

async function handleCreatePost(e) {
  e.preventDefault();
  const title = qs('#feedPostTitle').value.trim();
  const content = qs('#feedPostContent').value.trim();

  if (!title && !content) {
    showToast('Please add a title or message.', 'warning');
    return;
  }

  const payload = { title, content, createdBy: teacherRef ? teacherRef.name : 'Admin' };

  const imageFile = qs('#feedPostImageInput').files[0];
  if (imageFile) {
    try {
      const upload = await fileToUploadPayload(imageFile, 'image');
      payload.imageBase64 = upload.base64;
      payload.imageMimeType = upload.mimeType;
      payload.imageFileName = upload.fileName;
    } catch (err) {
      showToast(err.message, 'warning');
      return;
    }
  }

  showLoading('Posting...');
  const result = await apiPost('createFeedPost', payload);
  closeLoading();

  if (result.success) {
    showToast('Posted to the feed.', 'success');
    qs('#feedPostForm').reset();
    loadFeed();
  } else {
    showToast(result.message || 'Could not post.', 'error');
  }
}

export async function loadFeed() {
  const area = qs('#feedListArea');
  area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading feed...</p></div>`;

  const viewerId = teacherRef ? teacherRef.teacherId : '';
  const result = await apiGet('getFeedPosts', { viewerId });

  if (!result.success) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(result.message || 'Could not load feed.')}</p></div>`;
    return;
  }

  renderFeed(result.posts || [], area, {
    isAdmin: teacherRef && teacherRef.role === 'Admin',
    likedBy: viewerId,
    authorName: teacherRef ? teacherRef.name : 'Teacher',
    authorType: 'Teacher',
    reload: loadFeed
  });
}

/**
 * Shared renderer used by both the teacher dashboard and the student
 * portal, so the feed looks and behaves identically everywhere.
 * @param {Array} posts
 * @param {HTMLElement} area
 * @param {{isAdmin: boolean, likedBy: string, authorName: string, authorType: string}} ctx
 */
export function renderFeed(posts, area, ctx) {
  if (!posts.length) {
    area.innerHTML = `<div class="empty-state"><i class="fa-solid fa-newspaper"></i><p>No posts yet.</p></div>`;
    return;
  }

  area.innerHTML = posts.map((p) => `
    <div class="feed-post-card">
      <div class="feed-post-header">
        <div class="feed-post-author-avatar"><i class="fa-solid fa-graduation-cap"></i></div>
        <div>
          <div class="feed-post-author">${escapeHtml(p.CreatedBy)}</div>
          <div class="feed-post-time">${timeAgoShort(p.CreatedAt)}</div>
        </div>
        ${ctx.isAdmin ? `<button class="btn-icon feed-delete-btn" data-delete-post="${escapeHtml(p.PostID)}" title="Delete post"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
      ${p.Title ? `<div class="feed-post-title">${escapeHtml(p.Title)}</div>` : ''}
      ${p.Content ? `<div class="feed-post-content">${escapeHtml(p.Content)}</div>` : ''}
      ${p.ImageURL ? `<img class="feed-post-image" src="${p.ImageURL}" alt="Post image" data-view-image="${escapeHtml(p.ImageURL)}" onerror="this.style.display='none'">` : ''}
      <div class="feed-post-actions">
        <button class="feed-action-btn ${p.likedByViewer ? 'liked' : ''}" data-like-post="${escapeHtml(p.PostID)}">
          <i class="fa-solid fa-heart"></i> <span>${p.likeCount}</span>
        </button>
        <button class="feed-action-btn" data-toggle-comments="${escapeHtml(p.PostID)}">
          <i class="fa-regular fa-comment"></i> <span>${p.comments.length}</span>
        </button>
        <div class="feed-share-wrap">
          <button class="feed-action-btn" data-share-post="${escapeHtml(p.PostID)}">
            <i class="fa-solid fa-share-nodes"></i> Share
          </button>
        </div>
      </div>
      <div class="feed-comments-section" id="comments-${escapeHtml(p.PostID)}" style="display:none;">
        <div class="feed-comments-list">
          ${p.comments.map((c) => `
            <div class="feed-comment">
              <span class="feed-comment-author">${escapeHtml(c.AuthorName)}</span>
              <span class="feed-comment-text">${escapeHtml(c.Comment)}</span>
            </div>
          `).join('') || '<div class="feed-comment-empty">No comments yet.</div>'}
        </div>
        <form class="feed-comment-form" data-comment-form="${escapeHtml(p.PostID)}">
          <input type="text" placeholder="Write a comment..." maxlength="300" required>
          <button type="submit"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </div>
    </div>
  `).join('');

  qsa('[data-like-post]', area).forEach((btn) => {
    btn.addEventListener('click', () => handleLike(btn.dataset.likePost, ctx, area));
  });
  qsa('[data-toggle-comments]', area).forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = qs(`#comments-${btn.dataset.toggleComments}`);
      section.style.display = section.style.display === 'none' ? 'block' : 'none';
    });
  });
  qsa('[data-comment-form]', area).forEach((form) => {
    form.addEventListener('submit', (e) => handleAddComment(e, form.dataset.commentForm, ctx, area));
  });
  qsa('[data-share-post]', area).forEach((btn) => {
    const post = posts.find((p) => p.PostID === btn.dataset.sharePost);
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleShareMenu(btn, post); });
  });
  qsa('[data-view-image]', area).forEach((img) => {
    img.addEventListener('click', () => openFileViewer(img.dataset.viewImage, 'Feed Photo'));
  });
  qsa('[data-delete-post]', area).forEach((btn) => {
    btn.addEventListener('click', () => handleDeletePost(btn.dataset.deletePost, ctx, area));
  });
}

async function handleLike(postId, ctx, area) {
  if (!ctx.likedBy) {
    showToast('Could not identify who is liking this post.', 'warning');
    return;
  }
  const result = await apiPost('toggleFeedLike', { postId, likedBy: ctx.likedBy });
  if (result.success) {
    const btn = area.querySelector(`[data-like-post="${postId}"]`);
    btn.classList.toggle('liked', result.liked);
    btn.querySelector('span').textContent = result.likeCount;
  }
}

async function handleAddComment(e, postId, ctx, area) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const comment = input.value.trim();
  if (!comment) return;

  const result = await apiPost('addFeedComment', {
    postId, comment,
    authorName: ctx.authorName || 'Anonymous',
    authorType: ctx.authorType || 'Student'
  });

  if (result.success) {
    input.value = '';
    if (ctx.reload) ctx.reload();
  } else {
    showToast(result.message || 'Could not add comment.', 'error');
  }
}

async function handleDeletePost(postId, ctx) {
  const confirmed = await confirmAction({
    title: 'Delete this post?',
    text: 'This will remove the post along with its comments and likes.',
    confirmText: 'Yes, delete'
  });
  if (!confirmed) return;

  showLoading('Deleting post...');
  const result = await apiPost('deleteFeedPost', { postId });
  closeLoading();

  if (result.success) {
    showToast('Post deleted.', 'success');
    if (ctx.reload) ctx.reload();
  } else {
    showToast(result.message || 'Could not delete post.', 'error');
  }
}

// Any teacher or student can share a post to WhatsApp, Facebook or
// Instagram — Admin-only posting is enforced separately (createFeedPost
// is gated behind the admin-only "Share an Update" card in the UI).
function toggleShareMenu(btn, post) {
  // Only one share menu open at a time.
  const existing = qs('.feed-share-menu');
  if (existing) {
    const wasForThisPost = existing.dataset.forPost === (post ? post.PostID : '');
    existing.remove();
    document.removeEventListener('click', closeShareMenuOnOutsideClick);
    if (wasForThisPost) return;
  }
  if (!post) return;

  const text = `${post.Title ? post.Title + ' — ' : ''}${post.Content || ''}\n\nShared from ${CONFIG.ACADEMY_NAME}`.trim();
  const pageUrl = window.location.href.split('#')[0];

  const menu = document.createElement('div');
  menu.className = 'feed-share-menu';
  menu.dataset.forPost = post.PostID;
  menu.innerHTML = `
    <button type="button" data-share-channel="whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
    <button type="button" data-share-channel="facebook"><i class="fa-brands fa-facebook"></i> Facebook</button>
    <button type="button" data-share-channel="instagram"><i class="fa-brands fa-instagram"></i> Instagram</button>
  `;
  btn.closest('.feed-share-wrap').appendChild(menu);

  menu.querySelector('[data-share-channel="whatsapp"]').addEventListener('click', () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    closeShareMenu();
  });
  menu.querySelector('[data-share-channel="facebook"]').addEventListener('click', () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(text)}`, '_blank', 'noopener');
    closeShareMenu();
  });
  menu.querySelector('[data-share-channel="instagram"]').addEventListener('click', async () => {
    // Instagram has no web share-intent URL — copy the caption so it can
    // be pasted straight into a Story/DM, then open the Instagram app/site.
    try {
      await navigator.clipboard.writeText(text);
      showToast('Caption copied — paste it into Instagram.', 'success');
    } catch (err) {
      // Clipboard permission denied — user can still copy manually.
    }
    window.open('https://www.instagram.com/', '_blank', 'noopener');
    closeShareMenu();
  });

  setTimeout(() => document.addEventListener('click', closeShareMenuOnOutsideClick), 0);
}

function closeShareMenu() {
  const existing = qs('.feed-share-menu');
  if (existing) existing.remove();
  document.removeEventListener('click', closeShareMenuOnOutsideClick);
}

function closeShareMenuOnOutsideClick(e) {
  const menu = qs('.feed-share-menu');
  if (menu && !menu.contains(e.target)) closeShareMenu();
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
