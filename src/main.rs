use evobf::bf;
use evobf::bytebeat;

use pixel_canvas::{
    input::{
        glutin::event::{ElementState, KeyboardInput, MouseButton, VirtualKeyCode},
        Event, MouseState, WindowEvent,
    },
    Canvas, Color, Image,
};
use rayon::prelude::*;
use std::io::Read;

// the actual size, in pixels of the window to display
const WINDOW_WIDTH: usize = 512;
const WINDOW_HEIGHT: usize = 512;
// the internal size, in "pixels" of the bytebeat to render
const BYTEBEAT_WIDTH: usize = 512;
const BYTEBEAT_HEIGHT: usize = 512;
// the size of pixels for a brainfuck program
const PIXEL_SIZE: usize = 32;
const INITIAL_SPEED: usize = 500;
const PROGRAM_LENGTH: usize = 20;
const MUTATION_CHANCE: f32 = 3.0 / PROGRAM_LENGTH as f32;
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
                    }

                    if let WindowEvent::Focused(true) = event {
                        match state.reload() {
                            Ok(_) => println!("Reloaded successfully!"),
                            Err(err) => println!("Error: {}", err),
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
    MoveUp,
    MoveLeft,
    MoveDown,
    MoveRight,
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
                W => Some(MoveUp),
                A => Some(MoveLeft),
                S => Some(MoveDown),
                D => Some(MoveRight),
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

    /// Attempt to load a bytebeat from file. If the bytebeat fails to parse or compile, an error is returned.
    fn reload(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut file = std::fs::File::open("a.bytebeat")?;
        let mut program = String::new();
        file.read_to_string(&mut program)?;
        let program = bytebeat::parse_beat(&program).map_err(|err| format!("{}", err))?;
        let program = bytebeat::compile(program).map_err(|err| format!("{}", err))?;
        self.bytebeat.insert_program(program);
        Ok(())
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
            MoveUp | MoveLeft | MoveDown | MoveRight => (), // Not used for BF programs.
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
    pub key_x: i64,
    pub key_y: i64,
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
            key_x: 0,
            key_y: 0,
        }
    }

    fn handle_input(&mut self, control: Controls) {
        use Controls::*;
        match control {
            New => self.insert_program(bytebeat::random_beat(PROGRAM_LENGTH)),
            Restart => (),
            Next => self.index = (self.index + 1).min(self.bytebeats.len() - 1),
            Prev => self.index = self.index.saturating_sub(1),
            Mutate => self.insert_program(bytebeat::mutate(
                &self.bytebeats[self.index],
                MUTATION_CHANCE,
            )),
            VerySlower => self.speed /= 2,
            Slower => self.speed -= 1,
            Faster => self.speed += 1,
            VeryFaster => self.speed *= 2,
            MoveUp => self.key_y += 1,
            MoveLeft => self.key_x -= 1,
            MoveDown => self.key_y -= 1,
            MoveRight => self.key_x += 1,
        }

        // Print output
        match control {
            Faster | VeryFaster | Slower | VerySlower => {
                println!("Speed = {} (t = {})", self.speed, self.frame)
            }
            MoveLeft | MoveRight | MoveUp | MoveDown => {
                println!("Position: x = {} y = {}", self.key_x, self.key_y)
            }
            _ => (),
        }

        // "Reset" the current bytebeat
        match control {
            New | Restart | Next | Prev | Mutate => {
                self.frame = 0;
                self.speed = 1;
                println!("{}", self.bytebeats[self.index]);
                self.key_x = 0;
                self.key_y = 0;
            }
            _ => (),
        }
    }

    fn render(&mut self, image: &mut Image, mouse: &MouseState) {
        let program = &self.bytebeats[self.index];
        let t = self.frame;
        let key_x = self.key_x;
        let key_y = self.key_y;
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
                            key_x,
                            key_y,
                        )
                        .into();
                    }
                },
            );

        render_image(image, self.image_data.as_ref());
    }

    // Insert a program into the bytebeat history and go to it.
    fn insert_program(&mut self, program: bytebeat::Program) {
        self.bytebeats.push(program);
        self.index = self.bytebeats.len() - 1;
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
