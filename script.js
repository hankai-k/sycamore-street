/* ============ Supabase 初始化 ============
   下面呢两个都係"公开安全"嘅参数，唔驶收埋：
   - SUPABASE_URL：你个项目嘅网址
   - SUPABASE_ANON_KEY：publishable key，专门畀前端用，公开都冇问题
   （千万唔好将 service_role key 摆呢度！） */
const SUPABASE_URL = 'https://awdyxnjpvnyvgxfomwra.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BaHBtaNXGQRIdVWu5ISfNg_JoE4g43n';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============ 登录用嘅固定编号→邮箱对照表 ============
   呢个表只系用嚟"登录搵返係边个账户"，同用户之后自己改嘅昵称冇关系，
   所以就算个名改咗，都仲系用返呢个编号登录。
   想加人就喺 Supabase 度建多个账户 + 喺呢度加一行。 */
const ACCOUNT_SLOTS = [
  { number: '1000', email: 'u01@shigewujie.local' },
  { number: '1001', email: 'u02@shigewujie.local' },
  { number: '1002', email: 'u03@shigewujie.local' },
  { number: '1003', email: 'u04@shigewujie.local' },
  { number: '1004', email: 'u05@shigewujie.local' },
  { number: '1005', email: 'u06@shigewujie.local' },
  { number: '1006', email: 'u07@shigewujie.local' },
  { number: '1007', email: 'u08@shigewujie.local' },
  { number: '1008', email: 'u09@shigewujie.local' },
  { number: '1009', email: 'u10@shigewujie.local' },
  { number: '1010', email: 'u11@shigewujie.local' },
  { number: '1011', email: 'u12@shigewujie.local' },
  { number: '1012', email: 'u13@shigewujie.local' },
  { number: '1013', email: 'u14@shigewujie.local' },
  { number: '1014', email: 'u15@shigewujie.local' }
];

/* ============ 状态 ============ */
let currentUserId = null;    // Supabase auth 嘅 uid
let currentEmail = null;
let currentLastSignInAt = null;
let currentMode = 'account'; // 'account' | 'guest'
let guestId = null;
let guestNickname = '';
let posts = [];
let profilesMap = {};        // id -> {id, name, emoji, color}
let searchQuery = '';
let sortMode = 'latest';     // 'latest' | 'hot' | 'comments'
let splitMode = 'both';      // 'both' | 'left-only' | 'right-only'
const openComments = new Set();

function getActiveActorId() {
  return currentMode === 'guest' ? guestId : currentUserId;
}
function findAccount(id) {
  return profilesMap[id] || null;
}

