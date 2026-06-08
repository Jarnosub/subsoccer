// highlight-creator.js — Subsoccer Highlight Creator
// ─────────────────────────────────────────────────────
// Pipeline:  Video <video> → Canvas (+ overlay) → VideoEncoder → mp4-muxer → MP4 blob
// No server needed. 100% client-side.

import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs';

// ── DOM refs ──
const videoInput    = document.getElementById('video-input');
const dropzone      = document.getElementById('dropzone');
const previewWrap   = document.getElementById('preview-wrapper');
const sourceVideo   = document.getElementById('source-video');
const previewCanvas = document.getElementById('preview-canvas');
const playPauseBtn  = document.getElementById('play-pause-btn');
const videoTimeEl   = document.getElementById('video-time');
const changeVideoBtn= document.getElementById('change-video-btn');
const exportBtn     = document.getElementById('export-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar   = document.getElementById('progress-bar');
const progressText  = document.getElementById('progress-text');
const downloadSection = document.getElementById('download-section');
const downloadLink  = document.getElementById('download-link');
const matchForm     = document.getElementById('match-form');

const ctx = previewCanvas.getContext('2d');

// ── State ──
let videoFile = null;
let matchInfo = null;
let previewRAF = null;
let logoImg = null;
const CLIP_DURATION = 7; // seconds — the magic number
let clipStart = 0; // start time of 7s clip

// Trim DOM refs
const trimSlider  = document.getElementById('trim-slider');
const trimWindow   = document.getElementById('trim-window');
const trimStartEl  = document.getElementById('trim-start');
const trimEndEl    = document.getElementById('trim-end');
const shareBtn     = document.getElementById('share-btn');
let lastExportBlob = null;

// Preload logo
(function loadLogo() {
    logoImg = new Image();
    logoImg.src = 'subsoccer_logo.svg';
})();

// ───────────────────────────────────────────
// Drag & drop
// ───────────────────────────────────────────
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) loadVideo(file);
});

videoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadVideo(file);
});

changeVideoBtn.addEventListener('click', () => {
    videoInput.value = '';
    videoInput.click();
});

// ───────────────────────────────────────────
// Video loading
// ───────────────────────────────────────────
function loadVideo(file) {
    videoFile = file;
    const url = URL.createObjectURL(file);
    sourceVideo.src = url;

    sourceVideo.onloadedmetadata = () => {
        const dur = sourceVideo.duration;
        // Set canvas dimensions
        previewCanvas.width  = sourceVideo.videoWidth;
        previewCanvas.height = sourceVideo.videoHeight;
        // Show preview, hide dropzone
        dropzone.style.display = 'none';
        previewWrap.style.display = 'block';
        // Setup trim slider (hide if video is already ≤7s)
        clipStart = 0;
        const trimSection = document.querySelector('.trim-section');
        if (dur <= CLIP_DURATION) {
            trimSection.style.display = 'none';
        } else {
            trimSection.style.display = 'block';
            trimSlider.min = 0;
            trimSlider.max = Math.max(0, dur - CLIP_DURATION);
            trimSlider.value = 0;
            trimSlider.step = 0.1;
        }
        updateTrimUI();
        // Start playback from clip start
        sourceVideo.currentTime = clipStart;
        sourceVideo.play();
        startPreviewLoop();
        updateExportState();
    };
}

// ───────────────────────────────────────────
// Preview loop (live canvas with overlay)
// ───────────────────────────────────────────
function startPreviewLoop() {
    if (previewRAF) cancelAnimationFrame(previewRAF);
    function loop() {
        if (sourceVideo.readyState >= 2) {
            // Loop within clip bounds
            const actualClipDur = Math.min(CLIP_DURATION, sourceVideo.duration - clipStart);
            const clipEnd = clipStart + actualClipDur;
            if (!sourceVideo.paused && sourceVideo.currentTime >= clipEnd) {
                sourceVideo.currentTime = clipStart;
            }
            ctx.drawImage(sourceVideo, 0, 0, previewCanvas.width, previewCanvas.height);
            readMatchInfo();
            drawOverlay(ctx, previewCanvas.width, previewCanvas.height);
        }
        updateTimeDisplay();
        previewRAF = requestAnimationFrame(loop);
    }
    loop();
}

