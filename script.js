const fileInput = document.getElementById('fileInput');
const openImageBtn = document.getElementById('openImageBtn');
const emptyOpenBtn = document.getElementById('emptyOpenBtn');
const emptyStartCamBtn = document.getElementById('emptyStartCamBtn');
const cameraVideo = document.getElementById('cameraVideo');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const screenStage = document.getElementById('screenStage');

const recToggle = document.getElementById('recToggle');
const flipCamBtn = document.getElementById('flipCamBtn');
const shutterBtn = document.getElementById('shutterBtn');
const modeBtn = document.getElementById('modeBtn');
const filterTabBtn = document.getElementById('filterTabBtn');
const toneTabBtn = document.getElementById('toneTabBtn');
const galleryTabBtn = document.getElementById('galleryTabBtn');

const drawer = document.getElementById('drawer');
const drawerPeekBtn = document.getElementById('drawerPeekBtn');
const drawerCloseBtn = document.getElementById('drawerCloseBtn');
const drawerTabs = [...document.querySelectorAll('.drawer-tab')];
const drawerPanels = [...document.querySelectorAll('.drawer-panel')];
const presetPills = [...document.querySelectorAll('.preset-pill')];

const emptyState = document.getElementById('emptyState');
const emptyTitle = document.getElementById('emptyTitle');
const emptyText = document.getElementById('emptyText');

const reviewOverlay = document.getElementById('reviewOverlay');
const retakeBtn = document.getElementById('retakeBtn');
const saveGalleryBtn = document.getElementById('saveGalleryBtn');
const saveDeviceBtn = document.getElementById('saveDeviceBtn');

const statusLed = document.getElementById('statusLed');
const statusText = document.getElementById('statusText');

const hudMode = document.getElementById('hudMode');
const hudPreset = document.getElementById('hudPreset');
const hudPixel = document.getElementById('hudPixel');
const hudColors = document.getElementById('hudColors');

const pixelRange = document.getElementById('pixelRange');
const colorsRange = document.getElementById('colorsRange');
const ditherRange = document.getElementById('ditherRange');
const contrastRange = document.getElementById('contrastRange');
const saturationRange = document.getElementById('saturationRange');
const scanlineBtn = document.getElementById('scanlineBtn');
const resetBtn = document.getElementById('resetBtn');

const pixelValue = document.getElementById('pixelValue');
const colorsValue = document.getElementById('colorsValue');
const ditherValue = document.getElementById('ditherValue');
const contrastValue = document.getElementById('contrastValue');
const saturationValue = document.getElementById('saturationValue');

const galleryGrid = document.getElementById('galleryGrid');
const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');
const clearGalleryBtn = document.getElementById('clearGalleryBtn');

const colorSteps = [2,4,8,16,32];

const state = {
  mode: 'lab',
  preset: 'custom',
  tint: null,
  loadedImage: null,
  originalName: 'pixel-lomolab',
  activeTab: 'filter',
  drawerOpen: false,
  controls: {
    pixel: 8,
    colorsIndex: 2,
    dither: 35,
    contrast: 10,
    saturation: 8,
    scanlines: true,
  },
  cameraStream: null,
  facingMode: 'environment',
  liveRunning: false,
  liveRAF: null,
  lastRenderAt: 0,
  recorder: null,
  recordedChunks: [],
  recording: false,
  reviewDataUrl: null,
  reviewOrigin: 'cam',
};

const presets = {
  custom: { label: 'CUSTOM', tint: null },
  raw:    { label: 'RAW',   pixel: 7, colors: 16, dither: 0,  contrast: 8,  saturation: 4,  tint: null },
  mono:   { label: 'MONO',  pixel: 8, colors: 4,  dither: 55, contrast: 18, saturation: -50, tint: 'mono' },
  acid:   { label: 'ACID',  pixel: 9, colors: 4,  dither: 42, contrast: 24, saturation: 32, tint: 'acid' },
  warm:   { label: 'WARM',  pixel: 7, colors: 8,  dither: 30, contrast: 16, saturation: 18, tint: 'warm' },
  night:  { label: 'NIGHT', pixel: 10,colors: 8,  dither: 46, contrast: 28, saturation: -2, tint: 'night' },
};

