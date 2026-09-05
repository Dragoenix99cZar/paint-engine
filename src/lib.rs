use image::{DynamicImage, ImageFormat, Rgba};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct ImageProcessor {
    original_img: DynamicImage,
    img: DynamicImage,
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
        })
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
}
