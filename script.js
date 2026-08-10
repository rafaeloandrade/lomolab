const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const video = document.getElementById('cameraVideo');
const emptyState = document.getElementById('emptyState');
const emptyTitle = document.getElementById('emptyTitle');
const emptyText = document.getElementById('emptyText');
const emptyOpen = document.getElementById('emptyOpen');
const emptyCameraBtn = document.getElementById('emptyCameraBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const scanlineBtn = document.getElementById('scanlineBtn');
const screen = document.getElementById('dropZone');
const statusText = document.getElementById('statusText');
const statusLed = document.getElementById('statusLed');
const modeLabBtn = document.getElementById('modeLabBtn');
const modeCamBtn = document.getElementById('modeCamBtn');
const flipCamBtn = document.getElementById('flipCamBtn');
const shutterBtn = document.getElementById('shutterBtn');
const recBtn = document.getElementById('recBtn');
const recIndicator = document.getElementById('recIndicator');
const recordBadge = document.getElementById('recordBadge');

const hud = {
  mode: document.getElementById('hudMode'),
  preset: document.getElementById('hudPreset'),
  colors: document.getElementById('hudColors'),
  pixel: document.getElementById('hudPixel'),
};

const valueEls = {
  pixel: document.getElementById('pixelValue'),
  colors: document.getElementById('colorsValue'),
  dither: document.getElementById('ditherValue'),
  contrast: document.getElementById('contrastValue'),
  saturation: document.getElementById('saturationValue'),
};

const controls = {
  pixel:      { min: 2, max: 24, step: 1, value: 8 },
  colors:     { values: [2, 4, 8, 16, 32], index: 2, value: 8 },
  dither:     { min: 0, max: 100, step: 1, value: 35 },
  contrast:   { min: -50, max: 50, step: 1, value: 10 },
  saturation: { min: -50, max: 50, step: 1, value: 8 },
};

const presets = {
  custom: { label: 'CUSTOM' },
  raw:    { label: 'RAW PIXEL', pixel: 7, colors: 16, dither: 0,  contrast: 8,  saturation: 4,  tint: null },
  mono:   { label: 'MONO LCD',  pixel: 8, colors: 4,  dither: 55, contrast: 18, saturation: -50, tint: 'mono' },
  acid:   { label: 'ACID 04',   pixel: 9, colors: 4,  dither: 42, contrast: 24, saturation: 32, tint: 'acid' },
  warm:   { label: 'WARM 8-BIT',pixel: 7, colors: 8,  dither: 30, contrast: 16, saturation: 18, tint: 'warm' },
  night:  { label: 'NIGHT',     pixel: 10,colors: 8,  dither: 46, contrast: 28, saturation: -2, tint: 'night' },
};

let currentPreset = 'custom';
let currentImage = null;
let originalName = 'pixel-lomolab';
let renderTimer = null;
let currentTint = null;
let renderToken = 0;

let mode = 'lab';
let cameraStream = null;
let facingMode = 'environment';
let liveRaf = null;
let liveRunning = false;
let lastLiveRender = 0;

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

const workCanvas = document.createElement('canvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function pad2(v){ return String(Math.round(v)).padStart(2, '0'); }

function setStatus(text, busy=false){
  statusText.textContent = text;
  statusLed.classList.toggle('on', !busy);
}

function displayValue(name){
  const c = controls[name];
  if(name === 'contrast' || name === 'saturation'){
    return `${c.value >= 0 ? '+' : ''}${pad2(Math.abs(c.value))}`;
  }
  return pad2(c.value);
}

function setControlValue(name, value, markCustom=true){
  const c = controls[name];

  if(c.values){
    let closest = 0;
    let dist = Infinity;
    c.values.forEach((v,i)=>{
      const d = Math.abs(v - value);
      if(d < dist){ dist = d; closest = i; }
    });
    c.index = closest;
    c.value = c.values[closest];
  } else {
    c.value = clamp(Math.round(value / c.step) * c.step, c.min, c.max);
  }

  updateKnobVisual(name);
  if(markCustom) setPreset('custom', false);
  scheduleRender();
}

function updateKnobVisual(name){
  const knob = document.querySelector(`.knob[data-control="${name}"]`);
  const c = controls[name];
  let t;

  if(c.values){
    t = c.index / (c.values.length - 1);
  } else {
    t = (c.value - c.min) / (c.max - c.min);
  }

  const angle = -135 + t * 270;
  knob.style.setProperty('--angle', `${angle}deg`);
  knob.setAttribute('aria-valuenow', c.value);
  valueEls[name].textContent = displayValue(name);

  hud.colors.textContent = pad2(controls.colors.value);
  hud.pixel.textContent = pad2(controls.pixel.value);
}

function setPreset(name, applyValues=true){
  currentPreset = name;
  currentTint = presets[name].tint || null;

  document.querySelectorAll('.preset').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.preset === name);
  });

  hud.preset.textContent = presets[name].label;

  if(applyValues && name !== 'custom'){
    const p = presets[name];
    ['pixel','colors','dither','contrast','saturation'].forEach(key=>{
      if(typeof p[key] !== 'undefined') setControlValue(key, p[key], false);
    });
    scheduleRender();
  }
}

