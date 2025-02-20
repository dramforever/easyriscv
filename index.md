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
lui auipc
jal jalr
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
completely in full. There's no way I'm finishing writing this tutorial if RV32I
wasn't so bare boned.

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

You can try your hands on making your favorite loops, like fibonacci numbers or
something. Speaking of trying your hands, just so we're ready, here's what an
infinite loop looks like. Try pausing or stopping the loop, and single stepping
through the instructions.

```emulator
loop:
    addi x10, x10, 1
    add x11, x11, x10
    beq x0, x0, loop
```

(If you know a thing or two about JavaScript in the browser, you'll know that a
real infinite loop in JavaScript makes the whole page becomes unresponsive,
unless it's in a worker or something. The "Run" button here just runs the
emulator for a certain number of steps, pausing by giving back control to the
event loop in between.)

(This isn't the preferred way to write an unconditional jump. We'll see what is
later.)

By the way, this should be fresh on your mind from a few sections earlier, but
in case you forgot, there's no `bgt[u]` or `ble[u]` because you can just swap
`rs1` and `rs2` to get those.

### Jumps

There are two jump instructions in RISC-V. One of them is [`jal`]{x=insn} "jump
and link", which sets `rd` to the address of the following instruction, and then
jumps to a label:

```
jal rd, label
```

Another is [`jalr`]{x=insn} "jump and link register", which sets `rd` to the
address of the following instruction, and then jumps to the address at `imm +
rs1`.

```
jalr rd, imm(rs1)
```

(Actually, the address jumped to is `(imm + rs1) & ~1`, i.e. the least
significant bit is cleared. This distinction won't come up in normal code, like,
pretty much ever.)

Eesh, that's some funky looking syntax. When you see parentheses like this, it
has something to do with an *address*. Parens means address.

That's... still a lot going on. Let's take on some simpler cases first: If `rd`
is `x0` then the only thing these instructions do is jumping. We can use it
instead of the branch instructions for an unconditional jump.

```emulator
loop:
    # Yes this is an infinite loop. You can
    # see that we execute this one
    # instruction over and over
    jal x0, loop
```

For convenience, a pseudoinstruction is available for you: [`j`]{x=insn} is for
`jal` with `rd` being `x0`:

```
j label
```

As of why you would want to do this... Well, we only have 32 bits per
instruction, and since the `jal` instruction only needs one register number
instead of the branch instructions' two, and it doesn't need a condition, the
instruction encoding permits jumping over a longer range. So this is always
preferred over something like `beq x0, x0, label` for a jump.

As of `jalr`, you can jump to an address that's stored in a register. In C, that
would be dealing with function pointers. You'd need this any time where a
dynamic dispatch is needed. For example, we load the address of `foo` into a
register first before jumping to it.

```emulator
    lui x10, %hi(foo)
    addi x10, x10, %lo(foo)
    jalr x0, 0(x10)

    # This isn't executed
    li x12, 1
    ebreak

foo:
    # This is executed
    li x12, 2
    ebreak
```

In case you forgot by now, the `lui`/`addi` combo at the start puts the address
of the label `foo` in register `x10`.

Similar to `j`, [`jr`]{x=insn} is a psuedoinstruction for `jalr` with `rd` being
`x0` and `imm` being `0`:

```
jr rs1
```


Hmmm... If I didn't really need the address in `x10`, that `addi` would be
unnecessary, since `jalr` has the ability to add a low immediate on its own:

```emulator
    lui x10, %hi(foo)
    jalr x0, %lo(foo)(x10)

    # This isn't executed
    li x12, 1
    ebreak

foo:
    # This is executed
    li x12, 2
    ebreak
```

What's the advantage of this over `jal x0`? Since `%hi` and `%lo` can represent
any 32-bit value, this two-instruction combo can jump to any address, free from
range restrictions. You do need a free scratch register for the high part of the
address though, but since RISC-V gives you 31 of them, this shouldn't be too
much of a problem.