const workCanvas = document.createElement('canvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

let db = null;

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function pad2(v){ return String(Math.round(v)).padStart(2, '0'); }
function signed(v){ return `${v >= 0 ? '+' : ''}${pad2(Math.abs(v))}`; }

function setStatus(text, ok=true){
  statusText.textContent = text;
  statusLed.classList.toggle('on', ok);
}

function updateHud(){
  hudMode.textContent = state.mode.toUpperCase();
  hudPreset.textContent = presets[state.preset].label;
  hudPixel.textContent = pad2(state.controls.pixel);
  hudColors.textContent = pad2(colorSteps[state.controls.colorsIndex]);
  pixelValue.textContent = pad2(state.controls.pixel);
  colorsValue.textContent = pad2(colorSteps[state.controls.colorsIndex]);
  ditherValue.textContent = pad2(state.controls.dither);
  contrastValue.textContent = signed(state.controls.contrast);
  saturationValue.textContent = signed(state.controls.saturation);
  pixelRange.value = state.controls.pixel;
  colorsRange.value = state.controls.colorsIndex;
  ditherRange.value = state.controls.dither;
  contrastRange.value = state.controls.contrast;
  saturationRange.value = state.controls.saturation;
  scanlineBtn.setAttribute('aria-pressed', String(state.controls.scanlines));
  screenStage.style.setProperty('--scanline-opacity', state.controls.scanlines ? '.35' : '0');

  presetPills.forEach(btn => btn.classList.toggle('active', btn.dataset.preset === state.preset));
}

function showEmpty(title, text){
  emptyTitle.textContent = title;
  emptyText.textContent = text;
  emptyState.classList.remove('hidden');
}

function hideEmpty(){
  emptyState.classList.add('hidden');
}

function setDrawerOpen(open){
  state.drawerOpen = open;
  drawer.setAttribute('aria-expanded', String(open));
  screenStage.classList.toggle('drawer-open', open);
  screenStage.classList.toggle('drawer-closed', !open);
  drawerPeekBtn.setAttribute('aria-label', open ? 'Ocultar painel de efeitos' : 'Abrir painel de efeitos');
}

function setActiveTab(name){
  state.activeTab = name;
  drawerTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === name));
  drawerPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
}

function toggleDrawerWithTab(name){
  if(state.drawerOpen && state.activeTab === name){
    setDrawerOpen(false);
  } else {
    setActiveTab(name);
    setDrawerOpen(true);
  }
}

drawerPeekBtn.addEventListener('click', ()=>{
  setDrawerOpen(!state.drawerOpen);
});
drawerCloseBtn.addEventListener('click', ()=>{
  setDrawerOpen(false);
});

drawerTabs.forEach(btn=>{
  btn.addEventListener('click', ()=> toggleDrawerWithTab(btn.dataset.tab));
});

filterTabBtn.addEventListener('click', ()=> toggleDrawerWithTab('filter'));
toneTabBtn.addEventListener('click', ()=> toggleDrawerWithTab('tone'));
galleryTabBtn.addEventListener('click', ()=> {
  toggleDrawerWithTab('gallery');
  renderGallery();
});

function setPreset(name, applyValues=true){
  state.preset = name;
  state.tint = presets[name].tint || null;

  if(applyValues && name !== 'custom'){
    const p = presets[name];
    state.controls.pixel = p.pixel;
    state.controls.colorsIndex = colorSteps.indexOf(p.colors);
    state.controls.dither = p.dither;
    state.controls.contrast = p.contrast;
    state.controls.saturation = p.saturation;
  }
  updateHud();
  rerender();
}

presetPills.forEach(btn => btn.addEventListener('click', ()=> setPreset(btn.dataset.preset, true)));

function markCustom(){
  if(state.preset !== 'custom'){
    state.preset = 'custom';
    state.tint = null;
  }
  updateHud();
}

