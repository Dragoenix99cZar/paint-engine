use image::{DynamicImage, GenericImageView, ImageBuffer, ImageFormat, Rgba, RgbaImage};
use std::collections::VecDeque;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ImageProcessor {
    original_img: DynamicImage,
    img: DynamicImage,
    // Camera Transform State
    zoom: f32,
    pan_x: f32, // Offset in canvas coordinates
    pan_y: f32,
}

#[wasm_bindgen]
impl ImageProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(data: &[u8]) -> Result<ImageProcessor, JsValue> {
        let img = image::load_from_memory(data)
            .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;
        Ok(ImageProcessor {
            original_img: img.clone(),
            img,
            zoom: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
        })
    }

    // --- Transform Controls ---

    pub fn set_zoom(&mut self, delta: f32) {
        self.zoom = (self.zoom + delta).clamp(0.1, 10.0);
    }

    pub fn pan(&mut self, dx: f32, dy: f32) {
        self.pan_x += dx;
        self.pan_y += dy;
    }

    pub fn reset_transform(&mut self) {
        self.zoom = 1.0;
        self.pan_x = 0.0;
        self.pan_y = 0.0;
    }

    // --- Coordinate Translation ---
    // Converts canvas pixel locations into source image coordinates

    pub fn canvas_to_image_x(&self, canvas_x: f32, canvas_w: f32) -> i32 {
        let center_vp_x = canvas_w / 2.0;
        let center_img_x = self.img.width() as f32 / 2.0;
        ((canvas_x - center_vp_x - self.pan_x) / self.zoom + center_img_x).floor() as i32
    }

    pub fn canvas_to_image_y(&self, canvas_y: f32, canvas_h: f32) -> i32 {
        let center_vp_y = canvas_h / 2.0;
        let center_img_y = self.img.height() as f32 / 2.0;
        ((canvas_y - center_vp_y - self.pan_y) / self.zoom + center_img_y).floor() as i32
    }

    // --- Render Transformed Viewport ---
    // Draws source image pixels scaled/offset into a target canvas viewport size

    pub fn render_viewport(&self, viewport_w: u32, viewport_h: u32) -> Vec<u8> {
        let mut out_buf: RgbaImage = ImageBuffer::new(viewport_w, viewport_h);

        let img_w = self.img.width() as f32;
        let img_h = self.img.height() as f32;
        let vp_w = viewport_w as f32;
        let vp_h = viewport_h as f32;

        let center_vp_x = vp_w / 2.0;
        let center_vp_y = vp_h / 2.0;
        let center_img_x = img_w / 2.0;
        let center_img_y = img_h / 2.0;

        for vy in 0..viewport_h {
            for vx in 0..viewport_w {
                let ix = ((vx as f32 - center_vp_x - self.pan_x) / self.zoom + center_img_x).floor()
                    as i32;
                let iy = ((vy as f32 - center_vp_y - self.pan_y) / self.zoom + center_img_y).floor()
                    as i32;

                if ix >= 0
                    && ix < self.img.width() as i32
                    && iy >= 0
                    && iy < self.img.height() as i32
                {
                    let pixel = self.img.get_pixel(ix as u32, iy as u32);
                    out_buf.put_pixel(vx, vy, pixel);
                } else {
                    out_buf.put_pixel(vx, vy, Rgba([0, 0, 0, 0]));
                }
            }
        }

        out_buf.into_raw()
    }

    pub fn reset_to_original(&mut self) {
        self.img = self.original_img.clone();
    }

    pub fn width(&self) -> u32 {
        self.img.width()
    }

    pub fn height(&self) -> u32 {
        self.img.height()
    }

    pub fn flip_horizontal(&mut self) {
        self.img = self.img.fliph();
    }

    pub fn flip_vertical(&mut self) {
        self.img = self.img.flipv();
    }

    pub fn select_flood_fill(&self, start_x: u32, start_y: u32, tolerance: f32) -> Vec<u8> {
        let width = self.img.width();
        let height = self.img.height();
        let size = (width * height) as usize;

        let mut mask = vec![0u8; size];

        if start_x >= width || start_y >= height {
            return mask;
        }

        let rgba_img = self.img.to_rgba8();
        let target = rgba_img.get_pixel(start_x, start_y).0;

        let mut queue = VecDeque::new();
        let start_idx = (start_y * width + start_x) as usize;

        queue.push_back((start_x, start_y));
        mask[start_idx] = 1;

        let max_dist_sq = (tolerance * 255.0 * 2.0).powi(2);

        while let Some((cx, cy)) = queue.pop_front() {
            let neighbors = [
                (cx.wrapping_sub(1), cy),
                (cx + 1, cy),
                (cx, cy.wrapping_sub(1)),
                (cx, cy + 1),
            ];

            for (nx, ny) in neighbors {
                if nx < width && ny < height {
                    let idx = (ny * width + nx) as usize;
                    if mask[idx] == 0 {
                        let current = rgba_img.get_pixel(nx, ny).0;

                        let dr = target[0] as f32 - current[0] as f32;
                        let dg = target[1] as f32 - current[1] as f32;
                        let db = target[2] as f32 - current[2] as f32;
                        let da = target[3] as f32 - current[3] as f32;

                        let dist_sq = dr * dr + dg * dg + db * db + da * da;

                        if dist_sq <= max_dist_sq {
                            mask[idx] = 1;
                            queue.push_back((nx, ny));
                        }
                    }
                }
            }
        }

        mask
    }

    pub fn clear_mask_selection(&mut self, mask: &[u8]) {
        let width = self.img.width();
        let height = self.img.height();
        let mut rgba_img = self.img.to_rgba8();

        for y in 0..height {
            for x in 0..width {
                let idx = (y * width + x) as usize;
                if idx < mask.len() && mask[idx] == 1 {
                    rgba_img.put_pixel(x, y, Rgba([0, 0, 0, 0]));
                }
            }
        }
        self.img = DynamicImage::ImageRgba8(rgba_img);
    }

    pub fn crop(&mut self, x: u32, y: u32, width: u32, height: u32) {
        self.img = self.img.crop_imm(x, y, width, height);
    }

    pub fn rotate_90(&mut self) {
        self.img = self.img.rotate90();
    }

    pub fn clear_selection(&mut self, x: u32, y: u32, width: u32, height: u32) {
        let mut rgba_img = self.img.to_rgba8();
        let img_w = self.img.width();
        let img_h = self.img.height();

        for py in y..std::cmp::min(y + height, img_h) {
            for px in x..std::cmp::min(x + width, img_w) {
                rgba_img.put_pixel(px, py, Rgba([0, 0, 0, 0]));
            }
        }
        self.img = DynamicImage::ImageRgba8(rgba_img);
    }

    pub fn get_rgba_pixels(&self) -> Vec<u8> {
        self.img.to_rgba8().into_raw()
    }

    pub fn encode(&self, format: &str) -> Result<Vec<u8>, JsValue> {
        let target_format = match format.to_lowercase().as_str() {
            "png" => ImageFormat::Png,
            "jpeg" | "jpg" => ImageFormat::Jpeg,
            "webp" => ImageFormat::WebP,
            _ => return Err(JsValue::from_str("Unsupported format")),
        };

        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);

        self.img
            .write_to(&mut cursor, target_format)
            .map_err(|e| JsValue::from_str(&format!("Encoding error: {}", e)))?;

        Ok(buffer)
    }

    pub fn select_color_range(&self, target_x: u32, target_y: u32, tolerance: f32) -> Vec<u8> {
        let width = self.img.width();
        let height = self.img.height();
        let size = (width * height) as usize;
        let mut mask = vec![0u8; size];

        if target_x >= width || target_y >= height {
            return mask;
        }

        let rgba_img = self.img.to_rgba8();
        let target = rgba_img.get_pixel(target_x, target_y).0;
        let max_dist_sq = (tolerance * 255.0 * 2.0).powi(2);

        let pixels = rgba_img.as_raw();

        for i in 0..size {
            let px_idx = i * 4;
            let dr = target[0] as f32 - pixels[px_idx] as f32;
            let dg = target[1] as f32 - pixels[px_idx + 1] as f32;
            let db = target[2] as f32 - pixels[px_idx + 2] as f32;
            let da = target[3] as f32 - pixels[px_idx + 3] as f32;

            let dist_sq = dr * dr + dg * dg + db * db + da * da;

            if dist_sq <= max_dist_sq {
                mask[i] = 1;
            }
        }

        mask
    }
}