## Jump and link

What's the deal with the destination register then? What do you need the address
of the next instruction for? For jumping *back* of course. We can use this
functionality to call functions and return back.

```emulator
    li x10, 1
    jal x1, double  # Call double
    jal x1, double  # Call double
    ebreak

    # Double the value in x10
double:
    add x10, x10, x10
    jr x1           # Return
```

Note that I used the register `x1` for this, which is the register for providing
the return address by convention. For convenience, if the destination register
is omitted in `jal`, it defaults to `x1`. Meanwhile, [`ret`]{x=insn} is a
pseudoinstruction that stands for `jr x1`, i.e. `jalr x0, 0(x1)`:

```
jal label
ret
```

So the example above can be rewritten more conveniently as:

```emulator
    li x10, 1
    jal foo
    jal foo
    ebreak

foo:
    add x10, x10, x10
    ret
```

## Memory

That's a nice computer we have here. Now we have... all of 31 &times; 4 = 124
bytes of storage in the form of registers to work with. I want more...

### Basic memory accesses

The emulator has 1 MiB of memory starting at address `0x4000_0000`. That's
`0x4000_0000` to `0x400f_ffff`, inclusive. The assembler starts assembling at
the beginning of memory, as you can see in the dump, starting at address
`0x4000_0000`.

The [`.word`]{x=dir} [directive]{x=term} straight up puts a 4-byte/32-bit word
into the current position. You can specify multiple values separated by commas.

```
.word value [ , value [ , ...  ] ]
```

The [`lw`]{x=insn} ("load word") instruction loads a word from the address `rs1
+ imm` and puts it in `rd`, in other words it reads the word from memory:

```
lw rd, imm(rs1)
```

As with `jalr`, you can combine it with `lui` to access any address.

```emulator
    lui x10, %hi(foo)
    lw x11, %lo(foo)(x10)
    ebreak

foo:
    # Get it? foo, f00 ...
    .word 0xf00
```

The [`sw`]{x=insn} ("store word") instruction stores `rs2` to a word in memory
at address `rs2 + imm`, in other words it writes the word to memory:

```
sw rs2, imm(rs1)
```

```emulator
    lui x10, %hi(foo)
    lw x11, %lo(foo)(x10)

    li x12, 0x123
    sw x12, %lo(foo)(x10)

    # Now it's changed
    lw x13, %lo(foo)(x10)
    ebreak

foo:
    .word 0xf00
```

Just to make absolutely sure we're clear on this, [load]{x=term} means reading
from memory, [store]{x=term} means writing to memory. Both words can be nouns
and verbs. Also, a [word]{x=term} is 32-bit for RISC-V.

Let's have some fun. Can we have the program read itself?

```emulator
here:
    lui x10, %hi(here)
    lw x10, %lo(here)(x10)
    ebreak
```

Ohh that's fun. Does this mean I can also write programs with just `.word`?

```emulator
    .word 0x40000537 # lui x10, %hi(here)
    .word 0x00052503 # lw x10, %lo(here)(x10)
    .word 0x00100073 # ebreak
```

Oh that's nice. Just a peek into the world of machine code and instruction
encodings... which we will not be getting into.

With memory accesses under our belt, we can address a lot more data easily.
Here's an example where we find the sum of all the values in an array. Note how
we can access different addresses of memory, whereas there is no way to address
a register by a number in another register.

```emulator
    lui x10, %hi(array)
    addi x10, x10, %lo(array)

    li x11, 8   # length

    # Get end address
    slli x11, x11, 2
    add x11, x11, x10

    li x12, 0 # sum

loop:
    # If current == end, done
    beq x10, x11, end
    lw x13, 0(x10)      # Load from array
    add x12, x12, x13   # Add to sum
    addi x10, x10, 4    # Bump current pointer
    j loop

end:
    ebreak


array:
    .word 13, 24, 6, 7, 8, 19, 0, 4
```

The equivalent in C would be something like

