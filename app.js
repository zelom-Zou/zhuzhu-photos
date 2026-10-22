const galleryEl = document.getElementById('gallery');
const track1 = document.getElementById('track-1');
const track2 = document.getElementById('track-2');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxClose = document.getElementById('lightbox-close');

let photos = [];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 相对路径，兼容 GitHub Pages 的 /仓库名/ 子路径；线上加载压缩版，原图留在 photos/
function photoUrl(name) {
  return 'photos-web/' + encodeURIComponent(name);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
      <figure class="flow-item" data-name="${escapeHtml(p.name)}">
        <img src="${photoUrl(p.name)}" alt="${escapeHtml(p.name)}" loading="lazy" draggable="false">
      </figure>`
    )
    .join('');
}

function renderGallery() {
  if (!photos.length) {
    galleryEl.innerHTML = '<p class="empty-hint">还没有照片。把图片放进 photos/ 目录，并在 photos.json 里登记文件名。</p>';
    return;
  }
  // 每次进入随机排序，展示不定期更换
  const list = shuffle(photos);
  galleryEl.innerHTML = list
    .map((p) => {
      const caption = p.date ? `<figcaption>${escapeHtml(p.date)}</figcaption>` : '';
      return `
      <figure class="photo-card" data-name="${escapeHtml(p.name)}">
        <div class="photo-frame">
          <img src="${photoUrl(p.name)}" alt="${escapeHtml(p.name)}" loading="lazy" draggable="false">
        </div>
        ${caption}
      </figure>`;
    })
    .join('');
}

function renderAll() {
  renderMarquee(track1, shuffle(photos));
  renderMarquee(track2, shuffle(photos));
  renderGallery();
}

async function loadPhotos() {
  try {
    const res = await fetch('photos.json', { cache: 'no-cache' });
    const data = await res.json();
    photos = Array.isArray(data) ? data.filter((p) => p && p.name) : [];
    renderAll();
  } catch {
    galleryEl.innerHTML = '<p class="empty-hint">photos.json 读取失败，请检查文件格式。</p>';
  }
}

function openLightbox(name) {
  lightboxImg.src = photoUrl(name);
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = '';
  document.body.style.overflow = '';
}

document.addEventListener('click', (e) => {
  const fig = e.target.closest('[data-name]');
  if (fig && fig.dataset.name) {
    openLightbox(fig.dataset.name);
    return;
  }
  if (e.target === lightbox || e.target === lightboxImg || e.target === lightboxClose) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

// 流动区不定期换序
setInterval(() => {
  if (photos.length > 1) {
    renderMarquee(track1, shuffle(photos));
    renderMarquee(track2, shuffle(photos));
  }
}, 60000);

loadPhotos();
