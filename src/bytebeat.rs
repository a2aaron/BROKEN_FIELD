use rand::Rng;
use std::collections::HashMap;

#[derive(Copy, Clone, Debug, PartialEq)]
pub enum VarType {
    Frame,
    MouseX,
    MouseY,
    ScreenX,
    ScreenY,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Cmd {
    Var(VarType),
    NumF(f64),
    NumI(i64),
    Hex(i64),
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Shl,
    Shr,
    And,
    Orr,
    Xor,
    Sin,
    Cos,
    Tan,
    Pow,
    AddF,
    SubF,
    MulF,
    DivF,
    ModF,
    Lt,
    Gt,
    Leq,
    Geq,
    Eq,
    Neq,
    Cond,
    Arr(usize),
    Meta(String, String),
    Comment(String),
}

#[derive(Debug)]
pub struct Program {
    cmds: Vec<Cmd>,
    meta: HashMap<String, Vec<String>>,
}

impl Program {
    pub fn meta(&self, name: &str) -> Option<&str> {
        self.meta.get(name).and_then(|xs| xs.last()).map(|x| &x[..])
    }

    pub fn all_meta(&self, name: &str) -> Vec<String> {
        self.meta.get(name).cloned().unwrap_or_default()
    }
}

pub fn compile(cmds: Vec<Cmd>) -> Result<Program, CompileError> {
    use Cmd::*;
    let mut meta = HashMap::new();
    for cmd in &cmds {
        if let Meta(ref k, ref v) = *cmd {
            meta.entry(k.clone())
                .or_insert_with(Vec::default)
                .push(v.clone());
        }
    }
    // Validate the bytebeat by checking that the stack does not get popped when empty
    let mut stack_size = 0 as isize;
    let mut error_kind = None;
    for (index, cmd) in cmds.iter().enumerate() {
        let change = match *cmd {
            Var(_) | NumF(_) | NumI(_) | Hex(_) => 1,
            Meta(_, _) | Comment(_) => continue,
            // These all pop 1 value off the stack and push 1
            // value back on, so the net effect is no stack change
            Sin | Cos | Tan => 0,
            // Arr(x) pops a value off the stack (called the index)
            // then pops x more values off the stack. Finally, it
            // pushes one value back onto the stack based on the index
            // Thus the net effect of Arr is to reduce the stack size by x.
            Arr(x) => -saturating_as_isize(x),
            Cond => -2,
            // Split these into multiple branches to make rustfmt stop complaining
            Add | Sub | Mul | Div | Mod => -1,
            Shl | Shr | And | Orr | Xor => -1,
            Pow | AddF | SubF | MulF | DivF | ModF => -1,
            Lt | Gt | Leq | Geq | Eq | Neq => -1,
        };
        if stack_size + change <= 0 {
            error_kind = Some(ErrorKind::UnderflowedStack { index, stack_size });
            break;
        }
        // Do this after the if statement since we want to record the stack_size
        // before applying the effect of the operator.
        stack_size += change;
    }

    if stack_size == 0 && error_kind.is_none() {
        error_kind = Some(ErrorKind::EmptyProgram);
    }

    match error_kind {
        None => Ok(Program { cmds, meta }),
        Some(error_kind) => Err(CompileError { cmds, error_kind }),
    }
}

fn saturating_as_isize(num: usize) -> isize {
    if num > isize::max_value() as usize {
        isize::max_value()
    } else {
        num as isize
    }
}

impl std::fmt::Display for Program {
    fn fmt(&self, fmt: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(fmt, "{}", format_beat(&self.cmds))
    }
}

#[derive(Debug, PartialEq)]
pub struct CompileError {
    cmds: Vec<Cmd>,
    error_kind: ErrorKind,
}

impl CompileError {
    pub fn into_code(self) -> Vec<Cmd> {
        self.cmds
    }

    pub fn as_code(&self) -> &[Cmd] {
        &self.cmds
    }

