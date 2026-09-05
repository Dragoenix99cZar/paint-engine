use image::{imageops, DynamicImage, ImageFormat};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ImageProcessor {
    img: DynamicImage,
}

#[wasm_bindgen]
impl ImageProcessor {
    /// Loads raw image bytes (e.g., from JS Uint8Array or File input)
    #[wasm_bindgen(constructor)]
    pub fn new(data: &[u8]) -> Result<ImageProcessor, JsValue> {
        let img = image::load_from_memory(data)
            .map_err(|e| JsValue::from_str(&format!("Failed to load image: {}", e)))?;
        Ok(ImageProcessor { img })
    }

    /// Loads raw RGBA pixel data with specified width and height
    pub fn from_rgba(pixels: &[u8], width: u32, height: u32) -> Result<ImageProcessor, JsValue> {
        let buffer = image::RgbaImage::from_raw(width, height, pixels.to_vec())
            .ok_or_else(|| JsValue::from_str("Invalid RGBA buffer dimensions"))?;
        Ok(ImageProcessor {
            img: DynamicImage::ImageRgba8(buffer),
        })
    }

    pub fn width(&self) -> u32 {
        self.img.width()
    }

    pub fn height(&self) -> u32 {
        self.img.height()
    }

    /// Crop image to bounding box
    pub fn crop(&mut self, x: u32, y: u32, width: u32, height: u32) {
        self.img = self.img.crop_imm(x, y, width, height);
    }

    /// Resize image with high-quality resampling (Lanczos3)
    pub fn resize(&mut self, new_width: u32, new_height: u32) {
        self.img =
            self.img
                .resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);
    }

    /// Fast resize using Nearest Neighbor (ideal for pixel art)
    pub fn resize_nearest(&mut self, new_width: u32, new_height: u32) {
        self.img =
            self.img
                .resize_exact(new_width, new_height, image::imageops::FilterType::Nearest);
    }

    /// Rotate image in degrees (supports 90, 180, 270)
    pub fn rotate_90(&mut self) {
        self.img = self.img.rotate90();
    }

    pub fn rotate_180(&mut self) {
        self.img = self.img.rotate180();
    }

    pub fn rotate_270(&mut self) {
        self.img = self.img.rotate270();
    }

    /// Translate canvas with a background shift, filling new space with transparent pixels
    pub fn translate(&mut self, offset_x: i64, offset_y: i64) {
        let w = self.img.width();
        let h = self.img.height();
        let mut new_img = image::RgbaImage::new(w, h);

        imageops::overlay(&mut new_img, &self.img.to_rgba8(), offset_x, offset_y);
        self.img = DynamicImage::ImageRgba8(new_img);
    }

    /// Scale image by factor (e.g. 1.5 = 150%, 0.5 = 50%)
    pub fn scale(&mut self, factor: f32) {
        let new_w = ((self.img.width() as f32) * factor).max(1.0) as u32;
        let new_h = ((self.img.height() as f32) * factor).max(1.0) as u32;
        self.resize(new_w, new_h);
    }

    /// Export raw RGBA buffer to render directly onto HTML Canvas
    pub fn get_rgba_pixels(&self) -> Vec<u8> {
        self.img.to_rgba8().into_raw()
    }

    /// Convert and encode image into format bytes (PNG, JPEG, WebP)
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
}