pixelRange.addEventListener('input', ()=>{
  state.controls.pixel = +pixelRange.value;
  markCustom();
  rerender();
});
colorsRange.addEventListener('input', ()=>{
  state.controls.colorsIndex = +colorsRange.value;
  markCustom();
  rerender();
});
ditherRange.addEventListener('input', ()=>{
  state.controls.dither = +ditherRange.value;
  markCustom();
  rerender();
});
contrastRange.addEventListener('input', ()=>{
  state.controls.contrast = +contrastRange.value;
  markCustom();
  rerender();
});
saturationRange.addEventListener('input', ()=>{
  state.controls.saturation = +saturationRange.value;
  markCustom();
  rerender();
});

scanlineBtn.addEventListener('click', ()=>{
  state.controls.scanlines = !state.controls.scanlines;
  updateHud();
});
resetBtn.addEventListener('click', ()=>{
  state.controls.pixel = 8;
  state.controls.colorsIndex = 2;
  state.controls.dither = 35;
  state.controls.contrast = 10;
  state.controls.saturation = 8;
  state.preset = 'custom';
  state.tint = null;
  updateHud();
  rerender();
});

openImageBtn.addEventListener('click', ()=> fileInput.click());
emptyOpenBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if(file) loadFile(file);
});
emptyStartCamBtn.addEventListener('click', ()=> switchMode('cam'));
modeBtn.addEventListener('click', ()=> switchMode(state.mode === 'lab' ? 'cam' : 'lab'));
flipCamBtn.addEventListener('click', async ()=>{
  if(state.mode !== 'cam') return;
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});

shutterBtn.addEventListener('click', ()=>{
  if(canvas.width < 2 || canvas.height < 2) return;
  state.reviewDataUrl = canvas.toDataURL('image/png');
  state.reviewOrigin = state.mode;
  reviewOverlay.classList.remove('hidden');
  setDrawerOpen(false);
  setStatus('REVIEW');
});
retakeBtn.addEventListener('click', ()=>{
  reviewOverlay.classList.add('hidden');
  setStatus(state.mode === 'cam' ? 'LIVE' : 'READY');
});
saveDeviceBtn.addEventListener('click', ()=>{
  if(!state.reviewDataUrl) return;
  downloadDataUrl(state.reviewDataUrl, `pixel-lomolab-${new Date().toISOString().replace(/[:.]/g,'-')}.png`);
  setStatus('SAVED');
});
saveGalleryBtn.addEventListener('click', async ()=>{
  if(!state.reviewDataUrl) return;
  await saveToGallery(state.reviewDataUrl);
  await renderGallery();
  setActiveTab('gallery');
  setDrawerOpen(true);
  reviewOverlay.classList.add('hidden');
  setStatus('GALLERY');
});

recToggle.addEventListener('click', async ()=>{
  if(state.mode !== 'cam') return;
  if(state.recording){
    stopRecording();
  } else {
    await startRecording();
  }
});

refreshGalleryBtn.addEventListener('click', ()=> renderGallery());
clearGalleryBtn.addEventListener('click', async ()=>{
  if(!confirm('Apagar todas as imagens salvas nesta galeria local?')) return;
  await clearGallery();
  await renderGallery();
});

async function loadFile(file){
  if(!file.type.startsWith('image/')) return;
  state.originalName = file.name.replace(/\.[^/.]+$/, '') || 'pixel-lomolab';
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = ()=>{
    URL.revokeObjectURL(url);
    state.loadedImage = img;
    switchMode('lab', false);
    hideEmpty();
    renderFromSource(img, img.naturalWidth, img.naturalHeight, 1400);
    setStatus('READY');
  };
  img.onerror = ()=>{
    URL.revokeObjectURL(url);
    alert('Não foi possível abrir esta imagem.');
  };
  img.src = url;
}

async function switchMode(nextMode, autoStart=true){
  state.mode = nextMode;
  updateHud();

  if(nextMode === 'cam'){
    flipCamBtn.disabled = false;
    recToggle.disabled = false;
    if(autoStart) await startCamera();
  } else {
    flipCamBtn.disabled = true;
    recToggle.disabled = true;
    if(state.recording) stopRecording();
    stopCamera();
    if(state.loadedImage){
      hideEmpty();
      renderFromSource(state.loadedImage, state.loadedImage.naturalWidth, state.loadedImage.naturalHeight, 1400);
      setStatus('READY');
    } else {
      showEmpty('NO FILM LOADED', 'abra uma imagem ou inicie a câmera');
      clearCanvas();
      setStatus('READY');
    }
  }
}

