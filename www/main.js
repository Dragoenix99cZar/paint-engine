import init, { ImageProcessor } from './pkg/paint_engine.js';

async function run() {
  await init();

  const fileInput = document.getElementById('uploader');
  const canvas = document.getElementById('viewport');
  const overlay = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');

  // UI Control References
  const btnToggleCrop = document.getElementById('btn-toggle-crop');
  const cropPanel = document.getElementById('crop-panel');
  const btnApplyCrop = document.getElementById('btn-apply-crop');
  const cropX = document.getElementById('crop-x');
  const cropY = document.getElementById('crop-y');
  const cropW = document.getElementById('crop-w');
  const cropH = document.getElementById('crop-h');

  let engine = null;

  // Active Tool State ('none' | 'crop')
  let activeTool = 'none';

  // Selection State
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let selection = { x: 0, y: 0, w: 0, h: 0 };

  function toggleCropTool(forceState = null) {
    if (!engine) return;

    if (forceState !== null) {
      activeTool = forceState ? 'crop' : 'none';
    } else {
      activeTool = activeTool === 'crop' ? 'none' : 'crop';
    }

    if (activeTool === 'crop') {
      btnToggleCrop.classList.add('active');
      cropPanel.classList.remove('hidden');
      overlay.classList.add('active-crop');
      // Set default crop selection to full image canvas
      setSelection(0, 0, engine.width(), engine.height());
    } else {
      btnToggleCrop.classList.remove('active');
      cropPanel.classList.add('hidden');
      overlay.classList.remove('active-crop');
      clearOverlay();
    }
  }

  function clearOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function setSelection(x, y, w, h) {
    if (!engine || activeTool !== 'crop') return;

    const imgW = engine.width();
    const imgH = engine.height();

    // Bounds checking
    const clampedX = Math.max(0, Math.min(x, imgW - 1));
    const clampedY = Math.max(0, Math.min(y, imgH - 1));
    const clampedW = Math.min(Math.max(1, w), imgW - clampedX);
    const clampedH = Math.min(Math.max(1, h), imgH - clampedY);

    selection = { x: clampedX, y: clampedY, w: clampedW, h: clampedH };

    // Sync UI Inputs
    cropX.value = Math.round(clampedX);
    cropY.value = Math.round(clampedY);
    cropW.value = Math.round(clampedW);
    cropH.value = Math.round(clampedH);

    drawMarquee();
  }

  function drawMarquee() {
    clearOverlay();

    if (!engine || activeTool !== 'crop' || selection.w <= 0 || selection.h <= 0) return;

    // 1. Translucent mask over unselected region
    octx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    octx.fillRect(0, 0, overlay.width, overlay.height);

    // 2. Clear cutout for selection box
    octx.clearRect(selection.x, selection.y, selection.w, selection.h);

    // 3. Dashed border stroke
    octx.strokeStyle = '#ffffff';
    octx.lineWidth = 1.5;
    octx.setLineDash([6, 6]);
    octx.strokeRect(selection.x, selection.y, selection.w, selection.h);

    octx.strokeStyle = '#000000';
    octx.lineDashOffset = 6;
    octx.strokeRect(selection.x, selection.y, selection.w, selection.h);
  }

  function render() {
    if (!engine) return;
    const width = engine.width();
    const height = engine.height();

    canvas.width = width;
    canvas.height = height;
    overlay.width = width;
    overlay.height = height;

    const rawPixels = engine.get_rgba_pixels();
    const imageData = new ImageData(
      new Uint8ClampedArray(rawPixels.buffer),
      width,
      height
    );

    ctx.putImageData(imageData, 0, 0);

    if (activeTool === 'crop') {
      setSelection(0, 0, width, height);
    } else {
      clearOverlay();
    }
  }

  function getCanvasCoords(e) {
    const rect = overlay.getBoundingClientRect();
    const scaleX = overlay.width / rect.width;
    const scaleY = overlay.height / rect.height;

    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY)
    };
  }

  // Pointer Listeners (only trigger if activeTool === 'crop')
  overlay.addEventListener('mousedown', (e) => {
    if (!engine || activeTool !== 'crop') return;
    isDragging = true;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;

    setSelection(startX, startY, 1, 1);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || activeTool !== 'crop') return;
    const coords = getCanvasCoords(e);

    const x = Math.min(startX, coords.x);
    const y = Math.min(startY, coords.y);
    const w = Math.abs(coords.x - startX);
    const h = Math.abs(coords.y - startY);

    setSelection(x, y, w, h);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Manual Input Changes
  [cropX, cropY, cropW, cropH].forEach((input) => {
    input.addEventListener('input', () => {
      if (activeTool !== 'crop') return;
      setSelection(
        parseInt(cropX.value, 10) || 0,
        parseInt(cropY.value, 10) || 0,
        parseInt(cropW.value, 10) || 1,
        parseInt(cropH.value, 10) || 1
      );
    });
  });

  btnToggleCrop.onclick = () => toggleCropTool();

  btnApplyCrop.onclick = () => {
    if (!engine || activeTool !== 'crop' || selection.w <= 0 || selection.h <= 0) return;

    engine.crop(selection.x, selection.y, selection.w, selection.h);
    toggleCropTool(false); // Turn off crop mode after applying
    render();
  };

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    engine = new ImageProcessor(new Uint8Array(arrayBuffer));
    toggleCropTool(false);
    render();
  });

  document.getElementById('btn-resize').onclick = () => {
    if (!engine) return;
    engine.resize(800, 600);
    render();
  };

  document.getElementById('btn-rotate').onclick = () => {
    if (!engine) return;
    engine.rotate_90();
    render();
  };

  document.getElementById('btn-export-webp').onclick = () => {
    if (!engine) return;
    const webpBytes = engine.encode("webp");
    const blob = new Blob([webpBytes], { type: 'image/webp' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.webp';
    a.click();
  };
}

run();