function scheduleRender(){
  if(mode === 'cam'){
    return;
  }
  if(!currentImage) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderCurrentImage, 40);
}

function showEmpty(title, text, showOpen=true, showCamera=false){
  emptyState.classList.remove('hidden');
  emptyTitle.textContent = title;
  emptyText.textContent = text;
  emptyOpen.classList.toggle('hidden', !showOpen);
  emptyCameraBtn.classList.toggle('hidden', !showCamera);
}

function hideEmpty(){
  emptyState.classList.add('hidden');
}

function setMode(nextMode){
  mode = nextMode;
  document.body.classList.toggle('camera-mode', mode === 'cam');
  document.body.classList.toggle('lab-mode', mode === 'lab');
  modeLabBtn.classList.toggle('active', mode === 'lab');
  modeCamBtn.classList.toggle('active', mode === 'cam');
  hud.mode.textContent = mode.toUpperCase();

  if(mode === 'cam'){
    flipCamBtn.disabled = false;
    shutterBtn.disabled = false;
    recBtn.disabled = false;
    if(!canvas.style.display || canvas.style.display === 'none'){
      canvas.style.display = 'block';
    }
    startCamera();
  } else {
    flipCamBtn.disabled = true;
    shutterBtn.disabled = true;
    recBtn.disabled = true;
    stopRecording(false);
    stopCamera();
    if(currentImage){
      hideEmpty();
      canvas.style.display = 'block';
      renderCurrentImage();
    } else {
      canvas.style.display = 'none';
      showEmpty('NO FILM LOADED', 'abra uma foto da galeria ou computador', true, true);
    }
  }
}

function loadFile(file){
  if(!file || !file.type.startsWith('image/')) return;
  originalName = file.name.replace(/\.[^/.]+$/, '') || 'pixel-lomolab';

  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = ()=>{
    currentImage = img;
    URL.revokeObjectURL(url);
    setMode('lab');
    hideEmpty();
    canvas.style.display = 'block';
    downloadBtn.disabled = false;
    setStatus('PROCESS', true);
    renderCurrentImage();
  };

  img.onerror = ()=>{
    URL.revokeObjectURL(url);
    setStatus('ERROR');
    alert('Não foi possível abrir esta imagem.');
  };

  img.src = url;
}

fileInput.addEventListener('change', e => loadFile(e.target.files[0]));

['dragenter','dragover'].forEach(type=>{
  screen.addEventListener(type, e=>{
    e.preventDefault();
    screen.classList.add('dragging');
  });
});
['dragleave','drop'].forEach(type=>{
  screen.addEventListener(type, e=>{
    e.preventDefault();
    screen.classList.remove('dragging');
  });
});
screen.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));

