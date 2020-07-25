use std::collections::HashMap;

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

const PROGRAM_LENGTH: usize = 100;
const MAX_STEPS: usize = 10000;
const MEMORY_BEHAVIOR: MemoryBehavior = MemoryBehavior::Wrapping(INITAL_MEMORY);
const INITAL_MEMORY: usize = 256;
const EXTEND_MEMORY_AMOUNT: usize = 64;
const PIXEL_SIZE: usize = 32;
const INITIAL_SPEED: usize = 500;
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
                        state.state = BFState::new();
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
        if !halted(&state.state, &state.program) {
            for _ in 0..state.index {
                state.state.step(&state.program, &mut state.input);
            }
        }
        render_image(
            image,
            &state.state,
            state.program.instrs[state.state.program_pointer],
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
        // let program = from_string("<>->>[+>-[[+<>>]->]>>[+<><+>+[<>><>[+<][>[]-++-<+[><-]<][][+-[->]<[]>+[><<[<>[>-]-+->+][>[+<+][+><<-]]]]]]]");
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

fn execution_history(
    program: &Program,
    input: &mut dyn Iterator<Item = i8>,
    max_steps: usize,
) -> Vec<(BFState, BFChar)> {
    let mut history = Vec::with_capacity(max_steps);
    let mut state = BFState::new();
    let mut num_steps = 0;

    while !halted(&state, &program) && num_steps <= MAX_STEPS {
        let instr = program.get(state.program_pointer);
        state.step(&program, input);

        history.push((state.clone(), instr));
        num_steps += 1;
    }

    history
}

fn render_image(image: &mut Image, state: &BFState, instr: BFChar) {
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

fn interest_score(string: &Vec<i8>) -> usize {
    // charcters 0 thru 31 in ASCII are all unprintable and thus not very good
    let all_unprintable = string.iter().all(|&x| 0 <= x && x <= 31);
    let all_same = string.iter().all(|&x| x == *string.first().unwrap_or(&0));
    let very_short = string.len() <= 5;

    if all_unprintable {
        0
    } else if all_same {
        string.len() / 4
    } else if very_short {
        string.len()
    } else {
        100
    }
}

#[derive(Debug)]
struct Program {
    instrs: Vec<BFChar>,
    loop_dict: HashMap<usize, usize>,
}

impl Program {
    fn new(instrs: Vec<BFChar>) -> Program {
        debug_assert!(is_valid(&instrs));
        let loop_dict = loop_dict(&instrs);
        Program { instrs, loop_dict }
    }

    fn get(&self, i: usize) -> BFChar {
        self.instrs[i]
    }

    fn matching_loop(&self, i: usize) -> Option<usize> {
        self.loop_dict.get(&i).map(|f| *f)
    }
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum BFChar {
    Plus,
    Minus,
    Left,
    Right,
    StartLoop,
    EndLoop,
    Input,
    Output,
}

#[derive(Debug, Clone, Eq, PartialEq)]
struct BFState {
    program_pointer: usize,
    memory_pointer: usize,
    memory: Vec<i8>,
    memory_behavior: MemoryBehavior,
    output: Vec<i8>,
}

impl BFState {
    fn new() -> BFState {
        BFState {
            program_pointer: 0,
            memory_pointer: 0,
            memory: vec![0; INITAL_MEMORY],
            memory_behavior: MEMORY_BEHAVIOR,
            output: Vec::with_capacity(100),
        }
    }

    fn step(&mut self, program: &Program, input: &mut dyn Iterator<Item = i8>) {
        debug_assert!(!halted(self, program));
        use BFChar::*;
        use MemoryBehavior::*;

        let instruction = program.get(self.program_pointer);
        match instruction {
            Plus => {
                self.memory[self.memory_pointer] = self.memory[self.memory_pointer].wrapping_add(1)
            }
            Minus => {
                self.memory[self.memory_pointer] = self.memory[self.memory_pointer].wrapping_sub(1)
            }
            Left => match self.memory_behavior {
                Wrapping(modulo) => {
                    self.memory_pointer = wrapping_add(self.memory_pointer, -1, modulo)
                }
                InfiniteRightwards => self.memory_pointer = self.memory_pointer.saturating_sub(1),
            },
            Right => match self.memory_behavior {
                Wrapping(modulo) => {
                    self.memory_pointer = wrapping_add(self.memory_pointer, 1, modulo)
                }
                InfiniteRightwards => {
                    self.memory_pointer += 1;
                    if self.memory_pointer >= self.memory.len() {
                        self.memory.extend([0; EXTEND_MEMORY_AMOUNT].iter());
                    }
                }
            },
            StartLoop => {
                if self.memory[self.memory_pointer] == 0 {
                    self.program_pointer = program
                        .matching_loop(self.program_pointer)
                        .expect("missing StartLoop dict entry!");
                }
            }
            EndLoop => {
                if self.memory[self.memory_pointer] != 0 {
                    self.program_pointer = program
                        .matching_loop(self.program_pointer)
                        .expect("missing EndLoop dict entry!");
                }
            }
            Input => match input.next() {
                None => self.memory[self.memory_pointer] = 0,
                Some(x) => self.memory[self.memory_pointer] = x,
            },
            Output => self.output.push(self.memory[self.memory_pointer]),
        }
        self.program_pointer += 1;
    }
}

fn wrapping_add(a: usize, b: isize, modulo: usize) -> usize {
    let x = a as isize + b;
    if x < 0 {
        (x + modulo as isize) as usize % modulo
    } else {
        x as usize % modulo
    }
}

fn halted(state: &BFState, program: &Program) -> bool {
    state.program_pointer >= program.instrs.len()
}
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum MemoryBehavior {
    Wrapping(usize),
    InfiniteRightwards,
}

fn loop_dict(program: &[BFChar]) -> HashMap<usize, usize> {
    use BFChar::*;
    let mut hashmap = HashMap::new();
    let mut startloop_locs = Vec::new();
    for (i, &instr) in program.iter().enumerate() {
        match instr {
            Plus | Minus | Left | Right | Input | Output => (),
            StartLoop => {
                hashmap.insert(i, 0);
                startloop_locs.push(i);
            }
            EndLoop => {
                hashmap.insert(
                    i,
                    startloop_locs
                        .pop()
                        .expect("Empty startloop_locs (maybe the program is invalid)"),
                );
            }
        }
    }
    debug_assert!(startloop_locs.is_empty());
    hashmap
}

fn from_string(string: &str) -> Program {
    let mut program = Vec::with_capacity(string.len());
    for char in string.chars() {
        use BFChar::*;
        let instr = match char {
            '+' => Plus,
            '-' => Minus,
            '<' => Left,
            '>' => Right,
            '[' => StartLoop,
            ']' => EndLoop,
            ',' => Input,
            '.' => Output,
            _ => continue,
        };
        program.push(instr);
    }

    Program::new(program)
}

fn to_string(program: &[BFChar]) -> String {
    let mut string = String::new();
    for &bf_char in program {
        use BFChar::*;
        let letter: char = match bf_char {
            Plus => '+',
            Minus => '-',
            Left => '<',
            Right => '>',
            StartLoop => '[',
            EndLoop => ']',
            Input => ',',
            Output => '.',
        };
        string.push(letter);
    }

    string
}

fn is_valid(program: &[BFChar]) -> bool {
    use BFChar::*;
    let mut num_open_braces = 0;
    for instr in program {
        match instr {
            Plus | Minus | Left | Right | Input | Output => (),
            StartLoop => num_open_braces += 1,
            EndLoop => num_open_braces -= 1,
        }
        if num_open_braces < 0 {
            return false;
        }
    }
    num_open_braces == 0
}

fn random_bf(length: usize) -> Program {
    use BFChar::*;
    let mut program = Vec::with_capacity(length + 2);
    let mut num_open_braces = 0;
    let choices = &[Plus, Minus, Left, Right, StartLoop, EndLoop]; // &[Plus, Minus, Left, Right, StartLoop, EndLoop, Input, Output];

    while program.len() < length || num_open_braces != 0 {
        let mut bf_char = *rand::thread_rng().choose(choices).unwrap();

        // Avoid adding an end loop if there is no matching start loop
        if num_open_braces <= 0 && bf_char == EndLoop {
            continue;
        }

        // Avoid adding other characters if we run out of length
        if program.len() >= length {
            bf_char = EndLoop;
        }

        if bf_char == StartLoop {
            num_open_braces += 1;
        } else if bf_char == EndLoop {
            num_open_braces -= 1;
        }

        program.push(bf_char);
    }

    for _ in 0..num_open_braces {
        program.push(EndLoop);
    }
    debug_assert!(is_valid(&program));
    Program::new(program)
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