    pub fn error_kind(&self) -> &ErrorKind {
        &self.error_kind
    }
}

#[derive(Debug, PartialEq)]
pub enum ErrorKind {
    UnderflowedStack { index: usize, stack_size: isize },
    EmptyProgram,
}

impl<'a> std::fmt::Display for CompileError {
    fn fmt(&self, fmt: &mut std::fmt::Formatter) -> std::fmt::Result {
        use ErrorKind::*;
        match self.error_kind {
            UnderflowedStack { index, stack_size } => write!(
                fmt,
                "Attempt to pop beyond stack size. instruction: {} index: {}, size of stack {}",
                self.cmds[index], index, stack_size
            ),
            EmptyProgram => write!(fmt, "Program is empty: {:?}", self.cmds),
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub enum Val {
    F(f64),
    I(i64),
}

impl From<bool> for Val {
    fn from(b: bool) -> Val {
        if b {
            Val::I(1)
        } else {
            Val::I(0)
        }
    }
}

impl From<i64> for Val {
    fn from(i: i64) -> Val {
        Val::I(i)
    }
}

impl From<f64> for Val {
    fn from(f: f64) -> Val {
        Val::F(f)
    }
}

impl Into<bool> for Val {
    fn into(self) -> bool {
        match self {
            Val::F(x) if x == 0.0 => false,
            Val::I(0) => false,
            _ => true,
        }
    }
}

impl Into<i64> for Val {
    fn into(self) -> i64 {
        match self {
            Val::F(x) => x as i64,
            Val::I(x) => x,
        }
    }
}

impl Into<f64> for Val {
    fn into(self) -> f64 {
        match self {
            Val::F(x) => x,
            Val::I(x) => x as f64,
        }
    }
}

impl Into<u8> for Val {
    fn into(self) -> u8 {
        let x: i64 = self.into();
        x as u8
    }
}

// @Todo: How should this ordering work?? Should we compare intervals?
impl PartialOrd for Val {
    fn partial_cmp(&self, rhs: &Val) -> Option<std::cmp::Ordering> {
        match (*self, *rhs) {
            (Val::I(l), Val::I(r)) => l.partial_cmp(&r),
            (Val::F(l), Val::F(r)) => l.partial_cmp(&r),
            (Val::I(l), Val::F(r)) => (l as f64).partial_cmp(&r),
            (Val::F(l), Val::I(r)) => l.partial_cmp(&(r as f64)),
        }
    }
}

// @Todo: How should this work? Should we do some smarter interval comparison?
// Is that equivalent to this?
impl PartialEq for Val {
    fn eq(&self, rhs: &Val) -> bool {
        match (*self, *rhs) {
            (Val::I(l), Val::I(r)) => l == r,
            (Val::F(l), Val::F(r)) => l == r,
            (Val::I(l), Val::F(r)) => l as f64 == r && l == r as i64,
            (Val::F(l), Val::I(r)) => l == r as f64 && l as i64 == r,
        }
    }
}

/// This allows you to write each expression in terms of consuming the top of the
/// stack, and then generating the new value to be pushed on.
///
/// # Example:
/// ```rust
/// stack_op!(stack { a: Val, b: Val, c: bool } => if c { a } else { b })
/// ```
/// will pop the top three elements off the stack (with `c` being the topmost),
/// and then push on either `a` or `b`.
macro_rules! stack_op {
    ($stack:ident { $($var:ident : $t:ty),* } => $res:expr) => {{
        // Pop the variables
        stack_op!($stack { $($var : $t),* });
        // Evaluate the expression and push it onto the stack
        $stack.push($res.into());
    }};
    // Pop the variables in reverse order
    ($stack:ident { }) => {};
    ($stack:ident { $var:ident : $t:ty $(, $rvar:ident : $rt:ty)* }) => {
        stack_op!($stack { $($rvar : $rt),* });
        let $var: $t = $stack.pop().unwrap().into();
    }
}

pub fn eval_beat<T: Into<Val>>(
    stack: &mut Vec<Val>,
    program: &Program,
    t: T,
    mouse_x: T,
    mouse_y: T,
    screen_x: T,
    screen_y: T,
) -> Val {
    use Cmd::*;
    use VarType::*;
    let t = t.into();
    let mouse_x = mouse_x.into();
    let mouse_y = mouse_y.into();
    let screen_x = screen_x.into();
    let screen_y = screen_y.into();
    stack.clear();
    // let mut stack: Vec<Val> = Vec::new();
    for cmd in &program.cmds {
        match *cmd {
            Var(Frame) => stack_op!(stack { } => t),
            Var(MouseX) => stack_op!(stack { } => mouse_x),
            Var(MouseY) => stack_op!(stack { } => mouse_y),
            Var(ScreenX) => stack_op!(stack { } => screen_x),
            Var(ScreenY) => stack_op!(stack { } => screen_y),
            NumF(y) => stack_op!( stack { } => y),
            NumI(y) => stack_op!( stack { } => y),
            Hex(y) => stack_op!( stack { } => y),
            Add => stack_op!(stack { a: i64, b: i64 } => a.wrapping_add(b)),
            Sub => stack_op!(stack { a: i64, b: i64 } => a.wrapping_sub(b)),
            Mul => stack_op!(stack { a: i64, b: i64 } => a.wrapping_mul(b)),
            Div => stack_op!(stack { a: i64, b: i64 } => {
                if b == 0 { 0 } else { a.wrapping_div(b) }
            }),
            Mod => stack_op!(stack { a: i64, b: i64 } => {
                if b == 0 { 0 } else { a.wrapping_rem(b) }
            }),
            Shl => stack_op!(stack { a: i64, b: i64 } => a << (((b % 64) + 64) % 64)),
            Shr => stack_op!(stack { a: i64, b: i64 } => {
                let mut b = b % 64;
                if b < 0 {
                    b += 64;
                }
                a >> b
            }),
            And => stack_op!(stack { a: i64, b: i64 } => a & b),
            Orr => stack_op!(stack { a: i64, b: i64 } => a | b),
            Xor => stack_op!(stack { a: i64, b: i64 } => a ^ b),
            Sin => stack_op!(stack { a: f64 } => a.sin()),
            Cos => stack_op!(stack { a: f64 } => a.cos()),
            Tan => stack_op!(stack { a: f64 } => a.tan()),
            Pow => stack_op!(stack { a: f64, b: f64 } => a.powf(b)),
            AddF => stack_op!(stack { a: f64, b: f64 } => a + b),
            SubF => stack_op!(stack { a: f64, b: f64 } => a - b),
            MulF => stack_op!(stack { a: f64, b: f64 } => a * b),
            DivF => stack_op!(stack { a: f64, b: f64 } => {
                if b == 0.0 { 0.0 } else { a / b }
            }),
            ModF => stack_op!(stack { a: f64, b: f64 } => {
                if b == 0.0 { 0.0 } else { a % b }
            }),
            Lt => stack_op!(stack { a: Val, b: Val } => a < b),
            Gt => stack_op!(stack { a: Val, b: Val } => a > b),
            Leq => stack_op!(stack { a: Val, b: Val } => a <= b),
            Geq => stack_op!(stack { a: Val, b: Val } => a >= b),
            Eq => stack_op!(stack { a: Val, b: Val } => a == b),
            Neq => stack_op!(stack { a: Val, b: Val } => a != b),
            Cond => stack_op!(stack { a: Val, b: Val, cond: bool } => {
                if cond { a } else { b }
            }),
            Arr(0) => stack.push(0.into()),
            Arr(size) => {
                let index: i64 = stack.pop().unwrap().into();
                // We want to split off from the end, so we must subtract here.
                let split_index = stack.len() - size;
                let vec = stack.split_off(split_index);
                let size = size as i64;
                // Calculate the positive modulus (% gives remainder, which
                // is slightly different than mod for negative values)
                let index = ((index % size) + size) % size;
                stack.push(vec[index as usize]);
            }
            // These have no runtime effect
            Meta(..) | Comment(..) => (),
        }
    }
    stack.pop().unwrap()
}

pub fn parse_beat(text: &str) -> Result<Vec<Cmd>, ParseError> {
    use Cmd::*;
    use ParseError::*;
    use VarType::*;
    text.split_whitespace()
        .enumerate()
        .map(|(i, x)| match x {
            "t" => Ok(Var(Frame)),
            "mx" => Ok(Var(MouseX)),
            "my" => Ok(Var(MouseY)),
            "sx" => Ok(Var(ScreenX)),
            "sy" => Ok(Var(ScreenY)),
            "+" => Ok(Add),
            "-" => Ok(Sub),
            "*" => Ok(Mul),
            "/" => Ok(Div),
            "%" => Ok(Mod),
            "<<" => Ok(Shl),
            ">>" => Ok(Shr),
            "&" => Ok(And),
            "|" => Ok(Orr),
            "^" => Ok(Xor),
            "sin" => Ok(Sin),
            "cos" => Ok(Cos),
            "tan" => Ok(Tan),
            "pow" => Ok(Pow),
            "+." => Ok(AddF),
            "-." => Ok(SubF),
            "*." => Ok(MulF),
            "/." => Ok(DivF),
            "%." => Ok(ModF),
            "<" => Ok(Lt),
            ">" => Ok(Gt),
            "<=" => Ok(Leq),
            ">=" => Ok(Geq),
            "==" => Ok(Eq),
            "!=" => Ok(Neq),
            "?" => Ok(Cond),
            x if x.starts_with('[') => x[1..].parse().map(Arr).map_err(|_| BadArr(x, i)),
            x if x.starts_with('!') && x.contains(':') => {
                let mut parts = x[1..].split(':');
                Ok(Meta(
                    parts.next().unwrap().into(),
                    parts.next().unwrap().into(),
                ))
            }
            x if x.starts_with('#') => Ok(Comment(x[1..].into())),
            x if x.starts_with("0x") => i64::from_str_radix(&x[2..], 16)
                .map(Hex)
                .map_err(|_| UnknownToken(x, i)),
            x => {
                if x.contains('.') {
                    x.parse().map(NumF).map_err(|_| UnknownToken(x, i))
                } else {
                    x.parse().map(NumI).map_err(|_| UnknownToken(x, i))
                }
            }
        })
        .collect()
}

#[derive(Debug, PartialEq)]
pub enum ParseError<'a> {
    BadArr(&'a str, usize),
    UnknownToken(&'a str, usize),
}

impl<'a> std::fmt::Display for ParseError<'a> {
    fn fmt(&self, fmt: &mut std::fmt::Formatter) -> std::fmt::Result {
        use ParseError::*;
        match *self {
            BadArr(token, index) => write!(fmt, "Bad Array op: {}, index: {}", token, index),
            UnknownToken(token, index) => write!(fmt, "Unknown Token: {}, index: {}", token, index),
        }
    }
}

impl std::fmt::Display for Cmd {
    fn fmt(&self, fmt: &mut std::fmt::Formatter) -> std::fmt::Result {
        use Cmd::*;
        use VarType::*;
        match *self {
            Var(Frame) => write!(fmt, "t"),
            Var(MouseX) => write!(fmt, "mx"),
            Var(MouseY) => write!(fmt, "my"),
            Var(ScreenX) => write!(fmt, "sx"),
            Var(ScreenY) => write!(fmt, "sy"),
            NumF(y) => {
                let buf = format!("{}", y);
                if buf.contains('.') {
                    write!(fmt, "{}", buf)
                } else {
                    write!(fmt, "{}.0", buf)
                }
            }
            NumI(y) => write!(fmt, "{}", y),
            Hex(y) => write!(fmt, "0x{:X}", y), // Write out as 0xHEX
            Add => write!(fmt, "+"),
            Sub => write!(fmt, "-"),
            Mul => write!(fmt, "*"),
            Div => write!(fmt, "/"),
            Mod => write!(fmt, "%"),
            Shl => write!(fmt, "<<"),
            Shr => write!(fmt, ">>"),
            And => write!(fmt, "&"),
            Orr => write!(fmt, "|"),
            Xor => write!(fmt, "^"),
            Sin => write!(fmt, "sin"),
            Cos => write!(fmt, "cos"),
            Tan => write!(fmt, "tan"),
            Pow => write!(fmt, "pow"),
            AddF => write!(fmt, "+."),
            SubF => write!(fmt, "-."),
            MulF => write!(fmt, "*."),
            DivF => write!(fmt, "/."),
            ModF => write!(fmt, "%."),
            Lt => write!(fmt, "<"),
            Gt => write!(fmt, ">"),
            Leq => write!(fmt, "<="),
            Geq => write!(fmt, ">="),
            Eq => write!(fmt, "=="),
            Neq => write!(fmt, "!="),
            Cond => write!(fmt, "?"),
            Arr(size) => write!(fmt, "[{}", size),
            Meta(ref k, ref v) => write!(fmt, "!{}:{}", k, v),
            Comment(ref text) => write!(fmt, "#{}", text),
        }
    }
}

pub fn format_beat(cmds: &[Cmd]) -> String {
    cmds.iter()
        .map(|cmd| format!("{}", cmd))
        .collect::<Vec<_>>()
        .join(" ")
}
