use evobf::bf;
use evobf::bytebeat;

extern crate pixel_canvas;
extern crate rand;

use pixel_canvas::{
    input::{
        glutin::event::{ElementState, KeyboardInput, MouseButton, VirtualKeyCode},
        Event, MouseState, WindowEvent,
    },
    Canvas, Color, Image,
};
use rand::Rng;
// the actual size, in pixels of the window to display
const WINDOW_WIDTH: usize = 512;
const WINDOW_HEIGHT: usize = 512;
// the internal size, in "pixels" of the bytebeat to render
const BYTEBEAT_WIDTH: usize = 512;
const BYTEBEAT_HEIGHT: usize = 512;
// the size of pixels for a brainfuck program
const PIXEL_SIZE: usize = 32;
const INITIAL_SPEED: usize = 500;
const PROGRAM_LENGTH: usize = 100;
fn main() {
    println!("BROKEN_FIELD_START");
    let canvas = Canvas::new(WINDOW_WIDTH, WINDOW_HEIGHT)
        .title("BROKEN_FIELD")
        .state(State::new())
        .input(|info, state, event| {
            pixel_canvas::input::MouseState::handle_input(info, &mut state.mouse, event);
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
                        state.frame = 0;
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
                            VirtualKeyCode::Right => {
                                state.bytebeat_speed += 1;
                                state.brainfuck_speed += 1;
                            }
                            VirtualKeyCode::Left => {
                                state.bytebeat_speed -= 1;
                                state.brainfuck_speed = state.brainfuck_speed.saturating_sub(1);
                            }
                            VirtualKeyCode::Up => {
                                state.bytebeat_speed *= 2;
                                // cap is here so that the program doesnt hang if you set the speed to like, 4 billion
                                state.brainfuck_speed = (state.brainfuck_speed * 2).min(200_000);
                            }
                            VirtualKeyCode::Down => {
                                state.bytebeat_speed /= 2;
                                state.brainfuck_speed /= 2;
                            }
                            _ => (),
                        };

                        match keycode {
                            VirtualKeyCode::Right
                            | VirtualKeyCode::Left
                            | VirtualKeyCode::Up
                            | VirtualKeyCode::Down => println!(
                                "Bytebeat Speed: {} (t = {})",
                                state.bytebeat_speed, state.frame
                            ),
                            _ => (),
                        };
                    }
                    _ => (),
                },
                _ => (),
            };
            true
        });

    canvas.render(|state, image| {
        for screen_y in 0..BYTEBEAT_WIDTH {
            for screen_x in 0..BYTEBEAT_HEIGHT {
                let idx = screen_y * BYTEBEAT_WIDTH + screen_x;
                state.bytebeat_data[idx] = bytebeat::eval_beat(
                    &mut state.stack,
                    &state.bytebeat,
                    state.frame,
                    state.mouse.x as i64,
                    state.mouse.y as i64,
                    screen_x as i64,
                    screen_y as i64,
                )
                .into();
            }
        }

        render_image(image, state.bytebeat_data.as_ref());
        state.frame += state.bytebeat_speed;
        // for _ in 0..state.index {
        //     if !halted(&state.state, &state.program) {
        //         state.state.step(&state.program, &mut state.input);
        //     } else {
        //         break;
        //     }
        // }
        // render_bf(
        //     image,
        //     &state.state,
        //     *state
        //         .program
        //         .instrs
        //         .get(state.state.program_pointer)
        //         .unwrap_or(&BFChar::Plus),
        // );
    });
}
pub struct State {
    pub stack: Vec<bytebeat::Val>,
    pub bytebeat: bytebeat::Program,
    pub program: bf::Program,
    pub state: bf::BFState,
    pub bytebeat_speed: i64,
    pub brainfuck_speed: usize,
    pub mouse: MouseState,
    pub input: Box<dyn Iterator<Item = i8>>,
    pub frame: i64,
    pub bytebeat_data: Box<[u8]>,
}

impl State {
    fn new() -> State {
        let program = bf::random_bf(PROGRAM_LENGTH);
        // let bytebeat = bytebeat::compile(
        //     bytebeat::parse_beat("sx sy << my - my | mx % sx + sx / my & sy | t my - +")
        //         .expect("bepis"),
        // )
        // .expect("conk");
        let bytebeat = bytebeat::random_beat(10);
        // let program = from_string("+[>+]");
        println!("{}", bytebeat);

        State {
            stack: Vec::with_capacity(10),
            bytebeat,
            program,
            state: bf::BFState::new(),
            brainfuck_speed: INITIAL_SPEED,
            mouse: MouseState::new(),
            input: Box::new("".as_bytes().iter().cycle().map(|&b| b as i8)),
            frame: 0,
            bytebeat_speed: 1,
            bytebeat_data: vec![0; BYTEBEAT_WIDTH * BYTEBEAT_HEIGHT].into_boxed_slice(),
        }
    }
}

pub fn render_image(image: &mut Image, values: &[u8]) {
    let width = image.width() as usize;
    let width_scale_factor = image.width() / BYTEBEAT_WIDTH;
    let height_scale_factor = image.height() / BYTEBEAT_HEIGHT;
    for (y, row) in image.chunks_mut(width).enumerate() {
        for (x, pixel) in row.iter_mut().enumerate() {
            let screen_x = x / width_scale_factor;
            let screen_y = y / height_scale_factor;
            let value = values[screen_y * BYTEBEAT_WIDTH + screen_x];
            *pixel = Color {
                r: 0,     //value.wrapping_mul(63),
                g: value, //value.wrapping_mul(65),
                b: 0,     //value.wrapping_mul(67),
            };
        }
    }
}

pub fn render_bytebeat(image: &mut Image, state: &mut State) {
    let width = image.width() as usize;
    for (y, row) in image.chunks_mut(width).enumerate() {
        for (x, pixel) in row.iter_mut().enumerate() {
            let value: u8 = bytebeat::eval_beat(
                &mut state.stack,
                &state.bytebeat,
                state.frame,
                state.mouse.x as i64,
                state.mouse.y as i64,
                x as i64,
                y as i64,
            )
            .into();

            *pixel = Color {
                r: 0,     //value.wrapping_mul(63),
                g: value, //value.wrapping_mul(65),
                b: 0,     //value.wrapping_mul(67),
            };
        }
    }
}

pub fn render_bf(image: &mut Image, state: &bf::BFState, instr: bf::BFChar) {
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
