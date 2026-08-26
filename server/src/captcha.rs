// 图形验证码：点阵字体 + 旋转/噪点/干扰线，输出 PNG base64（与 Node 版一致）
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use rand::Rng;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use crate::config;

const SCALE: i32 = 5;
const COUNT: i32 = 4;
const CHAR_W: i32 = 5 * SCALE; // 25
const CHAR_H: i32 = 7 * SCALE; // 35
const PAD_X: i32 = 18;
const PAD_Y: i32 = 18;
const GAP: i32 = 9;

/// 5x7 点阵字体（去掉易混淆的 0/O/1/I）
fn glyph(ch: char) -> [&'static str; 7] {
    match ch {
        '2' => ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
        '3' => ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
        '4' => ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
        '5' => ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
        '6' => ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
        '7' => ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
        '8' => ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
        '9' => ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
        'A' => ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
        'B' => ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
        'C' => ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
        'D' => ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
        'E' => ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
        'F' => ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
        'G' => ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
        'H' => ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
        'J' => ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
        'K' => ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
        'L' => ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
        'M' => ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
        'N' => ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
        'P' => ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
        'Q' => ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
        'R' => ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
        'S' => ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
        'T' => ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
        'U' => ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
        'V' => ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
        'W' => ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
        'X' => ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
        'Y' => ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
        'Z' => ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
        _ => ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    }
}

const CHARS: &[char] = &[
    '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K',
    'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn set_px(rgb: &mut [u8], width: i32, height: i32, x: f64, y: f64, color: [u8; 3]) {
    let xi = x.round() as i32;
    let yi = y.round() as i32;
    if xi < 0 || yi < 0 || xi >= width || yi >= height {
        return;
    }
    let i = (yi * width + xi) as usize * 3;
    rgb[i] = color[0];
    rgb[i + 1] = color[1];
    rgb[i + 2] = color[2];
}

/// 生成验证码图片，返回 (文字, png 字节)
fn generate_image() -> (String, Vec<u8>) {
    let mut rng = rand::thread_rng();
    let width = PAD_X * 2 + CHAR_W * COUNT + GAP * (COUNT - 1);
    let height = PAD_Y * 2 + CHAR_H;

    // 背景浅色
    let bg = [
        rng.gen_range(238..=248),
        rng.gen_range(238..=248),
        rng.gen_range(243..=252),
    ];
    let mut pixels = vec![0u8; (width * height * 3) as usize];
    for i in 0..(width * height) as usize {
        pixels[i * 3] = bg[0];
        pixels[i * 3 + 1] = bg[1];
        pixels[i * 3 + 2] = bg[2];
    }

    let mut text = String::new();
    for i in 0..COUNT {
        let ch = CHARS[rng.gen_range(0..CHARS.len())];
        text.push(ch);
        let rows = glyph(ch);
        let angle: f64 = rng.gen_range(-0.45..0.45);
        let (sin, cos) = angle.sin_cos();
        let cx = PAD_X + i * (CHAR_W + GAP) + CHAR_W / 2;
        let cy = PAD_Y + CHAR_H / 2;
        let color = [
            rng.gen_range(20..=80),
            rng.gen_range(30..=90),
            rng.gen_range(60..=120),
        ];
        for ry in 0..7 {
            for rx in 0..5 {
                if rows[ry].as_bytes()[rx] == b'1' {
                    // 缩放：每个点 5x5
                    for dy in 0..SCALE {
                        for dx in 0..SCALE {
                            let px = (rx as i32) * SCALE + dx;
                            let py = (ry as i32) * SCALE + dy;
                            let x = (cx - CHAR_W / 2 + px) as f64;
                            let y = (cy - CHAR_H / 2 + py) as f64;
                            let ddx = x - cx as f64;
                            let ddy = y - cy as f64;
                            let rxx = cx as f64 + ddx * cos - ddy * sin;
                            let ryy = cy as f64 + ddx * sin + ddy * cos;
                            set_px(&mut pixels, width, height, rxx, ryy, color);
                        }
                    }
                }
            }
        }
    }

    // 干扰线
    for _ in 0..5 {
        let lc = [
            rng.gen_range(120..=200),
            rng.gen_range(120..=200),
            rng.gen_range(130..=210),
        ];
        let mut x = rng.gen_range(0..width / 3);
        let mut y = rng.gen_range(0..height);
        let step = rng.gen_range(8..=20);
        while x < width && y >= 0 && y < height {
            set_px(&mut pixels, width, height, x as f64, y as f64, lc);
            x += step;
            y += rng.gen_range(-2..=2);
        }
    }

    // 噪点
    for _ in 0..220 {
        let x = rng.gen_range(0..width);
        let y = rng.gen_range(0..height);
        set_px(
            &mut pixels,
            width,
            height,
            x as f64,
            y as f64,
            [
                rng.gen_range(80..=210),
                rng.gen_range(80..=210),
                rng.gen_range(90..=210),
            ],
        );
    }

    (text, encode_png(width as u32, height as u32, &pixels))
}

/// 用 png crate 编码 RGB 数据
fn encode_png(width: u32, height: u32, rgb: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgb);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("PNG header 失败");
        writer.write_image_data(rgb).expect("PNG 写入失败");
    }
    out
}

struct Entry {
    text: String,
    expires_ms: i64,
}

#[derive(Clone, Default)]
pub struct CaptchaStore {
    inner: Arc<Mutex<HashMap<String, Entry>>>,
}

impl CaptchaStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// 签发验证码，返回 (id, dataURL)
    pub fn issue(&self) -> (String, String) {
        let (text, png) = generate_image();
        let mut id = [0u8; 16];
        rand::thread_rng().fill(&mut id);
        let id = hex::encode(id);
        let expires = now_ms() + config::CAPTCHA_TTL_MS;

        let mut map = self.inner.lock().unwrap();
        map.retain(|_, e| e.expires_ms > now_ms()); // 清理过期
        map.insert(id.clone(), Entry { text, expires_ms: expires });
        let image = format!("data:image/png;base64,{}", STANDARD.encode(&png));
        (id, image)
    }

    /// 校验并消费（一次性）
    pub fn verify(&self, id: &str, answer: &str) -> bool {
        let mut map = self.inner.lock().unwrap();
        if let Some(e) = map.remove(id) {
            if e.expires_ms > now_ms() {
                return e.text.eq_ignore_ascii_case(answer.trim());
            }
        }
        false
    }
}
