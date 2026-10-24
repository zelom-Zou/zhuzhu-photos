const galleryEl = document.getElementById('gallery');
const track1 = document.getElementById('track-1');
const track2 = document.getElementById('track-2');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');

const uploadCard = document.getElementById('upload-card');
const photoInput = document.getElementById('photo-input');
const uploadStatus = document.getElementById('upload-status');
const uploadCount = document.getElementById('upload-count');
const tokenPanel = document.getElementById('token-panel');
const tokenInput = document.getElementById('token-input');
const tokenSave = document.getElementById('token-save');
const tokenClear = document.getElementById('token-clear');

const authGate = document.getElementById('auth-gate');
const authForm = document.getElementById('auth-form');
const authInput = document.getElementById('auth-input');
const authError = document.getElementById('auth-error');

const MAX_PHOTOS = 10;
const MAX_EDGE = 1600;
const MAX_OUTPUT_BYTES = 900 * 1024;

// 访问口令：只存 SHA-256，改口令就换掉这里的哈希
const UNLOCK_KEY = 'zhuzhu-unlocked';
const PASSWORD_HASH = '2cfc741640ec8aedfd754a77a937e93f07d3bc99cbb56232dea79f8697423ae3';

// 上传直接写入 GitHub 仓库，由 Pages 自动发布
const REPO = { owner: 'zelom-Zou', repo: 'zhuzhu-photos', branch: 'main' };
const UPLOAD_DIR = 'photos-online';
const UPLOAD_MANIFEST = 'photos-online.json';
const TOKEN_KEY = 'zhuzhu-github-token';
const API_BASE = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}`;

let photos = [];
let isUploading = false;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function photoKey(photo) {
  return (photo.online ? 'o:' : 's:') + photo.name;
}

/* ---------- 访问口令 ---------- */

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

function unlock() {
  document.documentElement.classList.remove('auth-pending');
  authError.textContent = '';
  loadPhotos();
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = authInput.value.trim();
  if (!value) return;

  let hash = '';
  try {
    hash = await sha256(value);
  } catch {
    authError.textContent = '当前环境不支持校验，请用 HTTPS 打开本站。';
    return;
  }

  if (hash !== PASSWORD_HASH) {
    authError.textContent = '口令不对，再试一次。';
    authInput.select();
    return;
  }

  try {
    localStorage.setItem(UNLOCK_KEY, '1');
  } catch {}
  authInput.value = '';
  unlock();
});

/* ---------- 渲染 ---------- */

function renderMarquee(track, list) {
  if (!list.length) {
    track.innerHTML = '<p class="empty-hint">还没有照片。</p>';
    return;
  }
  // 复制一份，配合 -50% 位移实现无缝循环
  const doubled = list.concat(list);
  track.innerHTML = doubled
    .map(
      (p) => `
      <figure class="flow-item" data-key="${escapeHtml(photoKey(p))}">
        <img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.name)}" loading="lazy" draggable="false">
      </figure>`
    )
    .join('');
}

function renderGallery() {
  if (!photos.length) {
    galleryEl.innerHTML = '<p class="empty-hint">还没有照片。点上方「添页」上传一张吧。</p>';
    return;
  }
  // 每次进入随机排序，展示不定期更换
  galleryEl.innerHTML = shuffle(photos)
    .map(
      (p) => `
      <figure class="photo-card" data-key="${escapeHtml(photoKey(p))}">
        <div class="photo-frame">
          <img src="${escapeHtml(p.src)}" alt="${escapeHtml(p.name)}" loading="lazy" draggable="false">
        </div>
      </figure>`
    )
    .join('');
}

function renderAll() {
  renderMarquee(track1, shuffle(photos));
  renderMarquee(track2, shuffle(photos));
  renderGallery();
  updateUploadState();
}

/* ---------- 数据加载 ---------- */

async function fetchJson(url) {
  try {
    // Pages 的 CDN 会缓存静态文件，加查询参数绕过旧缓存
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function loadPhotos({ quiet = false } = {}) {
  try {
    const [staticList, onlineList] = await Promise.all([
      fetchJson('photos.json'),
      fetchJson(UPLOAD_MANIFEST),
    ]);

    const staticPhotos = staticList
      .filter((p) => p && p.name)
      .map((p, index) => ({
        name: p.name,
        src: 'photos-web/' + encodeURIComponent(p.name),
        addedAt: Number(p.addedAt) || index,
        online: false,
      }));

    const onlinePhotos = onlineList
      .filter((p) => p && p.name)
      .map((p) => ({
        name: p.name,
        src: UPLOAD_DIR + '/' + encodeURIComponent(p.name),
        addedAt: Number(p.addedAt) || 0,
        online: true,
      }));

    // 旧照片在前、新照片在后，只展示最近 10 张
    photos = staticPhotos
      .concat(onlinePhotos)
      .sort((a, b) => a.addedAt - b.addedAt)
      .slice(-MAX_PHOTOS);

    renderAll();

    if (!quiet) {
      setStatus(photos.length ? '照片已经准备好了，可以继续上传。' : '还没有照片，选择一张开始吧。');
    }
  } catch {
    if (!quiet) setStatus('照片列表读取失败，请稍后重试。', true);
  }
}

/* ---------- 灯箱 ---------- */

function openLightbox(key) {
  const photo = photos.find((item) => photoKey(item) === key);
  if (!photo) return;
  lightboxImg.src = photo.src;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

/* ---------- 上传状态 ---------- */

function setStatus(message, isError = false) {
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle('is-error', isError);
}

function updateUploadState() {
  uploadCard.classList.toggle('is-uploading', isUploading);
  photoInput.disabled = isUploading;
  uploadCount.textContent = `当前展示 ${photos.length} / ${MAX_PHOTOS} 张`;
  tokenPanel.classList.toggle('has-token', Boolean(getToken()));
  const summary = tokenPanel.querySelector('summary');
  if (summary) summary.textContent = getToken() ? '上传设置（Token 已保存）' : '上传设置';
}

/* ---------- Token ---------- */

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

const tokenResult = document.getElementById('token-result');

function setTokenResult(message, isError = false) {
  tokenResult.textContent = message;
  tokenResult.classList.toggle('is-error', isError);
}

// 直接问 GitHub：这个 Token 是谁、有没有本仓库写权限
async function verifyToken(token) {
  const res = await fetch(`${API_BASE}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 401) {
    return {
      ok: false,
      message: 'Token 无效或已过期。要粘贴 github_pat_ 开头的那一整串，不是 Token 名称。',
    };
  }

  if (res.status === 404) {
    return {
      ok: false,
      message: '这个 Token 没有本仓库的权限，请在 Repository access 里勾选 zhuzhu-photos。',
    };
  }

  if (!res.ok) {
    return { ok: false, message: `GitHub 返回 ${res.status}，请稍后重试。` };
  }

  const repo = await res.json();
  const permissions = repo.permissions || {};

  if (!permissions.push) {
    return {
      ok: false,
      message: 'Token 能读取仓库但没有写入权限，请把 Contents 设为 Read and write。',
    };
  }

  return { ok: true, message: `验证通过，可以上传（仓库 ${repo.full_name}）。` };
}