// Play/pause toggle
playPauseBtn.addEventListener('click', () => {
    if (sourceVideo.paused) {
        sourceVideo.currentTime = clipStart;
        sourceVideo.play();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        sourceVideo.pause();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
});

sourceVideo.addEventListener('play',  () => playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>');
sourceVideo.addEventListener('pause', () => playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>');
sourceVideo.addEventListener('ended', () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    // Redraw last frame with overlay
    ctx.drawImage(sourceVideo, 0, 0, previewCanvas.width, previewCanvas.height);
    readMatchInfo();
    drawOverlay(ctx, previewCanvas.width, previewCanvas.height);
});

// ── Trim slider ──
trimSlider.addEventListener('input', () => {
    clipStart = parseFloat(trimSlider.value);
    updateTrimUI();
    sourceVideo.pause();
    sourceVideo.currentTime = clipStart;
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
});

function updateTrimUI() {
    const dur = sourceVideo.duration || CLIP_DURATION;
    const pct = (clipStart / dur) * 100;
    const widthPct = (CLIP_DURATION / dur) * 100;
    trimWindow.style.left = pct + '%';
    trimWindow.style.width = widthPct + '%';
    trimStartEl.textContent = formatTime(clipStart);
    trimEndEl.textContent = formatTime(clipStart + CLIP_DURATION);
}

function updateTimeDisplay() {
    const actualClipDur = Math.min(CLIP_DURATION, sourceVideo.duration - clipStart);
    const relTime = Math.max(0, sourceVideo.currentTime - clipStart);
    const cur = formatTime(Math.min(relTime, actualClipDur));
    videoTimeEl.textContent = `${cur} / ${formatTime(actualClipDur)}`;
}

function formatTime(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ───────────────────────────────────────────
// Overlay drawing
// ───────────────────────────────────────────
function drawOverlay(c, w, h) {
    if (!matchInfo) return;

    const { player1, player2, score } = matchInfo;

    // Scale based on video height — works for any resolution (720p to 4K)
    const s = h / 100; // 1% of video height as base unit
    const pad = Math.round(2.5 * s); // horizontal padding

    // ── Top bar (branding) ──
    const topH = Math.round(5 * s);  // 5% of height
    // Gradient background
    const topGrad = c.createLinearGradient(0, 0, 0, topH + Math.round(2 * s));
    topGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = topGrad;
    c.fillRect(0, 0, w, topH + Math.round(2 * s));

    // Red accent line under top bar
    c.fillStyle = '#c41e2a';
    c.fillRect(0, topH, w, Math.max(2, Math.round(0.25 * s)));

    // Logo
    if (logoImg && logoImg.complete && logoImg.naturalHeight > 0) {
        const logoH = Math.round(2.5 * s);
        const logoW = logoH * (logoImg.naturalWidth / logoImg.naturalHeight);
        c.drawImage(logoImg, pad, Math.round((topH - logoH) / 2), logoW, logoH);
    }

    // "SUBSOCCER GO" text
    const fontSize_brand = Math.round(2 * s);
    c.font = `800 ${fontSize_brand}px Inter, sans-serif`;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const textX = pad + (logoImg && logoImg.complete && logoImg.naturalHeight > 0
        ? Math.round(2.5 * s) * (logoImg.naturalWidth / logoImg.naturalHeight) + Math.round(1 * s)
        : 0);
    c.fillStyle = '#ffffff';
    c.fillText('SUBSOCCER', textX, topH / 2);
    const subsW = c.measureText('SUBSOCCER').width;
    c.fillStyle = '#c41e2a';
    c.fillText(' GO', textX + subsW, topH / 2);

    // ── Bottom scoreboard ──
    const botH = Math.round(8 * s);
    const botY = h - botH;

    // Gradient background (fading from bottom)
    const botGrad = c.createLinearGradient(0, botY - Math.round(3 * s), 0, h);
    botGrad.addColorStop(0, 'rgba(0,0,0,0)');
    botGrad.addColorStop(0.25, 'rgba(0,0,0,0.8)');
    botGrad.addColorStop(1, 'rgba(0,0,0,0.9)');
    c.fillStyle = botGrad;
    c.fillRect(0, botY - Math.round(3 * s), w, botH + Math.round(3 * s));

    // Red accent line on top of scoreboard
    c.fillStyle = '#c41e2a';
    c.fillRect(0, botY, w, Math.max(3, Math.round(0.3 * s)));

    const contentY = botY + Math.round(1.8 * s);

    // ── Player names + score (main row) ──
    const nameSize = Math.round(3 * s);     // ~3% of height
    const scoreSize = Math.round(4 * s);    // ~4% of height — big and bold

    c.textBaseline = 'top';

    // Player 1 (left-aligned)
    c.textAlign = 'left';
    c.fillStyle = '#ffffff';
    c.font = `700 ${nameSize}px Inter, sans-serif`;
    c.fillText(player1.toUpperCase(), pad, contentY);

    // Score (center, larger)
    c.textAlign = 'center';
    c.fillStyle = '#c41e2a';
    c.font = `900 ${scoreSize}px Inter, sans-serif`;
    c.fillText(score, w / 2, contentY - Math.round(0.5 * s));

    // Player 2 (right-aligned)
    c.textAlign = 'right';
    c.fillStyle = '#ffffff';
    c.font = `700 ${nameSize}px Inter, sans-serif`;
    c.fillText(player2.toUpperCase(), w - pad, contentY);

    // Reset
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
}

// ───────────────────────────────────────────
// Match info from form
// ───────────────────────────────────────────
matchForm.addEventListener('input', updateExportState);
matchForm.addEventListener('change', updateExportState);

function readMatchInfo() {
    const fd = new FormData(matchForm);
    const p1 = fd.get('player1')?.trim();
    const p2 = fd.get('player2')?.trim();
    const s1 = fd.get('score1') || '0';
    const s2 = fd.get('score2') || '0';
    if (p1 && p2) {
        matchInfo = { player1: p1, player2: p2, score: `${s1}-${s2}` };
    } else {
        matchInfo = null;
    }
}

function updateExportState() {
    readMatchInfo();
    exportBtn.disabled = !(matchInfo && videoFile);
}

// ───────────────────────────────────────────
// Export pipeline — try WebCodecs first, fall back to MediaRecorder
// ───────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
    readMatchInfo();
    if (!matchInfo || !videoFile) return;

    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing…';
    progressContainer.style.display = 'block';
    downloadSection.style.display = 'none';
    setProgress(0);

    try {
        if ('VideoEncoder' in window && typeof OffscreenCanvas !== 'undefined') {
            try {
                await exportWithWebCodecs();
            } catch (wcErr) {
                console.warn('WebCodecs failed, trying MediaRecorder:', wcErr);
                await exportWithMediaRecorder();
            }
        } else {
            await exportWithMediaRecorder();
        }
        downloadSection.style.display = 'block';
        downloadSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error('Export failed:', err);
        alert('Export failed: ' + err.message);
    } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="fa-solid fa-film"></i> Export MP4';
        progressContainer.style.display = 'none';
    }
});

