const REGEX_OPERATOR = /[#&()*+,/^|~:]/;
const REGEX_TOKENIZE = /\s+|(?=[#&()*+,/^|~:])|(?<=[#&()*+,/^|~:])/;
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
    } else if (/^-?(?:[0-9]+|0\w+)$/.test(tokens[p.i])) {
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
    } else if (/^\d+[fb]$/.test(tokens[p.i])) {
        const base = tokens[p.i].slice(0, -1);
        if (! p.loc_counter.has(base)) {
            p.loc_counter.set(base, 0);
        }
        const count = p.loc_counter.get(base);
        const dir = tokens[p.i].slice(-1);
        p.i ++;
        return {
            type: 'loc',
            label: tokens[p.i],
            base,
            suffix: count + (dir == 'f')
        };
    } else if (!REGEX_OPERATOR.test(tokens[p.i])) {
        const label = tokens[p.i];
        p.i++;
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
            if (inner.type === 'error') {
                return inner;
            }

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
                register: reg
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

const CSR = new Map([
    [ "mstatus", 0x300 ],
    [ "mtvec", 0x305 ],
    [ "mscratch", 0x340 ],
    [ "mepc", 0x341 ],
    [ "mcause", 0x342 ],
    [ "mtval", 0x343 ],
    [ "cycle", 0xc00 ],
    [ "instret", 0xc02 ],
    [ "cycleh", 0xc80 ],
    [ "instreth", 0xc82 ]
]);

function parse_csr(tokens, p) {
    if (p.i >= tokens.length) {
        return {
            type: 'error',
            message: 'Expecting CSR name or number, got end of line'
        };
    } else if (CSR.has(tokens[p.i])) {
        const csr = CSR.get(tokens[p.i]);
        p.i ++;
        return {
            type: 'csr',
            csr
        };
    } else {
        const csr = Number(tokens[p.i]);
        if (Number.isSafeInteger(csr) && 0 <= csr && csr < 0x1000) {
            p.i ++;
            return {
                type: 'csr',
                csr
            };
        } else {
            return {
                type: 'error',
                message: `Expecting CSR name or number, got ${tokens[p.i]}`
            };
        }
    }
}


const OPERAND_TYPES = (() => {
    const types = new Map();
    types.set('r', parse_reg);
    types.set('m', parse_mem);
    types.set('o', parse_operand);
    types.set('c', parse_csr);
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
    };
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
            };
        }

        const insn = base | (rd << 7) | (rs1 << 15) | (value >>> 0 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    };
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
            };
        }

        const insn = base | (rd << 7) | (rs1 << 15) | (value >>> 0 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    };
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
            };
        }

        const insn = base
            | (rs1 << 15)
            | (rs2 << 20)
            | ((value >> 5) << 25)
            | ((value & 0b11111) << 7);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    };
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
                message: `Jump offset ${rel} out of range`
            };
        }

        if (rel & 1) {
            return {
                type: 'error',
                message: `Jump offset ${rel} is odd, which is unencodable`
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
    };
}

function assemble_rrr(base) {
    return (parsed, { view, offset }) => {
        const rd = parsed.data.values[0].register;
        const rs1 = parsed.data.values[1].register;
        const rs2 = parsed.data.values[2].register;
        const insn = base | (rd << 7) | (rs1 << 15) | (rs2 << 20);
        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    };
}

