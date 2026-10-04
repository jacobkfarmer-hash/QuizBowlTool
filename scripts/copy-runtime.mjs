import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}node_modules/onnxruntime-web/dist/`;
const target = `${root}public/runtime/`;
await mkdir(target, { recursive: true });
for (const name of await readdir(source)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) await copyFile(source + name, target + name);
}
console.log('Local ONNX runtime assets copied. Speech needs no runtime CDN.');
