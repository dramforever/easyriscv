import * as easyriscv from './easyriscv.js';
import * as fs from 'fs';
import * as process from 'process';

const mem = new easyriscv.RiscvMemory();
(new Uint8Array(mem.memory)).set(fs.readFileSync(process.argv[2]));

const riscv = new easyriscv.RiscvState(mem);
riscv.pc = 0x4000_0000;

let res;
do {
    res = riscv.one_insn();
} while(res);

if (mem.fetch(riscv.pc) == 0x00000073) {
    console.log("ecall", riscv.regs[10], riscv.regs[3]);
    process.exit(riscv.regs[10]);
} else {
    process.exit(1);
}