function clearCanvas(){
  canvas.width = 1;
  canvas.height = 1;
  ctx.clearRect(0,0,1,1);
}

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){
    showEmpty('CAMERA UNAVAILABLE', 'seu navegador não suporta getUserMedia.');
    setStatus('NO CAM', false);
    return;
  }

  stopCamera();
  hideEmpty();
  try{
    setStatus('CAMERA');
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    cameraVideo.srcObject = state.cameraStream;
    await cameraVideo.play();
    state.liveRunning = true;
    state.lastRenderAt = 0;
    liveLoop();
    setStatus('LIVE');
  } catch(err){
    console.error(err);
    showEmpty('CAMERA BLOCKED', 'permita acesso à câmera. Use HTTPS ou localhost.');
    setStatus('DENIED', false);
  }
}

function stopCamera(){
  state.liveRunning = false;
  if(state.liveRAF) cancelAnimationFrame(state.liveRAF);
  state.liveRAF = null;
  if(cameraVideo.srcObject){
    cameraVideo.srcObject.getTracks().forEach(t => t.stop());
    cameraVideo.srcObject = null;
  }
  state.cameraStream = null;
}

function liveLoop(){
  const loop = (t)=>{
    if(!state.liveRunning) return;
    if(!reviewOverlay.classList.contains('hidden')){
      state.liveRAF = requestAnimationFrame(loop);
      return;
    }
    if(cameraVideo.readyState >= 2 && t - state.lastRenderAt > 66){
      renderFromSource(cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight, 1000);
      state.lastRenderAt = t;
    }
    state.liveRAF = requestAnimationFrame(loop);
  };
  state.liveRAF = requestAnimationFrame(loop);
}

async function startRecording(){
  if(typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined'){
    alert('Gravação de vídeo não suportada neste navegador.');
    return;
  }
  try{
    const stream = canvas.captureStream(12);
    const mimeTypes = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
    state.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    state.recordedChunks = [];

    state.recorder.ondataavailable = e => {
      if(e.data && e.data.size > 0) state.recordedChunks.push(e.data);
    };
    state.recorder.onstop = () => {
      if(!state.recordedChunks.length) return;
      const blob = new Blob(state.recordedChunks, { type: state.recorder.mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g,'-');
      downloadDataUrl(url, `pixel-lomolab-rec-${stamp}.webm`);
      setTimeout(()=> URL.revokeObjectURL(url), 3000);
    };

    state.recorder.start();
    state.recording = true;
    document.body.classList.add('recording');
    recToggle.setAttribute('aria-pressed','true');
    setStatus('REC');
  } catch(err){
    console.error(err);
    alert('Não foi possível iniciar a gravação.');
  }
}

function stopRecording(){
  if(!state.recording) return;
  state.recording = false;
  document.body.classList.remove('recording');
  recToggle.setAttribute('aria-pressed','false');
  try{
    state.recorder?.stop();
  }catch(err){
    console.warn(err);
  }
  setStatus('LIVE');
}

function rerender(){
  updateHud();
  if(state.mode === 'lab' && state.loadedImage){
    renderFromSource(state.loadedImage, state.loadedImage.naturalWidth, state.loadedImage.naturalHeight, 1400);
  }
}

function renderFromSource(source, srcW, srcH, maxLong=1000){
  if(!srcW || !srcH) return;

  const sourceScale = Math.min(1, maxLong / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * sourceScale));
  const outH = Math.max(1, Math.round(srcH * sourceScale));

  const pixelSize = state.controls.pixel;
  const lowW = Math.max(1, Math.round(outW / pixelSize));
  const lowH = Math.max(1, Math.round(outH / pixelSize));

  workCanvas.width = lowW;
  workCanvas.height = lowH;
  workCtx.imageSmoothingEnabled = true;
  workCtx.clearRect(0,0,lowW,lowH);
  workCtx.drawImage(source, 0, 0, lowW, lowH);

  const imageData = workCtx.getImageData(0,0,lowW,lowH);
  const d = imageData.data;

  for(let i=0;i<d.length;i+=4){
    const [r,g,b] = adjustColor(d[i], d[i+1], d[i+2]);
    d[i]=r; d[i+1]=g; d[i+2]=b;
  }

  const palette = medianCutPalette(makeSamplePixels(d), colorSteps[state.controls.colorsIndex]);
  const strength = state.controls.dither / 100;
  const work = new Float32Array(d.length);
  for(let i=0;i<d.length;i++) work[i] = d[i];

  const addError = (x,y,er,eg,eb,factor)=>{
    if(x<0 || x>=lowW || y<0 || y>=lowH) return;
    const idx = (y*lowW+x)*4;
    work[idx] += er*factor*strength;
    work[idx+1] += eg*factor*strength;
    work[idx+2] += eb*factor*strength;
  };

  for(let y=0; y<lowH; y++){
    const serpentine = y % 2 === 1;
    for(let xi=0; xi<lowW; xi++){
      const x = serpentine ? lowW - 1 - xi : xi;
      const i = (y*lowW+x)*4;
      const oldR = clamp(work[i], 0, 255);
      const oldG = clamp(work[i+1], 0, 255);
      const oldB = clamp(work[i+2], 0, 255);

      const nc = nearestColor(oldR, oldG, oldB, palette);
      d[i] = nc[0];
      d[i+1] = nc[1];
      d[i+2] = nc[2];

      const er = oldR - nc[0];
      const eg = oldG - nc[1];
      const eb = oldB - nc[2];
      const dir = serpentine ? -1 : 1;

      addError(x+dir, y, er,eg,eb, 7/16);
      addError(x-dir, y+1, er,eg,eb, 3/16);
      addError(x, y+1, er,eg,eb, 5/16);
      addError(x+dir, y+1, er,eg,eb, 1/16);
    }
  }

  workCtx.putImageData(imageData, 0, 0);
  canvas.width = outW;
  canvas.height = outH;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0,0,outW,outH);
  ctx.drawImage(workCanvas, 0, 0, outW, outH);
}

