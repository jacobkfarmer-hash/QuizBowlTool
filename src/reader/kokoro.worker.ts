import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import { env } from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) { env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/runtime/`; env.backends.onnx.wasm.numThreads = 1; }
let model: KokoroTTS | undefined;
let initialization: Promise<void> | undefined;
let backend = 'wasm';
let fallbackReason = '', backendError = '';
const initialize = (device?: 'wasm') => initialization ??= (async () => {
  const progress_callback = (p: { status: string; progress?: number; file?: string }) => self.postMessage({ status: p.status === 'progress' ? `Downloading voice model… ${Math.round(p.progress ?? 0)}%` : 'Preparing high-quality reader…' });
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const adapter = device !== 'wasm' && gpu ? await gpu.requestAdapter().catch(() => null) : null;
  if (adapter) { try { model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { device: 'webgpu', dtype: 'fp32', progress_callback }); backend = 'webgpu'; } catch (error) { backendError = error instanceof Error ? error.message : String(error); fallbackReason = 'WebGPU initialization failed; using WASM q8.'; self.postMessage({ status: 'Trying local WASM reader…' }); } }
  else fallbackReason = device === 'wasm' ? 'WASM explicitly requested.' : 'WebGPU adapter unavailable; using WASM q8.';
  if (!model) model = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { device: 'wasm', dtype: 'q8', progress_callback });
})();
let jobs = Promise.resolve();
self.onmessage = (e: MessageEvent<{ id: number; type: 'init' | 'generate'; text?: string; voice?: string; speed?: number; device?: 'wasm' }>) => {
  const request = e.data;
  jobs = jobs.then(async () => { try {
    await initialize(request.device);
    if (request.type === 'init') self.postMessage({ id: request.id, ready: true, backend, dtype: backend === 'webgpu' ? 'fp32' : 'q8', fallbackReason, backendError, voices: Object.entries(model!.voices).map(([id, info]) => ({ id, name: info.name })) });
    else {
      const chunks: Float32Array[] = []; const phonemes: string[] = []; const texts: string[] = [];
      // The public queued-sentences getter avoids re-splitting prepared context.
      // Close explicitly: kokoro-js 1.2.1's string stream can otherwise wait forever.
      const stream = new TextSplitterStream(); stream.sentences.push(request.text!); stream.close();
      for await (const result of model!.stream(stream, { voice: request.voice as 'af_heart', speed: request.speed ?? 1 })) {
        if (model!.tokenizer(result.phonemes, { truncation: false }).input_ids.dims.at(-1)! > 512) throw new Error('This clause exceeds the neural reader context. Trying System Voice.');
        chunks.push(result.audio.audio); phonemes.push(result.phonemes); texts.push(result.text);
      }
      const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0)); let offset = 0; for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
      self.postMessage({ id: request.id, samples, sampleRate: 24000, phonemes, texts, backend }, { transfer: [samples.buffer as ArrayBuffer] });
    }
  } catch (err) { self.postMessage({ id: request.id, error: err instanceof Error ? err.message : String(err) }); } });
};
