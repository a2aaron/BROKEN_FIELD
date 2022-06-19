use broken_field::{bf, bytebeat, fractal};

use num_complex::Complex;
use pixel_canvas::{Color, Image};
use rayon::prelude::*;

use crate::{Controls, Inputs};

// the internal size, in "pixels" of the bytebeat to render
const BYTEBEAT_WIDTH: usize = 512;
const BYTEBEAT_HEIGHT: usize = 512;

// the size of pixels for a brainfuck program
const PIXEL_SIZE: usize = 32;
const PROGRAM_LENGTH: usize = 20;
const MUTATION_CHANCE: f32 = 3.0 / PROGRAM_LENGTH as f32;

pub trait Art {
    // Reset the state of this Art to the beginning
    fn reset(&mut self);
    // Mutate this piece of Art, producing a similar but different piece of Art
    fn mutate(&self) -> Box<dyn Art>;
    // Update the internal state, called once per frame
    fn update(&mut self, speed: i64, input: Inputs);
    // Render the internal state to an Image
    fn render(&self, image: &mut Image);
    // Handle an input (optional, defaults to doing nothing)
    fn handle_input(&mut self, _control: Controls) {}
}

pub struct BrainfuckArt {
    pub program: bf::Program,
    pub state: bf::BFState,
    pub input: Box<dyn Iterator<Item = i8>>,
}

impl BrainfuckArt {
    pub fn new_from(program: bf::Program) -> BrainfuckArt {
        println!("{}", program);

        BrainfuckArt {
            program,
            state: bf::BFState::new(),
            input: Box::new("Hello, world!".as_bytes().iter().cycle().map(|&b| b as i8)),
        }
    }

    pub fn new_random() -> BrainfuckArt {
        let program = bf::random_bf(PROGRAM_LENGTH);
        BrainfuckArt::new_from(program)
    }
}

impl Art for BrainfuckArt {
    fn reset(&mut self) {
        self.state = bf::BFState::new();
        self.input = Box::new("Hello, world!".as_bytes().iter().cycle().map(|&b| b as i8));
    }

    fn update(&mut self, speed: i64, _: Inputs) {
        let speed = speed.clamp(0, 2_000_000) as usize;
        for _ in 0..speed {
            if !bf::halted(&self.state, &self.program) {
                self.state.step(&self.program, self.input.as_mut());
            } else {
                break;
            }
        }
    }

    fn render(&self, image: &mut Image) {
        let instr = *self
            .program
            .instrs
            .get(self.state.program_pointer)
            .unwrap_or(&bf::BFChar::Plus);

        render_bf(image, &self.state, instr);
    }

    fn mutate(&self) -> Box<dyn Art> {
        let program = bf::mutate(&self.program, MUTATION_CHANCE);
        Box::new(BrainfuckArt::new_from(program)) as Box<dyn Art>
    }
}

pub struct BytebeatArt {
    pub program: bytebeat::Program,
    pub image_data: Box<[u8]>,
    pub frame: i64,
}

impl BytebeatArt {
    pub fn new_from(program: bytebeat::Program) -> BytebeatArt {
        println!("{}", program);

        BytebeatArt {
            program,
            image_data: vec![0; BYTEBEAT_WIDTH * BYTEBEAT_HEIGHT].into_boxed_slice(),
            frame: 0,
        }
    }

    pub fn new_random() -> BytebeatArt {
        BytebeatArt::new_from(bytebeat::random_beat(PROGRAM_LENGTH))
    }
}

impl Art for BytebeatArt {
    fn reset(&mut self) {
        self.frame = 0;
    }

    fn mutate(&self) -> Box<dyn Art> {
        Box::new(BytebeatArt::new_from(bytebeat::mutate(
            &self.program,
            MUTATION_CHANCE,
        )))
    }

    fn update(&mut self, speed: i64, inputs: Inputs) {
        let t = self.frame;
        let program = &self.program;
        // Iterate over the image data, rendering the bytebeat to the internal image data
        self.image_data
            .par_chunks_mut(BYTEBEAT_WIDTH)
            .enumerate()
            .for_each_init(
                || Vec::with_capacity(32),
                |stack, (screen_y, row)| {
                    for screen_x in 0..BYTEBEAT_HEIGHT {
                        row[screen_x] = bytebeat::eval_beat(
                            stack,
                            program,
                            t,
                            inputs.mouse_x,
                            inputs.mouse_y,
                            screen_x as i64,
                            screen_y as i64,
                            inputs.key_x,
                            inputs.key_y,
                        )
                        .into();
                    }
                },
            );
        self.frame += speed;
    }

    fn render(&self, image: &mut Image) {
        render_bytebeat(image, &self.image_data);
    }
}

struct ComplexCoordinateGrid {
    corner: Complex<f64>,
    height: f64,
    width: f64,
}

