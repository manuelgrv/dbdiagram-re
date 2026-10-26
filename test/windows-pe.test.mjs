import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWindowsPE } from '../scripts/windows-pe.mjs';
function executable() {
  const data = Buffer.alloc(1024);
  data.write('MZ'); data.writeUInt32LE(128, 60); data.write('PE\0\0', 128);
  data.writeUInt16LE(0x8664, 132); data.writeUInt16LE(1, 134); data.writeUInt16LE(240, 148);
  const optional = 152;
  data.writeUInt16LE(0x20b, optional); data.writeUInt16LE(2, optional + 68); data.writeUInt32LE(0x1000, optional + 120);
  const section = optional + 240;
  data.writeUInt32LE(512, section + 8); data.writeUInt32LE(0x1000, section + 12);
  data.writeUInt32LE(512, section + 16); data.writeUInt32LE(512, section + 20);
  data.writeUInt32LE(0x1040, 512 + 12); data.write('KERNEL32.dll\0', 576);
  return data;
}
test('Windows inspection reads 64-bit architecture, GUI subsystem, and import names', () => {
  assert.deepEqual(inspectWindowsPE(executable()), { arch: 'x64', subsystem: 2, imports: ['KERNEL32.dll'] });
  const arm = executable(); arm.writeUInt16LE(0xaa64, 132);
  assert.equal(inspectWindowsPE(arm).arch, 'arm64');
});
test('Windows inspection rejects corrupt headers and import addresses', () => {
  for (const length of [0, 63, 151, 300, 450, 520]) assert.throws(() => inspectWindowsPE(executable().subarray(0, length)), /Truncated|Invalid/);
  const bad = executable(); bad.writeUInt32LE(0xfffff, 152 + 120);
  assert.throws(() => inspectWindowsPE(bad), /Invalid PE import address/);
  bad.write('NOTPE', 0); assert.throws(() => inspectWindowsPE(bad), /Not a Windows executable/);
});
