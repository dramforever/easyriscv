```{=html}
<head>
    <title>Easy RISC-V</title>

    <script type="module" src="easyriscv.js"></script>
    <link rel="stylesheet" href="style.css">
    <meta charset='utf-8'>
</head>

<body>
```

# Easy RISC-V

An interactive introduction to RISC-V assembly programming, by
[dramforever](https://github.com/dramforever).

Interested in the code? Want to report an issue? Check out the GitHub page:
<https://github.com/dramforever/easyriscv>

## Introduction

Inspired by [Easy 6502 by Nick Morgan][easy6502], this is a quick-ish
introduction to RISC-V assembly programming. This introduction is intended for
those with a basic familiarity with low level computer science concepts, but
unfamiliar with RISC-V. If you're curious about RISC-V, I hope this will be a
good start to your journey to learning about it.

[easy6502]: https://skilldrick.github.io/easy6502/

RISC-V (pronounced "risk-five"), as its name suggests, is [RISC (Reduced
instruction set computer)][wp-risc] architecture. Having started its life at UC
Berkerley, RISC-V has bred a lively community of students, researchers,
engineers and hobbyists working on software and hardware. Some highlights of
RISC-V include:

[wp-risc]: https://en.wikipedia.org/wiki/Reduced_instruction_set_computer

- Clean design: Although loosely based on many previous designs, RISC-V is at
  its core a new and clean design. It does away with integer status flags like
  "carry" or "overflow", and does not have MIPS's branch delay slots. RISC-V is
  designed primarily as a target for compilers, but writing RISC-V assembly by
  hand is still quite pleasant.
- Open standard: RISC-V specifications are developed publicly and anyone can use
  them without copyright or patent licensing issues. Many researchers and
  companies around the world have made their own RISC-V processor cores and
  chips based on these specificaions.
- Community support: If you want to make your own processors, rather than paying
  a hefty license fee to Arm, or designing your own architecture, you can just
  use RISC-V. Using RISC-V instead of a custom architecture allows you to make
  use of the existing and growing software ecosystem instead of having to
  maintain your own.

RISC-V is less mature than more established architectures like x86 or Arm, but
it is already gaining steam real quick and has found great success in many areas
of application, such as embedded systems, custom processors, education, and
research.

This article will cover the 32-bit bare bones RV32I_Zicsr instruction set with a
tiny subset of the privileged architecture. You'll probably never find a "real"
chip with such bare bones instruction support. Most of them will have more
*extensions* for other features like floating point or compressed instructions.
However, I would still consider what we have here a "complete" instruction set.
For example, Rust has [Tier 2 support][rust-riscv32-none] for the target
`riscv32i-unknown-none-elf` which actually works completely fine with
only the instructions we'll cover here.

[rust-riscv32-none]: https://doc.rust-lang.org/nightly/rustc/platform-support/riscv32-unknown-none-elf.html

Speaking of instructions we will cover, why don't we meet the 45 of them right
here and now:

<!-- TODO: Ordering? -->

```
lui auipc jal jalr
beq bne blt bge bltu bgeu
lb lh lw lbu lhu sb sh sw
addi slti sltiu xori ori andi slli srli srai
add sub slt sltu xor or and sll srl sra
ecall ebreak
csrrw csrrs csrrc csrrwi csrrsi csrrci
```

Some of these instruction names should ring a bell (`add`, `or`, `xor`). Others
will look like they have some pattern to it. A few weird ones like `auipc` stand
out. These instructions form the foundation of RISC-V, performing the basic
tasks a processor would do.

You will also catch a glimpse of what creating an operating system on RISC-V is
like, namely handling exceptions and privilege levels.

Let's get started.

## My first RISC-V assembly program

Throughout this article you will see emulator panes like these:

(If you just see a code block, there's a JavaScript problem. Make sure
you've enabled JavaScript, probably...)

```emulator
start:
    addi x10, x0, 0x123
    ebreak
```

You can use the buttons to control each emulator. Go ahead and click on 'Start'.
A register view should pop up showing the state of the emulator. Now click on
'Run'. You'll notice that:

```
a0 (x10) 0x00000000
```

Changed into:

```
a0 (x10) 0x00000123
```

And the emulator stopped. Congratulations, you've run your first RISC-V assembly
program.

## Emulator controls

'Start' assembles your code and, well, starts the emulator. If there's a problem
with your code, it will tell you about it and the emulator will not start.

When the emulator is started, you can see the current state of the registers in
the side pane. More controls also becomes available. 'Run' runs until the end or
until you hit 'Pause'. 'Step' runs a single step.

If you hit 'Step', you'll notice that the above program takes two steps to run.
You may have guessed correctly that the first step corresponds to `addi`, and
the second corresponds to `ebreak`. The top of the register panel shows `pc`,
the current instruction address, and in parentheses the current instruction.

'Dump' opens a new window containing some text. There are two
sections: the first is the symbol table, which tells you about the labels in
your code:

```
# Symbols
# 0x40000000 start
```

The second section is an annotated version of your code:

```
start:
{ 0x40000000: 12300513 } addi x10, x0, 0x123
{ 0x40000004: 00100073 } ebreak
```

This tells you that the `addi` instruction encodes to hex `12300513`, and starts
at address hex `40000000`. Similarly, `ebreak` encodes as `00100073` at
address hex `40000004`.

(Note: RISC-V instructions are *little-endian*, meaning that the four bytes of
`addi` are actually `13 05 30 12`.)

We'll talk in detail about all of `pc`, registers, instructions, labels, and the
two checkboxes later.

Now you may have also guessed that `addi x10, x0, 0x123` means `x10 = x0 +
0x123`. As of `ebreak`, for now, just remember that `ebreak` stops the emulator.

## Processor state

<!-- TODO: Rewrite this section so it doesn't look like it's about the emulator -->

Why don't we start with the register view that shows the internal state of the
processor.

On the top of the register view is `pc`. The [program counter]{x=term}, or
[`pc`]{x=term} is the address of the current instruction. (The instruction
listed in parenthesis next to `pc` in the register view is provided as a
courtesy and is not part of the processor state.)

After that, 31 [general purpose registers]{x=term} are listed, numbered [`x1`
through `x31`]{x=reg}. These can contain any 32-bit data.

(If you're wondering, there are no flags for RV32I.)

You may have noticed I've omitted one register. The register [`x0`]{x=reg} is a
special "zero register". For computational instructions, you can use `x0`
anywhere a register is expected. Reading it always gives zero, and writing to it
just gets ignored. The use of a special register simplifies the design of the
architecture, and this use is shared by MIPS and Arm AArch64. We will make good
use of `x0` soon.

## Instruction syntax

But before we can start talking about instructions themselves, we need a way to
talk about the [instruction syntax]{x=term} so I can, you know, write it down
for you.

The syntax of an instruction is the instruction name and then several
comma-separated operands. For example, for this instruction we've seen above:

```
addi x10, x0, 0x123
```

`x10` is the [destination register]{x=term} or [`rd`]{x=term}. The next operand
is the first (and only) [source register]{x=term} or [`rs1`]{x=term}. The last
operand is an [immediate value]{x=term} or [`imm`]{x=term}. Using these
abbreviations, we can summarize that the syntax for `addi` is:

```
addi rd, rs1, imm
```

Some other instructions have a second source register or [`rs2`]{x=term}. For
example, the non-immediate `add` instruction has this syntax:

```
add rd, rs1, rs2
```

Some other instructions have no operands, like `ebreak`. Others have slightly
more complex operands.

## Computational instructions

Using the registers as a playground of numbers, we can use computational
instructions to work with them.

### Arithmetic instructions

As we've seen above, you can get a RISC-V machine to add numbers together.

The [`addi`]{x=insn} instruction adds the value in `rs1` to the immediate value
`imm`, and puts the result in `rd`.

```
addi rd, rs1, imm
```

The [`add`]{x=insn} instruction adds the value in `rs1` to the value in `rs2`, and
puts the result in `rd`.

```
add rd, rs1, rs2
```

The opposite of addition is subtraction. The [`sub`]{x=insn} instruction
subtracts the value in `rs2` from the value in `rs1` (i.e. `rs1 - rs2`), and
puts the result in `rd`. There's no corresponding `subi` instruction --- Just
use `addi` with a negative number.

```
sub rd, rs1, rs2
```

Step through this demo program and try writing your own additions and
subtractions:

```emulator
    addi x10, x0, 0x123
    addi x11, x0, 0x555

    addi x12, x10, 0x765
    add x13, x10, x11
    sub x14, x11, x10

    addi x10, x10, 1
    addi x10, x10, 1
    addi x10, x10, -1
    addi x10, x10, -1

    ebreak
```

One thing you should note is that the immediate value has a limited range,
namely `[-2048, 2047]`, the range of a 12-bit two's complement signed integer.
This is because RV32I uses fixed 32-bit i.e. 4-byte instructions, and only the
top 12 bits are available to encode an immediate value. You can see the
hexadecimal value encoded in the instruction from the 'Dump'. This article will
not go into much further detail about instruction encodings.

```
{ 0x40000000: 12300513 } addi x10, x0, 0x123
{ 0x40000004: 55500593 } addi x11, x0, 0x555
```

Even instructions as simple as addition and subtraction have other interesting
uses. We have already used `addi x10, x0, 0x123` to put `0x123` in the register
`x10`. When writing in assembly, we can use a little shortcut called
[pseudoinstructions]{x=term}. The [`li`]{x=insn} ("load immediate")
pseudoinstruction is a convenient way to put a small value in a register. It
expands to `addi rd, x0, imm` when `imm` is in the range `[-2048, 2047]`.

```
li rd, imm
```

When `imm` is `0`, `addi` copies the value without changing it because adding
zero is the same as doing nothing. The [`mv`]{x=insn} ("move") pseudoinstruction
copies the value from `rs1` to `rd`. It expands to `addi rd, rs1, 0`.

```
mv rd, rs1
```

Using the pseudoinstruction vs the "real" instruction are equivalent. You can
see in the dump that the two are assembled exactly the same way.

```emulator
    addi x10, x0, 0x123
    li x10, 0x123

    addi x11, x10, 0
    mv x11, x10

    ebreak
```

Subtracting from zero is negation. What's negative of `0x123`?


```emulator
    li x10, 0x123
    sub x11, x0, x10

    ebreak
```

Hmm, we get `0xfffffccd`. That's the 32-bit [two's complement]{x=term}
representation of `-291` or `-0x123`. There's plenty of tutorials on this out
there, so we'll just note that whenever something is "signed", RISC-V uses two's
complement representation. The benefit of this is that there's less instructions
for separate signed and unsigned instructions --- both signed and unsigned
numbers have the same overflow wrap-around behavior.

Speaking of overflow wrap-around, what happens if we add something too much and
it overflows? We'll use `add` to repeatedly double `0x123` and see what happens:

```emulator
    li x10, 0x123
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10
    add x10, x10, x10

    ebreak
```

As `0x123` crawls up to the upper bits and eventually we get to `0x9180_0000`,
in the next iteration it turns into `0x2300_0000`. There was an overflow! Double
of `0x9180_0000` is `0x1_2300_0000`, but that needs 33 bits in binary, so the
highest bit can't be put in the result. Since RISC-V doesn't have flag bits for
carry or overflow, it's simply gone. The programmer is expected to deal with
this.

### Bitwise instructions

While we're talking about bits, another thing we can do about bits is doing
bitwise logical operations on them.

The [`and`]{x=insn} instruction performs a bitwise-"and" between the bits of
`rs1` and `rs2` and puts the result in `rd`. The [`or`]{x=insn} and
[`xor`]{x=insn} instructions similarly performs bitwise-"or" and bitwise-"xor",
respectively.

```
and rd, rs1, rs2
or rd, rs1, rs2
xor rd, rs1, rs2
```

Immediate operand versions of the three, namely [`andi`]{x=insn},
[`ori`]{x=insn}, [`xori`]{x=insn} also exist.

```
andi rd, rs1, imm
ori rd, rs1, imm
xori rd, rs1, imm
```

Here are some random bit operation examples you can play with:

```emulator
    li x10, 0x5a1
    xori x10, x10, 0xf0
    xori x10, x10, -1

    li x11, 0x5a1
    addi x12, x11, -1
    and x11, x11, x12
    addi x12, x11, -1
    and x11, x11, x12
    addi x12, x11, -1
    and x11, x11, x12

    li x13, 0x5a1
    ori x14, x13, 0xf
    ori x14, x13, 0xff
    ori x14, x13, 0xf0

    ebreak
```

Remember that the immediate value is in the range `[-2048, 2047]`. For negative
values, the two's complement representation used means that the high bits are
all ones. For example, using `-1` as `imm` means the second operand is binary
all ones, or `0xffff_ffff`. This allows us to use `xori rd, rs1, -1` as
bitwise-"not".

```emulator
    li x10, 0x5a1
    xori x11, x10, -1

    or x12, x10, x11
    add x13, x10, x11

    ebreak
```

Another interesting operation you can do is to round/[align]{x=term} something up or
down to a multiple of a power of two. For example, if you want to find the
closest multiple of 16 below `a`, in binary that would be clearing the lowest 4
bits, or `a & ~0b1111`. Conveniently, that's `a & -16` in two's complement.

Aligning up is less intuitive, but one idea would be adding 16 first. However
that gives an incorrect result for powers of 16. It's easy enough to fix though:
adding one less works exactly right: `(a + 15) & -16`

```emulator
    li x10, 0x123
    andi x11, x10, -16

    addi x12, x10, 15
    andi x12, x12, -16
    ebreak
```

### Comparison instructions

Usually when you write a comparison of some sort like `a == b` or `a >= b`, it's
used as a condition for some `if` or loop, but... those things are complicated!
We're getting to it later.

Sometimes you just want a boolean value out of a comparison. The C convention
uses 1 for true and 0 for false, and since the world runs on C now, that's what
RISC-V provides.

In C there are six comparison operators:

```
== != < > <= >=
```

The values being compared can also be both signed or both unsigned.

How many comparison instructions do we have at our disposal? Let's see...

The [`slt`]{x=insn} ("set less than") instruction compares `rs1` and `rs2` as
signed 32-bit integers, and sets `rd` to `1` if `rs1 < rs2`, and `0` otherwise
(`rs1 >= rs2`). The [`sltu`]{x=insn} instruction is similar but it treats the
operands as unsigned values. [`slti`]{x=insn} and [`sltiu`]{x=insn} are similar
but the second operand is an immediate value.

```
slt rd, rs1, rs2
sltu rd, rs1, rs2
slti rd, rs1, imm
sltiu rd, rs1, imm
```

(Of particular note is `sltiu`, where the immediate operand still has the range
`[-2048, 2047]` but is sign extended to 32 bits and then treated as an unsigned
value, like what would happen in C with `a < (unsigned)-1`.)

That's... one of the six comparisons settled. What about the others? As it turns
out, we can synthesize any of the other five, using up to two instructions.

Making `>` from `<` is easy, as you can just swap the operands. Using `xori`
with `1` we can invert the result of a comparison, giving as `<=` and `>=`.

```emulator
    li x10, 0x3
    li x11, 0x5

    slt x12, x10, x11   # x10 < x11
    slt x13, x11, x10   # x10 > x11

    xori x14, x12, 1    # x10 >= x11  i.e.  !(x10 < x11)
    xori x15, x13, 1    # x10 <= x11  i.e.  !(x10 > x11)

    ebreak
```

That was signed comparison but unsigned comparison works the same using `sltu`
instead of `slt`.

As for `==` and `!=`, let's tackle the easier case of `a == 0` and `a != 0`
first. We will use the fact that for unsigned values, `a != 0` is equivalent to
`a > 0`. The negation of that is `a <= 0`, which is the same as `a < 1`.

```emulator
    li x10, 0

    sltu x11, x0, x10   # 0 <u x10  i.e.  x10 != 0
    sltiu x12, x10, 1   # x10 <u 1  i.e.  x10 == 0
```

As a bonus, this is also how we get logical not and converting integer to
boolean.

Now that we have these, `a == b` is just `(a - b) == 0`, and `a != b` is just
`(a - b) != 0`.

```emulator
    li x10, 0x3         # a
    li x11, 0x5         # b
    sub x10, x10, x11   # x10 = a - b

    sltu x11, x0, x10   # 0 <u x10  i.e.  x10 != 0
    sltiu x12, x10, 1   # x10 <u 1  i.e.  x10 == 0

    ebreak
```

In summary: (`[u]` means use `u` for unsigned comparison and nothing for signed
comparison)

- `a < b`: `slt[u]`
- `a > b`: `slt[u] reversed`
- `a <= b`: `slt[u] reversed ; xori 1`
- `a >= b`: `slt[u] ; xori 1`
- `a == 0`: `sltu x0`
- `a != 0`: `sltiu 1`
- `a == b`: `sub ; sltu x0`
- `a != b`: `sub ; sltiu 1`

### Shift instructions

There is no way I can do justice to the usage of bit shifts in the middle of a
tutorial on RISC-V assembly. If you're here, you've probably heard of them.
There's nothing really special to the way they appear in usage for RISC-V.

There are two variants for right shifting: [`srl`]{x=insn} and [`srli`]{x=insn}
("shift right logical (immediate)") performs "logical" or unsigned right shift
where the leftmost or most significant bits are filled with zeros.

[`sra`]{x=insn} and [`srai`]{x=insn} ("shift right arithmetic (immediate)")
performs "arithmetic" or signed right shift where the leftmost bits are filled
with the same of what highest/sign bit was. So if you shift a negative value,
you get a negative result; if you shift a non-negative value, you get a
non-negative result.

```
srl rd, rs1, rs2
sra rd, rs1, rs2
srli rd, rs1, imm
srai rd, rs1, imm
```

As before, the ones with the `i` suffix take an immediate value as the second
operand, and the ones without `i` take a register.

```emulator
    li x10, -3
    srai x11, x10, 16
    srli x12, x10, 16
    ebreak
```

So `a` means "arithmetic", `l` means "logical". Got it.

Left shifts have no such distinction. For consistency they are still "logical":
[`sll`]{x=insn} is left shift, and [`slli`]{x=insn} is left shift with
immediate.

```
sll rd, rs1, rs2
slli rd, rs1, imm
```

Aha, now we can blow up `0x123` without repeating myself so much:

```emulator
    li x10, 0x123
    slli x10, x10, 10
    slli x10, x10, 10
    slli x10, x10, 10
    ebreak
```

The immediate value for shift instructions are special: they can only be in the
range of 0 to 31, inclusive, because it doesn't make sense to shift by a
negative amount, or by more than 31. When the shift amount is taken from a
register, the value is considered modulo 32, or in other words only the last 5
bits are taken into account:

```emulator
    li x10, 0x444
    li x11, 0x81

    srl x10, x10, x11   # Same as shifting by 1

    ebreak
```

For some fun, let's try multiplying a value by 10, something you would do when
parsing decimal numbers: `a * 10` can be rewritten as `(a << 1) + (a << 3)`:

```emulator
    li x10, 0x5

    slli x11, x10, 1
    slli x12, x10, 3
    add x11, x11, x12

    ebreak
```

### That's it...?

That's it?

You may have noticed some glaring omissions. What we've learned doesn't even
cover grade school math: multiplication and division are missing.

RISC-V is designed with [extensions]{x=term} in mind. Remember that as said in
the introduction, RV32I is the barest bones of the barest bones we've got.
Forcing everyone to make their processors with multiplication and division even
for tasks that don't need them would waste silicon area and money on every chip.
Instead those making RISC-V processors have great freedom to choose, and indeed
some would say, they have too much freedom.

For us... Honestly, I'm just glad we've been dealt a hand that we can tackle
completely in full. There's no way I'm finishing writing this tutorial if it
were more full-fledged.

### Summary of computational instructions

(Operand `a` is `rs1`, and `b` is `rs2` or immediate. In the instruction name
`[i]` means an immediate variant is available. Subscript `u` means unsigned and
`s` means two's complement signed.)

| Instruction | Operation | Immediate range |
|---|----|---|
| `add[i]` | `a + b` | `[-2048, 2047]` |
| `sub` | `a - b` | (n/a) |
| `slt[i]` | <code>(a &lt;<sub>s</sub> b) ? 1 : 0</code> | `[-2048, 2047]` |
| `slt[i]u` | <code>(a &lt;<sub>u</sub> b) ? 1 : 0</code> | `[-2048, 2047]` |
| `xor[i]` | `a ^ b` | `[-2048, 2047]` |
| `or[i]` | `a | b` | `[-2048, 2047]` |
| `and[i]` | `a & b` | `[-2048, 2047]` |
| `sll[i]` | `a << b` | `[0, 31]` |
| `srl[i]` | <code>a &gt;&gt;<sub>u</sub> b</code> | `[0, 31]` |
| `sra[i]` | <code>a &gt;&gt;<sub>s</sub> b</code> | `[0, 31]` |

## Intermission: Larger numbers

The `addi` instruction has limit on the immediate value. How do we make bigger
values?

The [`lui`]{x=insn} ("load upper immediate") instruction takes an immediate in
the range `[0, 1048575]` (i.e. up to <code>2<sup>20</sup> - 1</code>) and sets
`rd` to that value left shifted 12 bits:

```
lui rd, imm20
```

That was... slightly confusing. Why don't we give it a try:

```emulator
    lui x10, 1
    lui x11, 2
    ebreak
```

Instead of `li` loading a "low" immediate, we control the *upper* 20 bits of
what we put in the register. After that, we can use another `addi` instruction
to fill in the lower bits. For example, if we want `0x12345`:

```emulator
    lui x10, 0x12
    addi x10, x10, 0x345
    ebreak
```

For convenience, in assembly you can use `%hi()` and `%lo()` to extract the,
well, high 20 and low 10 bits of a value. The previous example could also be
written:

```emulator
    lui x10, %hi(0x12345)
    addi x10, x10, %lo(0x12345)
    ebreak
```

Letting `lui` handle the high 20 bits, and `addi` for the low 12 bits, you can
make any 32-bit value.

(A small complication arises if you want to use values with bit 11 set. In that
case, the immediate operand to `addi` will have to be negative. However `%hi`
understands this and adds one to compensate, so this `%hi`/`%lo` combination
does work for everything.)

## Jumps and branches

So far, everything that we've had so far can be done on even the most basic
programmer's calculator. To truly make a computer... do computer stuff, we'd
want loops and conditionals.

In RISC-V parlance, a [branch]{x=term} is a conditional transfer of control
flow, and a [jump]{x=term} is an unconditional transfer of control flow.

I think the branch instructions are slightly simpler, so let's start with those.

### Branches

All the branch instruction follow the form "If some comparison, go to
somewhere." The conditions are:

- [`beq`]{x=insn}: `rs1 == rs2` ("equal")
- [`bne`]{x=insn}: `rs1 != rs2` ("not equal")
- [`blt`]{x=insn}: `rs1 < rs2` signed ("less than")
- [`bge`]{x=insn}: `rs1 >= rs2` signed ("greater or equal")
- [`bltu`]{x=insn}: `rs1 < rs2` signed ("less than unsigned")
- [`bgeu`]{x=insn}: `rs1 >= rs2` signed ("greater or equal unsigned")

(In case you're wondering about the confusing choice of ordering operators here,
it's just that the negation of `<` is `>=`.)

```
beq rs1, rs2, label
bne rs1, rs2, label
blt rs1, rs2, label
bge rs1, rs2, label
bltu rs1, rs2, label
bgeu rs1, rs2, label
```

Oh, right, almost forgot to explain what labels are. Labels are convenience
identifiers for addresses at some line of your code. They are some identifier
followed by a colon (like `this:`). They can appear on a line of its own, or
before any instruction on the line. You can see which address they point to
using the "Dump" button. The third operand of a branch instruction is a label to
jump to if the condition holds.

Let's add up all the numbers from 1 to 100:

```emulator
    li x10, 100         # i = 100
    li x11, 0           # sum = 0

loop:
    add x11, x11, x10   # sum = sum + i
    addi x10, x10, -1   # i = i - 1
    blt x0, x10, loop   # If i > 0: loop again
                        # Otherwise: done

    ebreak
```

# Index

::: {index_of=term}
:::

::: {index_of=reg}
:::

::: {index_of=insn}
:::
