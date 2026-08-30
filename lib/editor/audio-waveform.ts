export function mergePcmChunkIntoWaveform(
  current: number[],
  samples: Float32Array,
  chunkStart: number,
  chunkEnd: number,
  sourceDuration: number,
  bars = 720,
) {
  const count = Math.max(96, Math.min(2400, Math.round(bars)));
  const output = Array<number>(count).fill(0);
  if (current.length) {
    for (let index = 0; index < count; index += 1) {
      output[index] =
        current[Math.min(current.length - 1, Math.floor((index / count) * current.length))] || 0;
    }
  }
  if (!samples.length || !Number.isFinite(sourceDuration) || sourceDuration <= 0)
    return output;

  const safeStart = Math.max(0, Math.min(sourceDuration, chunkStart));
  const safeEnd = Math.max(safeStart, Math.min(sourceDuration, chunkEnd));
  const fromBar = Math.max(0, Math.floor((safeStart / sourceDuration) * count));
  const toBar = Math.min(
    count,
    Math.max(fromBar + 1, Math.ceil((safeEnd / sourceDuration) * count)),
  );
  const chunkBars = Math.max(1, toBar - fromBar);

  for (let bar = 0; bar < chunkBars; bar += 1) {
    const fromSample = Math.floor((bar / chunkBars) * samples.length);
    const toSample = Math.max(
      fromSample + 1,
      Math.floor(((bar + 1) / chunkBars) * samples.length),
    );
    const stride = Math.max(1, Math.floor((toSample - fromSample) / 64));
    let peak = 0;
    for (let point = fromSample; point < toSample; point += stride)
      peak = Math.max(peak, Math.abs(samples[point] || 0));
    output[fromBar + bar] = Math.max(
      output[fromBar + bar],
      Math.max(0.035, Math.min(1, Math.sqrt(peak))),
    );
  }
  return output;
}