document.querySelectorAll('.preset').forEach(btn=>{
  btn.addEventListener('click', ()=> setPreset(btn.dataset.preset, true));
});

resetBtn.addEventListener('click', ()=>{
  controls.pixel.value = 8;
  controls.colors.index = 2;
  controls.colors.value = 8;
  controls.dither.value = 35;
  controls.contrast.value = 10;
  controls.saturation.value = 8;
  currentTint = null;
  Object.keys(controls).forEach(updateKnobVisual);
  setPreset('custom', false);
  if(mode === 'lab' && currentImage) renderCurrentImage();
});

scanlineBtn.addEventListener('click', ()=>{
  const next = scanlineBtn.getAttribute('aria-pressed') !== 'true';
  scanlineBtn.setAttribute('aria-pressed', String(next));
  screen.style.setProperty('--scanline-opacity', next ? '.45' : '0');
});

modeLabBtn.addEventListener('click', ()=> setMode('lab'));
modeCamBtn.addEventListener('click', ()=> setMode('cam'));
emptyCameraBtn.addEventListener('click', ()=> setMode('cam'));

flipCamBtn.addEventListener('click', async ()=>{
  if(mode !== 'cam') return;
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
});

downloadBtn.addEventListener('click', ()=>{
  if(canvas.style.display === 'none') return;
  downloadCanvas('pixel-lomolab');
});

shutterBtn.addEventListener('click', ()=>{
  if(mode !== 'cam') return;
  if(canvas.width < 2 || canvas.height < 2) return;
  downloadCanvas('pixel-lomolab-cam');
  setStatus('SHOT');
});

recBtn.addEventListener('click', async ()=>{
  if(mode !== 'cam') return;
  if(isRecording){
    stopRecording(true);
  } else {
    await startRecording();
  }
});

