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

let counter = 0;

/**
 * @param {HTMLDivElement} el
 */
function convertEmulator(el) {
    const text = el.textContent.replace(/^\n/, '');
    for (const c of el.childNodes) {
        c.remove();
    }
    el.classList.remove('emulator-disabled');
    el.classList.add('emulator');

    const edit = document.createElement('textarea');
    edit.autocomplete = false;
    edit.autocapitalize = false;
    edit.placeholder = '    # code here...';

    edit.value = text;
    edit.classList.add('emulator-edit');

    const regsDispWrapper = document.createElement('div');
    regsDispWrapper.classList.add('emulator-regs-wrapper');

    const regsDisp = document.createElement('div');
    regsDisp.classList.add('emulator-regs');
    regsDisp.append(Array(44).fill(' ').join(''));
    regsDispWrapper.append(regsDisp)

    const controls = document.createElement('div');
    controls.classList.add('emulator-controls');

    const output = document.createElement('div');
    output.classList.add('emulator-output');

    el.append(edit, regsDispWrapper, controls, output);

    const runBtn = document.createElement('button');
    runBtn.append('Run');
    const stepBtn = document.createElement('button');
    stepBtn.append('Step');
    const startStopBtn = document.createElement('button');
    startStopBtn.append('Start');
    const dumpBtn = document.createElement('button');
    dumpBtn.append('Dump');
    const clearBtn = document.createElement('button');
    clearBtn.append('Clear');

    const pauseOnExc = document.createElement('div');
    pauseOnExc.classList.add('emulator-checkbox');
    const pauseOnExcCheck = document.createElement('input');
    pauseOnExcCheck.type = 'checkbox';
    pauseOnExcCheck.checked = true;
    pauseOnExcCheck.id = `pause-on-exc-${counter}`;
    const pauseOnExcLabel = document.createElement('label');
    pauseOnExcLabel.append('Pause on exc.');
    pauseOnExcLabel.htmlFor = `pause-on-exc-${counter}`;
    counter ++;
    pauseOnExc.append(pauseOnExcCheck, pauseOnExcLabel)

    const printOnExc = document.createElement('div');
    printOnExc.classList.add('emulator-checkbox');
    const printOnExcCheck = document.createElement('input');
    printOnExcCheck.type = 'checkbox';
    printOnExcCheck.checked = true;
    printOnExcCheck.id = `print-on-exc-${counter}`;
    const printOnExcLabel = document.createElement('label');
    printOnExcLabel.append('Print on exc.');
    printOnExcLabel.htmlFor = `print-on-exc-${counter}`;
    counter ++;
    printOnExc.append(printOnExcCheck, printOnExcLabel)

    controls.append(runBtn, stepBtn, startStopBtn, dumpBtn, clearBtn, pauseOnExc, printOnExc);

    let pauseOnException = false;
    let printOnException = false;
    let running = false, started = false;

    function updateUI() {
        pauseOnException = pauseOnExcCheck.checked;
        printOnException = printOnExcCheck.checked;

        edit.disabled = started;
        runBtn.disabled = ! started;
        runBtn.textContent = running ? 'Pause' : 'Run';
        stepBtn.disabled = running || ! started;
        dumpBtn.disabled = ! started;
        startStopBtn.textContent = started ? 'Stop' : 'Start';
        startStopBtn.disabled = running && started;
    }

    pauseOnExcCheck.onchange = updateUI;
    printOnExcCheck.onchange = updateUI;
    updateUI();

    let mem = null, riscv = null, dump = null, runTask = null, oldState = null;

    const fmt = (x) => `0x${x.toString(16).padStart(8, '0')}`;

    function renderRegs() {
        const newState = riscv.dump_state();

        const parts = [];
        const names = "zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6".split(' ');

        const makeField = (str, changed) => {
            const span = document.createElement('span');
            span.textContent = str;
            if (changed)
                span.classList.add('field-changed');
            return span;
        };

        const regFmt = (i) => makeField(fmt(newState.regs[i]), oldState !== null && newState.regs[i] !== oldState.regs[i]);
        const field = (n) => makeField(`${newState[n]}`, oldState !== null && newState[n] !== oldState[n]);
        const fieldFmt = (n) => makeField(fmt(newState[n]), oldState !== null && newState[n] !== oldState[n]);

        const insn = mem.fetch(riscv.pc);
        parts.push(`  pc       ${fmt(newState.pc)} (insn: ${insn === null ? '???' : fmt(insn)})\n`);

        for (let i = 0; i < 32; i ++) {
            const end = i % 2 ? '\n' : ' |';
            parts.push(`${names[i].padStart(4, ' ')} ${`(x${i})`.padStart(5, ' ')} `, regFmt(i), end);
        }
        parts.push('\n');
        parts.push(`(priv) = `, field('priv'),` | mstatus = { MPP = `, field('mpp'),` }\n`);
        parts.push(`mscratch = `, fieldFmt('mscratch'), ` | `);
        parts.push(`mtvec = `, fieldFmt('mtvec'), `\n`);
        parts.push(`mepc = `, fieldFmt('mepc'), ` | `);
        parts.push(`mtval = `, fieldFmt('mtval'), `\n`);
        parts.push(`mcause = `, fieldFmt('mcause'), `\n`);

        parts.push(`cycle = 0x${riscv.cycle[1].toString(16).padStart(8, '0')}_${riscv.cycle[0].toString(16).padStart(8, '0')}\n`);
        parts.push(`instret = 0x${riscv.instret[1].toString(16).padStart(8, '0')}_${riscv.instret[0].toString(16).padStart(8, '0')}\n`);

        regsDisp.replaceChildren(...parts);
    }

    function writeOutput(text) {
        output.textContent += text;
        output.scrollTo(0, output.scrollHeight);
    }

    function start() {
        const res = assemble_riscv(edit.value, 0x40000000);

        if (res.type === 'ok') {
            dump = res.dump;
            const decoder = new TextDecoder();
            mem = new EmulatorMemory((byte) => {
                const buf = new Uint8Array([byte]);
                writeOutput(decoder.decode(buf, { stream: true }))
            });
            (new Uint8Array(mem.memory)).set(new Uint8Array(res.data));
            writeOutput('[ Started ]\n')
            riscv = new RiscvState(mem);
            riscv.pc = 0x40000000;
            riscv.regs[2 /* sp */] = 0x40000000 + mem.memory.byteLength;
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
        dump = null;
        oldState = null;
        running = false;
        started = false;
        writeOutput('[ Stopped ]\n')
        updateUI();
        edit.focus();
    }

    function viewDump() {
        const blob = new Blob([dump], { type: 'text/plain' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl);
    }

    const CAUSES = new Map([
        [ 0x00, "Instruction address misaligned" ],
        [ 0x01, "Instruction access fault" ],
        [ 0x02, "Illegal instruction" ],
        [ 0x03, "Breakpoint" ],
        [ 0x05, "Load access fault" ],
        [ 0x07, "Store/AMO access fault" ],
        [ 0x08, "Environment call from User mode" ],
        [ 0x0b, "Environment call from Machine mode" ]
    ]);

    const fmtException = (res) =>
        `[ Exception: ${CAUSES.get(res.cause) || "???"} (${res.cause}) | tval = ${fmt(res.tval)}, epc = ${fmt(res.epc)} ]\n`;

    function step() {
        oldState = riscv.dump_state();
        const res = riscv.step();
        renderRegs();
        if (res.type === 'stop') {
            stop();
        } else if (res.type === 'exception') {
            if (printOnException) {
                writeOutput(fmtException(res));
            }
        }
    }

    function run() {
        const LIMIT = 100;

        running = true;

        oldState = riscv.dump_state();

        for (let count = 0; count < LIMIT; count ++) {
            const res = riscv.step();
            if (res.type === 'exception') {
                if (printOnException) {
                    writeOutput(fmtException(res));
                }
                if (pauseOnException) {
                    renderRegs();
                    pause();
                }
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

    edit.onkeydown = (event) => {
        if (event.key === 'Tab' && ! event.ctrlKey && ! event.altKey && ! event.metaKey && ! event.shiftKey) {
            const text = edit.value;

            const prev = text.lastIndexOf('\n', Math.max(0, edit.selectionStart - 1)) + 1;

            if (edit.selectionStart === edit.selectionEnd) {
                const caret = edit.selectionStart;
                const add = 4 - (caret - prev) % 4;
                const data = Array(add).fill(' ').join('');
                document.execCommand('insertText', false, data);
            }
            event.preventDefault();
        } else if (event.key === 'Enter' && event.shiftKey && ! event.ctrlKey && ! event.altKey && ! event.metaKey) {
            event.preventDefault();

            start();
            if (started) {
                stepBtn.focus();
            }
        } else if (event.key === 'Enter' && event.ctrlKey && ! event.altKey && ! event.metaKey && ! event.shiftKey) {
            event.preventDefault();
            output.textContent = '';
            start();
            if (started) {
                run();
            }
        }
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

    dumpBtn.onclick = viewDump;

    clearBtn.onclick = () => {
        output.textContent = '';
    }

}

const emulators = document.querySelectorAll('.emulator-disabled');

for (const e of emulators) {
    convertEmulator(e);
}
