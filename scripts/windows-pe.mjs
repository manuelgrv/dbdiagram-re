// Read the PE headers/import table without depending on dumpbin or a cross-toolchain.
export function inspectWindowsPE(data) {
  const requireBytes = (offset, size) => { if (!Number.isInteger(offset) || offset < 0 || offset + size > data.length) throw new Error('Truncated PE executable'); };
  requireBytes(0, 64);
  if (data.toString('ascii', 0, 2) !== 'MZ') throw new Error('Not a Windows executable');
  const pe = data.readUInt32LE(60);
  requireBytes(pe, 24);
  if (data.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw new Error('Invalid PE signature');
  const machine = data.readUInt16LE(pe + 4), count = data.readUInt16LE(pe + 6), optionalSize = data.readUInt16LE(pe + 20), optional = pe + 24;
  requireBytes(optional, optionalSize);
  if (optionalSize < 128 || data.readUInt16LE(optional) !== 0x20b) throw new Error('Expected a 64-bit PE executable');
  const subsystem = data.readUInt16LE(optional + 68), importsRVA = data.readUInt32LE(optional + 120), sections = [];
  for (let i = 0; i < count; i++) {
    const offset = optional + optionalSize + i * 40;
    requireBytes(offset, 40);
    sections.push({ virtualSize: data.readUInt32LE(offset + 8), rva: data.readUInt32LE(offset + 12), size: data.readUInt32LE(offset + 16), file: data.readUInt32LE(offset + 20) });
  }
  const fileOffset = rva => {
    const section = sections.find(s => rva >= s.rva && rva - s.rva < s.size);
    if (!section) throw new Error('Invalid PE import address');
    return section.file + rva - section.rva;
  };
  const imports = [];
  if (importsRVA) {
    let descriptor = fileOffset(importsRVA);
    for (let i = 0; i < 4096; i++, descriptor += 20) {
      requireBytes(descriptor, 20);
      if (data.subarray(descriptor, descriptor + 20).every(byte => byte === 0)) break;
      const start = fileOffset(data.readUInt32LE(descriptor + 12));
      const end = data.indexOf(0, start);
      if (end < start || end - start > 512) throw new Error('Invalid PE import name');
      imports.push(data.toString('ascii', start, end));
      if (i === 4095) throw new Error('Unterminated PE import table');
    }
  }
  return { arch: machine === 0x8664 ? 'x64' : machine === 0xaa64 ? 'arm64' : 'unknown', subsystem, imports };
}