function setProgress(pct) {
    progressBar.style.width = pct + '%';
    progressText.textContent = Math.round(pct) + '%';
}

// ───────────────────────────────────────────
// WebCodecs export (frame-by-frame seek)
// ───────────────────────────────────────────
async function exportWithWebCodecs() {
    const video = sourceVideo;
    video.pause();

    const width  = video.videoWidth;
    const height = video.videoHeight;
    const fps = 30;
    const actualClipDur = Math.min(CLIP_DURATION, video.duration - clipStart);
    const totalFrames = Math.floor(actualClipDur * fps);

    // Check encoder support
    const codecString = 'avc1.42001f';
    const encConfig = {
        codec: codecString,
        width,
        height,
        bitrate: 2_500_000,
        framerate: fps,
    };
    const support = await VideoEncoder.isConfigSupported(encConfig);
    if (!support.supported) {
        // Try baseline profile
        encConfig.codec = 'avc1.420028';
        const s2 = await VideoEncoder.isConfigSupported(encConfig);
        if (!s2.supported) throw new Error('H.264 encoding not supported on this device');
        encConfig.codec = s2.config.codec;
    } else {
        encConfig.codec = support.config.codec;
    }

    // Setup muxer
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
        target,
        video: {
            codec: 'avc',
            width,
            height,
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
    });

    // Setup encoder
    let encodeError = null;
    const encoder = new VideoEncoder({
        output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
        },
        error: (e) => { encodeError = e; },
    });
    encoder.configure(encConfig);

    // OffscreenCanvas for overlay compositing
    const offCanvas = new OffscreenCanvas(width, height);
    const offCtx = offCanvas.getContext('2d');

    // Process each frame
    for (let i = 0; i < totalFrames; i++) {
        if (encodeError) throw encodeError;

        const time = clipStart + (i / fps); // offset by clip start
        await seekTo(video, time);

        // Draw video frame + overlay graphics
        offCtx.clearRect(0, 0, width, height);
        offCtx.drawImage(video, 0, 0, width, height);
        drawOverlay(offCtx, width, height);

        // Create VideoFrame from canvas
        const frame = new VideoFrame(offCanvas, {
            timestamp: Math.round((i / fps) * 1_000_000), // relative timestamp from 0
        });

        const keyFrame = (i % (fps * 2) === 0); // keyframe every 2s
        encoder.encode(frame, { keyFrame });
        frame.close();

        // Update progress
        setProgress((i / totalFrames) * 100);

        // Yield to UI thread periodically
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    // Flush & finalize
    await encoder.flush();
    encoder.close();
    muxer.finalize();

    setProgress(100);

    // Create download blob
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    lastExportBlob = blob;
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = 'subsoccer-highlight.mp4';
}