function assemble_nullary(base) {
    return (parsed, { view, offset }) => {
        view.setUint32(offset, base, /* littleEndian */ true);
        return { type: 'ok' };
    };
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
            message: `Jump offset ${rel} is odd, which is unencodable`
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

function assemble_csr_r(base) {
    return (parsed, { view, offset }) => {
        const rd = parsed.data.values[0].register;
        const csr = parsed.data.values[1].csr
        const rs1 = parsed.data.values[2].register;

        const insn = base | (rd << 7) | (csr << 20) | (rs1 << 15);

        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function assemble_csr_i(base) {
    return (parsed, { view, offset }) => {
        const rd = parsed.data.values[0].register;
        const csr = parsed.data.values[1].csr
        const res = evaluate(parsed.data.values[2]);
        if (res.type === 'error') {
            return res;
        }
        const { value } = res;
        if (value < 0 || value >= 32) {
            return {
                type: 'error',
                message: `CSR instruction immediat ${value} out of range`
            };
        }

        const insn = base | (rd << 7) | (value << 20) | (rs1 << 15);

        view.setUint32(offset, insn, /* littleEndian */ true);
        return { type: 'ok' };
    }
}

function csr_pseudo(parsed) {
    return {
        type: 'instruction',
        length: 4,
        data: {
            type: 'multiple',
            values: [
                {
                    type: 'register',
                    register: 0 // zero
                },
                ... parsed.data.values
            ]
        }
    }
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
    words.set('lbu',    process_instruction('rm', assemble_rm_itype(0x00004003)));
    words.set('lhu',    process_instruction('rm', assemble_rm_itype(0x00005003)));

    words.set('sb',     process_instruction('rm', assemble_rm_stype(0x00000023)));
    words.set('sh',     process_instruction('rm', assemble_rm_stype(0x00001023)));
    words.set('sw',     process_instruction('rm', assemble_rm_stype(0x00002023)));

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

    words.set('j', process_instruction('o', (parsed, args) =>
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
        }, args)
    ));

    words.set('mv', process_instruction('rr', (parsed, args) =>
        assemble_rri_itype(0x00000013)({
            type: 'instruction',
            length: 4,
            data: {
                type: 'multiple',
                values: [
                    parsed.data.values[0],
                    parsed.data.values[1],
                    {
                        type: 'number',
                        value: 0
                    }
                ]
            }
        }, args)
    ));

    words.set('li', process_instruction('ro', (parsed, args) =>
        assemble_rri_itype(0x00000013)({
            type: 'instruction',
            length: 4,
            data: {
                type: 'multiple',
                values: [
                    parsed.data.values[0],
                    {
                        type: 'register',
                        register: 0
                    },
                    parsed.data.values[1]
                ]
            }
        }, args)
    ));

    words.set('la', {
        parse(tokens, p) {
            const data = parse_types('ro', tokens, p);
            if (data.type === 'error') {
                return data;
            }

            return {
                type: 'instruction',
                length: 8,
                data
            };
        },
        assemble(parsed, { evaluate, view, offset, pc }) {
            const rd = parsed.data.values[0].register;
            const res = evaluate(parsed.data.values[1]);
            if (res.type === 'error') {
                return res;
            }
            const { value } = res;
            const rel = (value - pc) >>> 0;
            const high = (rel >> 12 << 12) + ((rel & 0x800) !== 0);

            const auipc = 0x00000017 | (rd << 7) | high;
            const addi = 0x00000013 | (rd << 7) | (rd << 15) | ((rel & 0xfff) << 20);

            view.setUint32(offset, auipc, /* littleEndian */ true);
            view.setUint32(offset + 4, addi, /* littleEndian */ true);
            return { type: 'ok' };
        }
    });

    // This is really similar to la, but I don't feel like generalizing from
    // just two usages... Welp...
    words.set('call', {
        parse(tokens, p) {
            const data = parse_types('o', tokens, p);
            if (data.type === 'error') {
                return data;
            }

            return {
                type: 'instruction',
                length: 8,
                data
            };
        },
        assemble(parsed, { evaluate, view, offset, pc }) {
            const res = evaluate(parsed.data.values[0]);
            if (res.type === 'error') {
                return res;
            }
            const { value } = res;
            const rel = (value - pc) >>> 0;
            const high = (rel >> 12 << 12) + ((rel & 0x800) !== 0);

            const ra = 1;
            const auipc = 0x00000017 | (ra << 7) | high;
            const jalr = 0x00000067 | (ra << 7) | (ra << 15) | ((rel & 0xfff) << 20);

            view.setUint32(offset, auipc, /* littleEndian */ true);
            view.setUint32(offset + 4, jalr, /* littleEndian */ true);
            return { type: 'ok' };
        }
    });

    words.set('jr', process_instruction('r', (parsed, args) =>
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
        }, args)
    ));

    words.set('csrrw',  process_instruction('rcr', assemble_csr_r(0x00001073)));
    words.set('csrrs',  process_instruction('rcr', assemble_csr_r(0x00002073)));
    words.set('csrrc',  process_instruction('rcr', assemble_csr_r(0x00003073)));
    words.set('csrrwi', process_instruction('rco', assemble_csr_i(0x00005073)));
    words.set('csrrsi', process_instruction('rco', assemble_csr_i(0x00006073)));
    words.set('csrrci', process_instruction('rco', assemble_csr_i(0x00007073)));

    words.set('csrw',  process_instruction('cr', (parsed, args) =>
        assemble_csr_r(0x00001073)(csr_pseudo(parsed), args)
    ));
    words.set('csrs',  process_instruction('cr', (parsed, args) =>
        assemble_csr_r(0x00002073)(csr_pseudo(parsed), args)
    ));
    words.set('csrc',  process_instruction('cr', (parsed, args) =>
        assemble_csr_r(0x00003073)(csr_pseudo(parsed), args)
    ));
    words.set('csrwi', process_instruction('co', (parsed, args) =>
        assemble_csr_i(0x00005073)(csr_pseudo(parsed), args)
    ));
    words.set('csrsi', process_instruction('co', (parsed, args) =>
        assemble_csr_i(0x00006073)(csr_pseudo(parsed), args)
    ));
    words.set('csrci', process_instruction('co', (parsed, args) =>
        assemble_csr_i(0x00007073)(csr_pseudo(parsed), args)
    ));

    words.set('csrr',  process_instruction('rc', (parsed, args) =>
        assemble_csr_r(0x00002073)({
            type: 'instruction',
            length: 4,
            data: {
                type: 'multiple',
                values: [
                    ... parsed.data.values,
                    {
                        type: 'register',
                        register: 0 // zero
                    }
                ]
            }
        }, args)
    ));

    words.set('mret', process_instruction('', assemble_nullary(0x30200073)));

    return words;
})();

