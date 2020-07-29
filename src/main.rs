use evobf::bf;
use evobf::bytebeat;

use pixel_canvas::{
    input::{
        glutin::event::{ElementState, KeyboardInput, MouseButton, VirtualKeyCode},
        Event, MouseState, WindowEvent,
    },
    Canvas, Color, Image,
};
use rand::Rng;
use rayon::prelude::*;

// the actual size, in pixels of the window to display
const WINDOW_WIDTH: usize = 1024;
const WINDOW_HEIGHT: usize = 1024;
// the internal size, in "pixels" of the bytebeat to render
const BYTEBEAT_WIDTH: usize = 1024;
const BYTEBEAT_HEIGHT: usize = 1024;
// the size of pixels for a brainfuck program
const PIXEL_SIZE: usize = 32;
const INITIAL_SPEED: usize = 500;
const PROGRAM_LENGTH: usize = 20;
fn main() {
    println!("BROKEN_FIELD_START");
    let canvas = Canvas::new(WINDOW_WIDTH, WINDOW_HEIGHT)
        .title("BROKEN_FIELD")
        .state(State::new())
        .input(|info, state, event| {
            pixel_canvas::input::MouseState::handle_input(info, &mut state.mouse, event);
            // println!("new event {:?}", event);
            match event {
                Event::WindowEvent { event, .. } => {
                    if let Some(control) = Controls::from_event(event) {
                        state.bytebeat.handle_input(control);
                        match control {
                            Controls::Faster
                            | Controls::VeryFaster
                            | Controls::Slower
                            | Controls::VerySlower => println!(
                                "Speed = {} (t = {})",
                                state.bytebeat.speed, state.bytebeat.frame
                            ),
                            _ => (),
                        }
                    }
                }
                _ => (),
            }
            true
        });

    canvas.render(|state, image| {
        // let start = std::time::Instant::now();
        state.bytebeat.render(image, &state.mouse);
        state.bytebeat.frame += state.bytebeat.speed;
        // println!("Time: {:?}", start.elapsed());
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

#[derive(Debug, Copy, Clone)]
enum Controls {
    New,
    Restart,
    Next,
    Prev,
    Mutate,
    VerySlower,
    Slower,
    Faster,
    VeryFaster,
}

impl Controls {
    fn from_event(event: &WindowEvent) -> Option<Controls> {
        use Controls::*;
        use VirtualKeyCode::*;
        match event {
            WindowEvent::MouseInput {
                button: MouseButton::Left,
                state: ElementState::Released,
                ..
            } => Some(New),
            WindowEvent::MouseInput {
                button: MouseButton::Right,
                state: ElementState::Released,
                ..
            } => Some(Restart),
            WindowEvent::KeyboardInput {
                input:
                    KeyboardInput {
                        state: ElementState::Pressed,
                        virtual_keycode: Some(keycode),
                        ..
                    },
                ..
            } => match keycode {
                Right => Some(Faster),
                Left => Some(Slower),
                Up => Some(VeryFaster),
                Down => Some(VerySlower),
                Z => Some(Prev),
                X => Some(Next),
                M => Some(Mutate),
                _ => None,
            },
            _ => None,
        }
    }
}

struct State {
    pub bytebeat: BytebeatState,
    pub brainfuck: Brainfuck,
    pub mouse: MouseState,
}

impl State {
    fn new() -> State {
        State {
            bytebeat: BytebeatState::new(),
            brainfuck: Brainfuck::new(),
            mouse: MouseState::new(),
        }
    }
}

struct Brainfuck {
    pub program: bf::Program,
    pub state: bf::BFState,
    pub speed: usize,
    pub input: Box<dyn Iterator<Item = i8>>,
}

impl Brainfuck {
    fn new() -> Brainfuck {
        // let program = from_string("+[>+]");
        let program = bf::random_bf(PROGRAM_LENGTH);
        Brainfuck {
            program,
            state: bf::BFState::new(),
            speed: INITIAL_SPEED,
            input: Box::new("Hello, world!".as_bytes().iter().cycle().map(|&b| b as i8)),
        }
    }

    fn handle_input(&mut self, control: Controls) {
        use Controls::*;
        match control {
            New => {
                self.program = bf::random_bf(PROGRAM_LENGTH);
            }
            Restart => (),
            Next => unimplemented!(),
            Prev => unimplemented!(),
            Mutate => unimplemented!(),
            VerySlower => self.speed /= 2,
            Slower => self.speed = self.speed.saturating_sub(1),
            Faster => self.speed += 1,
            VeryFaster => self.speed = (self.speed * 2).max(2_000_000),
        }

        match control {
            New | Restart | Next | Prev | Mutate => {
                self.state = bf::BFState::new();
                self.speed = 1;
            }
            _ => (),
        }
    }

    fn render(&mut self, image: &mut Image) {
        let instr = *self
            .program
            .instrs
            .get(self.state.program_pointer)
            .unwrap_or(&bf::BFChar::Plus);

        render_bf(image, &self.state, instr);
    }
}

struct BytebeatState {
    pub stack: Vec<bytebeat::Val>,
    pub bytebeats: Vec<bytebeat::Program>,
    pub image_data: Box<[u8]>,
    pub index: usize,
    pub frame: i64,
    pub speed: i64,
}

impl BytebeatState {
    fn new() -> BytebeatState {
        // let bytebeat = bytebeat::compile(
        //     bytebeat::parse_beat("t sy my - sx mx - ^ mx - my + /").expect("bepis"),
        // )
        // .expect("conk");
        let bytebeat = bytebeat::random_beat(PROGRAM_LENGTH);
        println!("{}", bytebeat);

        BytebeatState {
            stack: Vec::with_capacity(PROGRAM_LENGTH),
            bytebeats: vec![bytebeat],
            image_data: vec![0; BYTEBEAT_WIDTH * BYTEBEAT_HEIGHT].into_boxed_slice(),
            index: 0,
            frame: 0,
            speed: 1,
        }
    }

    fn handle_input(&mut self, control: Controls) {
        use Controls::*;
        match control {
            New => self.bytebeats.push(bytebeat::random_beat(PROGRAM_LENGTH)),
            Restart => (),
            Next => self.index = (self.index + 1).min(self.bytebeats.len() - 1),
            Prev => self.index = self.index.saturating_sub(1),
            Mutate => self
                .bytebeats
                .push(bytebeat::mutate(&self.bytebeats[self.index], 0.1)),
            VerySlower => self.speed /= 2,
            Slower => self.speed -= 1,
            Faster => self.speed += 1,
            VeryFaster => self.speed *= 2,
        }

        // Go to the current bytebeat
        match control {
            New | Mutate => self.index = self.bytebeats.len() - 1,
            _ => (),
        }

        // "Reset" the current bytebeat
        match control {
            New | Restart | Next | Prev | Mutate => {
                self.frame = 0;
                self.speed = 1;
                println!("{}", self.bytebeats[self.index]);
            }
            _ => (),
        }
    }

    fn render(&mut self, image: &mut Image, mouse: &MouseState) {
        let program = &self.bytebeats[self.index];
        let t = self.frame;
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
                            mouse.x as i64,
                            mouse.y as i64,
                            screen_x as i64,
                            screen_y as i64,
                        )
                        .into();
                    }
                },
            );

        render_image(image, self.image_data.as_ref());
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