/* ============ 工具函数 ============ */
function genGuestId() { return 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('is-visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove('is-visible'), 2400);
}

function formatRelativeTime(ts) {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 日前`;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatAbsoluteTime(ts) {
  if (!ts) return '未知';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

/* 智能识别媒体链接：网易云音乐 / YouTube / 直链音视频 */
function renderMediaEmbed(post) {
  if (!post.media_type || post.media_type === 'none') return '';
  if (post.media_type === 'image' && post.media_data) {
    return `<div class="card__media"><img src="${post.media_data}" alt="图片"></div>`;
  }
  if (post.media_type === 'music') {
    const url = post.media_url || '';
    const neteaseMatch = url.match(/music\.163\.com\/.*[?#].*id=(\d+)/);
    if (neteaseMatch) {
      const songId = neteaseMatch[1];
      return `<div class="card__media"><iframe frameborder="no" marginwidth="0" marginheight="0" width="100%" height="86" src="https://music.163.com/outchain/player?type=2&id=${songId}&auto=0&height=66"></iframe></div>`;
    }
    if (/\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(url)) {
      return `<div class="card__media"><audio controls src="${escapeHtml(url)}"></audio></div>`;
    }
    if (url) {
      return `<div class="card__media"><a class="media-fallback" href="${escapeHtml(url)}" target="_blank" rel="noopener">🎵 点击在原平台播放</a></div>`;
    }
  }
  if (post.media_type === 'video') {
    const url = post.media_url || '';
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
    if (ytMatch) {
      return `<div class="card__media"><iframe width="100%" height="220" src="https://www.youtube.com/embed/${ytMatch[1]}" allowfullscreen></iframe></div>`;
    }
    if (/\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
      return `<div class="card__media"><video controls src="${escapeHtml(url)}"></video></div>`;
    }
    if (url) {
      return `<div class="card__media"><a class="media-fallback" href="${escapeHtml(url)}" target="_blank" rel="noopener">🎬 点击查看视频</a></div>`;
    }
  }
  return '';
}

/* ============ 游客标识（真·浏览器 localStorage，唔使替身喇） ============ */
function loadOrCreateGuestId() {
  let id = localStorage.getItem('sgwj_guest_id');
  if (!id) {
    id = genGuestId();
    localStorage.setItem('sgwj_guest_id', id);
  }
  return id;
}
function loadGuestNickname() { return localStorage.getItem('sgwj_guest_nickname') || ''; }
function saveGuestNickname(name) { localStorage.setItem('sgwj_guest_nickname', name); }

/* ============ 数据读取 ============ */
async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('id, display_name, emoji, color, now_playing_text, now_playing_url, now_playing_updated_at');
  if (error) { console.error(error); return; }
  profilesMap = {};
  (data || []).forEach(p => {
    profilesMap[p.id] = {
      id: p.id, name: p.display_name, emoji: p.emoji, color: p.color,
      nowPlayingText: p.now_playing_text, nowPlayingUrl: p.now_playing_url,
      nowPlayingUpdatedAt: p.now_playing_updated_at
    };
  });
}

async function loadPosts() {
  const { data, error } = await sb
    .from('posts')
    .select('*, comments(*), likes(actor_id)')
    .order('created_at', { ascending: false });
  if (error) { showToast('读取失败：' + error.message); return []; }
  return (data || []).map(p => ({
    ...p,
    likedBy: (p.likes || []).map(l => l.actor_id),
    comments: (p.comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }));
}

function commentDisplay(c) {
  if (c.actor_type === 'guest') {
    return { name: c.guest_name || '路过嘅游客', emoji: '🙂', color: '#EDEDED' };
  }
  const acc = findAccount(c.actor_id);
  return acc || { name: c.actor_id, emoji: '🎵', color: '#eee' };
}

/* ============ 而家听紧：判断状态是否仲新鲜（3日内） ============ */
function getFreshNowPlaying(acc) {
  if (!acc || !acc.nowPlayingText || !acc.nowPlayingUpdatedAt) return null;
  const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
  if (new Date(acc.nowPlayingUpdatedAt).getTime() < threeDaysAgo) return null;
  return { text: acc.nowPlayingText, url: acc.nowPlayingUrl };
}

/* ============ 渲染：个人状态弹窗（点头像） ============ */
function renderProfilePopup(accId) {
  const acc = findAccount(accId);
  if (!acc) return;
  const np = getFreshNowPlaying(acc);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card profile-popup">
      <div class="profile-popup__head">
        <span class="avatar avatar--lg" style="background:${acc.color}">${acc.emoji}</span>
        <h3>${escapeHtml(acc.name)}</h3>
      </div>
      ${np ? `
        <div class="profile-popup__np">
          <span class="np-label">🎧 而家听紧</span>
          ${np.url
            ? `<a href="${escapeHtml(np.url)}" target="_blank" rel="noopener">${escapeHtml(np.text)}</a>`
            : `<span>${escapeHtml(np.text)}</span>`}
        </div>
      ` : `<p class="profile-popup__empty">而家未设置紧听咩歌</p>`}
      <div class="modal-actions">
        <button class="btn btn--ghost" id="profilePopupClose">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('profilePopupClose').addEventListener('click', close);
}

/* ============ 渲染：登录页 ============ */
function renderLogin(errorMsg) {
  const app = document.getElementById('app');
  const options = ACCOUNT_SLOTS.map(s => `<option value="${s.email}">${escapeHtml(s.number)}</option>`).join('');
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>诗歌舞街</h1>
        <p class="sub">粤语歌分享社区 · 试用版</p>
        <div class="login-field">
          <label for="loginName">你係边位（编号）</label>
          <select id="loginName">${options}</select>
        </div>
        <div class="login-field">
          <label for="loginPwd">密码</label>
          <input type="password" id="loginPwd" placeholder="问社区管理员攞密码">
        </div>
        <p class="login-error">${errorMsg ? escapeHtml(errorMsg) : ''}</p>
        <button class="btn btn--primary" id="loginBtn">入嚟</button>
        <button type="button" class="btn btn--ghost" id="guestBtn" style="width:100%; margin-top:10px;">以游客身份睇下（可以睇/赞/留言，唔可以出帖）</button>
      </div>
    </div>
  `;
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginName').value;
    const pwd = document.getElementById('loginPwd').value;
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd });
    if (error) {
      renderLogin('密码唔啱，试多次');
      return;
    }
    currentMode = 'account';
    currentUserId = data.user.id;
    currentEmail = data.user.email;
    currentLastSignInAt = data.user.last_sign_in_at;
    await loadProfiles();
    posts = await loadPosts();
    renderApp();
  });
  document.getElementById('guestBtn').addEventListener('click', async () => {
    currentMode = 'guest';
    guestId = loadOrCreateGuestId();
    guestNickname = loadGuestNickname();
    await loadProfiles();
    posts = await loadPosts();
    renderApp();
  });
}