function adjustColor(r,g,b){
  const cf = (259 * (state.controls.contrast + 255)) / (255 * (259 - state.controls.contrast));
  r = cf * (r - 128) + 128;
  g = cf * (g - 128) + 128;
  b = cf * (b - 128) + 128;

  const sat = 1 + state.controls.saturation / 50;
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  r = lum + (r - lum) * sat;
  g = lum + (g - lum) * sat;
  b = lum + (b - lum) * sat;

  if(state.tint === 'mono'){
    const y = 0.299*r + 0.587*g + 0.114*b;
    r = y * .84; g = y * 1.02; b = y * .62;
  } else if(state.tint === 'acid'){
    r = r * 1.10 + 8; g = g * .92; b = b * 1.14 + 5;
  } else if(state.tint === 'warm'){
    r = r * 1.10 + 8; g = g * 1.00 + 2; b = b * .82;
  } else if(state.tint === 'night'){
    r = r * .70; g = g * .88 + 4; b = b * 1.08 + 10;
  }

  return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255)];
}

function makeSamplePixels(data){
  const pixels = [];
  const stride = Math.max(1, Math.floor((data.length / 4) / 8000));
  for(let i=0, px=0; i<data.length; i+=4, px++){
    if(px % stride !== 0) continue;
    if(data[i+3] < 20) continue;
    pixels.push([data[i], data[i+1], data[i+2]]);
  }
  return pixels;
}

function medianCutPalette(pixels, target){
  if(!pixels.length) return [[0,0,0],[255,255,255]];
  let boxes = [{ pixels }];

  while(boxes.length < target){
    let splitIndex = -1;
    let splitChannel = 0;
    let widest = -1;

    boxes.forEach((box, bi)=>{
      if(box.pixels.length < 2) return;
      let mins = [255,255,255], maxs = [0,0,0];
      for(const p of box.pixels){
        for(let c=0;c<3;c++){
          if(p[c] < mins[c]) mins[c] = p[c];
          if(p[c] > maxs[c]) maxs[c] = p[c];
        }
      }
      const ranges = maxs.map((v,c)=> v - mins[c]);
      const c = ranges.indexOf(Math.max(...ranges));
      if(ranges[c] > widest){
        widest = ranges[c];
        splitIndex = bi;
        splitChannel = c;
      }
    });

    if(splitIndex < 0) break;
    const box = boxes.splice(splitIndex,1)[0];
    box.pixels.sort((a,b)=> a[splitChannel] - b[splitChannel]);
    const mid = Math.floor(box.pixels.length / 2);
    boxes.push({ pixels: box.pixels.slice(0,mid) });
    boxes.push({ pixels: box.pixels.slice(mid) });
  }

  return boxes.map(box=>{
    let r=0,g=0,b=0;
    for(const p of box.pixels){
      r += p[0];
      g += p[1];
      b += p[2];
    }
    const n = Math.max(1, box.pixels.length);
    return [r/n, g/n, b/n];
  });
}

