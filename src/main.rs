use std::collections::HashMap;

extern crate pixel_canvas;
extern crate rand;

use pixel_canvas::{input::MouseState, Canvas, Color, Image};
use rand::Rng;

const PROGRAM_LENGTH: usize = 20;
const MAX_STEPS: usize = 100;
const NUM_PROGRAMS: usize = 100;

fn main() {
    let canvas = Canvas::new(512, 512)
        .title("BROKEN_FIELD")
        .state(State::new());

    canvas.render(|state, image| {
        state.step();

        // let score = interest_score(&state.state.output);
        // let output: Vec<u8> = state.state.output.iter().map(|&x| x as u8).collect();
        // let output = String::from_utf8_lossy(&output);
        // if score >= 0 {
        //     println!("{}\t\t{}", to_string(&state.program.instrs), &output,);
        // }

        render_image(image, &state.state);
    });
}

struct State {
    program: Program,
    state: BFState,
    num_steps: usize,
    input: Box<dyn Iterator<Item = i8>>,
}

impl State {
    fn new() -> State {
        State {
            program: random_bf(PROGRAM_LENGTH),
            state: BFState::new(),
            num_steps: 0,
            input: Box::new("Hello, world!".as_bytes().iter().map(|&b| b as i8)),
        }
    }

    fn step(&mut self) {
        if !halted(&self.state, &self.program) && self.num_steps <= MAX_STEPS {
            self.state.step(&self.program, &mut self.input);
            self.num_steps += 1;
        } else {
            self.program = random_bf(PROGRAM_LENGTH);
            self.state = BFState::new();
            self.num_steps = 0;
            self.input = Box::new("Hello, world!".as_bytes().iter().map(|&b| b as i8));
        }
    }
}

fn render_image(image: &mut Image, state: &BFState) {
    let width = image.width() as usize;
    for (y, row) in image.chunks_mut(width).enumerate() {
        for (x, pixel) in row.iter_mut().enumerate() {
            let pixel_size = 32;
            let megapixel_x = x / pixel_size;
            let megapixel_y = y / pixel_size;
            let megapixel_width = width / pixel_size;
            let i = megapixel_y * megapixel_width + megapixel_x;

            let subpixel_x = x - megapixel_x * pixel_size;
            let subpixel_y = y - megapixel_y * pixel_size;
            let edge_of_megapixel = subpixel_x == 0
                || subpixel_y == 0
                || subpixel_x == pixel_size - 1
                || subpixel_y == pixel_size - 1;
            let draw_pointer = i == state.memory_pointer;
            if draw_pointer && edge_of_megapixel {
                *pixel = Color { r: 255, g: 0, b: 0 };
            } else {
                let value = *state.memory.get(i).unwrap_or(&0) as u8;
                *pixel = Color {
                    r: value.wrapping_mul(15),
                    g: value.wrapping_mul(14),
                    b: value.wrapping_mul(13),
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

struct Program {
    instrs: Vec<BFChar>,
    loop_dict: HashMap<usize, usize>,
}

impl Program {
    fn new(instrs: Vec<BFChar>) -> Program {
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
    output: Vec<i8>,
}

impl BFState {
    fn new() -> BFState {
        BFState {
            program_pointer: 0,
            memory_pointer: 0,
            memory: vec![0; 100],
            output: Vec::with_capacity(100),
        }
    }

    fn step(&mut self, program: &Program, input: &mut dyn Iterator<Item = i8>) {
        debug_assert!(!halted(self, program));
        use BFChar::*;
        let instruction = program.get(self.program_pointer);
        match instruction {
            Plus => {
                self.memory[self.memory_pointer] = self.memory[self.memory_pointer].wrapping_add(1)
            }
            Minus => {
                self.memory[self.memory_pointer] = self.memory[self.memory_pointer].wrapping_sub(1)
            }
            Left => self.memory_pointer = self.memory_pointer.saturating_sub(1),
            Right => self.memory_pointer += 1,
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
fn halted(state: &BFState, program: &Program) -> bool {
    state.program_pointer == program.instrs.len()
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

fn from_string(string: &str) -> Vec<BFChar> {
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

    program
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
    let choices = &[Plus, Minus, Left, Right, StartLoop, EndLoop, Input, Output];

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