impl ComplexCoordinateGrid {
    fn new() -> ComplexCoordinateGrid {
        ComplexCoordinateGrid {
            corner: Complex { re: -2.0, im: -2.0 },
            height: 4.0,
            width: 4.0,
        }
    }

    fn to_coordinate(&self, x_percent: f64, y_percent: f64) -> Complex<f64> {
        let re = self.corner.re + self.width * x_percent;
        let im = self.corner.im + self.height * y_percent;
        Complex { re, im }
    }
}

pub struct Mandelbrot {
    grid: ComplexCoordinateGrid,
    color_scheme: colorgrad::Gradient,
}

impl Mandelbrot {
    pub fn new() -> Mandelbrot {
        Mandelbrot {
            grid: ComplexCoordinateGrid::new(),
            color_scheme: colorgrad::rainbow(),
        }
    }

    pub fn get_color(&self, width: usize, height: usize, x: usize, y: usize) -> Color {
        let x_percent = x as f64 / width as f64;
        let y_percent = y as f64 / height as f64;
        let complex = self.grid.to_coordinate(x_percent, y_percent);
        match fractal::evaluate_mandelbrot(complex, 100, 2.0) {
            None => Color::BLACK,
            Some(iter) => {
                let iter_percent = iter as f64 / 100.0;
                let (r, g, b, _) = self.color_scheme.repeat_at(iter_percent).rgba_u8();
                Color { r, g, b }
            }
        }
    }
}

impl Art for Mandelbrot {
    fn reset(&mut self) {
        self.grid = ComplexCoordinateGrid::new();
    }

    fn mutate(&self) -> Box<dyn Art> {
        Box::new(Mandelbrot::new())
    }

    fn update(&mut self, _speed: i64, _input: Inputs) {}

    fn render(&self, image: &mut Image) {
        let width = image.width();
        let height = image.height();
        for (y, row) in image.chunks_mut(width).enumerate() {
            for (x, pixel) in row.iter_mut().enumerate() {
                *pixel = self.get_color(width, height, x, y);
            }
        }
    }
}

fn render_bytebeat(image: &mut Image, values: &[u8]) {
    let width = image.width() as usize;
    let width_scale_factor = image.width() / BYTEBEAT_WIDTH;
    let height_scale_factor = image.height() / BYTEBEAT_HEIGHT;
    image
        .par_chunks_mut(width)
        .enumerate()
        .for_each(|(y, row)| {
            row.par_iter_mut().enumerate().for_each(|(x, pixel)| {
                let screen_x = x / width_scale_factor;
                let screen_y = y / height_scale_factor;
                let value = values[screen_y * BYTEBEAT_WIDTH + screen_x];
                *pixel = Color {
                    r: 0,
                    g: value,
                    b: 0,
                };
            })
        })
}

fn render_bf(image: &mut Image, state: &bf::BFState, instr: bf::BFChar) {
    let width = image.width() as usize;
    for (y, row) in image.chunks_mut(width).enumerate() {
        for (x, pixel) in row.iter_mut().enumerate() {
            let megapixel_x = x / PIXEL_SIZE;
            let megapixel_y = y / PIXEL_SIZE;
            let megapixel_width = width / PIXEL_SIZE;
            let i = megapixel_y * megapixel_width + megapixel_x;

            let subpixel_x = x - megapixel_x * PIXEL_SIZE;
            let subpixel_y = y - megapixel_y * PIXEL_SIZE;
            let edge_of_megapixel = subpixel_x == 0
                || subpixel_y == 0
                || subpixel_x == PIXEL_SIZE - 1
                || subpixel_y == PIXEL_SIZE - 1;
            let draw_pointer = i == state.memory_pointer;
            if draw_pointer && edge_of_megapixel {
                use bf::BFChar::*;
                *pixel = match instr {
                    Plus => Color { r: 0, g: 255, b: 0 },
                    Minus => Color { r: 255, g: 0, b: 0 },
                    Left => Color {
                        r: 255,
                        g: 128,
                        b: 128,
                    },
                    Right => Color {
                        r: 128,
                        g: 255,
                        b: 128,
                    },
                    StartLoop => Color {
                        r: 0,
                        g: 128,
                        b: 255,
                    },
                    EndLoop => Color {
                        r: 255,
                        g: 128,
                        b: 0,
                    },
                    Input => Color {
                        r: 255,
                        g: 255,
                        b: 0,
                    },
                    Output => Color {
                        r: 0,
                        g: 255,
                        b: 255,
                    },
                };
            } else {
                let value = *state.memory.get(i).unwrap_or(&0) as u8;
                *pixel = Color {
                    r: value.wrapping_mul(63),
                    g: value.wrapping_mul(65),
                    b: value.wrapping_mul(67),
                };
            }
        }
    }
}