```
uint32_t array[], length;

uint32_t *current = array;
uint32_t *end = array + length;
uint32_t sum = 0;

for (; current != end; current ++) {
    sum += *current;
}
```

Note how adding one to a pointer to word bumps the address by 4, because the
addresses are all byte addresses, and one word is four bytes. In C, the compiler
handles the multiplier for you, but in assembly you have to remember to do it
manually.

<!-- TODO: I need some memory dump thing to make useful examples of `sw` -->

### Smaller widths

Not everything in memory is word sized. You've already seen an array, which is
multiple-word-sized. There are also stuff smaller than word-sized.

An obvious one is the [byte]{x=term}, which is, well, 1-byte/8-bit and written
`[u]int8_t` in C. In the middle is the [halfword]{x=term}, which is
2-byte/16-bit and written `[u]int16_t` in C. You can use the directives
[`.byte`]{x=dir} and [`.half`]{x=dir} for those respectively.

```
.byte value [ , value [ , ...  ] ]
.half value [ , value [ , ...  ] ]
```

And just in case you don't remember those, [`.2byte`]{x=dir} means the same as
`.half`, and [`.4byte`]{x=dir} means the same as `.word`.

```
.2byte value [ , value [ , ...  ] ] # Same as .half
.4byte value [ , value [ , ...  ] ] # Same as .word
```

There's a small problem with loading smaller-than-word sized values into
word-sized registers: What do you do with the rest of the bits? Obviously the
lowest of the bits gets the actual value loaded. There are two most useful ways
to fill the upper bits:

- [zero extension]{x=term}: The higher bits are filled with zeros
- [sign extension]{x=term}: The higher bits are filled with copies of the
  highest bit of the original value

Zero extension is easy enough. As the name suggests, sign extension has
something to do with signed values. It's what happens when you convert a
narrower signed value into a wider one.

(Keeping the rest of the bits unchanged isn't a good option. It complicates the
implementation for processor, especially of modern high performance design, to
just write parts of a register. It would be easiest if the new value didn't
depend on the old value.)

For example, the signed byte value `-100` is `0x9c`. Since the highest bit i.e.
the sign bit of it is `1`, when we expand it into 32 bits we fill the high 24
bits with one so the new value, `0xffff_ff9c` still represents `-100`. This is
sign extension.

If we want to convert the unsigned byte value `156`, still `0x9c`, into an
unsigned word, it would have to be `0x0000_009c` to preserve its value.

For bytes, the [`lb`]{x=insn} ("load byte") instruction loads a byte and sign
extends the result, and the [`lbu`]{x=insn} ("load byte unsigned") instruction
does the same but zero extends the result. As with `lw`, the address is `rs1 + imm`.

```
lb rd, imm(rs1)
lbu rd, imm(rs1)
```

