```
===================================================================================================
        
        __________        .__        __    ___________              .__               
        \______   \_____  |__| _____/  |_  \_   _____/ ____    ____ |__| ____   ____  
         |     ___/\__  \ |  |/    \   __\  |    __)_ /    \  / ___\|  |/    \_/ __ \ 
         |    |     / __ \|  |   |  \  |    |        \   |  \/ /_/  >  |   |  \  ___/ 
         |____|    (____  /__|___|  /__|   /_______  /___|  /\___  /|__|___|  /\___  >
                        \/        \/               \/     \//_____/         \/     \/ 
        
       High-Performance, Bloat-Free Web Image Processing Engine
===================================================================================================
```
### 1. Overview

  A lightweight, ultra-fast web-based image editor inspired by MS Paint and Paint.NET. Built for 
  instant loading and local execution via a direct Rust/WASM high-performance pixel pipeline.

```
      +----------------------------------------------------------------------------+
      |  HTML5 Workspace (Layered Viewport / Overlay Canvas)                       |
      +----------------------------------------------------------------------------+
                                            ||
                             Zero-Copy Direct Memory Access
                                            ||
      +----------------------------------------------------------------------------+
      |  Rust Core (WASM / `image` crate)                                          |
      |  * Image Buffers   * Transformations   * Viewport Math   * Encoders        |
      +----------------------------------------------------------------------------+
```


### 2. Architecture

- Frontend           HTML5 / CSS3 / Vanilla JS (ES Modules)[cite: 6]
- WASM Core          Rust (`wasm-bindgen` + `image` crate)[cite: 6]
- Memory Sync        Zero-copy 32-bit RGBA direct memory transfer[cite: 6]
- Build Tool         `wasm-pack build --target web --out-dir www/pkg`[cite: 6]
---

### 3. Tech Comparison

```
  +--------------------+----------------------------+-----------------------+-----------------------+
  | Stack              | Approach                   | Advantages            | Drawbacks             |
  +--------------------+----------------------------+-----------------------+-----------------------+
  | Photopea           | Heavy WebGL/WASM + Layers  | Full Feature Depth    | Bloated, High Memory  |
  | Pure JS Canvas     | HTML5 2D Context           | Zero Setup            | GC Lag, Slow Loops    |
  | C++ / Emscripten   | Native C++ WASM            | High Performance      | Complex Pipeline      |
  | Rust + WASM (Ours) | Rust + `wasm-bindgen`      | Native Speed, Safe    | Toolchain Req.        |
  +--------------------+----------------------------+-----------------------+-----------------------+
```
---

### 4. Feature Matrix

  Completed Core Manipulations:
   [x] Memory Load & Direct Canvas Render    [x] Rotations (90 / 180 / 270)
   [x] Bounding Box & Interactive Crop       [x] High-Quality Resampling
   [x] Zoom, Pan & Coordinate Mapping        [x] Multi-format Exports (PNG/JPG/WebP)

  Completed Selection Tools:
   [X] Flood Fill / Paint Bucket (WASM)     [X] Adjustable Tolerance Mapping[cite: 6]
   [X] Color Range Selector                 [X] Transformed Overlay & Ants Syncing

  Roadmap & In Progress[cite: 6]:
   [ ] Lasso / Magic Wand Region Selections[cite: 6]   [ ] RMBG-1.4 Local AI BG Removal[cite: 6]
   [ ] Selection Clearing & Transparency[cite: 6]     [ ] LZ4 Compressed Undo/Redo Stacks[cite: 6]

```
  [ Project Structure ] -------------------------------------------------------------------------

  paint-engine
  |-- Cargo.toml / Cargo.lock
  |-- proj_info.md[cite: 6]
  |-- src/
  |   +-- lib.rs                  <-- Rust WASM ImageProcessor Implementation[cite: 6]
  `-- www/
      |-- index.html              <-- Workspace Layout & Layered Canvas Setup[cite: 6]
      |-- main.js                 <-- Tool Controller & Viewport Sync[cite: 6]
      `-- pkg/                    <-- WebAssembly Generated Outputs[cite: 6]


  [ Getting Started ] ---------------------------------------------------------------------------

  1. Build WebAssembly Module[cite: 6]:
     $ wasm-pack build --target web --out-dir www/pkg[cite: 6]

  2. Host Workspace:
     $ npx serve www

  * Note: Secure Context (HTTPS or localhost) is required for Blob downloads in modern browsers[cite: 6].

===================================================================================================

```
