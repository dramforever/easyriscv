import { RiscvState, RiscvMemory } from './emulator.js';
import { assemble_riscv } from './assembler.js';

class EmulatorMemory extends RiscvMemory {
    constructor(serialWrite) {
        super(1 << 20);
        this.serialWrite = serialWrite;
    }

    read(address, width) {
        if (address === 0x1000_0000) {
            if (width === 4 || width == 1) {
                return 0;
            } else {
                return null;
            }
        } else {
            return super.read(address, width);
        }
    }

    write(address, width, data) {
        if (address === 0x1000_0000) {
            if (width === 4 || width == 1) {
                this.serialWrite(data & 0xff);
                return true;
            } else {
                return null;
            }
        } else {
            return super.write(address, width, data);
        }
    }

}

/**
 * @param {HTMLDivElement} el
 */
function convertEmulator(el) {
    const text = el.textContent;
    for (const c of el.childNodes) {
        c.remove();
    }
    el.classList.remove('emulator-disabled');
    el.classList.add('emulator');

    const edit = document.createElement('textarea');
    edit.value = text;
    edit.classList.add('emulator-edit');

    const regsDisp = document.createElement('div');
    regsDisp.classList.add('emulator-regs');

    const controls = document.createElement('div');
    controls.classList.add('emulator-controls');

    const output = document.createElement('div');
    output.classList.add('emulator-output');
    output.append('Emulator output\n');

    el.append(edit, regsDisp, controls, output);

    const runBtn = document.createElement('button');
    runBtn.append('Run');
    const stepBtn = document.createElement('button');
    stepBtn.append('Step');
    const startStopBtn = document.createElement('button');
    startStopBtn.append('Start');
    const clearBtn = document.createElement('button');
    clearBtn.append('Clear');
    controls.append(runBtn, stepBtn, startStopBtn, clearBtn);

    let running = false, started = false;

    function updateUI() {
        edit.disabled = started;
        runBtn.disabled = ! started;
        runBtn.textContent = running ? 'Pause' : 'Run';
        stepBtn.disabled = running || ! started;
        startStopBtn.textContent = started ? 'Stop' : 'Start';
        startStopBtn.disabled = running && started;
    }

    updateUI();

    let mem = null, riscv = null, runTask = null;

    const fmt = (x) => `0x${x.toString(16).padStart(8, '0')}`;

    function renderRegs() {
        const lines = [];
        const names = "zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6".split(' ');

        const insn = mem.fetch(riscv.pc);
        lines.push(`  pc       ${fmt(riscv.pc)} (${insn === null ? '???' : fmt(insn)})\n`);
        for (let i = 0; i < 32; i ++) {
            const end = i % 2 ? '\n' : '  |  ';
            lines.push(`${names[i].padStart(4, ' ')} ${`(x${i})`.padStart(5, ' ')} ${fmt(riscv.regs[i])} = ${(riscv.regs[i] | 0).toString().padStart(10, ' ')}${end}`);
        }
        lines.push('\n');
        lines.push(`(priv) = ${riscv.priv} | mstatus = { MPP = ${riscv.mpp} }\n`);
        lines.push(`mscratch = ${fmt(riscv.mscratch)} | `);
        lines.push(`mtvec = ${fmt(riscv.mtvec)}\n`);
        lines.push(`mcause = ${fmt(riscv.mepc)} | `);
        lines.push(`mepc = ${fmt(riscv.mepc)} | `);
        lines.push(`mtval = ${fmt(riscv.mtval)}\n`);
        lines.push(`cycle = ${riscv.cycle[1].toString(16).padStart(8, '0')}_${riscv.cycle[0].toString(16).padStart(8, '0')} | `);
        lines.push(`instret = ${riscv.instret[1].toString(16).padStart(8, '0')}_${riscv.instret[0].toString(16).padStart(8, '0')}\n`);
        regsDisp.textContent = lines.join('');
    }

    function writeOutput(text) {
        output.textContent += text;
        output.scrollTo(0, output.scrollHeight);
    }

    function start() {
        const res = assemble_riscv(edit.value, 0x40000000);

        if (res.type === 'ok') {
            const decoder = new TextDecoder();
            mem = new EmulatorMemory((byte) => {
                const buf = new Uint8Array([byte]);
                writeOutput(decoder.decode(buf, { stream: true }))
            });
            (new Uint8Array(mem.memory)).set(new Uint8Array(res.data));
            writeOutput('[ Started ]\n')
            riscv = new RiscvState(mem);
            riscv.pc = 0x40000000;
            running = false;
            started = true;
            renderRegs();
            updateUI();
        } else {
            const parts = [];
            const lines = edit.value.split('\n');
            for (const { lineno, message } of res.errors) {
                parts.push(`${message}\n${lineno.toString().padStart(4, ' ')}| ${lines[lineno - 1]}`)
            }
            writeOutput('\n' + parts.join('\n\n') + '\n[ Errors while assembling ]\n');
        }
    }

    function stop() {
        mem = null;
        riscv = null;
        running = false;
        started = false;
        writeOutput('[ Stopped ]\n')
        updateUI();
    }

    function step() {
        const res = riscv.step();
        if (res.type === 'ok') {
            renderRegs();
        } else if (res.type === 'stop') {
            stop();
        } else {
            renderRegs();
            writeOutput(`[ Exception cause ${res.cause}, tval = ${fmt(res.tval)}, at pc = ${fmt(riscv.pc)} ]\n`)
        }
    }

    function run() {
        const LIMIT = 100;

        running = true;

        for (let count = 0; count < LIMIT; count ++) {
            const res = riscv.step();
            if (res.type === 'exception') {
                renderRegs();
                writeOutput(`[ Exception cause ${res.cause}, tval = ${fmt(res.tval)}, at pc = ${fmt(riscv.pc)} ]\n`)
                pause();
                break;
            } else if (res.type === 'stop') {
                renderRegs();
                stop();
                break;
            }
        }

        renderRegs();
        updateUI();

        if (running) {
            runTask = setTimeout(run, 0);
        }
    }

    function pause() {
        running = false;
        clearTimeout(runTask);
        updateUI();
    }

    runBtn.onclick = () => {
        if (running) {
            pause();
        } else {
            run();
        }
    }

    stepBtn.onclick = step;

    startStopBtn.onclick = () => {
        if (started) {
            stop();
        } else {
            start();
        }
    }

    startStopBtn.onclick = () => {
        if (started) {
            stop();
        } else {
            start();
        }
    }

    clearBtn.onclick = () => {
        output.textContent = '';
    }
}

const emulators = document.querySelectorAll('.emulator-disabled');

for (const e of emulators) {
    convertEmulator(e);
}
