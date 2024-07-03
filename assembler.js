const REGEX_OPERATOR = /[#&()*+,/^|~:]/;
const REGEX_TOKENIZE = /\s+|(?=[#&()*+,/^|~:])|(?<=[#&()*+,/^|~:])/;
const REGS = (() => {
    const regs = new Map();
    for (let i = 0; i < 32; i++) {
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
        p.i++;
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
            p.i++;
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
        const SPECIAL = ['%hi', '%lo', '%pcrel_hi', '%pcrel_lo'];
        if (SPECIAL.includes(tokens[p.i])) {
            const special = tokens[p.i];
            const invalid = {
                type: 'error',
                message: `Invalid use of ${special}`
            };
            p.i++;
            if (p.i >= tokens.length || tokens[p.i] !== '(') {
                return invalid;
            }
            p.i++;
            const inner = parse_value(tokens, p);
            if (inner.type === 'error') {
                return inner;
            }

            if (p.i >= tokens.length || tokens[p.i] !== ')') {
                return invalid;
            }
            p.i++;
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

    p.i++;

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

    p.i++;

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
            p.i++;
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
    for (const t of [...types]) {
        if (first) {
            first = false;
        } else {
            if (p.i < tokens.length || tokens[p.i] === ',') {
                p.i++;
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

            if (!(p.i >= tokens.length || tokens[p.i] === '#')) {
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
                if (value < -Math.pow(2, width * 8 - 1) || value >= Math.pow(2, width * 8)) {
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
        if (value < -(1 << 11) || value >= (1 << 11)) {
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
        if (value < -(1 << 11) || value >= (1 << 11)) {
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
        if (value < -(1 << 11) || value >= (1 << 11)) {
            return {
                type: 'error',
                message: `Immediate value ${value} out of range`
            };
        }

        const insn = base
            | (rs1 << 15)
            | (rs2 << 20)
            | ((value >> 5) << 25)
            | ((value & 31) << 7);
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
        if (rel < -(1 << 11) || rel >= (1 << 11)) {
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
            | ((rel >>> 11) & 1) << 7
            | ((rel >>> 5) & 63) << 25
            | ((rel >>> 1) & 15) << 8;

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

    if (rel < -(1 << 20) || rel >= (1 << 20)) {
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

    const insn = 111
        | (rd << 7)
        | ((rel >> 20) << 31)
        | (((rel >>> 12) & 255) << 12)
        | (((rel >>> 11) & 1) << 20)
        | (((rel >>> 1) & 1023) << 21);

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

    words.set('addi', process_instruction('rro', assemble_rri_itype(19)));
    words.set('slti', process_instruction('rro', assemble_rri_itype(8211)));
    words.set('sltiu', process_instruction('rro', assemble_rri_itype(12307)));
    words.set('xori', process_instruction('rro', assemble_rri_itype(16403)));
    words.set('ori', process_instruction('rro', assemble_rri_itype(24595)));
    words.set('andi', process_instruction('rro', assemble_rri_itype(28691)));

    words.set('slli', process_instruction('rro', assemble_rri_shift(4115)));
    words.set('srli', process_instruction('rro', assemble_rri_shift(20499)));
    words.set('srai', process_instruction('rro', assemble_rri_shift(1073762323)));

    words.set('add', process_instruction('rrr', assemble_rrr(51)));
    words.set('sub', process_instruction('rrr', assemble_rrr(1073741875)));
    words.set('sll', process_instruction('rrr', assemble_rrr(4147)));
    words.set('slt', process_instruction('rrr', assemble_rrr(8243)));
    words.set('sltu', process_instruction('rrr', assemble_rrr(12339)));
    words.set('xor', process_instruction('rrr', assemble_rrr(16435)));
    words.set('srl', process_instruction('rrr', assemble_rrr(20531)));
    words.set('sra', process_instruction('rrr', assemble_rrr(1073762355)));
    words.set('or', process_instruction('rrr', assemble_rrr(24627)));
    words.set('and', process_instruction('rrr', assemble_rrr(28723)));

    words.set('lb', process_instruction('rm', assemble_rm_itype(3)));
    words.set('lh', process_instruction('rm', assemble_rm_itype(4099)));
    words.set('lw', process_instruction('rm', assemble_rm_itype(8195)));
    words.set('lbu', process_instruction('rm', assemble_rm_itype(16387)));
    words.set('lhu', process_instruction('rm', assemble_rm_itype(20483)));

    words.set('sb', process_instruction('rm', assemble_rm_stype(35)));
    words.set('sh', process_instruction('rm', assemble_rm_stype(4131)));
    words.set('sw', process_instruction('rm', assemble_rm_stype(8227)));

    words.set('beq', process_instruction('rro', assemble_branch(99)));
    words.set('bne', process_instruction('rro', assemble_branch(4195)));
    words.set('blt', process_instruction('rro', assemble_branch(16483)));
    words.set('bge', process_instruction('rro', assemble_branch(20579)));
    words.set('bltu', process_instruction('rro', assemble_branch(24675)));
    words.set('bgeu', process_instruction('rro', assemble_branch(28771)));

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

        const insn = 55
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

        const insn = 23
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
        assemble: assemble_rm_itype(103)
    });

    words.set('fence', process_instruction('', assemble_nullary(267386895)));
    words.set('ecall', process_instruction('', assemble_nullary(115)));
    words.set('ebreak', process_instruction('', assemble_nullary(1048691)));

    words.set('ret', process_instruction('', assemble_nullary(32871)));

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
        assemble_rm_itype(103)({
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
    const loc = new Map();
    const loc_counter = new Map();
    const errors = [];

    let lineno = 0;
    let noted_misalign = false;

    for (const origLine of text.split('\n')) {
        lineno++;
        const line = origLine.trim();
        if (line === '') {
            continue;
        }

        const tokens = line.split(REGEX_TOKENIZE);
        const p = { i: 0, loc_counter };

        if (p.i + 2 <= tokens.length && tokens[p.i + 1] === ':') {
            const l = tokens[p.i++]; // Consume label
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
            if (!WORDS.has(tokens[p.i])) {
                errors.push({
                    type: 'error',
                    lineno,
                    message: `Unknown instruction or directive ${tokens[p.i]}`
                });
            } else {
                const res = WORDS.get(tokens[p.i]);
                p.i++;
                const parsed = res.parse(tokens, p);
                if (parsed.type === 'error') {
                    errors.push({ lineno, ...parsed });
                } else {
                    if (parsed.type === 'instruction' && !noted_misalign && (pc & 3)) {
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

    console.log(loc, loc_counter)

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
                        value: (value >>> 12) + ((value & 2048) != 0)
                    };
                } else if (expr.special === '%lo') {
                    return {
                        type: 'ok',
                        value: (value & 4095) << 20 >> 20
                    };
                } else if (expr.special === '%pcrel_hi') {
                    return {
                        type: 'ok',
                        value: ((value - pc) >>> 12) + (((value - pc) & 2048) != 0)
                    };
                } else if (expr.special === '%pcrel_lo') {
                    const rel = get_pcrel_at(value);
                    if (rel !== null) {
                        return {
                            type: 'ok',
                            value: (rel & 4095) << 20 >> 20
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
            errors.push({ lineno: chunk.lineno, ...res });
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
