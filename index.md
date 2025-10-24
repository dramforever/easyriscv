---
title: "Easy RISC-V"
---

An interactive introduction to RISC-V assembly programming, by
[dramforever](https://github.com/dramforever).

Interested in the code? Want to report an issue? Check out the GitHub page:
<https://github.com/dramforever/easyriscv>

# DRAFT VERSION NOTICE

**This is a draft version. The content should be complete, but there may be
significant editorial and usability issues. There may also be more mistakes than
what you would expect from a finished tutorial. Please get in contact with the
author in case of any confusion.**

# Introduction

Inspired by [Easy 6502 by Nick Morgan][easy6502], this is a quick-ish
introductory tutorial to RISC-V assembly programming. This tutorial is intended
for those with a basic familiarity with low level computer science concepts, but
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

# My first RISC-V assembly program

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
program. First here, at least.

# Emulator controls

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

# Processor state

The [program counter]{x=term}, or [`pc`]{x=term} is the address of the current
instruction. It points to the instruction to be executed.

RV32I has 31 [general purpose registers]{x=term} numbered [`x1` through
`x31`]{x=reg}. These can contain any 32-bit data.

(If you're wondering, there are no flags for RV32I.)

The register [`x0`]{x=reg} is a special "zero register". For computational
instructions, you can use `x0` anywhere a register is expected. Reading it
always gives zero, and writing to it just gets ignored. The use of a special
register simplifies the design of the architecture, and this use is shared by
MIPS and Arm AArch64. We will make good use of `x0` soon.

(Note: In the emulator, the instruction listed in parenthesis next to `pc` in
the register view is provided as a convenience and is not part of the processor
state.)

# Instruction syntax

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

# Computational instructions

Using the registers as a playground of numbers, we can use computational
instructions to work with them.

## Arithmetic instructions

As we've seen above, you can get a RISC-V machine to add numbers together.

The [`addi`]{x=insn} instruction adds the value in `rs1` to the immediate value
`imm`, and puts the result in `rd`.

```
addi rd, rs1, imm
```

The [`add`]{x=insn} instruction adds the value in `rs1` to the value in `rs2`,
and puts the result in `rd`.

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

## Bitwise instructions

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

Another interesting operation you can do is to round/[align]{x=term} something
up or down to a multiple of a power of two. For example, if you want to find the
closest multiple of 16 below `a`, in binary that would be clearing the lowest 4
bits, or `a & ~0b1111`. Conveniently, that's `a & -16` in two's complement.

Aligning up is less intuitive, but one idea would be adding 16 first. However
that gives an incorrect result for multiples of 16. It's easy enough to fix
though: adding one less works exactly right: `(a + 15) & -16`

```emulator
    li x10, 0x123
    andi x11, x10, -16

    addi x12, x10, 15
    andi x12, x12, -16
    ebreak
```

## Comparison instructions

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

## Shift instructions

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

## That's it...?

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

## Summary of computational instructions

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

# Intermission: Larger numbers

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

For convenience, in assembly you can use [`%hi()`]{x=rel} and [`%lo()`]{x=rel}
to extract the, well, high 20 and low 10 bits of a value. The previous example
could also be written:

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

# Jumps and branches

So far, everything that we've had so far can be done on even the most basic
programmer's calculator. To truly make a computer... do computer stuff, we'd
want loops and conditionals.

In RISC-V parlance, a [branch]{x=term} is a conditional transfer of control
flow, and a [jump]{x=term} is an unconditional transfer of control flow.

I think the branch instructions are slightly simpler, so let's start with those.

## Branches

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

By the way, there's no `bgt[u]` or `ble[u]` because you can just swap `rs1` and
`rs2` to get those.

## Jumps

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

For convenience, a pseudoinstruction is available for you: [`j`]{x=insn}
("jump") is for `jal` with `rd` being `x0`:

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

Similar to `j`, [`jr`]{x=insn} ("jump register") is a psuedoinstruction for
`jalr` with `rd` being `x0` and `imm` being `0`:

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
is omitted in `jal`, it defaults to `x1`. Meanwhile, [`ret`]{x=insn} ("return")
is a pseudoinstruction that stands for `jr x1`, i.e. `jalr x0, 0(x1)`:

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

# Memory

That's a nice computer we have here. Now we have... all of 31 &times; 4 = 124
bytes of storage in the form of registers to work with. I want more...

## Basic memory accesses

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

## Smaller widths

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
does the same but zero extends the result. As with `lw`, the address is `rs1 +
imm`.

```
lb rd, imm(rs1)
lbu rd, imm(rs1)
```

Similarly for [`lh`]{x=insn} ("load half") and [`lhu`]{x=insn} ("load half
unsigned"), just for unsigned halfwords (two bytes each, remember):

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

Correspondingly, the [`sb`]{x=insn} ("store byte") and [`sh`]{x=insn} ("store
half") do the opposite of `lb` and `lh`, storing bytes and halfwords to memory.
Instead of widening small values to register size, these take the lowest order
bits from `rs1` and stores it to memory. (There's no `sbu` and `shu` because
stores are narrowing, not widening operations.)

```
sb rs2, imm(rs1)
sh rs2, imm(rs1)
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

test:
    .byte 1, 2, 3, 4, 5, 6, 7, 8
```

Now you can try translating some basic C code into RISC-V assembly. Functions
are... still out of the questions for now. Variables have to be either global or
put in registers. What else are we missing...

## Memory-mapped I/O

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

# Functions

We already know how to call a function and return back. Namely, `jal` calls a
function, and `ret` returns. Usually functions take arguments, uses local
variables, and returns results. Since there's no real difference between the 31
general purpose registers, on account of them being, well, general purpose, we
could just use any of them as we wish. Usually though, there are some standard
conventions to follow

## Register aliases and calling conventions

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

    # int memcmp(const void *a, const void *b, size_t n);
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

    # void puts(const char *);
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

## The stack

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

In a similar way you can save and restore the `s` (remember, call-saved)
registers. Usually, the most convenient way to manage this is to put values that
need to be preserved across inner function calls in the `s` registers, and then
add code at the beginning to save them, and add code at the end to restore them.

Obligatory recursive Fibonacci time!

```emulator
    li a0, 10
    jal fib
    ebreak

fib:
    li t0, 2

    # If n < 2, then return n
    bge a0, t0, fib_large
    ret

fib_large:
    # Otherwise, n >= 2

    # Save stuff to stack
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s0, 4(sp)
    sw s1, 8(sp)

    mv s0, a0       # s0 = n
    addi a0, a0, -1 # a0 = n - 1

    jal fib
    mv s1, a0       # s1 = fib(n - 1)

    addi a0, s0, -2
    jal fib         # fib(n - 2)

    add a0, a0, s1

    # Restore stuff from stack and return
    lw ra, 0(sp)
    lw s0, 4(sp)
    lw s1, 8(sp)
    addi sp, sp, 16
    ret
```

The algorithm should be fairly straightforward:

```
fibonacci(n) {
    if (n < 2) { return n; }
    else { return fib(n - 1) + fib(n - 2); }
}
```

What's worth noting here is the fairly symmetric pattern of saving registers at
the start:

```
    addi sp, sp, -16
    sw ra, 0(sp)
    sw s0, 4(sp)
    sw s1, 8(sp)
```

And restoring them at the end:

```
    lw ra, 0(sp)
    lw s0, 4(sp)
    lw s1, 8(sp)
    addi sp, sp, 16
    ret
```

A little thing to also note that the `s` registers are only saved in the more
complex branch, where as the simpler branch just returns directly. This is also
acceptable from a calling convention perspective.

(Note: In the emulator, the `sp` register is initialized to an address that
would be convenient for you for use as a stack, as a, well, convenience.)

# Intermission: Numeric labels

Let's go back to this example:

```
    # void puts(const char *);
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
```

Having to name things like `puts_loop`, `puts_done` is a bit annoying. There's a
shorter way: [numeric labels]{x=term}.

A numeric label is one with a name of a decimal number. To refer to a numeric
label, use the number and a `f` suffix for "forward", and `b` for "backward",
and it will correspond to the nearest numeric label with that number, searching
forwards or backwards, respectively.

So, the `puts` example from earlier can be rewritten:

```
    # void puts(const char *);
puts:
    lui t1, %hi(0x10000000)
1:
    lb t0, 0(a0)
    beq t0, zero, 2f
    sw t0, 0(t1)
    addi a0, a0, 1
    j 1b

2:
    ret
```

Yeah I don't really like this syntax either, but it is what we've got.

# Position independence

Remember that oddball instruction I mentioned way back, `auipc`?

I don't know about your experience, but the first time I saw RISC-V disassembly,
this is the one instruction that caught my eye. And this memory has stuck to me
ever since. It's a rather common occurrence in real RISC-V programs, and somehow
I've been hiding it from you this whole time. If you take a sneak peek at the
next section's title, you'll see how far we've come without `auipc`.

So what does it do?

The [`auipc`]{x=insn} ("add upper immediate to pc") instruction is very similar
to `lui`. Instead of setting `rd` to `imm20 << 12`, it sets it to `pc + (imm20
<< 12)`, where `pc` is the address of the `auipc` instruction itself.

```
auipc rd, imm20
```

It works very similarly to `lui`. You can think of them as a pair: the "base" of
`lui` is `0`, whereas the "base" of `auipc` is the address of the `auipc`
instruction. So this code:

```
start:
    auipc a0, 3
    addi a0, a0, 4
```

Gives you `0x3004`, whereas this:

```
start:
    auipc a0, 3
    addi a0, a0, 4
```

Gives you `start + 0x3004`.

Why would you need this? On modern systems, it's often desirable to have machine
code that can be moved around in address space. For example, a shared library
i.e. dynamically linked library can be loaded into any program, at any address.
It would be helpful if the machine code does not need to be patched every time.
This is called [position independent code]{x=term} ([PIC]{x=term}).

Some instructions already exhibit position independence. For example, as
mentioned earlier when we talked about using `lui` and `jalr` as a pair, the
branch instructions and `jal` are encoded, as with all RV32I instructions, into
32-bit instruction words, so they can't possibly be able to encode every
possible address. Instead, the jump destination is `pc` plus some offset (`pc`
being, as before, the jump/branch instruction itself), and the offset itself is
encoded.

You can see these are three different instructions that jump to itself. Since
the offset is `0` in each case, the encoding is the same. Use the "Dump" button
to see for yourself.

```emulator
    ebreak

test1:
    j test1

test2:
    j test2

test3:
    j test3
```

The `auipc` instruction allows for very flexible position independence. You can
make arbitrary calculations based on the address at which code is located. The
immediate-bit operand mirroring `lui` means that it is well suited for
two-instruction pairs, just like `lui`. These kind of "`pc` plus something"
calculations are known as [pc-relative addressing]{x=term}.

The syntax for getting the assembler to generate the immediate values for
pc-relative addressing a bit arcane but hear me out:

```emulator
1:
    auipc a0, %pcrel_hi(foo)
    addi a0, a0, %pcrel_lo(1b)
    ebreak

foo:
    .word 0x12345
```

Like `%hi()` and `%lo()`, [`%pcrel_hi()`]{x=rel} and [`%pcrel_lo()`]{x=rel}
gives you the immediate values needed for pc-relative addressing. You pass the
label you want to address to `%pcrel_hi()`, but pass a label to *the `auipc`
instruction* to `%pcrel_lo()`.

Unlike `%lo()`, We need the address of the `auipc` instruction itself to
calculate the immediate value, and this is why you need to pass a label to it.
You don't need to write `foo` again, since the assembler will look at the
`auipc` instruction and see it's supposed to be for `foo`.

If you hate writing that, you can also use the convenience pseudoinstruction
[`la`]{x=insn}:

```
la rd, label
```

Just like a `lui` + `jalr` pair, an `auipc` + `jalr` can be used to jump to
somewhere farther away than one `jal` can reach in position-independent code.

One very common case is to call a function that might not be within reach of
`jal`. You can use the pseudoinstruction [`call`]{x=insn} for that.

```
call label
```

This expands to:

```
1:
    auipc ra, %pcrel_hi(label)
    jalr ra, %pcrel_lo(1b)(ra)
```

Notice how `ra` is used as a temporary register to store the intermediate
result, which is immediately overwritten by `jalr`.

In fact, there really isn't any reason to prefer `lui` over `auipc` when using a
label. This is why you if you disassemble a real RISC-V program, you see it
everywhere, even in non-position-independent code.

Now would be a good time to take a break, since we're ready to head into...

# Privileged architecture fundamentals

We're going to write an *extremely* bare bones operating system.

## Privilege levels

One of the tasks an operating system performs is to control what programs. On
RISC-V, the most basics of this control is implemented using [privilege
levels]{x=term}. RISC-V defines... let's just say, several privilege levels, but
we're only going to use two here:

- "[Machine]{x=term}", number 3
- "[User]{x=term}", number 0

The lower the privilege level number goes, the less privileged that level is.
Higher privilege levels treat lower privilege levels as generally completely
unreliable and untrusted, and must isolate themselves from adversarial software
and failures of lower privilege levels.

(However, we won't be talking about all of the features that make this full
isolation possible, and the emulator you've been seeing does not have enough
features for that anyway. Therefore, the operating system we'll be building will
leave itself unprotected in various ways.)

The privilege levels are sometimes called "[modes]{x=term}" for short. And, if
that's not short enough, we can shorten the level names themselves, ending up
with [M-mode]{x=term} and [U-mode]{x=term}. All of the ways to refer to these
privilege levels are interchangable.

When a RISC-V machine starts (This is known as "[reset]{x=term}"), it begins
execution in Machine mode. On a typical "embedded" system where only Machine
mode and User mode are implemented, execution begins in the initialization code
read from flash memory. This code can either perform what needs to be done
itself, or it can be an operating system that manages some tasks, each executing
in User mode.

The former design is used for simpler programs, and is analogous to the programs
we've seen and run so far. The latter is more complicated. We'll see the basics
of how to achieve that soon.

## Control and status registers (CSRs)

The [control and status registers]{x=term} ([CSRs]{x=term}) deal with various
features that are in some sense "special". No I don't have a better explanation
of what "special" means.

Six instructions are available for manipulating CSRs.

```
csrrw rd, csr, rs1
csrrs rd, csr, rs1
csrrc rd, csr, rs1
csrrwi rd, csr, uimm5
csrrsi rd, csr, uimm5
csrrci rd, csr, uimm5
```

To refer to a CSR in these instructions, use its name in assembly code. We'll
get to those in a bit.

The pattern works like this. Each of the instructions *atomically* reads the old
value of the CSR, and writes the new value based on some operation performed on
the old value and the last operand. The possible operations are:

- [`csrrw`]{x=insn} ("CSR read write"): `{ csr = rs1; rd = csr_old; }`
- [`csrrs`]{x=insn} ("CSR read set"): `{ csr = csr | rs1; rd = csr_old; }`
- [`csrrc`]{x=insn} ("CSR read clear"): `{ csr = csr & ~rs1; rd = csr_old; }`

Where `&`, `|`, `~` are bitwise "and", "or", "not" respectively.

Specifically, note that `rd` and `rs1` can be the same. For example, this
instruction swaps the value in `a0` and `mscratch`:

```
csrrw a0, mscratch, a0
```

For the "immediate" variants, instead of a register, they take an
"unsigned"/zero-extended 5-bit immediate value, i.e. an immediate value 0
through 31, inclusive. This is represented using `uimm5` in the assembly syntax
description. The operation is the same otherwise.

- [`csrrwi`]{x=insn} ("CSR read write immediate"): `{ csr = uimm5; rd = csr_old; }`
- [`csrrsi`]{x=insn} ("CSR read set immediate"): `{ csr = csr | uimm5; rd = csr_old; }`
- [`csrrci`]{x=insn} ("CSR read clear immediate"): `{ csr = csr & ~uimm5; rd = csr_old; }`

The full feature set of these instructions are designed for manipulating bit
fields in CSRs, which we will not be doing that much of in this tutorial. Still,
this orthogonal design should be fairly intuitive to remember.

CSRs and fields in CSRs do not behave like general purpose registers: Some of
them are read/write, some are read-only. Also, invalid values have special
behaviors. We will touch on more details as we introduce the individual CSRs
themselves, but one thing you may have noticed is that we don't seem to have
read-only CSR instructions. Read-only access is achieved using special cases in
the instruction encodings:

- `csrrs` and `csrrc` do not write to the CSR if `rs1` is `x0` (a.k.a. `zero`)
  (Note that just the value of `rs1` being 0 is not enough.)
- `csrrsi` and `csrrci` do not write to the CSR if `uimm5` is 0.

While we're at it:

- `csrrw` and `csrrwi` do not read the CSR if `rd` is `x0` (a.k.a. `zero`).
  (Note that writing to `x0` has no effect anyway, since it's constant 0.)

(No standard RISC-V CSR is write-only, or has side effects on read.)

As a convenience, the pseudoinstructions [`csrw`]{x=insn} ("CSR read") and
[`csrr`]{x=insn} ("CSR write") are available. `csrw csr, rs1` expands to `csrrw
x0, csr, rs1`. Meanwhile, `csrr rd, csr` expands specifically to `csrrs rd, csr,
x0`, just so we can agree on an encoding.

```
csrw csr, rs1
csrr rd, csr
```

You may have seen these CSR things if you've scrolled down on the register view.
Yes, we're finally getting into those.

## Counters

An example of CSRs is [counters]{x=term}. Two basic read-only counters are
[`cycle`]{x=csr} and [`instret`]{x=csr}. These counters, well, *count* the
number of "cycles" and "instructions retired". "Retried" is a technical term
basically meaning "successfully completed".

Since a 32-bit counter will overflow quite fast, on RV32, the counters have
"high" counterparts: [`cycleh`]{x=csr} and [`instreth`]{x=csr}. So, for example,
the full cycle counter has 64 bits, with the lower 32 bits in the CSR `cycle`
and higher 32 bits in the CSR `cycleh`.

While the emulator is running, scroll down on the register view panel, and on
the bottom you'll see the values of these counters. For convenience, they're
shown combined, so, `cycle = 0x11223344_55667788` means `cycleh` is
`0x11223344`, and `cycle` is `0x55667788`.

On real hardware `cycle` is coupled to the clock cycle. In this emulator, every
time you press "Step", it counts as a cycle. When you press "Run" and it starts,
well, running, a certain number of cycles happen periodically.

Let's look at a really simple example:

```emulator
    addi a0, a0, 1
    addi a0, a0, 1
    addi a0, a0, 1
    ebreak
```

It takes 4 cycles for this program to stop, but `instret` ends up at only 3
because the final `ebreak` instruction never actually completes.

(Do not confuse "retired" with "retried".)

A program can read its own counters. For example, this fun little program loops
until the cycle count is over 1000, assuming the low 32 bits doesn't overflow
before it has time to react:

```emulator
    li t1, 1000
loop:
    csrr t0, cycle
    blt t0, t1, loop

    ebreak
```

## Current privilege level

Technically `cycle` and `instret` are not part of the privileged architecture.
The real fun begins *now*.

The emulator shows the current privilege level as `(priv)`. It is in parentheses
to remind you of a very important fact:

*There is no CSR for the current privilege level.*

In general, it is not possible for a RISC-V program to learn what privilege
level it's in. This is required for the [Popek and Goldberg conditions of
virtualization][wp-p-g-conditions] to work, specifically because being able to
read the current privilege level at a lower-than-maximum privilege level would
be a "sensitive" but "unprivileged" instruction.

[wp-p-g-conditions]: https://en.wikipedia.org/wiki/Popek_and_Goldberg_virtualization_requirements

If you're writing a program for a certain privilege level, you should simply
assume that it is correctly being run at that privilege level.

# Exceptions

## Exception entry

A fundamental way an operating system does its job is through handling
exceptions. In general, [exceptions]{x=term} occur when there's a problem with a
specific instruction, and execution cannot continue. For example, since `cycle`
is a read-only CSR, writing to it is an illegal instruction:

```emulator
    csrw cycle, x0
```

Since we have no exception handling in the program, we'll have to inspect what
happened manually in the emulator. Indeed, a lot has happened:

Firstly, this message tells you that an exception happened:

```
[ Exception: Illegal instruction (2) | tval = 0xc0001073, epc = 0x4000000c ]
```

The same information is now also available in the CSRs, as follows:

- [`mcause`]{x=csr} ("M-mode trap cause"): The kind of exception.
- [`mepc`]{x=csr} ("M-mode exception pc"): The address of the instruction that
  caused the exception.
- [`mtval`]{x=csr} ("M-mode trap value"): Extra information about the exception
- [`mstatus`]{x=csr} ("M-mode status"): It is set to `0x00001800`. The two bits
  in the middle, `mstatus[12:11]` (In C syntax, `(mstatus >> 11) & 0x3`) is the
  `mstatus.MPP` ("M-mode previous privilege level") field, which contains 3,
  meaning that the exception occurred while running in Machine mode.

When an exception happens, in addition to recording the exception information in
these CSR fields, `pc` is set to `mtvec`, which is supposed to be the handler
address. Let's write ourselves an exception handler that simply prints a message
and stops the emulator, and see the handling in action:

```emulator
    la t0, handler
    csrw mtvec, t0

    # Now cause an exception
    csrw cycle, x0

    # Rest of the main program is never executed
    addi a0, a0, 1
    addi a0, a0, 1

handler:
    la a0, msg
    call puts
    ebreak

msg:
    .byte 0x4f, 0x68, 0x20, 0x6e, 0x6f, 0x21, 0x0a, 0x00

    # void puts(const char *);
puts:
    lui t1, %hi(0x10000000)
1:
    lb t0, 0(a0)
    beq t0, zero, 2f
    sw t0, 0(t1)
    addi a0, a0, 1
    j 1b

2:
    ret
```

Yeah it just prints `Oh no!` on error. Baby steps...

The checkboxes "Pause on exc." and "Print on exc." control whether the emulator
should pause or print a message, respectively, when an exception occurs. You can
uncheck those if you want the exception handler set in the program to run
without interference.

(Another case that will cause a jump to `mtvec` is [interrupts]{x=term}.
However, this feature does not exist in the emulator. The two cases are
collectively called [traps]{x=term}.)

## Exception causes

These are the exceptions possible in this emulator, and their respective numeric
codes:

|      | Description |
|:-----|:---|
| 0     | Instruction address misaligned |
| 1     | Instruction access fault |
| 2     | Illegal instruction |
| 3     | Breakpoint |
| 5     | Load access fault |
| 7     | Store/AMO access fault |
| 8     | Environment call from User mode |
| 11    | Environment call from Machine mode |

"Instruction address misaligned" happens when attempting to jump to an
instruction that is not 4-byte aligned. The exception happens on the jump or
branch instruction, not the target.

"Load access fault" and "Store/AMO access fault" happens when accessing a
invalid memory address, or accessing a memory address in an invalid way.

("AMO" stands for "atomic memory operation", which we will not talk about and is
not featured in the emulator.)

"Illegal instruction" happens not only in the self explanatory way when an
invalid instruction is executed, but also when accessing a CSR in an invalid
way, or from too low a privilege level.

"Breakpoint", "Environment call from User mode" and "Environment call from
Machine mode" will be explained in a future section.

## Exception return

The [`mret`]{x=insn} ("M-mode return") instruction performs the reverse of part
of what happens when an exception occurs. To be precise, what happens is:

- The current privilege levels is set back to `mstatus.MPP`
- `mstatus.MPP` is set to 0
- `pc` is set to `mepc`

(You can think of the privilege mode bits as shifting in a chain <code>0 &rarr;
MPP &rarr; priv</code>. And, to be even more precise, `mstatus.MPP` is set to
the lowest supported privilege mode since it's not supposed to contain
unsupported modes.)

`mret` takes no operands, so the assembly syntax is simply:

```
mret
```

If we do `mret` after getting an exception, then we simply go back to retrying
the same instruction again. This is useful for more featureful implementations,
where for example, after handling a page fault the correct course of action is
to retry the faulting instruction.

However, `mstatus` and `mepc` are also writable. This gives us more flexibility
in the use of `mret`.

# Handling User mode

## Entering User mode

Even though `mret` is named "return", it is in fact the only way to lower the
privilege level. We can use the behavior of `mret` to enter User mode. Here's an
example of entering User mode, with a User mode program that does something bad:

```emulator
    la t0, handler
    csrw mtvec, t0

    lui t0, %hi(0x1800)
    addi t0, t0, %lo(0x1800)

    # Clear MPP to 0
    csrrc zero, mstatus, t0

    la t0, user_entry
    csrw mepc, t0
    mret

handler:
    ebreak # Just stop the emulator

user_entry:
    # Try to access an M-mode CSR
    csrr a0, mstatus
```

As you can see, after we enter User mode, all of the CSRs used for exception
handling become completely inaccessible, not even readable. As with writing a
read-only CSR, accessing an CSR without permission also causes an illegal
instruction exception.

Moreover, when an exception happens, we go back to Machine mode, so the
exception handler runs in Machine mode. Here the handler does nothing except
stopping the emulator.

## Intentionally causing an exception

Sometimes, a program may wish to intentionally cause an exception.
There are several well-defined way to do that:

- The instruction `csrrw zero, cycle, zero` is specifically an illegal
  instruction. It causes an "Illegal instruction" exception.
- The instruction [`ebreak`]{x=insn} causes a "Breakpoint" exception
- The instruction [`ecall`]{x=insn} causes an "Environment call from User mode"
  exception when executed in User mode, and "Environment call from Machine mode"
  exception when executed in Machine mode.

Give those exceptions a try here:

```emulator
    la t0, handler
    csrw mtvec, t0

    lui t0, %hi(0x1800)
    addi t0, t0, %lo(0x1800)

    # Clear MPP to 0
    csrrc zero, mstatus, t0

    la t0, user_entry
    csrw mepc, t0
    mret

handler:
    ebreak # Just stop the emulator

user_entry:
    ebreak
    # ecall
    # csrrw zero, cycle, zero
```

As the names suggest, `ebreak` is used for debugging breakpoints. As a special
case, in this emulator `ebreak` in Machine mode stops the emulator. You can
think of it as the emulator being a debugger, and the debugger catching the
breakpoint.

Meanwhile, `ecall` is used for things like system calls. "Environment call from
User mode" is a distinct exception cause code to make it easy to check
specifically for this case.

## Saving and restoring all registers

One thing that you would want in your trap handler is to not trust or disturb
*any* general purpose registers in the code that the trap occurred in, unless
you intentionally want to do so, for example to return a value from a system
call. So you'd want to save all the registers to memory, before doing anything
else. However, accessing memory requires a general purpose register.

The [`mscratch`]{x=csr} ("M-mode scratch") CSR can help with this. This
register, unlike all the others, have no special functionality. It can hold any
32-bit value. However, like all the other M-mode CSRs, it can only be accessed
in Machine mode. User mode code cannot change the value of it.

So for example, you can stash the operating system stack pointer in `mscratch`
while executing in User mode. At the top of the handler, `csrrw sp, mscratch,
sp` to swap from the user stack pointer to the operating system stack pointer.

```
handler:
    csrrw sp, mscratch, sp
    # Save registers except sp
    csrr t0, mscratch
    # t0 = user sp, save it
    # Save user pc
    ...
```

And, to restore:

```
    lw t0, ... # Load user pc
    csrw mepc, t0
    lw t0, ... # Load user sp
    csrw mscratch, t0
    # Restore registers except sp
    csrrw sp, mscratch, sp
    mret
```

We'll see the full code for this in the following section.

# Writing a very very bare bones operating system

## Design

We have enough of to write a very very bare bones operating system. It will
support these features:

- System calls:
  - `a7 = 1`: putchar, `a0` is the byte to write
  - `a7 = 2`: exit
- Exception handling: Print error message and exit

We design the exception handling as follows:

- During most of the time in M-mode, `mscratch` is 0
- While in U-mode, `mscratch` points to the operating system stack pointer
- At trap handler, if `mscratch` is 0, the exception came from M-mode, which we
  cannot handle, so report a fatal exception.
- If it did come from U-mode, allocate 128 bytes on the stack to save the U-mode
  registers, and call `trap_main`, which manipulates U-mode registers in memory
- After `trap_main`, we restore from memory, deallocate it from the stack, and
  go back to U-mode, as outlined in the previous section.

The structure to save registers in is fairly simple:

```
struct regs {
  unsigned long pc;
  unsigned long ra; // x1
  unsigned long sp; // x2
  ...
  unsigned long t6; // x31
};
```

Basically you can think of it as an array where element 0 is pc, and 1 through
31 is registers x1 through x31.

Inside `trap_main`, we check `mcause` to see if it's a system call. If it is, we
dispatch based on `a7`. If it's not, we report an exception from U-mode.

At the beginning, we simply initialize the `struct regs` structure on stack,
initialize user `sp` and `pc` in it, and jump to the same code that handles
returning to U-mode.

## Code

Here's the assembly code with User mode code at the bottom. You may want to
uncheck "Pause on exc." and "Print on exc." for convenience.

Do not be too hard on yourself if you have trouble understanding the code fully.
This is, after all, a fairly complete OS kernel entry and exit implementation.
Really, the most important part I'm showing you here is that it is possible.

```emulator
    # Reserve 256 bytes for OS stack
    # User stack starts 256 bytes lower
    addi t2, sp, -256

    la t0, handler
    csrw mtvec, t0

    # Prepare struct reg
    addi sp, sp, -128

    mv a0, sp # struct regs *

    # Set user pc to user_entry
    la t0, user_entry
    sw t0, 0(a0)

    # Set user sp
    sw t2, 8(a0)

    j enter_user

    # void trap_main(struct regs *regs)
trap_main:
    # Save regs based on calling convention
    addi sp, sp, -16
    sw s0, (sp)
    sw ra, 4(sp)

    mv s0, a0
    csrr a1, mcause
    li t1, 8 # "Environment call from User mode"
    bne a1, t1, do_bad_exception # Not ecall, that's bad

    # Call do_syscall with args from ecall

    lw a0, 40(s0)
    lw a1, 44(s0)
    lw a2, 48(s0)
    lw a3, 52(s0)
    lw a4, 56(s0)
    lw a5, 60(s0)
    lw a6, 64(s0)
    lw a7, 68(s0)
    call do_syscall

    sw a0, 40(s0)   # Set user a0 return value

    # Bump user pc by 4
    # Skip over ecall instruction
    lw t0, 0(s0)
    addi t0, t0, 4
    sw t0, 0(s0)

    # Restore regs based on calling convention
    lw s0, (sp)
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

    # a0 = arg0, a7 = syscall number
do_syscall:
    # Dispatch based on syscall number
    li t0, 1
    beq a7, t0, sys_putchar
    li t0, 2
    beq a7, t0, sys_exit

    # Bad syscall
    li a0, -1
    ret

    # int sys_putchar(char c)
sys_putchar:
    # Save regs based on calling convention
    addi sp, sp, -16
    sw s0, (sp)
    sw ra, 4(sp)

    call kputchar
    li a0, 0

    # Restore regs based on calling convention
    lw s0, (sp)
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

    # [[noreturn]] void sys_exit()
sys_exit:
    # Just stop the emulator
    ebreak

    # [[noreturn]] void do_bad_exception(struct regs *regs, long cause)
    # Print message about bad U-mode exception, then stop
do_bad_exception:
    mv s0, a1

    # Equivalent of printf("Exception 0x%x", cause);
    la a0, msg_exception
    call kputs

    mv a0, s0
    la t0, hex_chars
    add t0, t0, a0
    lbu a0, (t0)
    call kputchar

    li a0, 0xa # '\n'
    call kputchar

    # Stop the emulator
    ebreak

fatal:
    # Print message about fatal exception, then stop
    la a0, msg_fatal
    call kputs
    ebreak

msg_exception:
    # "Exception 0x"
    .byte 0x45, 0x78, 0x63, 0x65, 0x70, 0x74, 0x69, 0x6f, 0x6e, 0x20, 0x30, 0x78, 0x00

msg_fatal:
    # "Fatal exception\n"
    .byte 0x46, 0x61, 0x74, 0x61, 0x6c, 0x20, 0x65, 0x78, 0x63, 0x65, 0x70, 0x74, 0x69, 0x6f, 0x6e, 0x0a, 0x00

hex_chars:
    # "0123456789abcdef"
    .byte 0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x00

    .byte 0x00 # Alignment padding
    # Otherwise, the next instruction wouldn't be aligned

    # void kputs(const char *);
    # Print string by accessing MMIO directly
kputs:
    lui t1, %hi(0x10000000)
1:
    lb t0, 0(a0)
    beq t0, zero, 2f
    sw t0, 0(t1)
    addi a0, a0, 1
    j 1b
2:
    ret

    # void kputchar(char);
    # Print byte by accessing MMIO directly
kputchar:
    lui t1, %hi(0x10000000)
    sw a0, (t1)
    ret

    # The big exception handler
handler:
    csrrw sp, mscratch, sp

    # If mscratch was 0, this is exception from M-mode
    # Can't handle that, it's a fatal error
    beq sp, zero, fatal

    # Save all registers
    addi sp, sp, -128
    sw x1, 4(sp)
    # x2/sp handled separately
    sw x3, 12(sp)
    sw x4, 16(sp)
    sw x5, 20(sp)
    sw x6, 24(sp)
    sw x7, 28(sp)
    sw x8, 32(sp)
    sw x9, 36(sp)
    sw x10, 40(sp)
    sw x11, 44(sp)
    sw x12, 48(sp)
    sw x13, 52(sp)
    sw x14, 56(sp)
    sw x15, 60(sp)
    sw x16, 64(sp)
    sw x17, 68(sp)
    sw x18, 72(sp)
    sw x19, 76(sp)
    sw x20, 80(sp)
    sw x21, 84(sp)
    sw x22, 88(sp)
    sw x23, 92(sp)
    sw x24, 96(sp)
    sw x25, 100(sp)
    sw x26, 104(sp)
    sw x27, 108(sp)
    sw x28, 112(sp)
    sw x29, 116(sp)
    sw x30, 120(sp)
    sw x31, 124(sp)

    # Save user sp, also set mscratch to 0 in M-mode
    csrrw t0, mscratch, zero
    sw t0, 8(sp)

    # Save user pc
    csrr t0, mepc
    sw t0, 0(sp)

    mv a0, sp
    call trap_main
    # ... falls through after trap_main ...
enter_user:
    # Set mstatus.MPP = User
    lui t0, %hi(0x1800)
    addi t0, t0, %lo(0x1800)
    csrrc zero, mstatus, t0

    # Set mepc = user pc
    # Will actually jump with mret
    lw t0, 0(sp)
    csrw mepc, t0

    # Set mscratch = user sp temporarily
    # Will swap right before mret
    lw t0, 8(sp)
    csrw mscratch, t0

    # Restore other registers from stack
    lw x1, 4(sp)
    # x2/sp handled separately
    lw x3, 12(sp)
    lw x4, 16(sp)
    lw x5, 20(sp)
    lw x6, 24(sp)
    lw x7, 28(sp)
    lw x8, 32(sp)
    lw x9, 36(sp)
    lw x10, 40(sp)
    lw x11, 44(sp)
    lw x12, 48(sp)
    lw x13, 52(sp)
    lw x14, 56(sp)
    lw x15, 60(sp)
    lw x16, 64(sp)
    lw x17, 68(sp)
    lw x18, 72(sp)
    lw x19, 76(sp)
    lw x20, 80(sp)
    lw x21, 84(sp)
    lw x22, 88(sp)
    lw x23, 92(sp)
    lw x24, 96(sp)
    lw x25, 100(sp)
    lw x26, 104(sp)
    lw x27, 108(sp)
    lw x28, 112(sp)
    lw x29, 116(sp)
    lw x30, 120(sp)
    lw x31, 124(sp)
    addi sp, sp, 128

    # Actually restore sp
    csrrw sp, mscratch, sp
    mret    # Time to go to user mode!

################

user_entry:
    la a0, msg_hello
    call puts
    call exit

    # void puts(const char *);
    # Print string using system call
puts:
    addi sp, sp, -16
    sw s0, (sp)
    sw ra, 4(sp)

    mv s0, a0
1:
    lb a0, 0(s0)
    beq a0, zero, 2f
    call putchar
    addi s0, s0, 1
    j 1b
2:

    lw s0, (sp)
    lw ra, 4(sp)
    addi sp, sp, 16
    ret

    # void putchar(const char *);
    # Print byte using system call
putchar:
    li a7, 1
    ecall
    ret

    # [[noreturn]] void exit();
exit:
    li a7, 2
    ecall
    # Not supposed to return, just to be safe
    ebreak

msg_hello:
    .byte 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x21, 0x0a, 0x00
```

## Pseudocode reference

For reference, here's some of the OS code in pseudo-C.

```
void trap_main(struct regs *regs) {
    unsigned long cause = csr_read(mcause);
    if (cause != 8)
        do_bad_exception(regs, cause);

    # Call do_syscall with args from ecall
    unsigned long ret = do_syscall(regs->a0, ..., regs->a7);
    regs->a0 = ret;

    // Bump user pc by 4, skip over ecall instruction
    regs->pc += 4;
}

unsigned long do_syscall(
    unsigned long a0,
    ...,
    unsigned long a7
) {
    if (a7 == 1)
        sys_putchar(a0);
    else if (a7 == 8)
        sys_exit();
    else
        return -1;
}

unsigned long sys_putchar(char a) {
    kputchar(a);
    return 0;
}

[[noreturn]]
unsigned long sys_exit(char a) {
    ebreak();
}

[[noreturn]]
void do_bad_exception(struct regs *regs, unsigned long cause) {
    kputs("Exception 0x");
    kputchar(hex_chars[cause]);
    kputchar('\n');
    ebreak();
}

[[noreturn]]
void fatal() {
    kputs("Fatal exception\n");
    ebreak();
}

void kputs(const char *str) {
    while (*str) {
        u32 val = (u32)*str;
        writel(0x10000000, val); // MMIO write
        str ++;
    }
}

void kputchar(char c) {
    u32 val = (u32)c;
    writel(0x10000000, val); // MMIO write
}
```

And here's the user code, again in pseudo C:

```
[[noreturn]]
void user_entry() {
    puts(...);
    exit();
}

void puts(const char *str) {
    while (*str) {
        putchar(*str);
        str ++;
    }
}

void putchar(char c) {
    ecall(a0 = c, a7 = 1);
}

void exit() {
    ecall(a7 = 2);
}
```

# Lies and omissions

As long as this tutorial is, some simplifications have been made. Here are some
of the most egregious lies and omissions, compared to the "real" RISC-V
architecture and "real" RISC-V assembly code found in the world:

- The assembly syntax resembles the syntax used by LLVM assembler and GNU
  Binutils for RISC-V. However, it is not identical.
- There are a lot more pseudoinstructions and CSRs than what I have described.
- The `li` pseudoinstruction should support a wider range of constants.
- `mstatus` is a lot more complicated than what I have described.
- `%hi`, `%lo`, `%pcrel_hi`, `%pcrel_lo` are more complicated than what I have
  described.

There are also very important topics that are common or even ubiquitous in the
RISC-V world, but I chose not to cover:

- 64-bit architecture
- Compressed instructions
- Other privileged architecture and operating systems topics: Interrupts, memory
  protection, virtual memory, ...

However, what I've taught you should be more than enough to get you started into
learning more on your own, or with further materials.

# References

Here are some references and tutorials I would personally recommend, if you're
looking to get further into RISC-V low-level development

- RISC-V Instruction Set Manual <https://github.com/riscv/riscv-isa-manual>
- RISC-V Assembly Programmer's Manual <https://github.com/riscv-non-isa/riscv-asm-manual>
- RISC-V Calling Conventions <https://github.com/riscv-non-isa/riscv-elf-psabi-doc/blob/master/riscv-cc.adoc>
- Operating System in 1,000 Lines <https://operating-system-in-1000-lines.vercel.app/en/>

Other useful resources that I have used while writing this tutorial:

- `arch/riscv/kernel/entry.S` from Linux <https://elixir.bootlin.com/linux/latest/source/arch/riscv/kernel/entry.S>

# Thanks

Thanks to my friends for various help with this tutorial:

- Aria Desires <https://faultlore.com>
- Riven Skaye <https://skaye.blog>
- (TODO)

And thanks to you for coming along with me on this journey. Come on over to
<https://github.com/dramforever/easyriscv> if you have suggestions, grievances,
or just want to share some thoughts.

# Index

## Instructions

::: {index_of=insn}
:::

## Registers and CSRs

::: {index_of=reg}
:::

::: {index_of=regalias}
:::

::: {index_of=csr}
:::

## Special assembly syntax

::: {index_of=dir}
:::

::: {index_of=rel}
:::

## Other terms

::: {index_of=term}
:::