/* ============ 渲染：主应用 ============ */
function renderApp() {
  const app = document.getElementById('app');
  const isGuest = currentMode === 'guest';
  const acc = isGuest ? null : findAccount(currentUserId);

  const whoamiHtml = isGuest ? `
        <span>🙂</span>
        <span class="whoami__name">游客浏览中</span>
        <button class="btn btn--ghost btn--small" id="loginSwitchBtn">登录</button>
  ` : `
        <span>${acc ? acc.emoji : '🎵'}</span>
        <div class="whoami__col">
          <span class="whoami__name">${escapeHtml(acc ? acc.name : '')}</span>
          <span class="whoami__lastlogin">上次登录：${formatAbsoluteTime(currentLastSignInAt)}</span>
        </div>
        <button class="btn btn--ghost btn--small" id="npBtn">🎧 而家听紧</button>
        <button class="btn btn--ghost btn--small" id="accountBtn">⚙️ 账号</button>
        <button class="btn btn--ghost btn--small" id="logoutBtn">登出</button>
  `;

  const composerHtml = isGuest ? '' : `
      <section class="composer">
        <h2>出个帖，分享下</h2>
        <div class="field">
          <label for="postText">讲两句</label>
          <textarea id="postText" rows="3" placeholder="呢句歌词/呢段旋律/呢张相……" maxlength="500"></textarea>
        </div>
        <div class="media-tabs">
          <button type="button" class="media-tab is-active" data-type="none">纯文字</button>
          <button type="button" class="media-tab" data-type="image">图片</button>
          <button type="button" class="media-tab" data-type="music">音乐</button>
          <button type="button" class="media-tab" data-type="video">视频</button>
        </div>
        <div class="media-input" data-panel="image">
          <div class="field">
            <label for="imageFile">上传图片（自动压缩）</label>
            <input type="file" id="imageFile" accept="image/*">
            <img id="imagePreview" class="file-preview" style="display:none;">
          </div>
        </div>
        <div class="media-input" data-panel="music">
          <div class="field">
            <label for="musicUrl">音乐链接（支持网易云分享链接 / mp3直链）</label>
            <input type="url" id="musicUrl" placeholder="https://music.163.com/... 或 https://.../song.mp3">
          </div>
        </div>
        <div class="media-input" data-panel="video">
          <div class="field">
            <label for="videoUrl">视频链接（支持 YouTube / mp4直链）</label>
            <input type="url" id="videoUrl" placeholder="https://youtube.com/watch?v=... 或 https://.../clip.mp4">
          </div>
        </div>
        <div class="composer__footer">
          <span class="composer__hint" id="composerHint"></span>
          <button class="btn btn--primary" id="submitPost" style="width:auto;">出帖</button>
        </div>
      </section>
  `;

  const rightPanelHtml = isGuest ? `
      <p class="empty" style="padding:30px 0;">游客身份冇发帖记录</p>
  ` : `
      ${composerHtml}
      <h2 class="own-posts__title">📝 我发过嘅帖</h2>
      <div class="feed" id="ownPostsList"></div>
  `;

  app.innerHTML = `
    <header class="topbar">
      <div>
        <span class="brand__mark">诗歌舞街</span>
        <span class="brand__sub">粤语歌分享社区 · 试用版</span>
      </div>
      <div class="whoami">${whoamiHtml}</div>
    </header>
    <main class="stage-split">
      <div class="split-layout" id="splitLayout">
        <div class="split-left" id="splitLeft">
          <section class="recommend" id="recommendSection" hidden></section>
          <section class="toolbar">
            <input type="search" id="searchInput" class="search" placeholder="搵歌名、内容，或者边位讲过嘅…">
            <div class="sort-tabs" id="sortTabs">
              <button type="button" class="sort-tab is-active" data-sort="latest">最新</button>
              <button type="button" class="sort-tab" data-sort="hot">最热</button>
              <button type="button" class="sort-tab" data-sort="comments">最多回复</button>
            </div>
          </section>
          <section class="feed" id="feed"></section>
          <p class="empty" id="emptyState" hidden></p>
        </div>
        <div class="split-divider" id="splitDivider"></div>
        <div class="split-right" id="splitRight">${rightPanelHtml}</div>
      </div>
    </main>
  `;

  if (isGuest) {
    document.getElementById('loginSwitchBtn').addEventListener('click', () => {
      currentMode = 'account';
      renderLogin();
    });
  } else {
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await sb.auth.signOut();
      currentUserId = null;
      currentEmail = null;
      renderLogin();
    });

    document.getElementById('accountBtn').addEventListener('click', () => {
      renderAccountModal();
    });

    document.getElementById('npBtn').addEventListener('click', () => {
      renderNowPlayingModal();
    });

    let activeMediaType = 'none';
    let pendingImageData = '';
    const tabs = app.querySelectorAll('.media-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        activeMediaType = tab.dataset.type;
        app.querySelectorAll('.media-input').forEach(panel => {
          panel.classList.toggle('is-active', panel.dataset.panel === activeMediaType);
        });
      });
    });

    const imageFile = document.getElementById('imageFile');
    const imagePreview = document.getElementById('imagePreview');
    imageFile.addEventListener('change', () => {
      const file = imageFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1000;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          pendingImageData = canvas.toDataURL('image/jpeg', 0.72);
          imagePreview.src = pendingImageData;
          imagePreview.style.display = 'block';
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('submitPost').addEventListener('click', async () => {
      const text = document.getElementById('postText').value.trim();
      if (!text) { showToast('讲两句先啦'); return; }

      const payload = {
        author_id: currentUserId, text,
        media_type: activeMediaType, media_url: '', media_data: ''
      };
      if (activeMediaType === 'image') {
        if (!pendingImageData) { showToast('拣张图先啦'); return; }
        payload.media_data = pendingImageData;
      } else if (activeMediaType === 'music') {
        payload.media_url = document.getElementById('musicUrl').value.trim();
        if (!payload.media_url) { showToast('贴条音乐链接先啦'); return; }
      } else if (activeMediaType === 'video') {
        payload.media_url = document.getElementById('videoUrl').value.trim();
        if (!payload.media_url) { showToast('贴条视频链接先啦'); return; }
      }

      const hint = document.getElementById('composerHint');
      hint.textContent = '出紧帖……';
      const { error } = await sb.from('posts').insert(payload);
      hint.textContent = '';
      if (error) { showToast('出帖失败：' + error.message); return; }

      showToast('出咗帖喇！');
      document.getElementById('postText').value = '';
      pendingImageData = '';
      imagePreview.style.display = 'none';
      imageFile.value = '';
      document.getElementById('musicUrl').value = '';
      document.getElementById('videoUrl').value = '';
      tabs.forEach(t => t.classList.remove('is-active'));
      tabs[0].classList.add('is-active');
      activeMediaType = 'none';
      app.querySelectorAll('.media-input').forEach(p => p.classList.remove('is-active'));

      posts = await loadPosts();
      renderFeed();
    });
  }

  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderFeed();
  });
  document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      sortMode = tab.dataset.sort;
      renderFeed();
    });
  });

  renderFeed();
  applySplitMode();
}

