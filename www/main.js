import init, { ImageProcessor } from './pkg/paint_engine.js';

async function run() {
  await init();

  const fileInput = document.getElementById('uploader');
  const canvas = document.getElementById('viewport');
  const overlay = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');

  // UI Elements
  const btnToggleSelect = document.getElementById('btn-toggle-select');
  const selectPanel = document.getElementById('select-panel');
  const btnCropAction = document.getElementById('btn-crop-action');
  const btnClearSelection = document.getElementById('btn-clear-selection');
  const btnDeselect = document.getElementById('btn-deselect');

  const selX = document.getElementById('sel-x');
  const selY = document.getElementById('sel-y');
  const selW = document.getElementById('sel-w');
  const selH = document.getElementById('sel-h');

  let engine = null;
  let activeTool = 'none';

  // Selection & Marquee State
  let hasSelection = false;
  let dashOffset = 0;
  let isDragging = false;
  let activeHandle = null; // 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'move', 'new'
  let startX = 0;
  let startY = 0;
  let selectionRect = { x: 0, y: 0, w: 0, h: 0 };

  const HANDLE_SIZE = 8;

  function setActiveTool(tool) {
    activeTool = activeTool === tool ? 'none' : tool;

    btnToggleSelect.classList.toggle('active', activeTool === 'select');
    selectPanel.classList.toggle('hidden', activeTool !== 'select');
    overlay.classList.toggle('active-select', activeTool === 'select');

    if (activeTool === 'select' && engine && !hasSelection) {
      setSelection(0, 0, engine.width(), engine.height());
    }
  }

  function resetSelection() {
    hasSelection = false;
    selectionRect = { x: 0, y: 0, w: 0, h: 0 };
    selX.value = 0;
    selY.value = 0;
    selW.value = 0;
    selH.value = 0;
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function setSelection(x, y, w, h) {
    if (!engine) return;

    const imgW = engine.width();
    const imgH = engine.height();

    const clampedX = Math.max(0, Math.min(x, imgW - 1));
    const clampedY = Math.max(0, Math.min(y, imgH - 1));
    const clampedW = Math.min(Math.max(1, w), imgW - clampedX);
    const clampedH = Math.min(Math.max(1, h), imgH - clampedY);

    selectionRect = { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
    hasSelection = clampedW > 0 && clampedH > 0;

    selX.value = Math.round(clampedX);
    selY.value = Math.round(clampedY);
    selW.value = Math.round(clampedW);
    selH.value = Math.round(clampedH);
  }

  function getHandles() {
    const { x, y, w, h } = selectionRect;
    return {
      nw: { x: x, y: y },
      n:  { x: x + w / 2, y: y },
      ne: { x: x + w, y: y },
      e:  { x: x + w, y: y + h / 2 },
      se: { x: x + w, y: y + h },
      s:  { x: x + w / 2, y: y + h },
      sw: { x: x, y: y + h },
      w:  { x: x, y: y + h / 2 }
    };
  }

  function hitTestHandle(px, py) {
    if (!hasSelection) return null;
    const handles = getHandles();

    for (const [name, pos] of Object.entries(handles)) {
      if (
        px >= pos.x - HANDLE_SIZE &&
        px <= pos.x + HANDLE_SIZE &&
        py >= pos.y - HANDLE_SIZE &&
        py <= pos.y + HANDLE_SIZE
      ) {
        return name;
      }
    }

    const { x, y, w, h } = selectionRect;
    if (px >= x && px <= x + w && py >= y && py <= y + h) {
      return 'move';
    }

    return null;
  }

  // Continuous 60 FPS Marching Ants & Handle Renderer
  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (hasSelection && selectionRect.w > 0 && selectionRect.h > 0) {
      const { x, y, w, h } = selectionRect;

      // Darken non-selected pixels
      octx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      octx.beginPath();
      octx.rect(0, 0, overlay.width, overlay.height);
      octx.rect(x, y, w, h);
      octx.fill('evenodd');

      // Marching ants border
      dashOffset = (dashOffset + 0.4) % 12;

      octx.save();
      octx.lineWidth = 1.5;

      octx.strokeStyle = '#ffffff';
      octx.setLineDash([6, 6]);
      octx.lineDashOffset = -dashOffset;
      octx.strokeRect(x, y, w, h);

      octx.strokeStyle = '#000000';
      octx.setLineDash([6, 6]);
      octx.lineDashOffset = -dashOffset + 6;
      octx.strokeRect(x, y, w, h);
      octx.restore();

      // Draw resize handles
      const handles = getHandles();
      octx.fillStyle = '#ffffff';
      octx.strokeStyle = '#6366f1';
      octx.lineWidth = 1.5;

      for (const pos of Object.values(handles)) {
        octx.fillRect(
          pos.x - HANDLE_SIZE / 2,
          pos.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE
        );
        octx.strokeRect(
          pos.x - HANDLE_SIZE / 2,
          pos.y - HANDLE_SIZE / 2,
          HANDLE_SIZE,
          HANDLE_SIZE
        );
      }
    }

    requestAnimationFrame(drawOverlay);
  }

  function renderViewport() {
    if (!engine) return;
    const width = engine.width();
    const height = engine.height();

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      overlay.width = width;
      overlay.height = height;
    }

    const rawPixels = engine.get_rgba_pixels();
    const imageData = new ImageData(
      new Uint8ClampedArray(rawPixels.buffer),
      width,
      height
    );

    ctx.putImageData(imageData, 0, 0);
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

  // Selection Dragging
  overlay.addEventListener('mousedown', (e) => {
    if (!engine || activeTool !== 'select') return;
    const coords = getCanvasCoords(e);
    isDragging = true;
    startX = coords.x;
    startY = coords.y;

    const handle = hitTestHandle(coords.x, coords.y);
    if (handle) {
      activeHandle = handle;
    } else {
      activeHandle = 'new';
      setSelection(startX, startY, 1, 1);
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!engine) return;
    const coords = getCanvasCoords(e);

    if (activeTool === 'select' && !isDragging) {
      const handle = hitTestHandle(coords.x, coords.y);
      const cursorMap = {
        nw: 'nwse-resize', se: 'nwse-resize',
        ne: 'nesw-resize', sw: 'nesw-resize',
        n: 'ns-resize', s: 'ns-resize',
        e: 'ew-resize', w: 'ew-resize',
        move: 'move'
      };
      overlay.style.cursor = cursorMap[handle] || 'crosshair';
    }

    if (!isDragging || activeTool !== 'select') return;

    const dx = coords.x - startX;
    const dy = coords.y - startY;

    if (activeHandle === 'new') {
      const x = Math.min(startX, coords.x);
      const y = Math.min(startY, coords.y);
      const w = Math.abs(coords.x - startX);
      const h = Math.abs(coords.y - startY);
      setSelection(x, y, w, h);
    } else if (activeHandle === 'move') {
      setSelection(selectionRect.x + dx, selectionRect.y + dy, selectionRect.w, selectionRect.h);
      startX = coords.x;
      startY = coords.y;
    } else if (activeHandle) {
      let { x, y, w, h } = selectionRect;

      if (activeHandle.includes('e')) w += dx;
      if (activeHandle.includes('s')) h += dy;
      if (activeHandle.includes('w')) { x += dx; w -= dx; }
      if (activeHandle.includes('n')) { y += dy; h -= dy; }

      if (w > 0 && h > 0) {
        setSelection(x, y, w, h);
        startX = coords.x;
        startY = coords.y;
      }
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    activeHandle = null;
  });

  [selX, selY, selW, selH].forEach((input) => {
    input.addEventListener('input', () => {
      setSelection(
        parseInt(selX.value) || 0,
        parseInt(selY.value) || 0,
        parseInt(selW.value) || 1,
        parseInt(selH.value) || 1
      );
    });
  });

  btnCropAction.onclick = () => {
    if (!engine || !hasSelection || selectionRect.w <= 0 || selectionRect.h <= 0) return;
    engine.crop(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    resetSelection();
    renderViewport();
  };

  btnClearSelection.onclick = () => {
    if (!engine || !hasSelection || selectionRect.w <= 0 || selectionRect.h <= 0) return;
    engine.clear_selection(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
    resetSelection();
    renderViewport();
  };

  btnDeselect.onclick = () => resetSelection();
  btnToggleSelect.onclick = () => setActiveTool('select');

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    engine = new ImageProcessor(new Uint8Array(arrayBuffer));
    setActiveTool('none');
    resetSelection();
    renderViewport();
  });

  document.getElementById('btn-rotate').onclick = () => {
    if (!engine) return;
    engine.rotate_90();
    resetSelection();
    renderViewport();
  };

  function exportImage(format, mimeType) {
    if (!engine) return;
    const bytes = engine.encode(format);
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `exported-image.${format}`;
    a.click();
  }

  document.getElementById('btn-export-png').onclick = () => exportImage('png', 'image/png');
  document.getElementById('btn-export-jpg').onclick = () => exportImage('jpeg', 'image/jpeg');
  document.getElementById('btn-export-webp').onclick = () => exportImage('webp', 'image/webp');

  drawOverlay();
}

run();
