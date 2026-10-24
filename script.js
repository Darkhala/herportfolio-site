/* =========================================================
   CONFIG ~ edit this part if needed
   ========================================================= */
const CONFIG = {
  // Poses used by the HERO head animation. c_smile is the centre/standby pose (plain "c" is not used in the hero).
  POSES: ['c_smile', 'up', 'down', 'l15', 'l30', 'l45', 'r15', 'r30', 'r45'],

  // Folders to look in, in order. images/web is made by optimize_images.py
  // Falls back to the originals in images/ if images/web doesn't exist yet.
  DIRS: ['images/web', 'images'],
  EXTS: ['webp', 'png', 'jpg', 'jpeg'],

  // Set true if the head turns the WRONG way (looks left when cursor is right)
  FLIP: false,

  SMOOTHING: 0.14,   // 0.05 slow ... 0.3 snappy
  TILT_Y: 5,         // extra 3D tilt (degrees) between frames
  TILT_X: 4,
  VERTICAL_ZONE: 0.4, // how far up/down the cursor must be to show the up/down poses
  IDLE_AFTER: 1500,  // ms of no cursor movement before she returns to standing still (c)


};

/* ========================================================= */

const CENTER = 'c_smile';   // standby / straight-ahead pose in the hero
const stack = document.getElementById('headStack');
const headWrap = document.getElementById('head');

/* ---- loading ---- */
function loadPose(name) {
  const candidates = [];
  CONFIG.DIRS.forEach((d) => CONFIG.EXTS.forEach((e) => candidates.push(`${d}/${name}.${e}`)));
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (i >= candidates.length) return resolve(null);
      const img = new Image();
      img.decoding = 'async';
      img.alt = '';
      img.draggable = false;
      img.onload = () => { console.info('loaded', img.src); resolve({ name, img }); };
      img.onerror = next;
      img.src = candidates[i++];
    };
    next();
  });
}

const turnAngle = (name) => {
  const m = /^([lr])(\d+)$/.exec(name);
  return m ? (m[1] === 'l' ? -1 : 1) * +m[2] : null;
};

(async function init() {
  const store = {};              // name -> pose
  const turns = [];              // sorted horizontal poses (incl. c = 0)
  let active = null;
  let ready = false;

  const show = (pose) => {
    if (!pose || active === pose) return;
    if (active) active.img.classList.remove('on');
    pose.img.classList.add('on');
    active = pose;
  };

  const register = (res) => {
    if (!res) return;
    store[res.name] = res;
    stack.appendChild(res.img);
    const a = res.name === CENTER ? 0 : turnAngle(res.name);
    if (a !== null) {
      res.angle = a;
      turns.push(res);
      turns.sort((x, y) => x.angle - y.angle);
    }
  };

  // 1) load the centre first so the hero appears immediately
  register(await loadPose(CENTER));
  if (!store[CENTER]) {
    stack.innerHTML = '<p style="position:absolute;inset:auto 0 40%;text-align:center;font-size:.9rem;opacity:.7">No images found.<br>Check that the images folder sits next to index.html</p>';
    return;
  }
  show(store[CENTER]);
  ready = true;

  // 2) load everything else in the background
  CONFIG.POSES.filter((n) => n !== CENTER).forEach((n) => loadPose(n).then(register));

  /* ---- helpers ---- */
  const nearestTurn = (a) => turns.reduce((b, p) => (Math.abs(p.angle - a) < Math.abs(b.angle - a) ? p : b), turns[0]);
  /* ---- pointer tracking ---- */
  let tx = 0, ty = 0, cx = 0, cy = 0;
  let lastMove = performance.now();
  let hasPointer = false;

  const onMove = (x, y) => {
    const r = headWrap.getBoundingClientRect();
    const hx = r.left + r.width / 2;
    const hy = r.top + r.height / 3;
    const dx = x - hx, dy = y - hy;
    const rangeX = dx >= 0 ? innerWidth - hx : hx;
    const rangeY = dy >= 0 ? innerHeight - hy : hy;
    tx = Math.max(-1, Math.min(1, dx / (rangeX * 0.85 || 1)));
    ty = Math.max(-1, Math.min(1, dy / (rangeY || 1)));
    lastMove = performance.now();
    hasPointer = true;
  };
  addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  const onTouch = (e) => e.touches[0] && onMove(e.touches[0].clientX, e.touches[0].clientY);
  addEventListener('touchstart', onTouch, { passive: true });
  addEventListener('touchmove', onTouch, { passive: true });

  /* ---- phones: optional tilt control (gyroscope) ---- */
  if (matchMedia('(pointer: coarse)').matches && 'DeviceOrientationEvent' in window) {
    const onTilt = (e) => {
      if (e.gamma == null || e.beta == null) return;
      const x = Math.max(-1, Math.min(1, e.gamma / 28));        // tilt left / right
      const y = Math.max(-1, Math.min(1, (e.beta - 50) / 30));  // tilt toward / away (50deg = holding naturally)
      if (Math.abs(x) > 0.15 || Math.abs(y) > 0.35) {           // dead zone so small hand shake is ignored
        tx = x; ty = y; lastMove = performance.now(); hasPointer = true;
      }
    };
    const btn = document.createElement('button');
    btn.className = 'tilt-btn';
    btn.textContent = 'Tilt your phone to look around ✦';
    document.querySelector('.hint')?.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', async () => {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {   // iPhone / iPad
          if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return;
        }
        addEventListener('deviceorientation', onTilt);
        btn.remove();
      } catch (err) { btn.remove(); }
    });
  }
  document.addEventListener('mouseleave', () => { tx = 0; ty = 0; });

  let current = store[CENTER];

  /* ---- main loop ---- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reach = () => Math.max(Math.abs(turns[0].angle), Math.abs(turns[turns.length - 1].angle)) || 1;

  let wasFollowing = false;

  function frame(t) {
    const following = hasPointer && t - lastMove < CONFIG.IDLE_AFTER && !reduce;
    if (!following) { tx = 0; ty = 0; }          // ease back to the centre
    wasFollowing = following;

    cx += (tx - cx) * CONFIG.SMOOTHING;
    cy += (ty - cy) * CONFIG.SMOOTHING;

    const dir = CONFIG.FLIP ? -1 : 1;
    current = nearestTurn(cx * reach() * dir);

    let pose = current;
    if (following) {
      // looking mostly straight up/down -> use the up / down poses
      if (Math.abs(cx) < 0.3 && Math.abs(cy) > CONFIG.VERTICAL_ZONE) {
        pose = (cy < 0 ? store.up : store.down) || current;
      }
    } else {
      pose = store[CENTER];   // cursor still: she just stands there smiling
    }
    show(pose);

    stack.style.transform =
      `rotateY(${cx * CONFIG.TILT_Y}deg) rotateX(${-cy * CONFIG.TILT_X}deg) translate3d(${cx * 6}px, ${cy * 4}px, 0)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ---------- scroll reveal + counters + misc ---------- */
