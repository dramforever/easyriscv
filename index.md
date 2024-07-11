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

This article will cover the 32-bit bare bones RV32I_Zicsr instruction set with a tiny
subset of the privileged architecture.

By the end of this introduction, you will have learned these 45 instructions:

```
lui auipc jal jalr
beq bne blt bge bltu bgeu
lb lh lw lbu lhu sb sh sw
addi slti sltiu xori ori andi slli srli srai
add sub slt sltu xor or and sll srl sra
ecall ebreak
csrrw csrrs csrrc csrrwi csrrsi csrrci
```

You will also catch a glimpse of what creating an operating system on RISC-V is
like, namely handling exceptions and privilege levels.

Let's get started.

## My first RISC-V assembly program

Throughout this article you will see emulator panes like these:

(If you just see a code block, there's a JavaScript problem. Make sure
you've enabled JavaScript, probably...)

::: {.emulator-disabled}
```{=html}
start:
    addi x10, x0, 0x123
    ebreak
```
:::

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

Why don't we start with the register view that shows the internal state of the
processor.

On the top of the register view is `pc`. The [program counter]{x=term}, or
[`pc`]{x=term} is the address of the current instruction. (The instruction
listed in parenthesis next to `pc` in the register view is provided as a
courtesy and is not part of the processor state.)

After that, 31 [general purpose registers]{x=term} registers are listed,
numbered [`x1` through `x31`]{x=reg}. These can contain any 32-bit data.

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

The [`sub`]{x=insn} instruction subtracts the value in `rs2` from the value in
`rs1` (i.e. `rs1 - rs2`), and puts the result in `rd`. There's no corresponding
`subi` instruction --- Just use `addi` with a negative number.

```
sub rd, rs1, rs2
```

Step through this demo program and try writing your own additions and
subtractions:

::: {.emulator-disabled}
```{=html}
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
:::

One thing you may have noticed is that the immediate value has a limited range,
namely `[-2048, 2047]`, the range of a 12-bit two's complement signed integer.
This is because RV32I uses fixed 32-bit i.e. 4-byte instructions, and only the
top 12 bits are available to encode an immediate value. You can see the
hexadecimal value encoded in the instruction from the 'Dump'. This article will
not go into much further detail about instruction encodings.

```
{ 0x40000000: 12300513 } addi x10, x0, 0x123
{ 0x40000004: 55500593 } addi x11, x0, 0x555
```

Even instructions as simple as addition and subtraction have other intersting
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

::: {.emulator-disabled}
```{=html}
    addi x10, x0, 0x123
    li x10, 0x123

    addi x11, x10, 0
    mv x11, x10

    ebreak
```
:::

Subtracting from zero is negation. What's negative of `0x123`?


::: {.emulator-disabled}
```{=html}
    addi x10, x0, 0x123
    sub x11, x0, x10

    ebreak
```
:::

Hmm, we get `0xfffffccd`. That's the 32-bit [two's complement]{x=term}
representation of `-291` or `-0x123`. There's plenty of tutorials on this out
there, so we'll just note that whenever something is "signed", RISC-V uses two's
complement representation. The benefit of this is that there's less instructions
for separate signed and unsigned instructions --- both signed and unsigned
numbers have the same overflow wrap-around behavior.

Speaking of overflow wrap-around, what happens if we add something too much and
it overflows? We'll use `add` to repeatedly double `0x123` and see what happens:

::: {.emulator-disabled}
```{=html}
    addi x10, x0, 0x123
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
:::

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
[`xor`]{x=insn} instructions similarly performs bitwise-"or" and bitwise-"xor".

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

::: {.emulator-disabled}
```{=html}
    addi x10, x0, 0x5a1
    xori x10, x10, 0xf0
    xori x10, x10, -1

    addi x11, x0, 0x5a1
    addi x12, x11, -1
    and x11, x11, x12
    addi x12, x11, -1
    and x11, x11, x12
    addi x12, x11, -1
    and x11, x11, x12

    addi x13, x0, 0x5a1
    ori x14, x13, 0xf
    ori x14, x13, 0xff
    ori x14, x13, 0xf0

    ebreak
```
:::

Remember that the immediate value is in the range `[-2048, 2047]`. For negative
values, the two's complement representation used means that the high bits are
all ones. For example, using `-1` as `imm` means the second operand is binary
all ones, or `0xffff_ffff`. This allows us to use `xori rd, rs1, -1` as
bitwise-"not".

### Comparison instructions

### Shift instructions

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
| `srl[i]` | <code>a &lt;&lt;<sub>u</sub> b</code> | `[0, 31]` |
| `sra[i]` | <code>a &lt;&lt;<sub>s</sub> b</code> | `[0, 31]` |

# Index

::: {index_of=term}
:::

::: {index_of=reg}
:::

::: {index_of=insn}
:::
