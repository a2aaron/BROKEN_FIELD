Brainfuck art experiments.

Currently, this program generates random, short brainfuck programs and runs them
on an input of "Hello, world!" and then outputs any interesting results. Here's
a sample of some of the output!


```
-.[[[<>]+.+[,.+.-+,.]]]         �☺HIelmlop, !woprlmd!"
->.,>+>.-<+,,>+[<.+-]
.>>,-+<>>.[.,,->,<+.]
-,[,]<[<+-][<],-[>.+]
,,[,+<+.]+>,,[.->-,[]]          nnq."yqtnf#☻☻☻☻☻
<[].-..[[.]+[,>>[[-]]]]         �������������������������������������������������
+-<<.>+....>-<+.,,>.            ☺☺☺☺☻�
,.[-+>.<.],>+++,,<,[]           HHHHHHHHHHHHHHH
-[<>,,,.+[,[<..].<+.]]          l���������������������������������������������
<+,.+,-+..--[.>.<-.<]           Heecbbaa``__^^]]\\[[ZZYYXX
+>.<,>>,,.+,>>-<,[[.]]          loooooooooooooooooooooooooooooooooooooooooo
++,+<.[,>.<.[[+]-][[]]]         Ie
->[]>,[,.>+,++-,..,.]           ello,wwordd!
>,--<->+-,.[<.<.+-,+]           e��mmmmpp--!!xxppssmm
-+-<.<>>+>[]>+[[[]<+]]          �
,.,++<>>,,.<[>-,.-<<]           Hl
-,+,+.<.,+.->+...>..            ffm☺☺☺
>.,+.,-.[<-.>][.><<<]           Id�������������������
,->,->-.[,<..[-]]+-.            �dd
.+<<>,<.>--[--,,[<]]            ☺
.,-.+><-[+->>-]>[,><]           G
-[--,[.,<.-,+]].-<><            Hemlp,!wprmd"☺☺☺☺☺
.,+<,>.>+>+<<[-,[<<-]]
>,.<<>++++,.[>.,+<.]            Heememepe-e!exepesemeee"e☺
<,>,,,.<+<<+,<[-.+,.]           ln,+ ▼wvonrqlkdc!
,,.>,>.[],[+,<>...--]           eooo,,,   wwwooorrrlllddd!!!
<-[,<<>],>-,.,--<<.<            lH
[>+],+.,,,<<-->..,,>            I
,,+[<<.,,[-.>+,,<].[]]          fkjihgfedcba`
+[[->]<><]-[[,[.<<.<]]]         HHHHHHHHHHHHHHHHHHHHHHHHHHHHH
```

(constants are, in the above sample
```rust 
const PROGRAM_LENGTH: usize = 20;
const MAX_STEPS: usize = 100;
const NUM_PROGRAMS: usize = 100;```)
