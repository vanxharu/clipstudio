// Giọng đọc có sẵn trong Windows (miễn phí, chạy offline, không cần key).
// Dùng Windows.Media.SpeechSynthesis (các giọng tải trong Cài đặt > Thời gian & ngôn ngữ > Giọng nói),
// nếu không được thì dùng System.Speech (SAPI). Xuất WAV rồi FFmpeg chuyển sang MP3.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PS1 = String.raw`
param([string]$TextFile, [string]$Out, [string]$Lang, [string]$Gender, [double]$Rate, [double]$Pitch = 0)
$ErrorActionPreference = 'Stop'
$text = [IO.File]::ReadAllText($TextFile, [Text.Encoding]::UTF8)
function Pick($voices, $getLang, $getGender) {
  $m = @($voices | Where-Object { (& $getLang $_) -eq $Lang })
  if ($m.Count -eq 0) { $p = $Lang.Split('-')[0]; $m = @($voices | Where-Object { (& $getLang $_).Split('-')[0] -eq $p }) }
  if ($m.Count -eq 0) { return $null }
  $g = @($m | Where-Object { (& $getGender $_) -eq $Gender })
  if ($g.Count -gt 0) { return $g[0] } else { return $m[0] }
}
$done = $false
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
  function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
  [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
  [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
  $v = Pick ([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) { param($x) $x.Language } { param($x) [string]$x.Gender }
  if ($v -ne $null) {
    $syn = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $syn.Voice = $v
    try { $syn.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(3.0, 1.0 + $Rate / 100.0)) } catch {}
    try { if ($Pitch -ne 0) { $syn.Options.AudioPitch = [Math]::Max(0.5, [Math]::Min(1.6, 1.0 + $Pitch / 100.0)) } } catch {}
    $stream = Await ($syn.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($Out, $bytes)
    Write-Output ('VOICE:' + $v.DisplayName)
    $done = $true
  }
} catch { Write-Output ('WINRT_ERR:' + $_.Exception.Message) }
if (-not $done) {
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $iv = @($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo })
  $v = Pick $iv { param($x) $x.Culture.Name } { param($x) [string]$x.Gender }
  if ($v -eq $null) { Write-Output 'NOVOICE'; exit 3 }
  $s.SelectVoice($v.Name)
  $s.Rate = [int][Math]::Max(-10, [Math]::Min(10, $Rate / 10.0))
  $s.SetOutputToWaveFile($Out)
  $s.Speak($text)
  $s.Dispose()
  Write-Output ('VOICE:' + $v.Name)
}
`;

let scriptPath = null;
function script() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  scriptPath = path.join(os.tmpdir(), 'h2v-wintts.ps1');
  fs.writeFileSync(scriptPath, '﻿' + PS1, 'utf8');
  return scriptPath;
}
const available = () => process.platform === 'win32';
// Đoán giới tính từ tên giọng Edge/Azure (HoaiMy = nữ, NamMinh = nam…)
const FEMALE = /HoaiMy|Female|Jenny|Aria|Emma|Ava|Sonia|Libby|Nanami|SunHi|Xiaoxiao|HsiaoChen|Denise|Katja|Elvira|Dalia|Francisca|Elsa|Svetlana|Premwadee|Gadis|Swara|Zariyah|Emel|Colette|Natasha|Kore|Aoede|Zephyr|Leda/i;

/** Tạo file âm thanh. out: đường dẫn .mp3 (cần ffmpeg) hoặc .wav */
function tts({ text, voice = 'vi-VN-HoaiMyNeural', rate = 0, pitch = 0, out, ffmpeg }) {
  if (!available()) return Promise.reject(new Error('Giọng Windows chỉ có trên Windows'));
  const lang = (String(voice).match(/^[a-z]{2,3}-[A-Z]{2}/) || ['vi-VN'])[0];
  const gender = FEMALE.test(voice) ? 'Female' : 'Male';
  const stamp = process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const txt = path.join(os.tmpdir(), 'h2v-wtts-' + stamp + '.txt');
  const wav = /\.wav$/i.test(out) ? out : path.join(os.tmpdir(), 'h2v-wtts-' + stamp + '.wav');
  fs.writeFileSync(txt, text, 'utf8');
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script(), '-TextFile', txt, '-Out', wav, '-Lang', lang, '-Gender', gender, '-Rate', String(+rate || 0), '-Pitch', String(+pitch || 0)], { windowsHide: true });
    let so = '', se = '';
    p.stdout.on('data', d => so += d); p.stderr.on('data', d => se += d);
    p.on('error', e => { fs.rmSync(txt, { force: true }); reject(e); });
    p.on('close', code => {
      fs.rmSync(txt, { force: true });
      if (/NOVOICE/.test(so) || code === 3) return reject(new Error(`Windows chưa có giọng đọc ${lang}. Vào Cài đặt > Thời gian & ngôn ngữ > Giọng nói > Thêm giọng nói, chọn ${lang === 'vi-VN' ? 'Tiếng Việt' : lang}, cài xong mở lại app. Hoặc dùng Gemini TTS (key miễn phí) trong "Cài đặt giọng đọc".`));
      if (code !== 0 || !fs.existsSync(wav)) return reject(new Error('Giọng Windows lỗi: ' + (se || so).slice(-300)));
      if (wav === out) return resolve(out);
      const f = spawn(ffmpeg || 'ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '24000', '-b:a', '64k', out], { windowsHide: true });
      let fe = ''; f.stderr.on('data', d => fe += d);
      f.on('error', e => { fs.rmSync(wav, { force: true }); reject(e); });
      f.on('close', c => { fs.rmSync(wav, { force: true }); c === 0 ? resolve(out) : reject(new Error('FFmpeg lỗi: ' + fe.slice(-300))); });
    });
  });
}
module.exports = { tts, available, _ps1: PS1 };
