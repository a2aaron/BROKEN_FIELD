use std::collections::HashMap;

extern crate pixel_canvas;
extern crate rand;

use pixel_canvas::{input::MouseState, Canvas, Color, Image};
use rand::Rng;

const PROGRAM_LENGTH: usize = 20;
const MAX_STEPS: usize = 1000;
const NUM_PROGRAMS: usize = 100;
const MAX_MEMORY: usize = 1000;

fn main() {
    let canvas = Canvas::new(512, 512)
        .title("BROKEN_FIELD")
        .state(State::new());
    // .state(MouseState::new())
    // .input(MouseState::handle_input);

    canvas.render(|state, image| {
        if state.index < state.execution_history.len() {
            use BFChar::*;
            render_image(image, &state.execution_history[state.index]);
            state.index += 5;
        // while state.index < state.execution_history.len() {
        //     match state.execution_history[state.index].1 {
        //         Plus | Minus | Input => break,
        //         Left | Right | Output => (),
        //         StartLoop | EndLoop => (),
        //     }
        //     state.index += 1;
        // }
        } else {
            *state = State::new();
            println!("{}", to_string(&state.program.instrs));
        }
    });
}

struct State {
    program: Program,
    execution_history: Vec<(BFState, BFChar)>,
    index: usize,
}

impl State {
    fn new() -> State {
        let program = random_bf(PROGRAM_LENGTH);
        let execution_history = execution_history(
            &program,
            &mut Box::new("Hello, world!".as_bytes().iter().map(|&b| b as i8)),
            MAX_STEPS,
        );

        State {
            program,
            execution_history,
            index: 0,
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

fn render_image(image: &mut Image, (state, instr): &(BFState, BFChar)) {
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
    output: Vec<i8>,
}

impl BFState {
    fn new() -> BFState {
        BFState {
            program_pointer: 0,
            memory_pointer: 0,
            memory: vec![0; MAX_MEMORY],
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
    state.program_pointer >= program.instrs.len()
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