/* ============ 渲染：账号设置弹窗（改昵称 / 改密码 子菜单） ============ */
function renderAccountModal() {
  const acc = findAccount(currentUserId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>账号设置</h3>
      <div class="account-tabs">
        <button type="button" class="account-tab is-active" data-tab="name">📝 改昵称</button>
        <button type="button" class="account-tab" data-tab="password">🔒 改密码</button>
      </div>
      <div class="account-tab-panel" data-panel="name">
        <div class="field">
          <label for="loginNameInput">昵称（其他人会睇到呢个名）</label>
          <input type="text" id="loginNameInput" value="${escapeHtml(acc ? acc.name : '')}" maxlength="20">
        </div>
      </div>
      <div class="account-tab-panel" data-panel="password" hidden>
        <div class="field">
          <label for="curPwdInput">当前密码</label>
          <input type="password" id="curPwdInput" placeholder="要改密码先至要填">
        </div>
        <div class="field">
          <label for="newPwdInput">新密码</label>
          <input type="password" id="newPwdInput" placeholder="唔改密码就留空">
        </div>
        <div class="field">
          <label for="confirmPwdInput">确认新密码</label>
          <input type="password" id="confirmPwdInput">
        </div>
      </div>
      <p class="modal-error" id="accountModalError"></p>
      <div class="modal-actions">
        <button class="btn btn--ghost" id="accountCancelBtn">取消</button>
        <button class="btn btn--primary" id="accountSaveBtn" style="width:auto;">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('accountCancelBtn').addEventListener('click', close);

  overlay.querySelectorAll('.account-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlay.querySelectorAll('.account-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      overlay.querySelectorAll('.account-tab-panel').forEach(panel => {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      });
    });
  });

  document.getElementById('accountSaveBtn').addEventListener('click', async () => {
    const errEl = document.getElementById('accountModalError');
    const saveBtn = document.getElementById('accountSaveBtn');
    const newName = document.getElementById('loginNameInput').value.trim();
    const curPwd = document.getElementById('curPwdInput').value;
    const newPwd = document.getElementById('newPwdInput').value;
    const confirmPwd = document.getElementById('confirmPwdInput').value;

    if (!newName) { errEl.textContent = '昵称唔可以留空'; return; }

    saveBtn.disabled = true;

    const { data: allProfiles } = await sb.from('profiles').select('id, display_name');
    const nameTaken = (allProfiles || []).some(p => p.id !== currentUserId && p.display_name === newName);
    if (nameTaken) { errEl.textContent = '呢个名已经有人用紧，换过第二个'; saveBtn.disabled = false; return; }

    const wantsPwdChange = curPwd || newPwd || confirmPwd;
    if (wantsPwdChange) {
      if (!newPwd || newPwd.length < 6) { errEl.textContent = '新密码至少要6位'; saveBtn.disabled = false; return; }
      if (newPwd !== confirmPwd) { errEl.textContent = '两次新密码对唔上'; saveBtn.disabled = false; return; }
      const { error: verifyErr } = await sb.auth.signInWithPassword({ email: currentEmail, password: curPwd });
      if (verifyErr) { errEl.textContent = '当前密码唔啱'; saveBtn.disabled = false; return; }
      const { error: pwdErr } = await sb.auth.updateUser({ password: newPwd });
      if (pwdErr) { errEl.textContent = '密码更新失败：' + pwdErr.message; saveBtn.disabled = false; return; }
    }

    const { error: nameErr } = await sb.from('profiles').update({ display_name: newName }).eq('id', currentUserId);
    if (nameErr) { errEl.textContent = '昵称更新失败：' + nameErr.message; saveBtn.disabled = false; return; }

    await loadProfiles();
    close();
    showToast('已经更新咗');
    renderApp();
  });
}