document.getElementById('year').textContent = new Date().getFullYear();

document.querySelectorAll('.section > *, .log li').forEach((el) => el.classList.add('reveal'));
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    e.target.querySelectorAll?.('[data-count]').forEach(countUp);
    io.unobserve(e.target);
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

function countUp(el) {
  const end = +el.dataset.count; let n = 0;
  const step = () => { n += Math.max(1, end / 30); el.textContent = Math.min(end, Math.round(n)); if (n < end) requestAnimationFrame(step); };
  step();
}


/* ---------- extra faces around the site ---------- */
const faceImg = (name) => loadPose(name).then((r) => r && r.img.cloneNode());

// containers with data-poses="a,b": show a, swap to b on hover
document.querySelectorAll('.swap[data-poses]').forEach(async (el) => {
  const imgs = await Promise.all(el.dataset.poses.split(',').map(faceImg));
  imgs.filter(Boolean).forEach((i) => el.appendChild(i));
});

// contact: she winks when you hover the button
const ctaBtn = document.querySelector('.contact .btn');
const ctaFace = document.querySelector('.contact-face');
if (ctaBtn && ctaFace) {
  ctaBtn.addEventListener('mouseenter', () => ctaFace.classList.add('alt'));
  ctaBtn.addEventListener('mouseleave', () => ctaFace.classList.remove('alt'));
}

// work: a little reaction bubble follows the cursor over the project log
const logList = document.querySelector('.log');
if (logList && matchMedia('(hover: hover)').matches) {
  const bubble = document.createElement('div');
  bubble.className = 'reaction face';
  document.body.appendChild(bubble);
  const names = ['l30_smile', 'r30_smile', 'c_wink', 'c_smile'];
  const els = {};
  names.forEach((n) => faceImg(n).then((i) => { if (i) { els[n] = i; bubble.appendChild(i); } }));
  logList.querySelectorAll('li').forEach((li, idx) => {
    li.addEventListener('mouseenter', () => {
      Object.values(els).forEach((i) => i.classList.remove('on'));
      els[names[idx % names.length]]?.classList.add('on');
      bubble.classList.add('show');
    });
    li.addEventListener('mouseleave', () => bubble.classList.remove('show'));
  });
  logList.addEventListener('pointermove', (e) => {
    bubble.style.transform = `translate(${e.clientX + 20}px, ${e.clientY - 70}px)`;
  });
}


/* ---------- touch screens ---------- */
if (matchMedia('(hover: none)').matches) {
  const hint = document.querySelector('.hint-text');
  if (hint) hint.textContent = 'Touch and drag to say hi';
  // no hover on phones, so tapping flips a face to its second expression
  document.querySelectorAll('.swap').forEach((el) => el.addEventListener('click', () => el.classList.toggle('alt')));
}