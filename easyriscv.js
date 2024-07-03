export class RiscvMemory {
    constructor() {
        this.memory = new ArrayBuffer(32 << 20);
        this.memory_view = new DataView(this.memory);
        this.mem_base = 0x4000_0000;
        this.debug_base = 0x1000_0000;
    }

    fetch(address) {
        const mem_top = this.mem_base + this.memory.byteLength;
        if (this.mem_base <= address && address <= mem_top - 4) {
            const offset = address - this.mem_base;
            return this.memory_view.getUint32(offset, true);
        } else {
            return null;
        }
    }

    read(address, width) {
        // console.log('read', address.toString(16).padStart(8, '0'), width);
        const mem_top = this.mem_base + this.memory.byteLength;
        if (this.mem_base <= address && address <= mem_top - width) {
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
        // console.log('write', address.toString(16).padStart(8, '0'), data.toString(16).padStart(2 * width, '0'));
        const mem_top = this.mem_base + this.memory.byteLength;
        if (this.mem_base <= address && address <= mem_top - width) {
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

    step() {
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
                const addr = ((insn >> 20) + this.regs[(insn >>> 15) & 0b11111]) >>> 0;
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

            if (is_imm && funct3 === 0b101 && (funct7 & 0b1011111) != 0) {
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
                : (funct3 === 0b010) ? (((op1 | 0) < (op2 | 0)) ? 1 : 0)
                : (funct3 === 0b011) ? (((op1 >>> 0) < (op2 >>> 0)) ? 1 : 0)
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
        } else if ((insn & 0b1111111) === 0b0001111) {
            if (((insn >>> 12) & 0b111) === 0b000) {
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

const REGEX_OPERATOR = /[#&()*+,/^|~:-]/;
const REGEX_TOKENIZE = /\s+|(?=[#&()*+,/^|~:-])|(?<=[#&()*+,/^|~:-])/;

const REGS = (() => {
    const regs = new Map();
    for (let i = 0; i < 32; i ++) {
        regs.set(`x${i}`, i);
    }

    const NAMED = "zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6";

    NAMED.split(' ').forEach((name, i) => regs.set(name, i));

    regs.set('fp', 8); // fp = s0 = x8

    return regs;
})();

function parse_reg(tokens, p) {
    if (p.i >= tokens.length) {
        return {
            type: 'error',
            message: 'Expecting register, got end of line'
        };
    } else if (REGS.has(tokens[p.i])) {
        const register = REGS.get(tokens[p.i]);
        p.i ++;
        return {
            type: 'register',
            register
        };
    } else {
        return {
            type: 'error',
            message: `Expecting register, got ${tokens[p.i]}`
        };
    }
}

function parse_value(tokens, p) {
    if (p.i >= tokens.length) {
        return {
            type: 'error',
            message: 'Expecting value, got end of line'
        };
    } else if (/^[0-9]\w*$/.test(tokens[p.i])) {
        const res = Number(tokens[p.i]);
        if (Number.isSafeInteger(res)) {
            p.i ++;
            return {
                type: 'number',
                value: res
            };
        } else {
            return {
                type: 'error',
                message: `Invalid number ${tokens[p.i]}`
            };
        }
    } else if (! REGEX_OPERATOR.test(tokens[p.i])) {
        const label = tokens[p.i];
        p.i ++;
        return {
            type: 'label',
            label
        };
    } else {
        return {
            type: 'error',
            message: `Expecting value, got ${tokens[p.i]}`
        };
    }
}

function parse_operand(tokens, p) {
    if (p.i < tokens.length && /%\w+/.test(tokens[p.i])) {
        const SPECIAL = [ '%hi', '%lo', '%pcrel_hi', '%pcrel_lo' ];
        if (SPECIAL.includes(tokens[p.i])) {
            const special = tokens[p.i];
            const invalid = {
                type: 'error',
                message: `Invalid use of ${special}`
            }
            p.i ++;
            if (p.i >= tokens.length || tokens[p.i] !== '(') {
                return invalid;
            }
            p.i ++;
            const inner = parse_value(tokens, p);
            if (p.i >= tokens.length || tokens[p.i] !== ')') {
                return invalid;
            }
            p.i ++;
            return {
                type: 'special',
                special, inner,
            };
        } else {
            return {
                type: 'error',
                message: `Invalid special token ${tokens[p.i]}`
            };
        }
    } else {
        return parse_value(tokens, p);
    }
}

function parse_mem(tokens, p) {
    if (p.i + 3 <= tokens.length
        && tokens[p.i] === '('
        && REGS.has(tokens[p.i + 1])
        && tokens[p.i + 2] === ')'
        && (p.i + 3 >= tokens.length || tokens[p.i] === '#')) {

        const reg = REGS.get(tokens[p.i + 1]);
        p.i += 3;
        return {
            type: 'memory',
            offset: {
                type: 'number',
                value: 0
            },
            register: {
                type: 'register',
                register: REGS.get(reg)
            }
        };
    }

    const offset = parse_operand(tokens, p);
    if (offset.type === 'error') {
        return offset;
    }

    if (p.i >= tokens.length || tokens[p.i] !== '(') {
        return {
            type: 'error',
            message: `Expecting open paren, got ${tokens[p.i]}`
        };
    }

    p.i ++;

    const register = parse_reg(tokens, p);

    if (register.type === 'error') {
        return register;
    }

    if (p.i >= tokens.length || tokens[p.i] !== ')') {
        return {
            type: 'error',
            message: `Expecting close paren, got ${tokens[p.i]}`
        };
    }

    p.i ++;

    return {
        type: 'memory',
        offset, register
    };
}

function parse_multiple(tokens, p) {
    const values = [];

    while (true) {
        const part = parse_operand(tokens, p);
        if (part.type === 'error') {
            return part;
        }
        values.push(part);
        if (p.i >= tokens.length || tokens[p.i] === '#') {
            break;
        } else if (tokens[p.i] === ',') {
            p.i ++;
        } else {
            return {
                type: 'error',
                message: `Expecting comma or end of line, got ${tokens[p.i]}`
            };
        }
    }

    return {
        type: 'multiple',
        values
    };
}

const OPERAND_TYPES = (() => {
    const types = new Map();
    types.set('r', parse_reg);
    types.set('m', parse_mem);
    types.set('o', parse_operand);
    return types;
})();

function parse_types(types, tokens, p) {
    const values = [];
    let first = true;
    for (const t of [... types]) {
        if (first) {
            first = false;
        } else {
            if (p.i < tokens.length || tokens[p.i] === ',') {
                p.i ++;
            } else {
                return {
                    type: 'error',
                    message: `Expecting comma, got ${p.i >= tokens.length ? 'end of line' : tokens[p.i]}`
                };
            }
        }
        const res = OPERAND_TYPES.get(t)(tokens, p);
        if (res.type === 'error') {
            return res;
        }
        values.push(res);
    }

    if (p.i < tokens.length && tokens[p.i] !== '#') {
        return {
            type: 'error',
            message: `Expecting end of line, got ${tokens[p.i]}`
        };
    }

    return {
        type: 'multiple',
        values
    };
}

function process_data(width) {
    return {
        parse(tokens, p) {
            const multiple = parse_multiple(tokens, p);
            if (multiple.type === 'error') {
                return multiple;
            }

            if (! (p.i >= tokens.length || tokens[p.i] === '#')) {
                return {
                    type: 'error',
                    message: `Expecting, got ${tokens[p.i]}`
                };
            } else {
                return {
                    type: 'data',
                    length: width * multiple.values.length,
                    data: multiple.values
                };
            }
        },
        assemble(parsed, { evaluate, view, offset }) {
            for (const v of parsed.data) {
                const res = evaluate(v);
                if (res.type === 'error') {
                    return res;
                };

                const { value } = res;

                // Avoid shift overflow with Math.pow
                if (value < - Math.pow(2, width * 8 - 1) || value >= Math.pow(2, width * 8)) {
                    return {
                        type: 'error',
                        message: `Value ${value} out of range`
                    };
                } else {
                    if (width === 1) {
                        view.setUint8(offset, value);
                    } else if (width === 2) {
                        view.setUint16(offset, value, /* littleEndian */ true);
                    } else if (width === 4) {
                        view.setUint32(offset, value, /* littleEndian */ true);
                    } else {
                        throw "Unexpected data width";
                    }

                    offset += width;
                }
            }

            return { type: 'ok' };
        }
    };
}

function process_instruction(types, assemble) {
    return {
        parse(tokens, p) {
            const data = parse_types(types, tokens, p);
            if (data.type === 'error') {
                return data;
            }

            return {
                type: 'instruction',
                length: 4,
                data
            };
        },
        assemble
    };
}

function assemble_rri_itype(base) {
    return (parsed, { evaluate, view, offset }) => {
        const rd = parsed.data.values[0].register;
        const rs1 = parsed.data.values[1].register;
        const res = evaluate(parsed.data.values[2]);
        if (res.type === 'error') {
            return res;
        };
        const { value } = res;
        if (value < - (1 << 11) || value >= (1 << 11)) {
            return {
                type: 'error',
                message: `Immediate value ${value} out of range`
            };
        }

        const insn = base | (rd << 7) | (rs1 << 15) | (value >>> 0 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_rri_shift(base) {
    return (parsed, { evaluate, view, offset }) => {
        const rd = parsed.data.values[0].register;
        const rs1 = parsed.data.values[1].register;
        const res = evaluate(parsed.data.values[2]);
        if (res.type === 'error') {
            return res;
        };
        const { value } = res;
        if (value < 0 || value >= 32) {
            return {
                type: 'error',
                message: `Shift amount ${value} out of range`
            }
        }

        const insn = base | (rd << 7) | (rs1 << 15) | (value >>> 0 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}


function assemble_rm_itype(base) {
    return (parsed, { evaluate, view, offset }) => {
        const rd = parsed.data.values[0].register;
        const rs1 = parsed.data.values[1].register.register;
        const res = evaluate(parsed.data.values[1].offset);
        if (res.type === 'error') {
            return res;
        };

        const { value } = res;
        if (value < - (1 << 11) || value >= (1 << 11)) {
            return {
                type: 'error',
                message: `Immediate value ${value} out of range`
            }
        }

        const insn = base | (rd << 7) | (rs1 << 15) | (value >>> 0 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_rm_stype(base) {
    return (parsed, { evaluate, view, offset }) => {
        const rs2 = parsed.data.values[0].register;
        const rs1 = parsed.data.values[1].register.register;
        const res = evaluate(parsed.data.values[1].offset);
        if (res.type === 'error') {
            return res;
        };

        const { value } = res;
        if (value < - (1 << 11) || value >= (1 << 11)) {
            return {
                type: 'error',
                message: `Immediate value ${value} out of range`
            }
        }

        const insn = base
            | (rs1 << 15)
            | (rs2 << 20)
            | ((value >> 5) << 20)
            | ((value & 0b11111) << 7);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_branch(base) {
    return (parsed, { evaluate, view, offset, pc }) => {
        const rs1 = parsed.data.values[0].register;
        const rs2 = parsed.data.values[1].register;
        const res = evaluate(parsed.data.values[2]);
        if (res.type === 'error') {
            return res;
        };

        const { value } = res;
        const rel = value - pc;
        if (rel < - (1 << 11) || rel >= (1 << 11)) {
            return {
                type: 'error',
                message: `Jump target ${rel} out of range`
            };
        }

        if (rel & 1) {
            return {
                type: 'error',
                message: `Jump target ${rel} is at odd offset, which is unencodable`
            };
        }

        const insn = base
            | (rs1 << 15)
            | (rs2 << 20)
            | (rel >>> 12) << 31
            | ((rel >>> 11) & 0b1) << 7
            | ((rel >>> 5) & 0b111111) << 25
            | ((rel >>> 1) & 0b1111) << 8;

        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_rrr(base) {
    return (parsed, { view, offset }) => {
        const rd = parsed.data.values[0].register;
        const rs1 = parsed.data.values[1].register;
        const rs2 = parsed.data.values[2].register;
        const insn = base | (rd << 7) | (rs1 << 15) | (rs2 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_nullary(base) {
    return (parsed, { view, offset }) => {
        view.setUint32(offset, base, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_jal(parsed, { evaluate, view, offset, pc }) {
    const rd = parsed.data.values[0].register;
    const res = evaluate(parsed.data.values[1]);
    if (res.type === 'error') {
        return res;
    }

    const { value } = res;
    const rel = value - pc;

    if (rel < - (1 << 20) || rel >= (1 << 20)) {
        return {
            type: 'error',
            message: `Jump offset ${rel} out of range`
        };
    }


    if (rel & 1) {
        return {
            type: 'error',
            message: `Jump offset ${rel} is odd and unencodable`
        };
    }

    const insn = 0x0000006f
        | (rd << 7)
        | ((rel >> 20) << 31)
        | (((rel >>> 12) & 0b11111111) << 12)
        | (((rel >>> 11) & 0b1) << 20)
        | (((rel >>> 1) & 0b1111111111) << 21)

    view.setUint32(offset, insn, /* littleEndian */ true);
    return { type: 'ok' };
}

const WORDS = (() => {
    const words = new Map();
    words.set('.byte', process_data(1));
    words.set('.half', process_data(2));
    words.set('.2byte', process_data(2));
    words.set('.word', process_data(4));
    words.set('.4byte', process_data(4));

    words.set('addi',   process_instruction('rro', assemble_rri_itype(0x00000013)));
    words.set('slti',   process_instruction('rro', assemble_rri_itype(0x00002013)));
    words.set('sltiu',  process_instruction('rro', assemble_rri_itype(0x00003013)));
    words.set('xori',   process_instruction('rro', assemble_rri_itype(0x00004013)));
    words.set('ori',    process_instruction('rro', assemble_rri_itype(0x00006013)));
    words.set('andi',   process_instruction('rro', assemble_rri_itype(0x00007013)));

    words.set('slli',   process_instruction('rro', assemble_rri_shift(0x00001013)));
    words.set('srli',   process_instruction('rro', assemble_rri_shift(0x00005013)));
    words.set('srai',   process_instruction('rro', assemble_rri_shift(0x40005013)));

    words.set('add',    process_instruction('rrr', assemble_rrr(0x00000033)));
    words.set('sub',    process_instruction('rrr', assemble_rrr(0x40000033)));
    words.set('sll',    process_instruction('rrr', assemble_rrr(0x00001033)));
    words.set('slt',    process_instruction('rrr', assemble_rrr(0x00002033)));
    words.set('sltu',   process_instruction('rrr', assemble_rrr(0x00003033)));
    words.set('xor',    process_instruction('rrr', assemble_rrr(0x00004033)));
    words.set('srl',    process_instruction('rrr', assemble_rrr(0x00005033)));
    words.set('sra',    process_instruction('rrr', assemble_rrr(0x40005033)));
    words.set('or',     process_instruction('rrr', assemble_rrr(0x00006033)));
    words.set('and',    process_instruction('rrr', assemble_rrr(0x00007033)));

    words.set('lb',     process_instruction('rm', assemble_rm_itype(0x00000003)));
    words.set('lh',     process_instruction('rm', assemble_rm_itype(0x00001003)));
    words.set('lw',     process_instruction('rm', assemble_rm_itype(0x00002003)));
    words.set('lbu',    process_instruction('rm', assemble_rm_itype(0x00003003)));
    words.set('lhu',    process_instruction('rm', assemble_rm_itype(0x00004003)));

    words.set('sb',     process_instruction('rm', assemble_rm_stype(0x00001003)));
    words.set('sh',     process_instruction('rm', assemble_rm_stype(0x00002003)));
    words.set('sw',     process_instruction('rm', assemble_rm_stype(0x00004003)));

    words.set('beq',    process_instruction('rro', assemble_branch(0x00000063)));
    words.set('bne',    process_instruction('rro', assemble_branch(0x00001063)));
    words.set('blt',    process_instruction('rro', assemble_branch(0x00004063)));
    words.set('bge',    process_instruction('rro', assemble_branch(0x00005063)));
    words.set('bltu',   process_instruction('rro', assemble_branch(0x00006063)));
    words.set('bgeu',   process_instruction('rro', assemble_branch(0x00007063)));

    words.set('lui', process_instruction('ro', (parsed, { evaluate, view, offset }) => {
        const rd = parsed.data.values[0].register;
        const res = evaluate(parsed.data.values[1]);
        if (res.type === 'error') {
            return res;
        }

        const { value } = res;

        if (value < 0 || value >= (1 << 20)) {
            return {
                type: 'error',
                message: `Immediate value ${value} out of range`
            };
        }

        const insn = 0x00000037
            | (rd << 7)
            | (value >>> 0 << 12);

        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }));

    words.set('auipc', process_instruction('ro', (parsed, { evaluate, view, offset }) => {
        const rd = parsed.data.values[0].register;
        const res = evaluate(parsed.data.values[1]);
        if (res.type === 'error') {
            return res;
        }

        const { value } = res;

        if (value < 0 || value >= (1 << 20)) {
            return {
                type: 'error',
                message: `Immediate value ${value} out of range`
            };
        }

        const insn = 0x00000017
            | (rd << 7)
            | (value >>> 0 << 12);

        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }));

    words.set('jal', {
        parse(tokens, p) {
            const saved = p.i;
            const res_o = parse_types('o', tokens, p);
            if (res_o.type !== 'error') {
                return {
                    type: 'instruction',
                    length: 4,
                    data: {
                        type: 'multiple',
                        values: [
                            {
                                type: 'register',
                                register: 1 // ra
                            },
                            res_o.values[0]
                        ]
                    }
                };
            } else {
                p.i = saved;
                const res = parse_types('ro', tokens, p);
                if (res.type === 'error') {
                    return res;
                } else {
                    return {
                        type: 'instruction',
                        length: 4,
                        data: res
                    };
                }
            }
        },
        assemble: assemble_jal
    });

    words.set('jalr', {
        parse(tokens, p) {
            const saved = p.i;
            const res_r = parse_types('r', tokens, p);
            if (res_r.type !== 'error') {
                return {
                    type: 'instruction',
                    length: 4,
                    data: {
                        type: 'multiple',
                        values: [
                            {
                                type: 'register',
                                register: 1 // ra
                            },
                            {
                                type: 'memory',
                                offset: {
                                    type: 'number',
                                    value: 0
                                },
                                register: res_r.values[0]
                            }
                        ]
                    }
                };
            } else {
                p.i = saved;
                const res = parse_types('rm', tokens, p);
                if (res.type === 'error') {
                    return res;
                } else {
                    return {
                        type: 'instruction',
                        length: 4,
                        data: res
                    };
                }
            }
        },
        assemble: assemble_rm_itype(0x00000067)
    });

    words.set('fence', process_instruction('', assemble_nullary(0x0ff0000f)));
    words.set('ecall', process_instruction('', assemble_nullary(0x00000073)));
    words.set('ebreak', process_instruction('', assemble_nullary(0x00100073)));

    words.set('ret', process_instruction('', assemble_nullary(0x00008067)));

    words.set('j', process_instruction('o', (parsed, args) => {
        assemble_jal({
            type: 'instruction',
            length: 4,
            data: {
                type: 'multiple',
                values: [
                    {
                        type: 'register',
                        register: 0 // zero
                    },
                    parsed.data.values[0]
                ]
            }
        }, args);
        return { type: 'ok' };
    }));

    words.set('jr', process_instruction('r', (parsed, args) => {
        assemble_rm_itype(0x00000067)({
            type: 'instruction',
            length: 4,
            data: {
                type: 'multiple',
                values: [
                    {
                        type: 'register',
                        register: 0 // zero
                    },
                    {
                        type: 'memory',
                        offset: {
                            type: 'number',
                            value: 0
                        },
                        register: parsed.data.values[0]
                    }
                ]
            }
        }, args);
        return { type: 'ok' };
    }));

    return words;
})();

export function assemble_riscv(text, origin) {
    let pc = origin;
    const label = new Map();
    const chunks = new Map();
    const errors = [];

    let lineno = 0;
    let noted_misalign = false;

    for (const origLine of text.split('\n')) {
        lineno ++;
        const line = origLine.trim();
        if (line === '') {
            continue;
        }

        const tokens = line.split(REGEX_TOKENIZE);
        const p = { i: 0 };

        if (p.i + 2 <= tokens.length && tokens[p.i + 1] === ':') {
            const l = tokens[p.i ++]; // Consume label
            label.set(l, pc);
            p.i ++;
        }

        if (p.i < tokens.length && tokens[p.i] != '#') {
            // Not empty after optional label
            if (! WORDS.has(tokens[p.i])) {
                errors.push({
                    type: 'error',
                    lineno,
                    message: `Unknown instruction or directive ${tokens[p.i]}`
                });
            } else {
                const res = WORDS.get(tokens[p.i]);
                p.i ++;
                const parsed = res.parse(tokens, p);
                if (parsed.type === 'error') {
                    errors.push({ lineno, ... parsed });
                } else {
                    if (parsed.type === 'instruction' && ! noted_misalign && (pc & 0x3)) {
                        noted_misalign = true;
                        errors.push({
                            type: 'error',
                            lineno,
                            message: `Instruction at misaligned address 0x${pc.toString(16)}`
                        });
                    }
                    chunks.set(pc, { lineno, parsed, assemble: res.assemble });
                    pc += parsed.length;
                }
            }
        }
    }

    const buf = new ArrayBuffer(pc - origin);
    const view = new DataView(buf);

    const pcrel_cache = new Map();

    for (const [pc, chunk] of chunks) {
        function get_pcrel_at(addr) {
            if (pcrel_cache.has(addr)) {
                return pcrel_cache.get(addr);
            } else if (chunks.has(addr)) {
                const chunk = chunks.get(addr);
                if (chunk.parsed.data.values.length === 2
                    && chunk.parsed.data.values[1].type === 'special'
                    && chunk.parsed.data.values[1].special === '%pcrel_hi') {
                    const ref = evaluate(chunk.parsed.data.values[1].inner, addr);
                    if (ref.type === 'error') {
                        return null;
                    }
                    const rel = ref.value - addr;
                    pcrel_cache.set(addr, rel);
                    return rel;
                } else {
                    return null;
                }
            } else {
                return null;
            }
        }

        function evaluate(expr, pc) {
            if (expr.type === 'number') {
                return {
                    type: 'ok',
                    value: expr.value
                };
            } else if (expr.type == 'label') {
                if (label.has(expr.label)) {
                    return {
                        type: 'ok',
                        value: label.get(expr.label)
                    };
                } else {
                    return {
                        type: 'error',
                        message: `Unknown label ${expr.label}`
                    };
                }
            } else if (expr.type === 'special') {
                const inner = evaluate(expr.inner, pc);
                if (inner.type === 'error') {
                    return inner;
                }
                const { value } = inner;

                if (expr.special === '%hi') {
                    return {
                        type: 'ok',
                        value: (value >>> 12) + ((value & 0x800) != 0)
                    };
                } else if (expr.special === '%lo') {
                    return {
                        type: 'ok',
                        value: (value & 0xfff) << 20 >> 20
                    };
                } else if (expr.special === '%pcrel_hi') {
                    return {
                        type: 'ok',
                        value: (value - pc) >>> 12 + (((value - pc) & 0x800) != 0)
                    };
                } else if (expr.special === '%pcrel_lo') {
                    const rel = get_pcrel_at(value);
                    if (rel !== null) {
                        return {
                            type: 'ok',
                            value: (rel & 0xfff) << 20 >> 20
                        };
                    } else {
                        return {
                            type: 'error',
                            message: 'No %pcrel_hi found'
                        };
                    }
                }
            }
        }
        const res = chunk.assemble(chunk.parsed, {
            evaluate: (expr) => evaluate(expr, pc),
            view, offset: pc - origin, pc
        });
        if (res.type === 'error') {
            errors.push({ lineno: chunk.lineno, ... res });
        }
    }

    if (errors.length) {
        return {
            type: 'errors',
            errors
        };
    } else {
        return {
            type: 'ok',
            data: buf
        };
    }
}
