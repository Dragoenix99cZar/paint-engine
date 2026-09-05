import init, { ImageProcessor } from './pkg/paint_engine.js';

async function run() {
  await init();

  const fileInput = document.getElementById('uploader');
  const canvas = document.getElementById('viewport');
  const overlay = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');

  // Controls
  const btnToggleSelect = document.getElementById('btn-toggle-select');
  const btnToggleFlood = document.getElementById('btn-toggle-flood');
  const selectPanel = document.getElementById('select-panel');
  const floodPanel = document.getElementById('flood-panel');
  const floodTolerance = document.getElementById('flood-tolerance');
  const toleranceVal = document.getElementById('tolerance-val');

  const btnCropAction = document.getElementById('btn-crop-action');
  const btnClearSelection = document.getElementById('btn-clear-selection');
  const btnDeselect = document.getElementById('btn-deselect');

  const selX = document.getElementById('sel-x');
  const selY = document.getElementById('sel-y');
  const selW = document.getElementById('sel-w');
  const selH = document.getElementById('sel-h');

  let engine = null;
  let activeTool = 'none';

  // Selection states
  let selectionType = 'none'; // 'box' or 'mask'
  let hasSelection = false;
  let pixelMask = null;
  let contourPath = null;

  let dashOffset = 0;
  let isDragging = false;
  let activeHandle = null; // 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'move', 'new'
  let dragStartCoords = { x: 0, y: 0 };
  let initialBox = { x: 0, y: 0, w: 0, h: 0 };
  let selectionRect = { x: 0, y: 0, w: 0, h: 0 };

  const HANDLE_SIZE = 10;
  const HIT_PADDING = 6;

  function setActiveTool(tool) {
    activeTool = activeTool === tool ? 'none' : tool;

    btnToggleSelect.classList.toggle('active', activeTool === 'select');
    btnToggleFlood.classList.toggle('active', activeTool === 'flood');

    selectPanel.classList.toggle('hidden', activeTool !== 'select');
    floodPanel.classList.toggle('hidden', activeTool !== 'flood');

    overlay.classList.toggle('active-tool', activeTool !== 'none');

    if (activeTool === 'select' && engine && !hasSelection) {
      setBoxSelection(0, 0, engine.width(), engine.height());
    }
  }

  function resetSelection() {
    hasSelection = false;
    selectionType = 'none';
    pixelMask = null;
    contourPath = null;
    selectionRect = { x: 0, y: 0, w: 0, h: 0 };
    selX.value = 0;
    selY.value = 0;
    selW.value = 0;
    selH.value = 0;
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function setBoxSelection(x, y, w, h) {
    if (!engine) return;

    const imgW = engine.width();
    const imgH = engine.height();

    const clampedX = Math.max(0, Math.min(x, imgW - 1));
    const clampedY = Math.max(0, Math.min(y, imgH - 1));
    const clampedW = Math.min(Math.max(1, w), imgW - clampedX);
    const clampedH = Math.min(Math.max(1, h), imgH - clampedY);

    selectionRect = { x: clampedX, y: clampedY, w: clampedW, h: clampedH };
    selectionType = 'box';
    hasSelection = clampedW > 0 && clampedH > 0;
    pixelMask = null;

    selX.value = Math.round(clampedX);
    selY.value = Math.round(clampedY);
    selW.value = Math.round(clampedW);
    selH.value = Math.round(clampedH);
  }

  function setPixelMaskSelection(maskArray) {
    if (!engine || !maskArray || maskArray.length === 0) return;

    pixelMask = maskArray;
    selectionType = 'mask';
    hasSelection = maskArray.some((v) => v === 1);
    contourPath = buildMaskContourPath(maskArray, engine.width(), engine.height());

    // Calculate bounding box for flood fill selection
    if (hasSelection) {
      const bbox = getMaskBoundingBox(maskArray, engine.width(), engine.height());
      if (bbox) {
        selectionRect = bbox;
        selX.value = Math.round(bbox.x);
        selY.value = Math.round(bbox.y);
        selW.value = Math.round(bbox.w);
        selH.value = Math.round(bbox.h);
      }
    }
  }

  function getMaskBoundingBox(mask, w, h) {
    let minX = w, minY = h, maxX = -1, maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (mask[y * w + x] === 1) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1 || maxY === -1) return null;

    return {
      x: minX,
      y: minY,
      w: maxX - minX + 1,
      h: maxY - minY + 1
    };
  }

  function buildMaskContourPath(mask, w, h) {
    const path = new Path2D();

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] !== 1) continue;

        if (y === 0 || mask[(y - 1) * w + x] === 0) {
          path.moveTo(x, y);
          path.lineTo(x + 1, y);
        }
        if (x === w - 1 || mask[y * w + (x + 1)] === 0) {
          path.moveTo(x + 1, y);
          path.lineTo(x + 1, y + 1);
        }
        if (y === h - 1 || mask[(y + 1) * w + x] === 0) {
          path.moveTo(x, y + 1);
          path.lineTo(x + 1, y + 1);
        }
        if (x === 0 || mask[y * w + (x - 1)] === 0) {
          path.moveTo(x, y);
          path.lineTo(x, y + 1);
        }
      }
    }
    return path;
  }

  function getHandles() {
    const { x, y, w, h } = selectionRect;
    return {
      nw: { x: x, y: y, cursor: 'nwse-resize' },
      n:  { x: x + w / 2, y: y, cursor: 'ns-resize' },
      ne: { x: x + w, y: y, cursor: 'nesw-resize' },
      e:  { x: x + w, y: y + h / 2, cursor: 'ew-resize' },
      se: { x: x + w, y: y + h, cursor: 'nwse-resize' },
      s:  { x: x + w / 2, y: y + h, cursor: 'ns-resize' },
      sw: { x: x, y: y + h, cursor: 'nesw-resize' },
      w:  { x: x, y: y + h / 2, cursor: 'ew-resize' }
    };
  }

  function getHitHandle(coords) {
    if (selectionType !== 'box' || !hasSelection) return null;

    const handles = getHandles();
    const hitRadius = (HANDLE_SIZE / 2) + HIT_PADDING;

    for (const [key, pos] of Object.entries(handles)) {
      if (
        Math.abs(coords.x - pos.x) <= hitRadius &&
        Math.abs(coords.y - pos.y) <= hitRadius
      ) {
        return key;
      }
    }

    const { x, y, w, h } = selectionRect;
    if (coords.x >= x && coords.x <= x + w && coords.y >= y && coords.y <= y + h) {
      return 'move';
    }

    return null;
  }

  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (hasSelection) {
      dashOffset = (dashOffset + 0.4) % 12;

      if (selectionType === 'mask' && pixelMask) {
        const imgW = engine.width();
        const imgH = engine.height();
        const maskImageData = octx.createImageData(imgW, imgH);
        const data = maskImageData.data;

        for (let i = 0; i < pixelMask.length; i++) {
          if (pixelMask[i] === 1) {
            const idx = i * 4;
            data[idx] = 99;
            data[idx + 1] = 102;
            data[idx + 2] = 241;
            data[idx + 3] = 90;
          }
        }
        octx.putImageData(maskImageData, 0, 0);

        if (contourPath) {
          octx.save();
          octx.lineWidth = 1;

          octx.strokeStyle = '#ffffff';
          octx.setLineDash([4, 4]);
          octx.lineDashOffset = -dashOffset;
          octx.stroke(contourPath);

          octx.strokeStyle = '#000000';
          octx.setLineDash([4, 4]);
          octx.lineDashOffset = -dashOffset + 4;
          octx.stroke(contourPath);
          octx.restore();
        }
      } else if (selectionType === 'box') {
        const { x, y, w, h } = selectionRect;

        // Dim outside bounding box
        octx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        octx.beginPath();
        octx.rect(0, 0, overlay.width, overlay.height);
        octx.rect(x, y, w, h);
        octx.fill('evenodd');

        // Bounding box marching ants border
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

        // Render visible sizing handles
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

  // Mouse Interaction Events
  overlay.addEventListener('mousedown', (e) => {
    if (!engine) return;
    const coords = getCanvasCoords(e);

    if (activeTool === 'flood') {
      const tolerance = parseFloat(floodTolerance.value) / 100.0;
      const mask = engine.select_flood_fill(coords.x, coords.y, tolerance);
      setPixelMaskSelection(mask);
      return;
    }

    if (activeTool === 'select') {
      const hit = getHitHandle(coords);

      isDragging = true;
      dragStartCoords = coords;
      initialBox = { ...selectionRect };

      if (hit) {
        activeHandle = hit;
      } else {
        activeHandle = 'new';
        setBoxSelection(coords.x, coords.y, 1, 1);
        initialBox = { x: coords.x, y: coords.y, w: 1, h: 1 };
      }
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!engine || activeTool !== 'select') return;
    const coords = getCanvasCoords(e);

    if (!isDragging && selectionType === 'box') {
      const hit = getHitHandle(coords);
      if (hit === 'move') {
        overlay.style.cursor = 'move';
      } else if (hit) {
        const handles = getHandles();
        overlay.style.cursor = handles[hit].cursor;
      } else {
        overlay.style.cursor = 'crosshair';
      }
      return;
    }

    if (!isDragging) return;

    const dx = coords.x - dragStartCoords.x;
    const dy = coords.y - dragStartCoords.y;

    if (activeHandle === 'new') {
      const nx = Math.min(dragStartCoords.x, coords.x);
      const ny = Math.min(dragStartCoords.y, coords.y);
      const nw = Math.abs(coords.x - dragStartCoords.x);
      const nh = Math.abs(coords.y - dragStartCoords.y);
      setBoxSelection(nx, ny, nw, nh);
      return;
    }

    if (activeHandle === 'move') {
      setBoxSelection(
        initialBox.x + dx,
        initialBox.y + dy,
        initialBox.w,
        initialBox.h
      );
      return;
    }

    let { x, y, w, h } = initialBox;

    if (activeHandle.includes('e')) w += dx;
    if (activeHandle.includes('s')) h += dy;
    if (activeHandle.includes('w')) {
      x += dx;
      w -= dx;
    }
    if (activeHandle.includes('n')) {
      y += dy;
      h -= dy;
    }

    if (w < 0) {
      x += w;
      w = Math.abs(w);
    }
    if (h < 0) {
      y += h;
      h = Math.abs(h);
    }

    setBoxSelection(x, y, w, h);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    activeHandle = null;
  });

  // Numeric Form Input Binding
  [selX, selY, selW, selH].forEach((input) => {
    input.addEventListener('change', () => {
      setBoxSelection(
        parseInt(selX.value, 10) || 0,
        parseInt(selY.value, 10) || 0,
        parseInt(selW.value, 10) || 1,
        parseInt(selH.value, 10) || 1
      );
    });
  });

  floodTolerance.addEventListener('input', (e) => {
    toleranceVal.textContent = `${e.target.value}%`;
  });

  btnClearSelection.onclick = () => {
    if (!engine || !hasSelection) return;

    if (selectionType === 'mask' && pixelMask) {
      engine.clear_mask_selection(pixelMask);
    } else if (selectionType === 'box') {
      engine.clear_selection(
        selectionRect.x,
        selectionRect.y,
        selectionRect.w,
        selectionRect.h
      );
    }

    resetSelection();
    renderViewport();
  };

  btnCropAction.onclick = () => {
    if (!engine || !hasSelection) return;
    engine.crop(
      selectionRect.x,
      selectionRect.y,
      selectionRect.w,
      selectionRect.h
    );
    resetSelection();
    renderViewport();
  };

  btnDeselect.onclick = () => resetSelection();
  btnToggleSelect.onclick = () => setActiveTool('select');
  btnToggleFlood.onclick = () => setActiveTool('flood');

  document.getElementById('btn-reset-original').onclick = () => {
    if (!engine) return;
    engine.reset_to_original();
    resetSelection();
    renderViewport();
  };

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

    try {
      const bytes = engine.encode(format);
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `exported-image.${format}`;

      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  document.getElementById('btn-export-png').onclick = () => exportImage('png', 'image/png');
  document.getElementById('btn-export-jpg').onclick = () => exportImage('jpeg', 'image/jpeg');
  document.getElementById('btn-export-webp').onclick = () => exportImage('webp', 'image/webp');

  drawOverlay();
}

run();
