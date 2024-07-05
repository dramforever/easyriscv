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

RISC-V, as its name suggests, is [RISC (Reduced instruction set
computer)][wp-risc] architecture. Having started its life at UC Berkerley,
RISC-V has bred a lively community of students, researchers, engineers and
hobbyists working on software and hardware. Some highlights of RISC-V include:

[wp-risc]: https://en.wikipedia.org/wiki/Reduced_instruction_set_computer

- Clean design: Although loosely based on many previous designs, RISC-V is at
  its core a new and clean design. It does away with integer status flags like
  "carry" or "overflow", and does not have MIPS's branch delay slots. RISC-V
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

This article will cover the 32-bit bare bones RV32I instruction set with a tiny
subset of the privileged architecture.

By the end of this introduction, you will have learned these 45 instructions:

```
lui auipc jal jalr
beq bne blt bge bltu bgeu
lb lh lw lbu lhu sb sh sw
addi slti sltiu xori ori andi slli srli srai
add sub sll slt sltu xor srl sra or and
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

The 'Start' button assembles your code and, well, starts the emulator. If
there's a problem with your code, it will tell you about it and the emulator
will not start.

When the emulator is started, you can see the current state of the registers in
the side pane. More controls also becomes available. 'Run' runs until the end or
until you hit 'Pause'. 'Step' runs a single step.

If you hit 'Step', you'll notice that the above program takes two steps to run.
You may have guessed correctly that the first step corresponds to `addi`, and
the second corresponds to `ebreak`. The top of the register panel shows `pc`,
the current instruction address, and in parentheses the current instruction.

The 'Dump' button opens a new window containing some text. There are two
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

On RV32I, the architectural state comprises of

- 31 general purpose registers, `x1` through `x31`, capable of holding any
  32-bit data
- The program counter register `pc`

`x0` is a special "zero register". For computational instructions, you can use
`x0` anywhere a register is expected. Reading it always gives zero, and writing
to it just gets ignored.
