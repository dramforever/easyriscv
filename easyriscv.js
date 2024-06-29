export class RiscvMemory {
    constructor() {
        this.memory = new ArrayBuffer(32 << 20);
        this.memory_view = new DataView(this.memory);
        this.mem_base = 0x4000_0000;
        this.debug_base = 0x1000_0000;
    }

    fetch(address) {
        const mem_top = this.mem_base + this.memory.byteLength;
        if (this.mem_base <= address && address < mem_top) {
            const offset = address - this.mem_base;
            return this.memory_view.getUint32(offset, true);
        } else {
            return null;
        }
    }

    read(address, width) {
        console.log('read', address.toString(16).padStart(8, '0'), width);
        const mem_top = this.mem_base + this.memory.byteLength;
        if (this.mem_base <= address && address < mem_top) {
            const offset = address - this.mem_base;
            if (width === 1) {
                return this.memory_view.getUint8(offset);
            } else if (width === 2) {
                return this.memory_view.getUint16(offset, /* littleEndian */ true);
            } else if (width === 4) {
                return this.memory_view.getUint32(offset, /* littleEndian */ true);
            } else {
                return null;
            }
        } else if (address === this.debug_base) {
            if (width === 4) {
                return 0;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    write(address, width, data) {
        console.log('write', address.toString(16).padStart(8, '0'), data.toString(16).padStart(2 * width, '0'));
        const mem_top = this.mem_base + this.memory.byteLength;
        if (this.mem_base <= address && address < mem_top) {
            const offset = address - this.mem_base;
            if (width === 1) {
                this.memory_view.setUint8(offset, data);
                return true;
            } else if (width === 2) {
                this.memory_view.setUint16(offset, data, /* littleEndian */ true);
                return true;
            } else if (width === 4) {
                this.memory_view.setUint32(offset, data, /* littleEndian */ true);
                return true;
            } else {
                return null;
            }
        } else if (address === this.debug_base) {
            if (width === 4) {
                console.log(`${(data & 0xff).toString(16).padStart(2, '0')} (${String.fromCodePoint(data & 0xff)})`);
                return true;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
}

const CAUSE_CODE = {
    misaligned_fetch: 0x00,
    fetch_access: 0x01,
    illegal_instruction: 0x02,
    breakpoint: 0x03,
    load_access: 0x05,
    store_access: 0x07,
    user_ecall: 0x08,
    machine_ecall: 0x0B,
}

export class RiscvState {
    constructor(memory) {
        this.memory = memory;
        this.regs = new Uint32Array(32);
        this.pc = 0;
    }

    exception(cause, tval) {
        console.error('exception', cause, tval);
        return null;
    }

    one_insn() {
        const write_rd = (index, value) => {
            if (index != 0)
                this.regs[index] = value;
        };

        const insn = this.memory.fetch(this.pc);

        if (insn === null) {
            return this.exception(CAUSE_CODE.fetch_access, this.pc);
        } else if ((insn & 0b1011111) === 0b0010111) { // lui or auipc
            const add = (insn & 0b0100000) ? 0 : this.pc;
            write_rd((insn >>> 7) & 0b11111, ((insn >> 12 << 12) + add) >>> 0);
            this.pc = (this.pc + 4) >>> 0;
            return true;
        } else if ((insn & 0b1111111) === 0b1101111) { // jal
            const imm =
                (insn >> 31 << 20)
                | (((insn >>> 12) & 0b11111111) << 12)
                | (((insn >>> 20) & 0b1) << 11)
                | (((insn >>> 21) & 0b1111111111) << 1);

            const jump_dest = (this.pc + imm) >>> 0;

            if (jump_dest & 0b11) {
                return this.exception(CAUSE_CODE.misaligned_fetch, 0);
            } else {
                write_rd((insn >>> 7) & 0b11111, this.pc + 4);
                this.pc = jump_dest;
                return true;
            }
        } else if ((insn & 0b1111111) === 0b1100111) {
            if (((insn >>> 12) & 0b111) === 0b000) { // jalr
                const jump_dest = (this.regs[(insn >>> 15) & 0b11111] + (insn >> 20)) >>> 0;

                if (jump_dest & 0b11) {
                    return this.exception(CAUSE_CODE.misaligned_fetch, 0);
                } else {
                    write_rd((insn >>> 7) & 0b11111, this.pc + 4);
                    this.pc = jump_dest;
                    return true;
                }
            } else {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            }
        } else if ((insn & 0b1111111) === 0b1100011) {
            if (((insn >>> 12) & 0b110) === 0b010) {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            } else { // beq, bne, blt, bge, bltu, bgeu
                const imm =
                    (insn >> 31 << 12)
                    | (((insn >>> 7) & 0b1) << 11)
                    | (((insn >>> 25) & 0b111111) << 5)
                    | (((insn >>> 8) & 0b1111) << 1);

                const jump_dest = (this.pc + imm) >>> 0;

                const rs1 = this.regs[(insn >>> 15) & 0b11111];
                const rs2 = this.regs[(insn >>> 20) & 0b11111];

                const base_cond =
                    (((insn >>> 12) & 0b110) === 0b000) ? (rs1 === rs2) // eq
                    : (((insn >>> 12) & 0b110) === 0b100) ? ((rs1 | 0) < (rs2 | 0)) // lt
                    : /* (((insn >>> 12) & 0b110) === 0b110) ? */ (rs1 < rs2); // ltu

                const cond = base_cond ^ (((insn >>> 12) & 0b001) !== 0);

                if (cond) {
                    if (jump_dest & 0b11) {
                        return this.exception(CAUSE_CODE.misaligned_fetch, 0);
                    } else {
                        write_rd((insn >>> 7) & 0b11111, this.pc + 4);
                        this.pc = jump_dest;
                        return true;
                    }
                } else {
                    this.pc = (this.pc + 4) >>> 0;
                    return true;
                }
            }
        } else if ((insn & 0b1111111) === 0b0000011) {
            if (((insn >>> 12) & 0b011) === 0b011
                || ((insn >>> 12) & 0b111) === 0b110) {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            } else {
                // lb, lh, lw, lbu, lhu
                const addr = ((insn >>> 20) + this.regs[(insn >>> 15) & 0b11111]) >>> 0;
                const width = 1 << ((insn >>> 12) & 0b011);
                const res = this.memory.read(addr, width);
                if (res === null) {
                    return this.exception(CAUSE_CODE.load_access, addr);
                } else {
                    const load_res =
                        ((insn >>> 12) & 0b100) === 0b100
                        ? (res << (32 - width * 8) >>> (32 - width * 8))
                        : (res << (32 - width * 8) >> (32 - width * 8)) >>> 0;
                    write_rd((insn >>> 7) & 0b11111, load_res);
                    this.pc = (this.pc + 4) >>> 0;
                    return true;
                }
            }
        } else if ((insn & 0b1111111) === 0b0100011) {
            if (((insn >>> 12) & 0b011) === 0b011
                || ((insn >>> 12) & 0b100) === 0b100) {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            } else {
                // sb, sh, sw
                const imm = (insn >> 25 << 5) | ((insn >>> 7) & 0b11111);
                const addr = (imm + this.regs[(insn >>> 15) & 0b11111]) >>> 0;
                const width = 1 << ((insn >>> 12) & 0b011);
                const op = this.regs[(insn >>> 20) & 0b11111];
                const data = op << (32 - width * 8) >>> (32 - width * 8);
                const res = this.memory.write(addr, width, data);
                if (res === null) {
                    return this.exception(CAUSE_CODE.store_access, addr);
                } else {
                    this.pc = (this.pc + 4) >>> 0;
                    return true;
                }
            }
        } else if ((insn & 0b1011111) === 0b0010011) {
            const is_imm = (insn & 0b0100000) === 0;
            const funct3 = (insn >>> 12) & 0b111;
            const imm = insn >> 20;
            const funct7 = insn >>> 25;

            if (is_imm && funct3 === 0b001 && funct7 != 0) {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            }

            if (is_imm && funct3 == 0b101 && (funct7 & 0b1011111) != 0) {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            }

            const has_neg_mask = 0b00100001;
            const funct7_mask = ((has_neg_mask >>> funct3) & 1) ? 0b1011111 : 0b1111111;

            if (! is_imm && (funct7 & funct7_mask) != 0) {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            }

            const op1 = this.regs[(insn >>> 15) & 0b11111];
            const op2 = is_imm ? imm : this.regs[(insn >>> 20) & 0b11111];

            const result =
                (funct3 === 0b000) ?
                    ((! is_imm && (funct7 & 0b0100000) != 0)
                        ? (op1 - op2)
                        : (op1 + op2))
                : (funct3 === 0b001) ? (op1 << (op2 & 0b11111))
                : (funct3 === 0b010) ? (((op1 | 0) < (op2 | 0)) ? 0 : 1)
                : (funct3 === 0b011) ? (((op1 >>> 0) < (op2 >>> 0)) ? 0 : 1)
                : (funct3 === 0b100) ? (op1 ^ op2)
                : (funct3 === 0b101) ?
                    (((funct7 & 0b0100000) != 0)
                        ? (op1 >> (op2 & 0b11111))
                        : (op1 >>> (op2 & 0b11111)))
                : (funct3 === 0b110) ? op1 | op2
                : /* (funct3 === 0b111) ? */ op1 & op2;

            write_rd((insn >>> 7) & 0b11111, result >>> 0);
            this.pc = (this.pc + 4) >>> 0;
            return true;
        } else if ((insn & 0b1111111) == 0b0001111) {
            if (((insn >>> 12) & 0b011) === 0b000) {
                // fence
                // do nothing
                this.pc = (this.pc + 4) >>> 0;
                return true;
            } else {
                return this.exception(CAUSE_CODE.illegal_instruction, insn);
            }
        } else {
            return this.exception(CAUSE_CODE.illegal_instruction, insn);
        }
    }
}
