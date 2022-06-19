mod art_impls;

use std::io::Read;

use broken_field::bf;
use broken_field::bytebeat;

use art_impls::Art;
use art_impls::BrainfuckArt;
use art_impls::BytebeatArt;
use art_impls::Mandelbrot;

use pixel_canvas::{
    input::{
        glutin::event::{ElementState, KeyboardInput, MouseButton, VirtualKeyCode},
        Event, MouseState, WindowEvent,
    },
    Canvas, Image,
};

// the actual size, in pixels of the window to display
const WINDOW_WIDTH: usize = 512;
const WINDOW_HEIGHT: usize = 512;

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
                    state.handle_input(control);
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
pub enum Controls {
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
    ChangeTo(ArtType),
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
                Key1 => Some(ChangeTo(ArtType::BF)),
                Key2 => Some(ChangeTo(ArtType::Bytebeat)),
                Key3 => Some(ChangeTo(ArtType::Mandelbrot)),
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
            arts: vec![Box::new(BytebeatArt::new_random())],
            art_index: 0,
            speed: 1,
            key_x: 0,
            key_y: 0,
        }
    }

    fn set_active(&mut self, art_type: ArtType) {
        println!("Setting current art generator to: {:?}", art_type);
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
            ArtType::BF => Box::new(BrainfuckArt::new_random()) as Box<dyn Art>,
            ArtType::Bytebeat => Box::new(BytebeatArt::new_random()) as Box<dyn Art>,
            ArtType::Mandelbrot => Box::new(Mandelbrot::new()) as Box<dyn Art>,
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
            Controls::ChangeTo(art_type) => self.set_active(art_type),
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
            Box::new(BytebeatArt::new_from(program)) as Box<dyn Art>
        } else {
            let bf_program = bf::from_string(&program);
            Box::new(BrainfuckArt::new_from(bf_program)) as Box<dyn Art>
        };
        self.insert_art(art);
        Ok(())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ArtType {
    BF,
    Bytebeat,
    Mandelbrot,
}

pub struct Inputs {
    key_x: i64,
    key_y: i64,
    mouse_x: i64,
    mouse_y: i64,
}