function nearestColor(r,g,b,palette){
  let best = palette[0], bestD = Infinity;
  for(const p of palette){
    const dr = r-p[0], dg = g-p[1], dbv = b-p[2];
    const d = dr*dr + dg*dg + dbv*dbv;
    if(d < bestD){
      bestD = d;
      best = p;
    }
  }
  return best;
}

function downloadDataUrl(url, name){
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
}

async function initDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open('pixelLomoLabDB', 1);
    req.onupgradeneeded = (event)=>{
      const dbx = event.target.result;
      if(!dbx.objectStoreNames.contains('shots')){
        const store = dbx.createObjectStore('shots', { keyPath:'id', autoIncrement:true });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = ()=>{
      db = req.result;
      resolve(db);
    };
    req.onerror = ()=> reject(req.error);
  });
}

async function saveToGallery(dataUrl){
  if(!db) await initDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('shots', 'readwrite');
    tx.objectStore('shots').add({ dataUrl, createdAt: Date.now() });
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

async function getGalleryItems(){
  if(!db) await initDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('shots', 'readonly');
    const req = tx.objectStore('shots').getAll();
    req.onsuccess = ()=>{
      const result = (req.result || []).sort((a,b)=> b.createdAt - a.createdAt);
      resolve(result);
    };
    req.onerror = ()=> reject(req.error);
  });
}

async function deleteGalleryItem(id){
  if(!db) await initDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('shots', 'readwrite');
    tx.objectStore('shots').delete(id);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

async function clearGallery(){
  if(!db) await initDB();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction('shots', 'readwrite');
    tx.objectStore('shots').clear();
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

async function renderGallery(){
  let items = [];
  try{
    items = await getGalleryItems();
  }catch(err){
    console.error(err);
  }

  if(!items.length){
    galleryGrid.innerHTML = '<div class="gallery-empty">Nenhuma captura salva ainda.</div>';
    return;
  }

  galleryGrid.innerHTML = '';
  items.forEach(item=>{
    const el = document.createElement('div');
    el.className = 'gallery-item';
    el.innerHTML = `
      <img src="${item.dataUrl}" alt="Captura salva" />
      <div class="thumb-actions">
        <button class="thumb-btn" data-action="open">OPEN</button>
        <button class="thumb-btn" data-action="del">DEL</button>
      </div>
    `;
    el.querySelector('[data-action="open"]').addEventListener('click', ()=>{
      state.reviewDataUrl = item.dataUrl;
      state.reviewOrigin = 'gallery';
      reviewOverlay.classList.remove('hidden');
      setDrawerOpen(false);
      setStatus('REVIEW');
    });
    el.querySelector('[data-action="del"]').addEventListener('click', async ()=>{
      await deleteGalleryItem(item.id);
      await renderGallery();
    });
    galleryGrid.appendChild(el);
  });
}

window.addEventListener('beforeunload', ()=>{
  if(state.recording) stopRecording();
  stopCamera();
});

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    if(state.recording) stopRecording();
    if(state.mode === 'cam') stopCamera();
  } else if(state.mode === 'cam'){
    startCamera();
  }
});

(async function init(){
  try{
    await initDB();
  } catch(err){
    console.warn('IndexedDB indisponível', err);
  }
  updateHud();
  setActiveTab('filter');
  setDrawerOpen(false);
  showEmpty('NO FILM LOADED', 'abra uma imagem ou inicie a câmera');
  await renderGallery();
})();