export function assemble_riscv(text, origin) {
    let pc = origin;
    const label = new Map();
    const chunks = new Map();
    const loc = new Map();
    const loc_counter = new Map();
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
        const p = { i: 0, loc_counter };

        if (p.i + 2 <= tokens.length && tokens[p.i + 1] === ':') {
            const l = tokens[p.i ++]; // Consume label
            p.i++;
            if (/^\d+$/.test(l)) {
                // local label
                if (! loc_counter.has(l))
                    loc_counter.set(l, 0);

                const suffix = loc_counter.get(l);
                loc_counter.set(l, suffix + 1)
                loc.set(`${l}.${suffix + 1}`, pc);
            } else {
                label.set(l, pc);
            }
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
            } else if (expr.type === 'label') {
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
            } else if (expr.type === 'loc') {
                if (loc.has(`${expr.base}.${expr.suffix}`)) {
                    return {
                        type: 'ok',
                        value: loc.get(`${expr.base}.${expr.suffix}`)
                    };
                } else {
                    return {
                        type: 'error',
                        message: `Unknown reference to local label ${expr.base} number ${expr.suffix}`
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
                        value: ((value >>> 12) + ((value & 0x800) != 0)) & 0xfffff
                    };
                } else if (expr.special === '%lo') {
                    return {
                        type: 'ok',
                        value: (value & 0xfff) << 20 >> 20
                    };
                } else if (expr.special === '%pcrel_hi') {
                    return {
                        type: 'ok',
                        value: ((value - pc) >>> 12) + (((value - pc) & 0x800) != 0)
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
                            message: 'No corresponding %pcrel_hi found'
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
        const lines = text.split('\n');
        for (const [pc, chunk] of chunks) {
            if (chunk.parsed.type === 'instruction') {
                const insns = new Uint32Array(buf.slice(pc - origin, pc - origin + chunk.parsed.length));
                const formatted = [... insns].map(x => x.toString(16).padStart(8, '0')).join(' ');
                lines[chunk.lineno - 1] = `{ 0x${pc.toString(16).padStart(8, '0')}: ${formatted} } ${lines[chunk.lineno - 1].trimStart()}`;
            }
        }

        const sym = [...label, ...loc].map(([name, addr]) => `# 0x${addr.toString(16).padStart(8, '0')} ${name}`);

        return {
            type: 'ok',
            data: buf,
            dump: `# Symbols\n${sym.join('\n')}\n\n${lines.join('\n')}\n`
        };
    }
}
