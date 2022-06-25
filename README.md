Art Experiments

An art program using `pixel-canvas` which can currently display three types of art.

# IMPORTANT - FLICKER WARNING
Some of the art that BROKEN_FIELD generates can be extremely flickery or flashy. Please be careful if you are photosensitive.

# Overview

BROKEN_FIELD is an art program which procedurally generates different types of artistic visualizations. These art programs can be interacted with via keyboard & mouse.

## Controls
Left Click - Generate New Art
Right Click - Restart Current Art

Right Arrow - Run Art faster
Left Arrow - Run Art slower
Up - Run Art much faster (double current speed)
Down - Run Art much slower (halve current speed)

Z - See previous Art
X - See next Art
M - Generate New Art, mutating the current Art to produce the new Art
W/A/S/D - Keyboard Controls (only affects Bytebeat art)

1/2/3 - Switch generated Art type to Brainfuck/Bytebeat/Mandelbrot set respectively.

Tne window will hot-reload whatever is in `a.bytebeat` and attempt to parse it as a Bytebeat or Brainfuck program if possible.

# Brainfuck Mode
This mode visualizes the memory of a Brainfuck program. The Brainfuck program is given a standard input that loops "Hello, World!" forever and runs on a looping tape of 256 cells. The visualization simply displays the values in memory as large colored squares, which an outline on the currently selected square.

Examples:
![Image](screenshots/bf%20-%20example1.png)
![Image](screenshots/bf%20-%20example2.png)

[Video](https://youtube.com/watch?v=K_weN-BL4G8)

# Bytebeat Mode
This mode uses a stack based language to interactively display interesting art. Each pixel has the same program run for it, and the top value remaining on the stack after the program is executed is used to color the pixel a certain shade of green.

The commands are:
```
t - time counter, increments or decrements each frame at whatever speed the speed is currently set to
sx/sy - Screen X and Y coordinates
mx/my - Mouse X and Y coordinates
kx/ky - Keyboard X and Y coordinates
+ - * / - Basic integer arithmetic
% - Modulo
>> << - Bitshift left/right
& | ^ - Bitwise AND/OR/XOR
sin cos tan pow - Trignometic functinos
+. -. *. /. %. - Floating point versions of the artithmetic operations
< > <= >= == != - Comparators
? - Conditional, pop 3 values off of the stack called `a, b, cond`. If `cond` is true, push back `a`, else push back `b`
```

Some examples:
![Image](screenshots/bb%20-%20example1.png)
![Image](screenshots/bb%20-%20example2.png)
![Image](screenshots/bb%20-%20example3.png)
![Image](screenshots/bb%20-%20example4.png)


[Video 1](https://www.youtube.com/watch?v=Q91BZyxkqSY)
[Video 2](https://youtube.com/watch?v=fMa5Ox0A05k)
[Video 3](https://youtube.com/watch?v=DsSI1pCNn7c)

# Mandelbrot Mode
Current a WIP, but is meant to display random, interesting portions of the Mandelbrot set.