tokenSave.addEventListener('click', async () => {
  const value = tokenInput.value.trim();
  if (!value) {
    setTokenResult('请先粘贴 GitHub Token。', true);
    return;
  }

  tokenSave.disabled = true;
  setTokenResult('正在向 GitHub 验证…');

  try {
    const result = await verifyToken(value);

    if (!result.ok) {
      setTokenResult(result.message, true);
      return;
    }

    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch {
      setTokenResult('浏览器不允许保存本地数据，请检查隐私设置。', true);
      return;
    }

    tokenInput.value = '';
    setTokenResult(result.message);
    updateUploadState();
    setStatus('Token 已验证，可以开始上传。');
  } catch {
    setTokenResult('无法连接 GitHub，请检查网络后重试。', true);
  } finally {
    tokenSave.disabled = false;
  }
});

tokenClear.addEventListener('click', () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  tokenInput.value = '';
  setTokenResult('');
  updateUploadState();
  setStatus('已清除本浏览器的 Token。');
});

/* ---------- 图片压缩与转正 ---------- */

async function loadImageSource(file) {
  try {
    // 浏览器按 EXIF 信息校正方向
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    try {
      image.style.imageOrientation = 'from-image';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('无法读取这张照片'));
        image.src = objectUrl;
      });
      return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }
}

function encodeCanvas(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('照片压缩失败'))),
      'image/jpeg',
      quality
    );
  });
}