function downloadCanvas(baseName){
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const link = document.createElement('a');
  link.download = `${baseName}-${stamp}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function startCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showEmpty('CAMERA UNAVAILABLE', 'seu navegador não suporta acesso à câmera.', false, false);
    setStatus('NO CAM');
    return;
  }

  stopCamera();
  hideEmpty();
  canvas.style.display = 'block';

  try{
    setStatus('CAMERA', true);
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video:{
        facingMode:{ ideal:facingMode },
        width:{ ideal:1280 },
        height:{ ideal:720 }
      },
      audio:false
    });

    video.srcObject = cameraStream;
    await video.play();
    downloadBtn.disabled = false;
    liveRunning = true;
    lastLiveRender = 0;
    startLiveLoop();
    setStatus('LIVE');
  }catch(err){
    console.error(err);
    showEmpty('CAMERA BLOCKED', 'permita o acesso à câmera. No celular, teste em HTTPS ou localhost.', false, true);
    setStatus('DENIED');
  }
}

function stopCamera(){
  liveRunning = false;
  if(liveRaf) cancelAnimationFrame(liveRaf);
  liveRaf = null;
  if(video.srcObject){
    const tracks = video.srcObject.getTracks();
    tracks.forEach(t => t.stop());
    video.srcObject = null;
  }
  cameraStream = null;
}

function startLiveLoop(){
  if(!liveRunning) return;

  const loop = (t)=>{
    if(!liveRunning) return;
    if(video.readyState >= 2){
      if(t - lastLiveRender > 66){
        processSource(video, video.videoWidth, video.videoHeight, 960);
        lastLiveRender = t;
      }
    }
    liveRaf = requestAnimationFrame(loop);
  };
  liveRaf = requestAnimationFrame(loop);
}

async function startRecording(){
  if(typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined'){
    alert('A gravação de vídeo não é suportada neste navegador.');
    return;
  }

  try{
    const stream = canvas.captureStream(12);
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recordedChunks = [];

    mediaRecorder.ondataavailable = e=>{
      if(e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = ()=>{
      if(recordedChunks.length){
        const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g,'-');
        link.href = url;
        link.download = `pixel-lomolab-rec-${stamp}.webm`;
        link.click();
        setTimeout(()=> URL.revokeObjectURL(url), 2000);
      }
    };

    mediaRecorder.start();
    isRecording = true;
    document.body.classList.add('recording');
    recBtn.setAttribute('aria-pressed', 'true');
    recordBadge.hidden = false;
    setStatus('REC');
  }catch(err){
    console.error(err);
    alert('Não foi possível iniciar a gravação neste navegador.');
  }
}

function stopRecording(downloadAfter=true){
  if(!isRecording) return;
  isRecording = false;
  document.body.classList.remove('recording');
  recBtn.setAttribute('aria-pressed', 'false');
  recordBadge.hidden = true;
  setStatus(mode === 'cam' ? 'LIVE' : 'READY');

  try{
    mediaRecorder?.stop();
  }catch(err){
    console.warn(err);
  }
}

function initKnobs(){
  document.querySelectorAll('.knob').forEach(knob=>{
    const name = knob.dataset.control;
    let startY = 0;
    let startValue = 0;
    let active = false;

    const onMove = (e)=>{
      if(!active) return;
      const pointY = e.clientY;
      const delta = startY - pointY;
      const c = controls[name];

      if(c.values){
        const index = clamp(Math.round(c.values.indexOf(startValue) + delta / 22), 0, c.values.length - 1);
        setControlValue(name, c.values[index]);
      } else {
        const sensitivity = (c.max - c.min) / 140;
        setControlValue(name, startValue + delta * sensitivity);
      }
    };

    const onUp = ()=>{
      active = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    knob.addEventListener('pointerdown', e=>{
      e.preventDefault();
      active = true;
      startY = e.clientY;
      startValue = controls[name].value;
      knob.setPointerCapture?.(e.pointerId);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    knob.addEventListener('wheel', e=>{
      e.preventDefault();
      const c = controls[name];
      if(c.values){
        let idx = c.values.indexOf(c.value) + (e.deltaY > 0 ? -1 : 1);
        idx = clamp(idx, 0, c.values.length - 1);
        setControlValue(name, c.values[idx]);
      } else {
        setControlValue(name, c.value + (e.deltaY > 0 ? -c.step : c.step));
      }
    }, { passive:false });

    knob.addEventListener('keydown', e=>{
      if(!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) return;
      e.preventDefault();
      const dir = ['ArrowUp','ArrowRight'].includes(e.key) ? 1 : -1;
      const c = controls[name];

      if(c.values){
        let idx = clamp(c.values.indexOf(c.value) + dir, 0, c.values.length - 1);
        setControlValue(name, c.values[idx]);
      } else {
        setControlValue(name, c.value + dir * c.step);
      }
    });
  });

  Object.keys(controls).forEach(updateKnobVisual);
}

function adjustColor(r,g,b){
  const cf = (259 * (controls.contrast.value + 255)) / (255 * (259 - controls.contrast.value));
  r = cf * (r - 128) + 128;
  g = cf * (g - 128) + 128;
  b = cf * (b - 128) + 128;

  const sat = 1 + controls.saturation.value / 50;
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  r = lum + (r - lum) * sat;
  g = lum + (g - lum) * sat;
  b = lum + (b - lum) * sat;

  if(currentTint === 'mono'){
    const y = 0.299*r + 0.587*g + 0.114*b;
    r = y * .84; g = y * 1.02; b = y * .62;
  } else if(currentTint === 'acid'){
    r = r * 1.10 + 8; g = g * .92; b = b * 1.14 + 5;
  } else if(currentTint === 'warm'){
    r = r * 1.10 + 8; g = g * 1.00 + 2; b = b * .82;
  } else if(currentTint === 'night'){
    r = r * .70; g = g * .88 + 4; b = b * 1.08 + 10;
  }

  return [clamp(r,0,255),clamp(g,0,255),clamp(b,0,255)];
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
      const ranges = maxs.map((v,c)=>v-mins[c]);
      const c = ranges.indexOf(Math.max(...ranges));
      if(ranges[c] > widest){
        widest = ranges[c];
        splitIndex = bi;
        splitChannel = c;
      }
    });

    if(splitIndex < 0) break;
    const box = boxes.splice(splitIndex,1)[0];
    box.pixels.sort((a,b)=>a[splitChannel]-b[splitChannel]);
    const mid = Math.floor(box.pixels.length/2);
    boxes.push({ pixels: box.pixels.slice(0,mid) });
    boxes.push({ pixels: box.pixels.slice(mid) });
  }

  return boxes.map(box=>{
    let r=0,g=0,b=0;
    for(const p of box.pixels){ r+=p[0]; g+=p[1]; b+=p[2]; }
    const n = Math.max(1, box.pixels.length);
    return [r/n,g/n,b/n];
  });
}

function nearestColor(r,g,b,palette){
  let best = palette[0], bestD = Infinity;
  for(const p of palette){
    const dr=r-p[0], dg=g-p[1], db=b-p[2];
    const d=dr*dr+dg*dg+db*db;
    if(d<bestD){bestD=d;best=p;}
  }
  return best;
}

function renderCurrentImage(){
  if(!currentImage) return;
  processSource(currentImage, currentImage.naturalWidth, currentImage.naturalHeight, 1200);
  setStatus('READY');
}

function processSource(source, srcW, srcH, maxLong=1000){
  if(!srcW || !srcH) return;
  const token = ++renderToken;

  const sourceScale = Math.min(1, maxLong / Math.max(srcW,srcH));
  const outW = Math.max(1, Math.round(srcW * sourceScale));
  const outH = Math.max(1, Math.round(srcH * sourceScale));
  const pixelSize = controls.pixel.value;
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
    const [r,g,b] = adjustColor(d[i],d[i+1],d[i+2]);
    d[i]=r; d[i+1]=g; d[i+2]=b;
  }

  const palette = medianCutPalette(makeSamplePixels(d), controls.colors.value);
  const strength = controls.dither.value / 100;
  const work = new Float32Array(d.length);
  for(let i=0;i<d.length;i++) work[i]=d[i];

  const addError = (x,y,er,eg,eb,factor)=>{
    if(x<0||x>=lowW||y<0||y>=lowH) return;
    const idx=(y*lowW+x)*4;
    work[idx]+=er*factor*strength;
    work[idx+1]+=eg*factor*strength;
    work[idx+2]+=eb*factor*strength;
  };

  for(let y=0;y<lowH;y++){
    const serpentine = y % 2 === 1;
    for(let xi=0;xi<lowW;xi++){
      const x = serpentine ? lowW-1-xi : xi;
      const i=(y*lowW+x)*4;

      const oldR=clamp(work[i],0,255);
      const oldG=clamp(work[i+1],0,255);
      const oldB=clamp(work[i+2],0,255);

      const nc=nearestColor(oldR,oldG,oldB,palette);
      d[i]=nc[0];d[i+1]=nc[1];d[i+2]=nc[2];

      const er=oldR-nc[0], eg=oldG-nc[1], eb=oldB-nc[2];
      const dir=serpentine?-1:1;

      addError(x+dir,y,er,eg,eb,7/16);
      addError(x-dir,y+1,er,eg,eb,3/16);
      addError(x,y+1,er,eg,eb,5/16);
      addError(x+dir,y+1,er,eg,eb,1/16);
    }
  }

  workCtx.putImageData(imageData,0,0);
  canvas.width=outW;
  canvas.height=outH;
  ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,outW,outH);
  ctx.drawImage(workCanvas,0,0,outW,outH);
}

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    if(isRecording) stopRecording(true);
    if(mode === 'cam') stopCamera();
  }else if(mode === 'cam'){
    startCamera();
  }
});

window.addEventListener('beforeunload', ()=>{
  if(isRecording) stopRecording(false);
  stopCamera();
});

initKnobs();
setPreset('custom', false);
showEmpty('NO FILM LOADED', 'abra uma foto da galeria ou computador', true, true);
document.body.classList.add('lab-mode');
