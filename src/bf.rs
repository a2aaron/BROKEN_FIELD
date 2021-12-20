use std::collections::HashMap;
use std::fmt::Display;

use rand::seq::SliceRandom;
use rand::{thread_rng, Rng};

const MAX_STEPS: usize = 10000;
const MEMORY_BEHAVIOR: MemoryBehavior = MemoryBehavior::Wrapping(INITAL_MEMORY);
const INITAL_MEMORY: usize = 256;
const EXTEND_MEMORY_AMOUNT: usize = 64;

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct BFState {
    pub program_pointer: usize,
    pub memory_pointer: usize,
    pub memory: Vec<i8>,
    pub memory_behavior: MemoryBehavior,
    pub output: Vec<i8>,
}

impl BFState {
    pub fn new() -> BFState {
        BFState {
            program_pointer: 0,
            memory_pointer: 0,
            memory: vec![0; INITAL_MEMORY],
            memory_behavior: MEMORY_BEHAVIOR,
            output: Vec::with_capacity(100),
        }
    }

    pub fn step(&mut self, program: &Program, input: &mut dyn Iterator<Item = i8>) {
        debug_assert!(!halted(self, program));
        use self::MemoryBehavior::*;
        use BFChar::*;

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

impl Default for BFState {
    fn default() -> Self {
        Self::new()
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

pub fn halted(state: &BFState, program: &Program) -> bool {
    state.program_pointer >= program.instrs.len()
}
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum MemoryBehavior {
    Wrapping(usize),
    InfiniteRightwards,
}

#[derive(Debug)]
pub struct Program {
    pub instrs: Vec<BFChar>,
    loop_dict: HashMap<usize, usize>,
}

impl Program {
    pub fn new(instrs: Vec<BFChar>) -> Program {
        debug_assert!(is_valid(&instrs));
        let loop_dict = loop_dict(&instrs);
        Program { instrs, loop_dict }
    }

    pub fn get(&self, i: usize) -> BFChar {
        self.instrs[i]
    }

    fn matching_loop(&self, i: usize) -> Option<usize> {
        self.loop_dict.get(&i).copied()
    }
}

impl Display for Program {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "{}", to_string(&self.instrs))
    }
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

pub fn mutate(program: &Program, mutation_chance: f32) -> Program {
    let mut instrs = program.instrs.clone();
    for instr in instrs.iter_mut() {
        if mutation_chance > rand::thread_rng().gen_range(0.0, 1.0) {
            *instr = match instr {
                BFChar::StartLoop => BFChar::StartLoop,
                BFChar::EndLoop => BFChar::EndLoop,
                _ => *[
                    BFChar::Plus,
                    BFChar::Minus,
                    BFChar::Left,
                    BFChar::Right,
                    BFChar::Input,
                    BFChar::Output,
                ]
                .choose(&mut rand::thread_rng())
                .unwrap(),
            };
        }
    }

    Program::new(instrs)
}

pub fn execution_history(
    program: &Program,
    input: &mut dyn Iterator<Item = i8>,
    max_steps: usize,
) -> Vec<(BFState, BFChar)> {
    let mut history = Vec::with_capacity(max_steps);
    let mut state = BFState::new();
    let mut num_steps = 0;

    while !halted(&state, program) && num_steps <= MAX_STEPS {
        let instr = program.get(state.program_pointer);
        state.step(program, input);

        history.push((state.clone(), instr));
        num_steps += 1;
    }

    history
}

pub fn interest_score(string: &[i8]) -> usize {
    // charcters 0 thru 31 in ASCII are all unprintable and thus not very good
    let all_unprintable = string.iter().all(|&x| (0..=31).contains(&x));
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

pub fn from_string(string: &str) -> Program {
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

pub fn to_string(program: &[BFChar]) -> String {
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

pub fn is_valid(program: &[BFChar]) -> bool {
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

pub fn random_bf(length: usize) -> Program {
    use BFChar::*;
    let mut program = Vec::with_capacity(length + 2);
    let mut num_open_braces = 0;
    let choices = &[Plus, Minus, Left, Right, StartLoop, EndLoop]; // &[Plus, Minus, Left, Right, StartLoop, EndLoop, Input, Output];

    while program.len() < length || num_open_braces != 0 {
        let mut bf_char = *choices.choose(&mut thread_rng()).unwrap();

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

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
pub enum BFChar {
    Plus,
    Minus,
    Left,
    Right,
    StartLoop,
    EndLoop,
    Input,
    Output,
}
