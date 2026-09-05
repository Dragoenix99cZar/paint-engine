import init, { ImageProcessor } from './pkg/paint_engine.js';

async function run() {
  await init();

  const fileInput = document.getElementById('uploader');
  const canvas = document.getElementById('viewport');
  const overlay = document.getElementById('overlay');
  const workspace = document.querySelector('.workspace');
  const ctx = canvas.getContext('2d');
  const octx = overlay.getContext('2d');

  // Controls
  const btnToggleSelect = document.getElementById('btn-toggle-select');
  const btnToggleFlood = document.getElementById('btn-toggle-flood');
  const btnToggleColorRange = document.getElementById('btn-toggle-color-range');

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

  // Zoom & Pan state
  let zoomLevel = 1.0;
  const MIN_ZOOM = 0.1;
  const MAX_ZOOM = 10.0;
  const ZOOM_STEP = 0.1;

  // Selection state
  let selectionType = 'none'; // 'box' or 'mask'
  let hasSelection = false;
  let pixelMask = null;
  let contourPath = null;
  let lastClickCoords = null;

  let dashOffset = 0;
  let isDragging = false;
  let activeHandle = null;
  let dragStartCoords = { x: 0, y: 0 };
  let initialBox = { x: 0, y: 0, w: 0, h: 0 };
  let selectionRect = { x: 0, y: 0, w: 0, h: 0 };

  const HANDLE_SIZE = 10;
  const HIT_PADDING = 6;

  function updateTransform() {
    canvas.style.transform = `scale(${zoomLevel})`;
    overlay.style.transform = `scale(${zoomLevel})`;
    canvas.style.transformOrigin = 'center center';
    overlay.style.transformOrigin = 'center center';
  }

  function setActiveTool(tool) {
    activeTool = activeTool === tool ? 'none' : tool;

    btnToggleSelect.classList.toggle('active', activeTool === 'select');
    btnToggleFlood.classList.toggle('active', activeTool === 'flood');
    btnToggleColorRange.classList.toggle('active', activeTool === 'color-range');

    selectPanel.classList.toggle('hidden', activeTool !== 'select');

    const showTolerance = activeTool === 'flood' || activeTool === 'color-range';
    floodPanel.classList.toggle('hidden', !showTolerance);

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
    lastClickCoords = null;
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

  function recalculateMaskSelection() {
    if (!engine || !lastClickCoords) return;

    const tolerance = parseFloat(floodTolerance.value) / 100.0;
    let mask = null;

    if (activeTool === 'flood') {
      mask = engine.select_flood_fill(lastClickCoords.x, lastClickCoords.y, tolerance);
    } else if (activeTool === 'color-range') {
      mask = engine.select_color_range(lastClickCoords.x, lastClickCoords.y, tolerance);
    }

    if (mask) {
      setPixelMaskSelection(mask);
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

  function getHitHandle(imgCoords) {
    if (selectionType !== 'box' || !hasSelection) return null;

    // Translate bounding box handles into canvas viewport space
    const topLeft = imageToCanvasCoords(selectionRect.x, selectionRect.y);
    const bottomRight = imageToCanvasCoords(
      selectionRect.x + selectionRect.w,
      selectionRect.y + selectionRect.h
    );

    const vx = topLeft.x;
    const vy = topLeft.y;
    const vw = bottomRight.x - topLeft.x;
    const vh = bottomRight.y - topLeft.y;

    // Canvas-space cursor position
    const rect = overlay.getBoundingClientRect();
    const screenX = lastMouseScreenX - rect.left;
    const screenY = lastMouseScreenY - rect.top;

    const vpHandles = {
      nw: { x: vx, y: vy, cursor: 'nwse-resize' },
      n:  { x: vx + vw / 2, y: vy, cursor: 'ns-resize' },
      ne: { x: vx + vw, y: vy, cursor: 'nesw-resize' },
      e:  { x: vx + vw, y: vy + vh / 2, cursor: 'ew-resize' },
      se: { x: vx + vw, y: vy + vh, cursor: 'nwse-resize' },
      s:  { x: vx + vw / 2, y: vy + vh, cursor: 'ns-resize' },
      sw: { x: vx, y: vy + vh, cursor: 'nesw-resize' },
      w:  { x: vx, y: vy + vh / 2, cursor: 'ew-resize' }
    };

    const hitRadius = (HANDLE_SIZE / 2) + HIT_PADDING;

    for (const [key, pos] of Object.entries(vpHandles)) {
      if (Math.abs(screenX - pos.x) <= hitRadius && Math.abs(screenY - pos.y) <= hitRadius) {
        return key;
      }
    }

    if (imgCoords.x >= selectionRect.x && imgCoords.x <= selectionRect.x + selectionRect.w &&
        imgCoords.y >= selectionRect.y && imgCoords.y <= selectionRect.y + selectionRect.h) {
      return 'move';
    }

    return null;
  }

  function imageToCanvasCoords(imgX, imgY) {
    // Queries zoom and pan state implicitly by sampling test points via Rust's transform math
    const vpWidth = overlay.width;
    const vpHeight = overlay.height;

    // Derive canvas positions using Rust coordinate translation inverse:
    // canvas_x = (imgX - center_img_x) * zoom + center_vp_x + pan_x
    // We can pass two reference points or use Rust's canvas_to_image_x inverse formula:
    const centerVpX = vpWidth / 2;
    const centerVpY = vpHeight / 2;
    const centerImgX = engine.width() / 2;
    const centerImgY = engine.height() / 2;

    // Extract zoom from engine by checking canvas_to_image delta across 1px
    const zoom = 1 / (engine.canvas_to_image_x(1, vpWidth) - engine.canvas_to_image_x(0, vpWidth));

    // Extract pan values
    const panX = - (engine.canvas_to_image_x(0, vpWidth) - centerImgX) * zoom - centerVpX;
    const panY = - (engine.canvas_to_image_y(0, vpHeight) - centerImgY) * zoom - centerVpY;

    return {
      x: (imgX - centerImgX) * zoom + centerVpX + panX,
      y: (imgY - centerImgY) * zoom + centerVpY + panY,
      zoom
    };
  }

  function drawOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);

    if (hasSelection && engine) {
      dashOffset = (dashOffset + 0.4) % 12;

      const imgW = engine.width();
      const imgH = engine.height();
      const vpW = overlay.width;
      const vpH = overlay.height;

      if (selectionType === 'mask' && pixelMask) {
        // Create a temporary offscreen canvas for the unscaled mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = imgW;
        maskCanvas.height = imgH;
        const maskCtx = maskCanvas.getContext('2d');

        const maskImageData = maskCtx.createImageData(imgW, imgH);
        const data = maskImageData.data;

        for (let i = 0; i < pixelMask.length; i++) {
          if (pixelMask[i] === 1) {
            const idx = i * 4;
            data[idx] = 99;      // R
            data[idx + 1] = 102; // G
            data[idx + 2] = 241; // B
            data[idx + 3] = 90;  // Alpha
          }
        }
        maskCtx.putImageData(maskImageData, 0, 0);

        // Map image origin (0,0) and image dimensions into transformed viewport canvas bounds
        const origin = imageToCanvasCoords(0, 0);
        const corner = imageToCanvasCoords(imgW, imgH);
        const scaledW = corner.x - origin.x;
        const scaledH = corner.y - origin.y;

        // Draw transformed mask overlay
        octx.imageSmoothingEnabled = false;
        octx.drawImage(maskCanvas, origin.x, origin.y, scaledW, scaledH);

        // Draw marching ants outline over contour path
        if (contourPath) {
          octx.save();
          octx.translate(origin.x, origin.y);
          octx.scale(origin.zoom, origin.zoom);

          octx.lineWidth = 1 / origin.zoom;
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
        // Map selection rectangle from image space to canvas viewport space
        const topLeft = imageToCanvasCoords(selectionRect.x, selectionRect.y);
        const bottomRight = imageToCanvasCoords(
          selectionRect.x + selectionRect.w,
          selectionRect.y + selectionRect.h
        );

        const vx = topLeft.x;
        const vy = topLeft.y;
        const vw = bottomRight.x - topLeft.x;
        const vh = bottomRight.y - topLeft.y;

        // Dim area outside selection box
        octx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        octx.beginPath();
        octx.rect(0, 0, vpW, vpH);
        octx.rect(vx, vy, vw, vh);
        octx.fill('evenodd');

        // Marching ants bounding box
        octx.save();
        octx.lineWidth = 1.5;

        octx.strokeStyle = '#ffffff';
        octx.setLineDash([6, 6]);
        octx.lineDashOffset = -dashOffset;
        octx.strokeRect(vx, vy, vw, vh);

        octx.strokeStyle = '#000000';
        octx.setLineDash([6, 6]);
        octx.lineDashOffset = -dashOffset + 6;
        octx.strokeRect(vx, vy, vw, vh);
        octx.restore();

        // Render handle boxes at transformed positions
        const vpHandles = {
          nw: { x: vx, y: vy },
          n:  { x: vx + vw / 2, y: vy },
          ne: { x: vx + vw, y: vy },
          e:  { x: vx + vw, y: vy + vh / 2 },
          se: { x: vx + vw, y: vy + vh },
          s:  { x: vx + vw / 2, y: vy + vh },
          sw: { x: vx, y: vy },
          w:  { x: vx, y: vy + vh / 2 }
        };

        octx.fillStyle = '#ffffff';
        octx.strokeStyle = '#6366f1';
        octx.lineWidth = 1.5;

        for (const pos of Object.values(vpHandles)) {
          octx.fillRect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
          octx.strokeRect(pos.x - HANDLE_SIZE / 2, pos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        }
      }
    }

    requestAnimationFrame(drawOverlay);
  }

  // Render viewport pixels directly from Rust
  function renderViewport() {
    if (!engine) return;

    const vpWidth = workspace.clientWidth;
    const vpHeight = workspace.clientHeight;

    if (canvas.width !== vpWidth || canvas.height !== vpHeight) {
      canvas.width = vpWidth;
      canvas.height = vpHeight;
      overlay.width = vpWidth;
      overlay.height = vpHeight;
    }

    const rawPixels = engine.render_viewport(vpWidth, vpHeight);
    const imageData = new ImageData(
      new Uint8ClampedArray(rawPixels.buffer),
      vpWidth,
      vpHeight
    );

    ctx.putImageData(imageData, 0, 0);
  }

  // Convert click events on the canvas element into original image coordinates using Rust
  function getCanvasCoords(e) {
    const rect = overlay.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    const imgX = engine.canvas_to_image_x(canvasX, overlay.width);
    const imgY = engine.canvas_to_image_y(canvasY, overlay.height);

    return { x: imgX, y: imgY };
  }

  // --- Keyboard & Wheel Bindings for Zoom & Pan ---

  function changeZoom(delta) {
    if (!engine) return;

    // Route zoom change into Rust engine state
    engine.set_zoom(delta);

    // Re-render viewport to update pixel transforms
    renderViewport();
  }

  window.addEventListener('keydown', (e) => {
    // Zoom in with '+' or '='
    if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      changeZoom(0.1);
    }
    // Zoom out with '-'
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      changeZoom(-0.1);
    }
  });

  // Route zoom and pan scroll events through Rust methods
  workspace.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!engine) return;

    if (e.ctrlKey) {
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      engine.set_zoom(delta);
    } else if (e.shiftKey) {
      const speed = 25;
      engine.pan(e.deltaY < 0 ? speed : -speed, 0);
    } else {
      const speed = 25;
      engine.pan(0, e.deltaY < 0 ? speed : -speed);
    }

    renderViewport();
  }, { passive: false });

  // Mouse Interaction Events
  overlay.addEventListener('mousedown', (e) => {
    if (!engine) return;
    const coords = getCanvasCoords(e);

    if (activeTool === 'flood') {
      lastClickCoords = coords;
      const tolerance = parseFloat(floodTolerance.value) / 100.0;
      const mask = engine.select_flood_fill(coords.x, coords.y, tolerance);
      setPixelMaskSelection(mask);
      return;
    }

    if (activeTool === 'color-range') {
      lastClickCoords = coords;
      const tolerance = parseFloat(floodTolerance.value) / 100.0;
      const mask = engine.select_color_range(coords.x, coords.y, tolerance);
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

  // Define screen position tracking variables near your drag/selection state
  let lastMouseScreenX = 0;
  let lastMouseScreenY = 0;

  window.addEventListener('mousemove', (e) => {
    if (!engine) return;

    // Track global screen positions for getHitHandle calculation
    lastMouseScreenX = e.clientX;
    lastMouseScreenY = e.clientY;
    if (activeTool !== 'select') return;
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

  // Dynamic tolerance slider updates
  floodTolerance.addEventListener('input', (e) => {
    toleranceVal.textContent = `${e.target.value}%`;
    recalculateMaskSelection();
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
  btnToggleColorRange.onclick = () => setActiveTool('color-range');

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

    // Reset engine camera transforms
    engine.reset_transform();

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

  document.getElementById('btn-flip-h').onclick = () => {
    if (!engine) return;
    engine.flip_horizontal();
    resetSelection();
    renderViewport();
  };

  document.getElementById('btn-flip-v').onclick = () => {
    if (!engine) return;
    engine.flip_vertical();
    resetSelection();
    renderViewport();
  };

  document.getElementById('btn-reset-view').onclick = () => {
    if (!engine) return;

    // Resets zoom to 1.0 and pan coordinates to (0, 0) in Rust
    engine.reset_transform();

    // Re-render the canvas to update both viewport pixels and overlay transforms
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