function seekTo(video, time) {
    return new Promise((resolve) => {
        if (Math.abs(video.currentTime - time) < 0.01) { resolve(); return; }
        const handler = () => {
            video.removeEventListener('seeked', handler);
            resolve();
        };
        video.addEventListener('seeked', handler);
        video.currentTime = time;
    });
}

// ───────────────────────────────────────────
// Fallback: Canvas + MediaRecorder
// ───────────────────────────────────────────
async function exportWithMediaRecorder() {
    const video = sourceVideo;
    video.currentTime = clipStart;
    video.muted = true;

    const w = video.videoWidth;
    const h = video.videoHeight;

    const recCanvas = document.createElement('canvas');
    recCanvas.width = w;
    recCanvas.height = h;
    const recCtx = recCanvas.getContext('2d');

    let mimeType = 'video/webm;codecs=vp9';
    if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
    } else if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
    }

    const stream = recCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    const recDone = new Promise((resolve) => { recorder.onstop = resolve; });

    recorder.start(100);
    await video.play();

    const clipEnd = clipStart + CLIP_DURATION;
    function drawLoop() {
        if (video.paused) return;
        if (video.currentTime >= clipEnd) {
            video.pause();
            recorder.stop();
            return;
        }
        recCtx.drawImage(video, 0, 0, w, h);
        drawOverlay(recCtx, w, h);
        setProgress(((video.currentTime - clipStart) / CLIP_DURATION) * 100);
        requestAnimationFrame(drawLoop);
    }
    drawLoop();

    await recDone;
    setProgress(100);

    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mimeType });
    lastExportBlob = blob;
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = `subsoccer-highlight.${ext}`;
}

// ───────────────────────────────────────────
// Web Share API (native share on mobile)
// ───────────────────────────────────────────
shareBtn.addEventListener('click', async () => {
    if (!lastExportBlob) return;
    const file = new File([lastExportBlob], 'subsoccer-highlight.mp4', { type: 'video/mp4' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({
                files: [file],
                title: 'Subsoccer Highlight',
                text: '🏆 Check out my Subsoccer highlight!',
            });
        } catch (e) {
            if (e.name !== 'AbortError') console.error('Share failed:', e);
        }
    } else {
        // Fallback: just trigger download
        downloadLink.click();
    }
});