Similarly for [`lh`]{x=insn} ("load half") and [`lhu`]{x=insn} ("load half
unsigned"), just for unsigned halfwords:

```
lh rd, imm(rs1)
lhu rd, imm(rs1)
```

We can try out the sign extension and zero extension example from earlier.

```emulator
    # Signed
    li x10, -100
    lui x11, %hi(test)
    lb x11, %lo(test)(x11)

    # Unsigned
    li x12, 156
    lui x13, %hi(test)
    lbu x13, %lo(test)(x13)

    ebreak

test:
    .byte 0x9c
```

While we're at it, here's two more minor details. Firstly, [endianness]{x=term}.
While theoretically big endian RISC-V machines can exist, I've never seen one...
and this emulator is little endian, meaning that the four bytes in a word are
laid out in memory lowest first. So, `.byte 0x1, 0x2, 0x3, 0x4` would be the
same as `.word 0x04030201`.

```emulator
    lui x10, %hi(test)
    lw x10, %lo(test)(x10)
    ebreak

test:
    .byte 0x1, 0x2, 0x3, 0x4
```

Secondly, memory accesses should be [aligned]{x=term} for maximum efficiency.
This means that the address for a halfword/2byte should be a multiple of two,
and the address for a word/4byte should be a multiple of four. Misaligned
accesses (meaning, well, when the address is not aligned) may not work as
expected.

For user programs running on a rich operating systems, misaligned accesses are
supported but may be slow. In embedded application running on microcontrollers
and such, it might not work at all.

This emulator supports misaligned memory accesses.

```emulator
    lui x10, %hi(test)
    addi x10, x10, %lo(test)

    lw x11, 0(x10)
    lw x12, 1(x10)
    lw x13, 3(x10)

.test
    .byte 1, 2, 3, 4, 5, 6, 7, 8
```

Now you can try translating some basic C code into RISC-V assembly. Functions
are... still out of the questions for now. Variables have to be either global or
put in registers. What else are we missing...

### Memory-mapped I/O

Is it Hello World time? I think it's Hello World time...

For a computer to not just be a space heater, we need some way for it to at
least generate output and take input. While other architectures may have
dedicated I/O instructions, RISC-V uses [memory mapped I/O]{x=term}.
Essentially, this means that loads and stores to special addresses communicate
with other [devices]{x=term}. They do not work like normal memory, and you
should only use the supported widths to access them.

One output device we have here is at address `0x1000_0000`. Any 32-bit writes to
it appends the lowest 8 bits as a byte to the text in the output pane. In other
words, a `sw` to that address writes a byte of output.

(The output pane uses UTF-8 encoding.)

<!-- TODO: Uhh... Make the assembler support character and string literals? -->

```emulator
    lui x11, %hi(0x10000000)
    li x10, 0x48 # 'H'
    sw x10, 0(x11)
    li x10, 0x69 # 'i'
    sw x10, 0(x11)
    li x10, 0x21 # '!'
    sw x10, 0(x11)
    li x10, 0x0a # '\n'
    sw x10, 0(x11)
    ebreak
```

Eh, close enough to a greeting the entire world. We could refactor it a bit to
use a loop, or whatever... Now that we think about it, how about going one step
further and organize our code into some functions?

## Functions

We already know how to call a function and return back. Namely, `jal` calls a
function, and `ret` returns. Usually functions take arguments, uses local
variables, and returns results. Since there's no real difference between the 31
general purpose registers, on account of them being, well, general purpose, we
could just use any of them as we wish. Or we could follow the standard
conventions.

### Register aliases and calling conventions

This whole time you probably have noticed that registers are listed with two
names each, and indeed both work identically in assembly.

```emulator
    li x10, 1
    li a0, 1
    ebreak
```

These [register aliases]{x=term} are named after their uses:

- [`s0` through `s11`]{x=regalias} are *saved* registers
- [`t0` through `t6`]{x=regalias} are *temporary* registers
- [`a0` through `a7`]{x=regalias} are *argument* registers
- [`zero`]{x=regalias} is the, well, zero register
- [`ra`]{x=regalias} is for the return address, by convention, as we've seen
- [`sp`]{x=regalias} ... we'll talk about `sp` later
- (The use of [`tp`]{x=regalias} and [`gp`]{x=regalias} is out of the scope of
  this document.)

(Yeah it's... all placed in a weird order... don't mind...)

When you call a function, you put up to eight arguments in the... well, argument
registers, in the order `a0`, `a1`, ..., `a7`. After that you use `jal` or
something, which puts the return address in `ra`, and jumps to the function.

Inside, the function, if it wishes to use the [call-saved]{x=term} registers
`s0` through `s11`, it must save their values at the start of the function, and
restore them before returning. The non call-saved registers `a0` through `a7`,
`t0` through `t6` and `ra` may be modified without restoring their values.

When the called function is done, it would, as mentioned, restore any used
call-saved registers, and jump back to the return address, resuming the calling
code.

Here's a basic-ish example:

```
int memcmp(const void *a, const void *b, size_t n)
```

The parameter `a` is passed in `a0`, `b` is passed in `a1`, and `n` is passed in
`a2`. The return value will be in `a0`. Here's an implementation and test run:

```emulator
    # memcmp(test1, test2, 4)

    lui a0, %hi(test1)
    addi a0, a0, %lo(test1)
    lui a1, %hi(test2)
    addi a1, a1, %lo(test2)
    li a2, 4
    jal memcmp
    ebreak

memcmp:
    add a3, a0, a2 # a3 = a + n
    li t0, 0

memcmp_loop:
    beq a0, a3, memcmp_done # No more bytes

    lb t0, 0(a0)
    lb t1, 0(a1)
    sub t0, t0, t1  # t0 = *a - *b

    bne t0, zero, memcmp_done # If different, done

    addi a0, a0, 1  # a ++
    addi a1, a1, 1  # b ++

    j memcmp_loop

memcmp_done:
    mv a0, t0
    ret

test1:
    .byte 1, 2, 3, 4
test2:
    .byte 1, 2, 2, 4
```

Here's a slightly better-organized "Hello World", using a `puts` function:

```emulator
    lui a0, %hi(msg)
    addi a0, a0, %lo(msg)
    jal puts
    ebreak

    # void puts(const char *)
puts:
    lui t1, %hi(0x10000000)
puts_loop:
    lb t0, 0(a0)
    beq t0, zero, puts_done
    sw t0, 0(t1)
    addi a0, a0, 1
    j puts_loop

puts_done:
    ret

msg:
    .byte 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x77
    .byte 0x6f, 0x72, 0x6c, 0x64, 0x21, 0x0a, 0x00
```

### The stack

Although we can write some very basic functions now, there are still a few
problems:

- You can't call a function within another function because if you do so `ra`
  would be overwritten, and then you can't return back from the outer function
  anymore.
- We still don't know how "saving" registers work.

Clearly, both would require using the memory somehow. We can feed two birds with
one scone by using memory in a structured way: The [stack]{x=term}.

Unlike some other architectures, the `sp` register is not really special in any
way. But just like how we can designate how `a0` is used, we can have some
conventions about how `sp` is supposed to be used:

- The register is call-saved, which means that when you return from a function,
  `sp` needs to have the same value as when the function was entered
- `sp` *always* points to somewhere in an area of memory called the "stack", and
  it is *always* 16-byte aligned.

And, for the stack itself:

- On RISC-V, the stack grows to lower addresses, meaning that the memory where
  `address >= sp` are "in the stack", and `address < sp` are free space that the
  stack can grow into.
- Code can allocate space on the stack by decrementing `sp`, and deallocate
  space by incrementing `sp`. Of course, allocations and deallocations must be
  balanced properly.
- You can only freely use space that you have allocated.

An example is in order. Let's say you have a function `foo` which just calls
`bar` twice.

```
void foo() {
    bar();
    bar();
}
```

Inside `foo`, it would need to save the initial `ra`, so it can return back
later. Even though `ra` takes only 4 bytes, `sp` needs to be 16-byte aligned at
all times, so we round that up to 16 bytes. Decrementing `sp` by 16 we allocate
the space:

```
foo:
    addi sp, sp, -16
```

Now, in addition to all of the non call-saved registers, we have 16 bytes of
scratch space at `sp` through `sp + 15`. We can backup the value of `ra` here

```
    ...
    sw ra, 0(sp)
```

Then we just call `bar` twice, which overwrites `ra`:

```
    ...
    jal bar
    jal bar
```

At the end of the function, we just need to get back the return address,
deallocate the stack space, and return. Although using any register would
suffice for the return address, since it is the backed up value of `ra` after
all, we load it back to `ra`.

```
    ...
    lw ra, 0(sp)
    addi sp, sp, 16
    ret
```

## Intermission: Position independence

# Index

::: {index_of=term}
:::

::: {index_of=reg}
:::

::: {index_of=regalias}
:::

::: {index_of=insn}
:::

::: {index_of=dir}
:::
