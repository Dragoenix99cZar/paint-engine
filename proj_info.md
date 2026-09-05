# Project Context & Agent Handoff Spec

---

## 1. Project Ideation

The goal is to build a high-performance, bloat-free web-based image editor inspired by classic desktop tools like **MS Paint** and **Paint.NET**.

Unlike heavy modern suites (Photoshop, Photopea) or simple wrapper apps, this tool focuses on **instant loading, low footprint, and local processing** for core image manipulation tasks.

### Core Architecture

* **Frontend UI Layer:** Minimal HTML5/CSS, Vanilla JavaScript ES Modules, layered HTML5 Canvas architecture (`viewport` for image rendering, `overlay` for active tool interactions/marquees).
* **Core Processing Engine:** **Rust compiled to WebAssembly (`wasm-bindgen`)** using the Rust `image` crate. All image operations (cropping, transformations, pixel manipulations, encoding) run directly in Rust memory to prevent JS garbage collection lag and high heap allocation overhead.
* **Direct Memory Transfer:** The WASM engine exports raw 32-bit RGBA pixel buffers directly into JS `Uint8ClampedArray` memory to update the canvas via `putImageData` without DOM `Image` conversions.

---

## 2. Alternatives & Technical Comparisons

| Tool / Stack | Architectural Approach | Strengths | Weaknesses / Why Not Chosen |
| --- | --- | --- | --- |
| **Photopea / Photoshop** | Complex WebGL/WASM Engine + Full Layer System | Unmatched feature depth | Heavy initial download, complex UX/UI, high memory overhead |
| **Pure JS Canvas API** | Standard HTML5 2D Context | Zero WASM build setup, tiny bundle | Heavy JS GC pauses, slow flood-fill on 4K images, poor resample filters |
| **C++ / Emscripten WASM** | C++ compiled via Emscripten | Near-native speed, vast C++ image libs (`OpenCV`, `stb`) | More complex build pipeline and memory safety management |
| **Rust + WASM (Selected)** | Rust + `wasm-bindgen` + `image` crate | **Native performance, safe concurrency, tight JS bindings, small binary** | Requires `wasm-pack` build toolchain |

---

## 3. Features & Roadmap Checklist

### Core Manipulations

* [x] Image Loading (File API to Rust memory buffer)
* [x] Canvas Viewport Syncing & Rendering
* [x] Interactive Crop Tool (Toggle mode, Marquee overlay, Numerical inputs, Bounds checking)
* [x] Image Resizing (Lanczos3 high-quality downsampling)
* [x] Rotation (90°, 180°, 270°)
* [x] Canvas Translation & Scaling
* [x] Multi-Format Encoding/Exporting (PNG, JPEG, WebP)
* [ ] Flood Fill / Paint Bucket with adjustable tolerance (WASM)
* [ ] Region Selections (Lasso, Rectangle, Magic Wand)
* [ ] Region Removal & Transparency Fill
* [ ] Local Background Removal (Smart Wand or local Transformers.js / ONNX model)
* [ ] Undo / Redo Memory Manager (Compressed delta stacks in WASM)

---

## 4. Current State: What Has Been Achieved

The project currently has a functioning end-to-end Rust + WASM foundation with an interactive cropping interface:

### 1. WASM Core (`src/lib.rs` & `Cargo.toml`)

* Encapsulated `ImageProcessor` struct maintaining an internal `DynamicImage` instance.
* WASM exports for:
* `new()` / `from_rgba()` constructors.
* `crop(x, y, w, h)`, `resize()`, `resize_nearest()`, `rotate_90()`, `translate()`, `scale()`.
* `get_rgba_pixels()` for zero-copy memory extraction.
* `encode(format)` returning binary `Vec<u8>` arrays for WebP, PNG, JPEG downloads.



### 2. Layered Canvas Viewport (`www/index.html`)

* Dark-mode editor layout with a checkerboard workspace background to highlight transparency.
* Layered dual-canvas design:
* `#viewport`: Displays actual image pixels from WASM.
* `#overlay`: Handles interaction overlays (crop selection boxes, crosshair cursors).



### 3. Interactive Tool Architecture (`www/main.js`)

* **State-Driven Crop Tool:**
* Toggle button controls tool state (`activeTool = 'none' | 'crop'`).
* When active: Cursor switches to `crosshair`, pointer events become active, dark translucent mask appears outside selection.
* Interactive click-and-drag box drawing with live CSS dash-array marching effect.
* Bidirectional sync between mouse drag selection and numerical `X, Y, W, H` inputs.
* Auto-deactivates overlay mode on crop application.



---

## 5. Next Steps: Remaining Tasks

For future agent iterations, prioritize implementation in the following sequence:

1. **Flood Fill (Paint Bucket Tool) in Rust:**
* Implement a stack-based/queue-based 4-way flood fill algorithm inside `src/lib.rs`.
* Support color tolerance thresholds (Euclidean distance on RGBA space).
* Integrate UI color picker and tolerance slider (`0–100%`) in `index.html`.


2. **Region Selection System:**
* Create an offscreen selection mask buffer (`Uint8Array`) in JS/WASM for arbitrary region selections (Lasso / Rectangle).
* Render continuous "marching ants" around selection perimeters in the overlay canvas using `requestAnimationFrame`.


3. **Region Delete & Fill:**
* Allow pressing `Delete` to clear selected regions to transparent (`alpha = 0`) or fill with secondary color.


4. **Background Removal:**
* Phase 1: Smart Magic Wand flood-fill setting alpha = 0.
* Phase 2: In-browser AI removal using `@xenova/transformers` with `RMBG-1.4` (local WebGPU/WASM runtime).


5. **Undo/Redo Stack:**
* Implement a state buffer manager in Rust using `lz4` compression to keep undo history footprint under ~50MB for large image workflows.



---

```
paint-engine
│   Cargo.lock
│   Cargo.toml
│   proj_info.md
│
├───src
│       lib.rs
│   
└───www
    │   index.html
    │   main.js
    │
    └───pkg
            .gitignore
            package.json
            paint_engine.d.ts
            paint_engine.js
            paint_engine_bg.wasm
            paint_engine_bg.wasm.d.ts

                File               Lines               Size
------------------------------------------------------------
     paint_engine.js                 368           11.54  KB
          index.html                 204            5.18  KB
             main.js                 227            6.50  KB
              lib.rs                 109            3.60  KB
------------------------------------------------------------
📄 Total Files        : 4
📏 Total LOC          : 908
💾 Total Size         : 26.81  KB

```

---
Error

When Png or Jpg or Webp btn clicked, error
"The file at 'blob:http://192.168.1.132:8080/f0dfeb11-4ed2-4e81-9b87-0b2ea0a31290' was loaded over an insecure connection. This file should be served over HTTPS."

This error occurs because modern web browsers block automatic file downloads from blob: URLs when accessing your dev server over a local IP address ([http://192.168.1.132:8080](http://192.168.1.132:8080)) without HTTPS.


---
CMD:
wasm-pack build --target web --out-dir www/pkg