/* ============ 渲染：而家听紧弹窗（独立于账号设置） ============ */
function renderNowPlayingModal() {
  const acc = findAccount(currentUserId);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-card">
      <h3>🎧 而家听紧</h3>
      <div class="field">
        <label for="npTextInput">而家听紧咩歌（唔填就唔显示）</label>
        <input type="text" id="npTextInput" value="${escapeHtml(acc && acc.nowPlayingText ? acc.nowPlayingText : '')}" maxlength="60" placeholder="例如：喜欢你 - Beyond">
      </div>
      <div class="field">
        <label for="npUrlInput">链接（可选，畀人一齐听）</label>
        <input type="url" id="npUrlInput" value="${escapeHtml(acc && acc.nowPlayingUrl ? acc.nowPlayingUrl : '')}" placeholder="https://open.spotify.com/track/... 或其他分享链接">
      </div>
      <p class="modal-error" id="npModalError"></p>
      <div class="modal-actions">
        <button class="btn btn--ghost" id="npCancelBtn">取消</button>
        <button class="btn btn--primary" id="npSaveBtn" style="width:auto;">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.getElementById('npCancelBtn').addEventListener('click', close);

  document.getElementById('npSaveBtn').addEventListener('click', async () => {
    const errEl = document.getElementById('npModalError');
    const npText = document.getElementById('npTextInput').value.trim();
    const npUrl = document.getElementById('npUrlInput').value.trim();

    const { error } = await sb.from('profiles').update({
      now_playing_text: npText || null,
      now_playing_url: npText ? (npUrl || null) : null,
      now_playing_updated_at: npText ? new Date().toISOString() : null
    }).eq('id', currentUserId);
    if (error) { errEl.textContent = '更新失败：' + error.message; return; }

    await loadProfiles();
    close();
    showToast('已经更新咗');
    renderFeed();
  });
}

