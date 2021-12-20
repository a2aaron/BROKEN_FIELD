use std::io::Read;

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

// the actual size, in pixels of the window to display
const WINDOW_WIDTH: usize = 512;
const WINDOW_HEIGHT: usize = 512;
// the internal size, in "pixels" of the bytebeat to render
const BYTEBEAT_WIDTH: usize = 512;
const BYTEBEAT_HEIGHT: usize = 512;
// the size of pixels for a brainfuck program
const PIXEL_SIZE: usize = 32;
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
            if let Event::WindowEvent { event, .. } = event {
                // Handle typical input
                if let Some(control) = Controls::from_event(event) {
                    match control {
                        Controls::ChangeToBF => state.set_active(ArtType::BF),
                        Controls::ChangeToBytebeat => state.set_active(ArtType::Bytebeat),
                        _ => state.handle_input(control),
                    }
                }
                // Live reload on window focus
                if let WindowEvent::Focused(true) = event {
                    match state.reload() {
                        Ok(_) => println!("Reloaded successfully!"),
                        Err(err) => println!("Error: {}", err),
                    }
                }
            }
            true
        });

    canvas.render(|state, image| {
        state.update();
        state.render(image);
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
    ChangeToBF,
    ChangeToBytebeat,
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
                Key1 => Some(ChangeToBF),
                Key2 => Some(ChangeToBytebeat),
                _ => None,
            },
            _ => None,
        }
    }
}

struct State {
    // The speed that the art should play at. exact units are art dependent
    speed: i64,
    // Which type of art to create.
    art_type: ArtType,
    // A list of the available art pieces
    arts: Vec<Box<dyn Art>>,
    // Which art should be displayed.
    art_index: usize,
    // The state of the mouse
    mouse: MouseState,
    // The x and y keyboard positions
    key_x: i64,
    key_y: i64,
}

impl State {
    fn new() -> State {
        State {
            mouse: MouseState::new(),
            art_type: ArtType::Bytebeat,
            arts: vec![Box::new(BytebeatState::new_random())],
            art_index: 0,
            speed: 1,
            key_x: 0,
            key_y: 0,
        }
    }

    fn set_active(&mut self, art_type: ArtType) {
        self.art_type = art_type;
    }

    fn reset(&mut self) {
        self.speed = if self.art_type == ArtType::BF { 500 } else { 1 };
        self.key_x = 0;
        self.key_y = 0;
        self.arts[self.art_index].reset();
    }

    fn new_art(&self) -> Box<dyn Art> {
        match self.art_type {
            ArtType::BF => Box::new(Brainfuck::new_random()) as Box<dyn Art>,
            ArtType::Bytebeat => Box::new(BytebeatState::new_random()) as Box<dyn Art>,
        }
    }

    fn insert_art(&mut self, art: Box<dyn Art>) {
        self.arts.push(art);
        self.art_index = self.arts.len() - 1;
    }

    fn handle_input(&mut self, control: Controls) {
        use Controls::*;
        match control {
            New => self.insert_art(self.new_art()),
            Restart => self.reset(),
            Next => self.art_index = (self.art_index + 1).min(self.arts.len() - 1),
            Prev => self.art_index = self.art_index.saturating_sub(1),
            Mutate => self.insert_art(self.arts[self.art_index].mutate()),
            VerySlower => self.speed /= 2,
            Slower => self.speed -= 1,
            Faster => self.speed += 1,
            VeryFaster => self.speed *= 2,
            MoveUp => self.key_y += 1,
            MoveLeft => self.key_x -= 1,
            MoveDown => self.key_y -= 1,
            MoveRight => self.key_x += 1,
            _ => (),
        }

        // Print output
        match control {
            Faster | VeryFaster | Slower | VerySlower => {
                println!("Speed = {}", self.speed)
            }
            MoveLeft | MoveRight | MoveUp | MoveDown => {
                println!("Position: x = {} y = {}", self.key_x, self.key_y)
            }
            _ => (),
        }
    }

    fn update(&mut self) {
        let input = Inputs {
            key_x: self.key_x,
            key_y: self.key_y,
            mouse_x: self.mouse.x as i64,
            mouse_y: self.mouse.y as i64,
        };
        self.arts[self.art_index].update(self.speed, input);
    }

    fn render(&mut self, image: &mut Image) {
        self.arts[self.art_index].render(image);
    }

    /// Attempt to load a bytebeat from file. If the bytebeat fails to parse or compile, an error is returned.
    fn reload(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut file = std::fs::File::open("a.bytebeat")?;
        let mut program = String::new();
        file.read_to_string(&mut program)?;
        let art = if let Ok(bytebeat_program) = bytebeat::parse_beat(&program) {
            let program = bytebeat::compile(bytebeat_program).map_err(|err| format!("{}", err))?;
            Box::new(BytebeatState::new_from(program)) as Box<dyn Art>
        } else {
            let bf_program = bf::from_string(&program);
            Box::new(Brainfuck::new_from(bf_program)) as Box<dyn Art>
        };
        self.insert_art(art);
        Ok(())
    }
}

struct Inputs {
    key_x: i64,
    key_y: i64,
    mouse_x: i64,
    mouse_y: i64,
}

#[derive(PartialEq, Eq)]
enum ArtType {
    BF,
    Bytebeat,
}

trait Art {
    // Reset the state of this Art to the beginning
    fn reset(&mut self);
    // Mutate this piece of Art, producing a similar but different piece of Art
    fn mutate(&self) -> Box<dyn Art>;
    // Update the internal state, called once per frame
    fn update(&mut self, speed: i64, input: Inputs);
    // Render the internal state to an Image
    fn render(&self, image: &mut Image);
}

struct Brainfuck {
    pub program: bf::Program,
    pub state: bf::BFState,
    pub input: Box<dyn Iterator<Item = i8>>,
}

impl Brainfuck {
    fn new_from(program: bf::Program) -> Brainfuck {
        println!("{}", program);

        Brainfuck {
            program,
            state: bf::BFState::new(),
            input: Box::new("Hello, world!".as_bytes().iter().cycle().map(|&b| b as i8)),
        }
    }

    fn new_random() -> Brainfuck {
        let program = bf::random_bf(PROGRAM_LENGTH);
        Brainfuck::new_from(program)
    }
}

impl Art for Brainfuck {
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
        Box::new(Brainfuck::new_from(program)) as Box<dyn Art>
    }
}

struct BytebeatState {
    pub program: bytebeat::Program,
    pub image_data: Box<[u8]>,
    pub frame: i64,
}

impl BytebeatState {
    fn new_from(program: bytebeat::Program) -> BytebeatState {
        println!("{}", program);

        BytebeatState {
            program,
            image_data: vec![0; BYTEBEAT_WIDTH * BYTEBEAT_HEIGHT].into_boxed_slice(),
            frame: 0,
        }
    }

    fn new_random() -> BytebeatState {
        BytebeatState::new_from(bytebeat::random_beat(PROGRAM_LENGTH))
    }
}

impl Art for BytebeatState {
    fn reset(&mut self) {
        self.frame = 0;
    }

    fn mutate(&self) -> Box<dyn Art> {
        Box::new(BytebeatState::new_from(bytebeat::mutate(
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

pub fn render_bytebeat(image: &mut Image, values: &[u8]) {
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
