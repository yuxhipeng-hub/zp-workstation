const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
function execute(binary, args, { cwd = undefined, signal = undefined, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      windowsHide: true,
      shell: false,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '',
      stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('媒体处理超时，已有文件已保留。'))
    }, timeout)
    child.stdout.on('data', (b) => {
      stdout = (stdout + b).slice(-1000000)
    })
    child.stderr.on('data', (b) => {
      stderr = (stderr + b).slice(-24000)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(
        new Error(
          e.name === 'AbortError'
            ? '媒体处理已中断。'
            : `无法启动 ${binary}，请安装工具并重启 Workbench。`,
        ),
      )
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${binary} 执行失败（${code}）：${stderr.slice(-1000)}`))
    })
  })
}
class VideoPost {
  async probe(file, kind = 'video') {
    const r = await execute('ffprobe', [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      file,
    ])
    const data = JSON.parse(r.stdout)
    if (!data.streams?.some((s) => s.codec_type === kind)) throw new Error('文件没有所需媒体轨道。')
    return data
  }
  async check() {
    const r = await execute('ffmpeg', ['-version'])
    await execute('ffprobe', ['-version'])
    return r.stdout.split('\n')[0]
  }
  async render(edit, inputs, dir, signal, audioFile = '') {
    if (
      !Number.isInteger(edit.width) ||
      !Number.isInteger(edit.height) ||
      edit.width < 256 ||
      edit.height < 256 ||
      edit.width > 1920 ||
      edit.height > 1920 ||
      edit.width % 2 ||
      edit.height % 2 ||
      ![24, 25, 30].includes(edit.fps) ||
      !inputs.length ||
      inputs.length > 60
    )
      throw new Error('导出须为偶数尺寸 256–1920、24/25/30 fps，1–60 个片段。')
    const parts = [],
      sources = []
    for (let i = 0; i < inputs.length; i++) {
      const clip = edit.clips[i],
        meta = await this.probe(inputs[i]),
        duration = Number(meta.format.duration)
      const len = clip.out - clip.in
      if (!(
        len > 0 &&
        len <= 120 &&
        clip.in >= 0 &&
        clip.out <= duration + 0.05 &&
        clip.volume <= 3 &&
        clip.fade <= len / 2
      ))
        throw new Error(`片段 ${i + 1} 入出点、音量或淡入淡出无效。`)
      const video = meta.streams.find((s) => s.codec_type === 'video')
      sources.push({
        artifactId: clip.artifactId,
        width: video.width,
        height: video.height,
        colorSpace: video.color_space || 'unknown',
        upscaled: video.width < edit.width || video.height < edit.height,
      })
      let vf = `scale=${edit.width}:${edit.height}:force_original_aspect_ratio=decrease,pad=${edit.width}:${edit.height}:(ow-iw)/2:(oh-ih)/2,fps=${edit.fps},setsar=1,eq=brightness=${clip.brightness}:saturation=${clip.saturation}`
      if (clip.fade)
        vf += `,fade=t=in:st=0:d=${clip.fade},fade=t=out:st=${len - clip.fade}:d=${clip.fade}`
      if (clip.subtitle) {
        const time = (s) => {
          const ms = Math.round(s * 1000)
          return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
        }
        const name = `subtitle-${i}.srt`
        await fs.writeFile(
          path.join(dir, name),
          `1\n00:00:00,000 --> ${time(len)}\n${clip.subtitle.replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '')}\n`,
        )
        vf += `,subtitles=${name}`
      }
      const part = `part-${i}.mp4`,
        hasAudio = meta.streams.some((s) => s.codec_type === 'audio')
      const args = ['-nostdin', '-y', '-ss', String(clip.in), '-t', String(len), '-i', inputs[i]]
      if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo')
      args.push(
        '-map',
        '0:v:0',
        '-map',
        hasAudio ? '0:a:0' : '1:a:0',
        '-vf',
        vf,
        '-af',
        `volume=${clip.volume},afade=t=in:d=${clip.fade},afade=t=out:st=${len - clip.fade}:d=${clip.fade}`,
        '-t',
        String(len),
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-ar',
        '48000',
        '-ac',
        '2',
        part,
      )
      await execute('ffmpeg', args, { cwd: dir, signal })
      parts.push(part)
    }
    await fs.writeFile(path.join(dir, 'concat.txt'), parts.map((p) => `file '${p}'`).join('\n'))
    const temporary = path.join(dir, 'output.pending.mp4')
    await execute(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-f',
        'concat',
        '-safe',
        '1',
        '-i',
        'concat.txt',
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        temporary,
      ],
      { cwd: dir, signal },
    )
    let candidate = temporary
    if (audioFile) {
      const audio = await this.probe(audioFile, 'audio'),
        total = edit.clips.reduce((n, c) => n + c.out - c.in, 0)
      if (
        edit.audioIn >= Number(audio.format.duration) ||
        edit.audioVolume > 3 ||
        edit.audioFade > total / 2
      )
        throw new Error('音轨入点、音量或淡入淡出无效。')
      candidate = path.join(dir, 'audio.pending.mp4')
      const graph = `[1:a]volume=${edit.audioVolume},apad,afade=t=in:d=${edit.audioFade},afade=t=out:st=${total - edit.audioFade}:d=${edit.audioFade}[music];${edit.audioMode === 'replace' ? '[music]anull[out]' : '[0:a][music]amix=inputs=2:duration=first:normalize=0[out]'}`
      await execute(
        'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-i',
          temporary,
          '-ss',
          String(edit.audioIn),
          '-i',
          audioFile,
          '-filter_complex',
          graph,
          '-map',
          '0:v:0',
          '-map',
          '[out]',
          '-t',
          String(total),
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-movflags',
          '+faststart',
          candidate,
        ],
        { cwd: dir, signal },
      )
    }
    const report = await this.review(candidate, edit, dir, signal)
    const final = path.join(dir, 'film.mp4')
    await fs.rename(candidate, final)
    await fs.writeFile(
      path.join(dir, 'delivery.json'),
      JSON.stringify({ schemaVersion: 1, edit, report: { ...report, sources } }, null, 2),
      { flag: 'wx' },
    )
    return { file: final, report: { ...report, sources } }
  }
  async review(file, edit, dir, signal) {
    const meta = await this.probe(file)
    const decode = await execute(
      'ffmpeg',
      ['-nostdin', '-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'],
      { signal },
    )
    const detect = await execute(
      'ffmpeg',
      ['-nostdin', '-i', file, '-vf', 'blackdetect=d=0.1:pix_th=0.10', '-an', '-f', 'null', '-'],
      { signal },
    )
    const frames = []
    let t = 0
    for (const clip of edit.clips) {
      const len = clip.out - clip.in
      for (const offset of [0.04, len / 2, Math.max(0.04, len - 0.04)]) {
        const time = t + offset,
          name = `frame-${frames.length}.jpg`
        await execute(
          'ffmpeg',
          [
            '-nostdin',
            '-y',
            '-ss',
            String(time),
            '-i',
            file,
            '-frames:v',
            '1',
            path.join(dir, name),
          ],
          { signal },
        )
        frames.push({ shotId: clip.shotId, time, frame: Math.round(time * edit.fps), file: name })
      }
      t += len
    }
    const sheets = []
    for (let page = 0; page < Math.ceil(frames.length / 12); page++) {
      const name = `contact-${page}.jpg`,
        count = Math.min(12, frames.length - page * 12)
      await execute(
        'ffmpeg',
        [
          '-nostdin',
          '-y',
          '-start_number',
          String(page * 12),
          '-i',
          path.join(dir, 'frame-%d.jpg'),
          '-vf',
          `scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,tile=3x4:nb_frames=${count}`,
          '-frames:v',
          '1',
          path.join(dir, name),
        ],
        { signal },
      )
      sheets.push({
        file: name,
        artifactId: '',
        frames: frames.slice(page * 12, page * 12 + count),
      })
    }
    const stream = meta.streams.find((s) => s.codec_type === 'video'),
      duration = Number(meta.format.duration)
    if (
      Math.abs(duration - t) > 0.3 ||
      stream.width !== edit.width ||
      stream.height !== edit.height ||
      Math.abs(evalRate(stream.avg_frame_rate) - edit.fps) > 0.1 ||
      !meta.streams.some((s) => s.codec_type === 'audio')
    )
      throw new Error('导出时长、画幅、帧率或音轨校验失败，临时文件保留。')
    return {
      decoded: !decode.stderr,
      duration,
      width: stream.width,
      height: stream.height,
      fps: evalRate(stream.avg_frame_rate),
      audio: true,
      frames,
      sheets,
      blackFrames: detect.stderr.match(/black_start:[^\r\n]+/g) || [],
      unchecked: [
        '画面叙事与一致性需逐帧人工检查',
        '声音、音乐版权、字幕语义与审美需人工观看和试听',
        '黑色设计画面可能触发黑帧提示；未自动判断突跳与物体畸变',
      ],
    }
  }
}
function evalRate(v) {
  const [a, b] = String(v).split('/').map(Number)
  return b ? a / b : a
}
module.exports = { VideoPost, execute }