/* ============ 左右分栏：折叠/展开 ============ */
function applySplitMode() {
  const layout = document.getElementById('splitLayout');
  const left = document.getElementById('splitLeft');
  const right = document.getElementById('splitRight');
  const divider = document.getElementById('splitDivider');
  if (!layout || !left || !right || !divider) return;

  layout.classList.remove('mode-left-only', 'mode-right-only');
  left.classList.toggle('is-hidden', splitMode === 'right-only');
  right.classList.toggle('is-hidden', splitMode === 'left-only');

  if (splitMode === 'left-only') {
    layout.classList.add('mode-left-only');
    divider.innerHTML = `<button type="button" class="divider-btn" data-action="show-both" title="显示返两边">▶</button>`;
  } else if (splitMode === 'right-only') {
    layout.classList.add('mode-right-only');
    divider.innerHTML = `<button type="button" class="divider-btn" data-action="show-both" title="显示返两边">◀</button>`;
  } else {
    divider.innerHTML = `
      <button type="button" class="divider-btn" data-action="show-left-only" title="净係睇左边">◀</button>
      <button type="button" class="divider-btn" data-action="show-right-only" title="净係睇右边">▶</button>
    `;
  }

  divider.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'show-left-only') splitMode = 'left-only';
      else if (action === 'show-right-only') splitMode = 'right-only';
      else splitMode = 'both';
      applySplitMode();
    });
  });
}