async function renderJpeg(loaded, scale, quality) {
  const width = Math.max(1, Math.round(loaded.width * scale));
  const height = Math.max(1, Math.round(loaded.height * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(loaded.source, 0, 0, width, height);

  return encodeCanvas(canvas, quality);
}

function looksLikeImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  // 部分手机上传 HEIC 时 type 为空，用扩展名兜底
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || '');
}

async function compressImage(file) {
  if (!looksLikeImage(file)) {
    throw new Error(`“${file.name || '所选文件'}”不是图片`);
  }

  let loaded;
  try {
    loaded = await loadImageSource(file);
  } catch {
    throw new Error('这张照片的格式浏览器无法解码，请先在相册里转成 JPG 再上传');
  }

  try {
    if (!loaded.width || !loaded.height) throw new Error('这张照片的尺寸无效');

    const longest = Math.max(loaded.width, loaded.height);
    const baseScale = Math.min(1, MAX_EDGE / longest);
    // GitHub 接口对单文件体积敏感，逐级降质降尺寸
    const attempts = [
      { scale: baseScale, quality: 0.82 },
      { scale: baseScale, quality: 0.68 },
      { scale: Math.min(baseScale, 1200 / longest), quality: 0.75 },
    ];

    for (const attempt of attempts) {
      const blob = await renderJpeg(loaded, attempt.scale, attempt.quality);
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;
    }

    throw new Error('压缩后的照片仍然太大，请换一张照片');
  } finally {
    loaded.cleanup();
  }
}

/* ---------- GitHub API ---------- */

function arrayBufferToBase64(input) {
  const bytes = new Uint8Array(input);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function textToBase64(text) {
  return arrayBufferToBase64(new TextEncoder().encode(text));
}

function base64ToText(value) {
  const binary = atob(String(value).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function ghFetch(path, { method = 'GET', body } = {}) {
  const token = getToken();
  if (!token) throw new Error('还没有填写 GitHub Token');

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 404) return null;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) throw new Error('Token 无效或已过期');
    if (res.status === 403) throw new Error('Token 没有写入权限，请检查 Contents 权限');
    if (res.status === 409 || res.status === 422) {
      throw new Error('仓库刚被其他地方更新，请稍后重试');
    }
    throw new Error(data.message || 'GitHub 接口调用失败');
  }

  return data;
}

async function readOnlineManifest() {
  const file = await ghFetch(`/contents/${UPLOAD_MANIFEST}?ref=${REPO.branch}`);
  if (!file) return [];

  try {
    const list = JSON.parse(base64ToText(file.content));
    return Array.isArray(list) ? list.filter((item) => item && item.name) : [];
  } catch {
    return [];
  }
}

// 文件名不可枚举：别人即使拿到站点地址，也猜不到其他照片的地址
function randomName() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 一次提交写入全部照片，避免每张照片触发一次 Pages 构建
async function commitBatch(entries, deletions, message) {
  const ref = await ghFetch(`/git/ref/heads/${REPO.branch}`);
  if (!ref) throw new Error('找不到仓库分支');

  const base = await ghFetch(`/git/commits/${ref.object.sha}`);
  const tree = [];

  for (const entry of entries) {
    const blob = await ghFetch('/git/blobs', {
      method: 'POST',
      body: { content: entry.base64, encoding: 'base64' },
    });
    tree.push({ path: entry.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  if (deletions.length) {
    // 只删除确实存在于当前提交里的文件，否则整个提交会失败
    const snapshot = await ghFetch(
      `/git/trees/${base.tree.sha}?recursive=1`
    );
    const existing = new Set((snapshot?.tree || []).map((node) => node.path));

    for (const path of deletions) {
      if (existing.has(path)) {
        tree.push({ path, mode: '100644', type: 'blob', sha: null });
      }
    }
  }

  const newTree = await ghFetch('/git/trees', {
    method: 'POST',
    body: { base_tree: base.tree.sha, tree },
  });

  const newCommit = await ghFetch('/git/commits', {
    method: 'POST',
    body: { message, tree: newTree.sha, parents: [ref.object.sha] },
  });

  await ghFetch(`/git/refs/heads/${REPO.branch}`, {
    method: 'PATCH',
    body: { sha: newCommit.sha, force: false },
  });
}

async function uploadBatch(files) {
  const list = await readOnlineManifest();
  const now = Date.now();
  const entries = [];
  const added = [];

  for (let i = 0; i < files.length; i += 1) {
    setStatus(`正在压缩第 ${i + 1} / ${files.length} 张照片…`);
    const blob = await compressImage(files[i]);
    const name = `${now + i}-${randomName()}.jpg`;

    entries.push({
      path: `${UPLOAD_DIR}/${name}`,
      base64: arrayBufferToBase64(await blob.arrayBuffer()),
    });
    added.push({ name, addedAt: now + i });
  }

  const next = list
    .concat(added)
    .sort((a, b) => (Number(a.addedAt) || 0) - (Number(b.addedAt) || 0));

  const keep = next.slice(-MAX_PHOTOS);
  const deletions = next
    .slice(0, Math.max(0, next.length - MAX_PHOTOS))
    .map((item) => `${UPLOAD_DIR}/${item.name}`);

  entries.push({
    path: UPLOAD_MANIFEST,
    base64: textToBase64(JSON.stringify(keep, null, 2) + '\n'),
  });

  setStatus('正在提交到 GitHub…');
  await commitBatch(
    entries,
    deletions,
    `Add ${added.length} photo${added.length > 1 ? 's' : ''}`
  );

  return added[added.length - 1].name;
}

/* ---------- 等待 Pages 发布 ---------- */

function waitForImage(url, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const started = Date.now();

    const attempt = () => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => {
        if (Date.now() - started > timeoutMs) resolve(false);
        else setTimeout(attempt, 8000);
      };
      img.src = url + '?v=' + Date.now();
    };

    attempt();
  });
}

