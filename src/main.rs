extern crate rand;

use rand::Rng;

fn main() {
    for _ in 0..10 {
        println!("{:?}", to_string(random_bf(100)));
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

fn to_string(program: Program) -> String {
    let mut string = String::new();
    for bf_char in program {
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

fn random_bf(length: usize) -> Program {
    use BFChar::*;
    let mut program = Program::new();
    let mut num_open_braces = 0;
    let choices = vec![Plus, Minus, Left, Right, StartLoop, EndLoop, Input, Output];

    for _ in 0..length {
        let mut bf_char = *rand::thread_rng().choose(&choices).unwrap();

        if num_open_braces <= 0 && bf_char == EndLoop {
            bf_char = StartLoop;
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