/* ============ 右边栏：我发过嘅帖 ============ */
function renderOwnPosts() {
  const el = document.getElementById('ownPostsList');
  if (!el) return;
  const own = posts
    .filter(p => p.author_id === currentUserId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  el.innerHTML = own.length
    ? own.map(p => buildCardHtml(p)).join('')
    : `<p class="empty" style="padding:20px 0;">你仲未发过帖</p>`;
}

/* ============ 推荐 / 搜索 / 排序 ============ */
function computeRecommended() {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  return posts
    .filter(p => new Date(p.created_at).getTime() >= weekAgo)
    .map(p => ({ p, score: p.likedBy.length * 2 + p.comments.length }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.p.created_at) - new Date(a.p.created_at))
    .slice(0, 3)
    .map(x => x.p);
}

function getFilteredSortedPosts() {
  const q = searchQuery.trim().toLowerCase();
  let list = [...posts];
  if (q) {
    list = list.filter(p => {
      const acc = findAccount(p.author_id);
      const name = acc ? acc.name.toLowerCase() : '';
      return p.text.toLowerCase().includes(q) || name.includes(q);
    });
  }
  if (sortMode === 'hot') {
    list.sort((a, b) => b.likedBy.length - a.likedBy.length || new Date(b.created_at) - new Date(a.created_at));
  } else if (sortMode === 'comments') {
    list.sort((a, b) => b.comments.length - a.comments.length || new Date(b.created_at) - new Date(a.created_at));
  } else {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  return list;
}

function renderFeed() {
  const feedEl = document.getElementById('feed');
  const emptyState = document.getElementById('emptyState');
  const recommendEl = document.getElementById('recommendSection');
  if (!feedEl) return;

  const recommended = computeRecommended();
  if (recommended.length) {
    recommendEl.hidden = false;
    recommendEl.innerHTML = `<h2 class="recommend__title">🔥 推荐</h2><div class="recommend__list">${recommended.map(p => buildCardHtml(p, true)).join('')}</div>`;
  } else {
    recommendEl.hidden = true;
    recommendEl.innerHTML = '';
  }

  const list = getFilteredSortedPosts();
  emptyState.hidden = list.length !== 0;
  if (list.length === 0) {
    emptyState.textContent = posts.length ? '搵唔到相关嘅内容，试下第啲关键字。' : '呢度仲静静哋，做第一个分享嘅人啦。';
  }
  feedEl.innerHTML = list.map(post => buildCardHtml(post)).join('');
  if (currentMode === 'account') renderOwnPosts();
  attachCardHandlers();
}

function buildCardHtml(post, highlight) {
  const acc = findAccount(post.author_id) || { emoji: '🎵', color: '#eee', name: post.author_id };
  const liked = post.likedBy.includes(getActiveActorId());
  const np = getFreshNowPlaying(acc);
  const isOwnPost = currentMode === 'account' && post.author_id === currentUserId;
  const commentsHtml = post.comments
    .map(c => {
      const cd = commentDisplay(c);
      const isOwnComment = (c.actor_type === 'account' && currentMode === 'account' && c.actor_id === currentUserId)
        || (c.actor_type === 'guest' && currentMode === 'guest' && c.actor_id === guestId);
      return `<li class="comment" data-comment-id="${c.id}">
        <span class="comment__author">${escapeHtml(cd.name)}：</span><span>${escapeHtml(c.text)}</span>
        <span class="comment__time">${formatRelativeTime(c.created_at)}</span>
        ${isOwnComment ? `<button type="button" class="comment__delete" data-action="delete-comment" data-comment-id="${c.id}" title="删除留言">✕</button>` : ''}
      </li>`;
    })
    .join('');
  const isOpen = openComments.has(post.id);
  const nicknameField = currentMode === 'guest'
    ? `<input type="text" class="comments__nickname" placeholder="你嘅称呼" maxlength="20" value="${escapeHtml(guestNickname)}">`
    : '';
  return `
    <article class="card" data-id="${post.id}">
      ${highlight ? '<span class="hot-badge">🔥 热门</span>' : ''}
      <header class="card__head">
        <span class="avatar" style="background:${acc.color}" data-action="view-profile" data-account="${acc.id || ''}">${acc.emoji}</span>
        <div class="card__who">
          <span class="card__author" data-action="view-profile" data-account="${acc.id || ''}">${escapeHtml(acc.name)}</span>
          <span class="card__time">${formatRelativeTime(post.created_at)}</span>
          ${np ? (np.url
            ? `<a class="card__np" href="${escapeHtml(np.url)}" target="_blank" rel="noopener">🎧 ${escapeHtml(np.text)}</a>`
            : `<span class="card__np">🎧 ${escapeHtml(np.text)}</span>`) : ''}
        </div>
        ${isOwnPost ? `<button type="button" class="post-delete" data-action="delete-post" title="删除帖">🗑️</button>` : ''}
      </header>
      <p class="card__text">${escapeHtml(post.text)}</p>
      ${renderMediaEmbed(post)}
      <div class="card__actions">
        <button type="button" class="like-btn ${liked ? 'is-liked' : ''}" data-action="like">
          ${liked ? '❤️' : '🤍'} <span>${post.likedBy.length}</span>
        </button>
        <button type="button" class="comment-toggle" data-action="toggle-comments">留言 (${post.comments.length})</button>
      </div>
      <div class="comments ${isOpen ? 'is-open' : ''}">
        <ul class="comments__list">${commentsHtml}</ul>
        <form class="comments__form" data-action="comment-form">
          ${nicknameField}
          <input type="text" class="comments__input" placeholder="讲两句…" maxlength="200" required>
          <button type="submit" class="btn btn--ghost">回应</button>
        </form>
      </div>
    </article>
  `;
}

function attachCardHandlers() {
  document.querySelectorAll('.card').forEach(card => {
    const postId = card.dataset.id;
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    card.querySelectorAll('[data-action="view-profile"]').forEach(el => {
      const accId = el.dataset.account;
      if (!accId) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => renderProfilePopup(accId));
    });

    const deletePostBtn = card.querySelector('[data-action="delete-post"]');
    if (deletePostBtn) {
      deletePostBtn.addEventListener('click', async () => {
        if (!confirm('确定要删除呢个帖吗？删咗就冇得返转头。')) return;
        const { error } = await sb.from('posts').delete().eq('id', post.id);
        if (error) { showToast('删除失败：' + error.message); return; }
        posts = await loadPosts();
        renderFeed();
      });
    }

    card.querySelectorAll('[data-action="delete-comment"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定要删除呢条留言？')) return;
        const commentId = btn.dataset.commentId;
        const { error } = await sb.from('comments').delete().eq('id', commentId);
        if (error) { showToast('删除失败：' + error.message); return; }
        posts = await loadPosts();
        renderFeed();
      });
    });

    card.querySelector('[data-action="like"]').addEventListener('click', async () => {
      const actorId = getActiveActorId();
      const liked = post.likedBy.includes(actorId);
      if (liked) {
        await sb.from('likes').delete().eq('post_id', post.id).eq('actor_id', actorId);
      } else {
        await sb.from('likes').insert({ post_id: post.id, actor_id: actorId });
      }
      posts = await loadPosts();
      renderFeed();
    });

    card.querySelector('[data-action="toggle-comments"]').addEventListener('click', () => {
      if (openComments.has(postId)) openComments.delete(postId);
      else openComments.add(postId);
      renderFeed();
    });

    card.querySelector('[data-action="comment-form"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = card.querySelector('.comments__input');
      const text = input.value.trim();
      if (!text) return;

      let payload;
      if (currentMode === 'guest') {
        const nickInput = card.querySelector('.comments__nickname');
        const nick = (nickInput ? nickInput.value.trim() : '') || '路过嘅游客';
        guestNickname = nick;
        saveGuestNickname(nick);
        payload = { post_id: post.id, actor_type: 'guest', actor_id: guestId, guest_name: nick, text };
      } else {
        payload = { post_id: post.id, actor_type: 'account', actor_id: currentUserId, guest_name: null, text };
      }

      const { error } = await sb.from('comments').insert(payload);
      if (error) { showToast('留言失败：' + error.message); return; }
      openComments.add(postId);
      posts = await loadPosts();
      renderFeed();
    });
  });
}

/* ============ 启动 ============ */
(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentMode = 'account';
    currentUserId = session.user.id;
    currentEmail = session.user.email;
    currentLastSignInAt = session.user.last_sign_in_at;
    await loadProfiles();
    posts = await loadPosts();
    renderApp();
  } else {
    renderLogin();
  }
})();
