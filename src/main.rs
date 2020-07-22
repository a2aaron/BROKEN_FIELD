extern crate rand;

use rand::Rng;

const PROGRAM_LENGTH: usize = 20;
const MAX_STEPS: usize = 100;
const NUM_PROGRAMS: usize = 100;

fn main() {
    for _ in 0..NUM_PROGRAMS {
        let program = random_bf(PROGRAM_LENGTH);
        assert!(is_valid(&program));
        // println!("{}", to_string(&program));
        let mut state = State::new(program);
        let mut input = "Hello, world!".as_bytes().iter().map(|&b| b as i8);
        let mut num_steps = 0;
        while !state.halted() {
            // println!("{:?}", &state.memory[0..10]);
            state.step(&mut input);

            if num_steps > MAX_STEPS {
                // println!("too many steps! breaking early...");
                break;
            }
            num_steps += 1;
        }
        let output: Vec<u8> = state.output.iter().map(|&x| x as u8).collect();
        let output = String::from_utf8_lossy(&output);
        if !output.trim().is_empty() && output.len() > 1 {
            println!("{}\t\t{}", to_string(&state.program), &output);
        }
    }
}

type Program = Vec<BFChar>;

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
struct State {
    program: Program,
    program_pointer: usize,
    memory_pointer: usize,
    memory: Vec<i8>,
    output: Vec<i8>,
}

impl State {
    fn new(program: Program) -> State {
        State {
            program,
            program_pointer: 0,
            memory_pointer: 0,
            memory: vec![0; 100],
            output: Vec::with_capacity(100),
        }
    }

    fn step(&mut self, input: &mut dyn Iterator<Item = i8>) {
        debug_assert!(!self.halted());
        use BFChar::*;
        let instruction = self.program[self.program_pointer];
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
                    let mut new_pointer = self.program_pointer;
                    while self.program[new_pointer] != EndLoop {
                        new_pointer += 1;
                    }
                    self.program_pointer = new_pointer;
                }
            }
            EndLoop => {
                if self.memory[self.memory_pointer] != 0 {
                    let mut new_pointer = self.program_pointer;
                    while self.program[new_pointer] != StartLoop {
                        new_pointer -= 1;
                    }
                    self.program_pointer = new_pointer;
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

    fn halted(&self) -> bool {
        self.program_pointer == self.program.len()
    }
}

fn to_string(program: &Program) -> String {
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

fn is_valid(program: &Program) -> bool {
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
    let mut program = Program::new();
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
    program
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {}
}
