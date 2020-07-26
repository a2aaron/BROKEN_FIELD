mod bf;
use bf::*;

extern crate pixel_canvas;
extern crate rand;

use pixel_canvas::{
    input::{
        glutin::event::{
            ElementState, KeyboardInput, MouseButton, MouseScrollDelta, VirtualKeyCode,
        },
        Event, MouseState, WindowEvent,
    },
    Canvas, Color, Image,
};
use rand::Rng;

const PIXEL_SIZE: usize = 32;
const INITIAL_SPEED: usize = 500;
const PROGRAM_LENGTH: usize = 100;
fn main() {
    let canvas = Canvas::new(512, 512)
        .title("BROKEN_FIELD")
        .state(State::new())
        .input(|_info, state, event| {
            // println!("new event {:?}", event);
            match event {
                Event::WindowEvent { event, .. } => match event {
                    WindowEvent::MouseInput {
                        button: MouseButton::Left,
                        state: ElementState::Pressed,
                        ..
                    } => {
                        *state = State::new();
                    }
                    WindowEvent::MouseInput {
                        button: MouseButton::Right,
                        state: ElementState::Pressed,
                        ..
                    } => {
                        // restart the program without changing it
                        state.state = bf::BFState::new();
                    }
                    WindowEvent::KeyboardInput {
                        input:
                            KeyboardInput {
                                state: ElementState::Pressed,
                                virtual_keycode: Some(keycode),
                                ..
                            },
                        ..
                    } => {
                        match keycode {
                            VirtualKeyCode::Right => state.index += 1,
                            VirtualKeyCode::Left => state.index = state.index.saturating_sub(1),
                            VirtualKeyCode::Up => state.index = (state.index * 2).min(200_000),
                            VirtualKeyCode::Down => state.index /= 2,
                            _ => (),
                        };
                        println!("Speed: {}", state.index);
                    }
                    _ => (),
                },
                _ => (),
            };
            true
        });

    canvas.render(|state, image| {
        for _ in 0..state.index {
            if !halted(&state.state, &state.program) {
                state.state.step(&state.program, &mut state.input);
            } else {
                break;
            }
        }
        render_image(
            image,
            &state.state,
            *state
                .program
                .instrs
                .get(state.state.program_pointer)
                .unwrap_or(&BFChar::Plus),
        );
    });
}

struct State {
    program: Program,
    state: BFState,
    index: usize,
    mouse: MouseState,
    input: Box<dyn Iterator<Item = i8>>,
}

impl State {
    fn new() -> State {
        let program = random_bf(PROGRAM_LENGTH);
        // let program = from_string("+[>+]");
        println!("{}", to_string(&program.instrs));

        State {
            program,
            state: BFState::new(),
            index: INITIAL_SPEED,
            mouse: MouseState::new(),
            input: Box::new("".as_bytes().iter().cycle().map(|&b| b as i8)),
        }
    }
}

pub fn render_image(image: &mut Image, state: &BFState, instr: BFChar) {
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
                use BFChar::*;
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