async function waitForPublish(name) {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;

  const url = new URL(`${UPLOAD_DIR}/${encodeURIComponent(name)}`, location.href).href;
  setStatus('已提交，正在等待 GitHub Pages 发布…');

  const imageReady = await waitForImage(url);
  if (!imageReady) return false;

  // 图片先于清单发布，等清单里也出现这张照片
  const started = Date.now();
  while (Date.now() - started < 120000) {
    const list = await fetchJson(UPLOAD_MANIFEST);
    if (list.some((item) => item && item.name === name)) return true;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  return false;
}

/* ---------- 上传入口 ---------- */

async function uploadFiles(fileList) {
  if (isUploading) return;

  const files = Array.from(fileList || []).filter((f) => f && looksLikeImage(f));

  if (!files.length) {
    setStatus('请选择 JPG、PNG、WebP 等图片文件。', true);
    return;
  }

  if (!getToken()) {
    setStatus('请先在下方「上传设置」里填入 GitHub Token。', true);
    tokenPanel.open = true;
    tokenInput.focus();
    return;
  }

  isUploading = true;
  updateUploadState();

  try {
    const lastName = await uploadBatch(files);
    const published = await waitForPublish(lastName);

    if (published) {
      await loadPhotos({ quiet: true });
      setStatus(
        files.length > 1
          ? `完成，共上传 ${files.length} 张照片，最早的旧照片已自动移除。`
          : '照片上传完成，最早的旧照片已自动移除。'
      );
    } else {
      await loadPhotos({ quiet: true });
      setStatus('照片已提交，Pages 还在发布，稍后刷新页面即可看到。', true);
    }
  } catch (error) {
    setStatus(error.message || '上传失败，请稍后重试。', true);
    await loadPhotos({ quiet: true });
  } finally {
    isUploading = false;
    photoInput.value = '';
    updateUploadState();
  }
}

photoInput.addEventListener('change', () => {
  uploadFiles(photoInput.files);
});

uploadCard.addEventListener('click', (event) => {
  if (isUploading || event.target === photoInput) return;
  photoInput.click();
});

uploadCard.addEventListener('keydown', (event) => {
  if (event.target !== uploadCard) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!isUploading) photoInput.click();
  }
});

['dragenter', 'dragover'].forEach((eventName) => {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (!isUploading) uploadCard.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  uploadCard.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadCard.classList.remove('is-dragging');
  });
});

uploadCard.addEventListener('drop', (event) => {
  uploadFiles(event.dataTransfer.files);
});

/* ---------- 交互 ---------- */

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-key]');
  if (target && target.dataset.key) {
    openLightbox(target.dataset.key);
    return;
  }
  if (event.target === lightbox || event.target === lightboxImg || event.target === lightboxClose) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

// 流动区不定期换序
setInterval(() => {
  if (photos.length > 1) {
    renderMarquee(track1, shuffle(photos));
    renderMarquee(track2, shuffle(photos));
  }
}, 60000);

if (isUnlocked()) {
  unlock();
} else {
  authInput.focus();
}
