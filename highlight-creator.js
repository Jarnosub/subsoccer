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
const exportResultVideo = document.getElementById('export-result-video');
const matchForm     = document.getElementById('match-form');
const formatOriginalBtn = document.getElementById('format-original-btn');
const formatSquareBtn   = document.getElementById('format-square-btn');
const logoOffBtn        = document.getElementById('logo-off-btn');
const logoOnBtn         = document.getElementById('logo-on-btn');

const ctx = previewCanvas.getContext('2d');

// ── State ──
let videoFile = null;
let matchInfo = null;
let previewRAF = null;
let logoImg = null;
let cropMode = 'original'; // 'original' | 'square'
let showLogo = false;      // false = NO LOGO (Clean), true = SHOW LOGO
const CLIP_DURATION = 7; // seconds — the magic number
let clipStart = 0; // start time of 7s clip
let isExporting = false; // prevent preview loop from interfering

// Format selector handlers
if (formatOriginalBtn && formatSquareBtn) {
    formatOriginalBtn.addEventListener('click', () => setCropMode('original'));
    formatSquareBtn.addEventListener('click', () => setCropMode('square'));
}

// Logo toggle handlers
if (logoOffBtn && logoOnBtn) {
    logoOffBtn.addEventListener('click', () => setLogoVisibility(false));
    logoOnBtn.addEventListener('click', () => setLogoVisibility(true));
}

function setLogoVisibility(visible) {
    showLogo = visible;
    if (visible) {
        logoOnBtn?.classList.add('active');
        logoOffBtn?.classList.remove('active');
    } else {
        logoOffBtn?.classList.add('active');
        logoOnBtn?.classList.remove('active');
    }
    if (sourceVideo.readyState >= 2 && !isExporting) {
        drawVideoFrame(ctx, previewCanvas.width, previewCanvas.height);
        readMatchInfo();
        drawOverlay(ctx, previewCanvas.width, previewCanvas.height);
    }
}

function setCropMode(mode) {
    cropMode = mode;
    if (mode === 'square') {
        formatSquareBtn?.classList.add('active');
        formatOriginalBtn?.classList.remove('active');
    } else {
        formatOriginalBtn?.classList.add('active');
        formatSquareBtn?.classList.remove('active');
    }
    updateCanvasDimensions();
    if (sourceVideo.readyState >= 2 && !isExporting) {
        drawVideoFrame(ctx, previewCanvas.width, previewCanvas.height);
        readMatchInfo();
        drawOverlay(ctx, previewCanvas.width, previewCanvas.height);
    }
}


function updateCanvasDimensions() {
    if (!sourceVideo.videoWidth) return;
    if (cropMode === 'square') {
        const size = Math.min(sourceVideo.videoWidth, sourceVideo.videoHeight);
        if (previewCanvas.width !== size || previewCanvas.height !== size) {
            previewCanvas.width  = size;
            previewCanvas.height = size;
        }
    } else {
        if (previewCanvas.width !== sourceVideo.videoWidth || previewCanvas.height !== sourceVideo.videoHeight) {
            previewCanvas.width  = sourceVideo.videoWidth;
            previewCanvas.height = sourceVideo.videoHeight;
        }
    }
}

function drawVideoFrame(c, targetW, targetH) {
    if (cropMode === 'square') {
        const size = Math.min(sourceVideo.videoWidth, sourceVideo.videoHeight);
        const sx = (sourceVideo.videoWidth - size) / 2;
        const sy = (sourceVideo.videoHeight - size) / 2;
        c.drawImage(sourceVideo, sx, sy, size, size, 0, 0, targetW, targetH);
    } else {
        c.drawImage(sourceVideo, 0, 0, targetW, targetH);
    }
}

// Trim DOM refs
const trimSlider  = document.getElementById('trim-slider');
const trimWindow   = document.getElementById('trim-window');
const trimStartEl  = document.getElementById('trim-start');
const trimEndEl    = document.getElementById('trim-end');
const shareBtn     = document.getElementById('share-btn');
let lastExportBlob = null;

// Preload logo and font
(function preloadAssets() {
    logoImg = new Image();
    logoImg.src = 'subsoccer_logo.svg';
    if (document.fonts) {
        document.fonts.load("20px Subsoccer");
        document.fonts.ready.then(() => {
            if (previewCanvas.width > 0 && matchInfo) {
                drawOverlay(ctx, previewCanvas.width, previewCanvas.height);
            }
        });
    }
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
        updateCanvasDimensions();
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
        if (sourceVideo.readyState >= 2 && !isExporting) {
            // Loop within clip bounds (only during preview, not export)
            const actualClipDur = Math.min(CLIP_DURATION, sourceVideo.duration - clipStart);
            const clipEnd = clipStart + actualClipDur;
            if (!sourceVideo.paused && sourceVideo.currentTime >= clipEnd) {
                sourceVideo.currentTime = clipStart;
            }
            updateCanvasDimensions();
            drawVideoFrame(ctx, previewCanvas.width, previewCanvas.height);
            readMatchInfo();
            drawOverlay(ctx, previewCanvas.width, previewCanvas.height);
        }
        updateTimeDisplay();
        previewRAF = requestAnimationFrame(loop);
    }
    loop();
}


function stopPreviewLoop() {
    if (previewRAF) {
        cancelAnimationFrame(previewRAF);
        previewRAF = null;
    }
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

    const { player1, player2, score1, score2 } = matchInfo;

    // Scale based on video height — works for any resolution (720p to 4K)
    const s = h / 100; // 1% of video height as base unit
    const pad = Math.round(2.5 * s); // horizontal padding

    // ── Top bar (branding) — only drawn if showLogo is enabled ──
    if (showLogo) {
        const topH = Math.round(5.5 * s);  // ~5.5% of height
        const borderThick = Math.max(1, Math.round(0.08 * s)); // Thin light border (~1px at 1080p, scales proportionally)

        // 60% transparent black background
        c.fillStyle = 'rgba(0, 0, 0, 0.60)';
        c.fillRect(0, 0, w, topH);

        // Thin light line at bottom of top bar
        c.fillStyle = 'rgba(255, 255, 255, 0.25)';
        c.fillRect(0, topH - borderThick, w, borderThick);

        // Logo only (no GO word)
        if (logoImg && logoImg.complete && logoImg.naturalHeight > 0) {
            const logoH = Math.round(3.0 * s);
            const logoW = logoH * (logoImg.naturalWidth / logoImg.naturalHeight);
            c.drawImage(logoImg, pad, Math.round((topH - logoH) / 2), logoW, logoH);
        }
    }


    // ── Side Badges (Player 1 on Left, Player 2 on Right) ──
    const badgeW = Math.round(11.5 * s);
    const badgeH = Math.round(19.5 * s);
    const badgeY = Math.round((h - badgeH) / 2); // Centered vertically
    const maxTextW = badgeW * 0.88;

    // ── Helper to draw a badge with auto-fitted name & large score ──
    function drawPlayerBadge(name, scoreVal, startX, bgFill) {
        c.fillStyle = bgFill;
        c.fillRect(startX, badgeY, badgeW, badgeH);

        const centerX = startX + (badgeW / 2);

        // Player Name (Auto-fit to badge width)
        let nameFontSize = Math.round(3.4 * s);
        c.font = `${nameFontSize}px 'Subsoccer', Subsoccer, sans-serif`;
        const measured = c.measureText(name).width;
        if (measured > maxTextW && measured > 0) {
            nameFontSize = Math.max(Math.round(1.8 * s), Math.floor(nameFontSize * (maxTextW / measured)));
            c.font = `${nameFontSize}px 'Subsoccer', Subsoccer, sans-serif`;
        }
        c.fillStyle = '#ffffff';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText(name, centerX, badgeY + Math.round(1.4 * s));

        // Player Score (Large, fills lower area)
        const scoreFontSize = Math.round(11.8 * s);
        c.font = `${scoreFontSize}px 'Subsoccer', Subsoccer, sans-serif`;
        c.fillText(String(scoreVal !== undefined ? scoreVal : '0'), centerX, badgeY + Math.round(5.4 * s));
    }


    // Draw Left Badge: Player 1 (50% Dark Blue)
    drawPlayerBadge((player1 || 'Player 1').toUpperCase(), score1, 0, 'rgba(29, 58, 98, 0.50)');

    // Draw Right Badge: Player 2 (50% Red)
    drawPlayerBadge((player2 || 'Player 2').toUpperCase(), score2, w - badgeW, 'rgba(196, 30, 42, 0.50)');

    // Reset canvas text alignment
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
        matchInfo = { player1: p1, player2: p2, score1: s1, score2: s2, score: `${s1}-${s2}` };
    } else {
        matchInfo = null;
    }
}

function updateExportState() {
    readMatchInfo();
    exportBtn.disabled = !(matchInfo && videoFile);
}

// ───────────────────────────────────────────
// Dimension & Codec helpers for iOS / Mobile / WebCodecs
// ───────────────────────────────────────────
function getExportDimensions(videoWidth, videoHeight, isSquare) {
    let w = videoWidth || 720;
    let h = videoHeight || 1280;
    if (isSquare) {
        const minDim = Math.min(w, h);
        w = minDim;
        h = minDim;
    }
    // Cap max dimension to 1080 to prevent out-of-memory crashes on mobile/iOS
    const MAX_DIM = 1080;
    if (w > MAX_DIM || h > MAX_DIM) {
        if (w >= h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
        } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
        }
    }
    // Crucial for H.264 encoder: both width and height MUST be even numbers (divisible by 2)
    w = Math.floor(w / 2) * 2;
    h = Math.floor(h / 2) * 2;
    w = Math.max(128, w);
    h = Math.max(128, h);
    return { width: w, height: h };
}

async function findSupportedCodec(width, height, fps) {
    const candidates = [
        'avc1.4d002a', // Main Profile Level 4.2 (Standard 1080p)
        'avc1.640028', // High Profile Level 4.0
        'avc1.420028', // Baseline Profile Level 4.0
        'avc1.42001f', // Baseline Profile Level 3.1
        'avc1.42e01f', // Constrained Baseline Level 3.1
        'avc1.42001e', // Baseline Profile Level 3.0
    ];
    for (const codec of candidates) {
        try {
            const config = {
                codec,
                width,
                height,
                bitrate: 3_000_000,
                framerate: fps,
            };
            const res = await VideoEncoder.isConfigSupported(config);
            if (res && res.supported) {
                return res.config.codec || codec;
            }
        } catch (e) {}
    }
    return null;
}

// ───────────────────────────────────────────
// Export pipeline — try WebCodecs first, fall back to MediaRecorder
// ───────────────────────────────────────────
exportBtn.addEventListener('click', async () => {
    readMatchInfo();
    if (!matchInfo || !videoFile) return;

    exportBtn.disabled = true;
    exportBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Rendering...';
    progressContainer.style.display = 'block';
    downloadSection.style.display = 'none';
    setProgress(0);

    let exportSucceeded = false;

    // 1. Try WebCodecs first (fast & highest quality H.264 MP4)
    if (typeof VideoEncoder !== 'undefined') {
        try {
            console.log('Attempting export with WebCodecs...');
            await exportWithWebCodecs();
            exportSucceeded = true;
        } catch (webcodecsErr) {
            console.warn('WebCodecs export failed, falling back to MediaRecorder:', webcodecsErr);
        }
    }

    // 2. Fall back to MediaRecorder if WebCodecs was not available or failed
    if (!exportSucceeded) {
        try {
            console.log('Attempting export with MediaRecorder fallback...');
            await exportWithMediaRecorder();
            exportSucceeded = true;
        } catch (mediaRecErr) {
            console.error('MediaRecorder export failed:', mediaRecErr);
            alert('Export failed on this device: ' + mediaRecErr.message);
        }
    }

    if (exportSucceeded) {
        downloadSection.style.display = 'block';
        downloadSection.scrollIntoView({ behavior: 'smooth' });
    }

    exportBtn.disabled = false;
    exportBtn.innerHTML = '<i class="fa-solid fa-film"></i> Export MP4';
    progressContainer.style.display = 'none';
});

function setProgress(pct) {
    progressBar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    progressText.textContent = Math.round(Math.min(100, Math.max(0, pct))) + '%';
}

// ───────────────────────────────────────────
// WebCodecs export (frame-by-frame seek)
// ───────────────────────────────────────────
async function exportWithWebCodecs() {
    const video = sourceVideo;
    isExporting = true;
    stopPreviewLoop();
    video.pause();

    const { width, height } = getExportDimensions(video.videoWidth, video.videoHeight, cropMode === 'square');
    const fps = 30;
    const frameDurationMicros = Math.round(1_000_000 / fps);
    const actualClipDur = Math.min(CLIP_DURATION, video.duration - clipStart);
    const totalFrames = Math.floor(actualClipDur * fps);

    // Check encoder support
    const chosenCodec = await findSupportedCodec(width, height, fps);
    if (!chosenCodec) {
        throw new Error('No supported H.264 codec found for WebCodecs');
    }

    const encConfig = {
        codec: chosenCodec,
        width,
        height,
        bitrate: 3_000_000,
        framerate: fps,
        avc: { format: 'avc' },
    };

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

    // Standard HTMLCanvasElement for highest browser & iOS compatibility
    const encCanvas = document.createElement('canvas');
    encCanvas.width = width;
    encCanvas.height = height;
    const encCtx = encCanvas.getContext('2d');

    // Process each frame
    for (let i = 0; i < totalFrames; i++) {
        if (encodeError) throw encodeError;

        const time = clipStart + (i / fps); // offset by clip start
        await seekTo(video, time);

        // Draw video frame + overlay graphics
        encCtx.clearRect(0, 0, width, height);
        drawVideoFrame(encCtx, width, height);
        drawOverlay(encCtx, width, height);

        // Create VideoFrame with explicit duration
        let frame;
        try {
            frame = new VideoFrame(encCanvas, {
                timestamp: i * frameDurationMicros,
                duration: frameDurationMicros,
            });
        } catch (vfErr) {
            const bmp = await createImageBitmap(encCanvas);
            frame = new VideoFrame(bmp, {
                timestamp: i * frameDurationMicros,
                duration: frameDurationMicros,
            });
            bmp.close();
        }

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

    if (exportResultVideo) {
        exportResultVideo.src = url;
        exportResultVideo.load();
        exportResultVideo.play().catch(() => {});
    }

    downloadLink.href = url;
    downloadLink.download = 'subsoccer-highlight.mp4';

    // Restore preview
    isExporting = false;
    startPreviewLoop();
}

function seekTo(video, time) {
    return new Promise((resolve) => {
        if (Math.abs(video.currentTime - time) < 0.03) {
            resolve();
            return;
        }
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            video.removeEventListener('seeked', onSeeked);
            clearTimeout(timeoutId);
            resolve();
        };
        const onSeeked = () => finish();
        // 350ms failsafe timeout in case iOS drops the seeked event
        const timeoutId = setTimeout(finish, 350);
        video.addEventListener('seeked', onSeeked, { once: true });
        video.currentTime = time;
    });
}

// ───────────────────────────────────────────
// Fallback: Canvas + MediaRecorder
// ───────────────────────────────────────────
async function exportWithMediaRecorder() {
    const video = sourceVideo;

    // Stop preview loop so it doesn't interfere
    isExporting = true;
    stopPreviewLoop();
    video.pause();

    const { width: w, height: h } = getExportDimensions(video.videoWidth, video.videoHeight, cropMode === 'square');
    const actualClipDur = Math.min(CLIP_DURATION, video.duration - clipStart);

    const recCanvas = document.createElement('canvas');
    recCanvas.width = w;
    recCanvas.height = h;
    const recCtx = recCanvas.getContext('2d');

    const candidateMimes = [
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
    ];
    let mimeType = '';
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
        for (const m of candidateMimes) {
            if (MediaRecorder.isTypeSupported(m)) {
                mimeType = m;
                break;
            }
        }
    }

    const stream = recCanvas.captureStream ? recCanvas.captureStream(30) : previewCanvas.captureStream(30);
    const options = { videoBitsPerSecond: 3_000_000 };
    if (mimeType) options.mimeType = mimeType;

    const recorder = new MediaRecorder(stream, options);
    const chunks = [];
    let stopped = false;

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const recDone = new Promise((resolve) => {
        recorder.onstop = resolve;
    });

    function stopRecording() {
        if (stopped) return;
        stopped = true;
        video.pause();
        try { recorder.stop(); } catch(e) {}
    }

    // Safety timeout — never run longer than clip + 4s buffer
    const safetyTimeout = setTimeout(() => {
        console.warn('Export safety timeout reached');
        stopRecording();
    }, (actualClipDur + 4) * 1000);

    // Seek to clip start, wait for seek, then start
    video.currentTime = clipStart;
    await new Promise(r => {
        const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            r();
        };
        video.addEventListener('seeked', onSeek, { once: true });
        setTimeout(onSeek, 400); // failsafe
    });

    recorder.start(100);
    try {
        await video.play();
    } catch (e) {
        console.warn('Playback start error during recording:', e);
    }

    const clipEnd = clipStart + actualClipDur;
    function drawLoop() {
        if (stopped) return;
        if (video.currentTime >= clipEnd || video.paused || video.ended) {
            stopRecording();
            return;
        }
        recCtx.clearRect(0, 0, w, h);
        drawVideoFrame(recCtx, w, h);
        drawOverlay(recCtx, w, h);
        const elapsed = Math.max(0, video.currentTime - clipStart);
        setProgress(Math.min(99, (elapsed / actualClipDur) * 100));
        requestAnimationFrame(drawLoop);
    }
    drawLoop();

    await recDone;
    clearTimeout(safetyTimeout);
    setProgress(100);

    // Restore preview
    isExporting = false;
    startPreviewLoop();

    const outputType = (mimeType && mimeType.includes('webm')) ? 'video/webm' : 'video/mp4';
    const ext = outputType.includes('webm') ? 'webm' : 'mp4';
    const blob = new Blob(chunks, { type: outputType });
    lastExportBlob = blob;
    const url = URL.createObjectURL(blob);

    if (exportResultVideo) {
        exportResultVideo.src = url;
        exportResultVideo.load();
        exportResultVideo.play().catch(() => {});
    }

    downloadLink.href = url;
    downloadLink.download = `subsoccer-highlight.${ext}`;
}

// ───────────────────────────────────────────
// Web Share API & Download Intercept for Mobile
// ───────────────────────────────────────────
shareBtn.addEventListener('click', async () => {
    if (!lastExportBlob) return;
    const isMp4 = lastExportBlob.type.includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';
    const mime = isMp4 ? 'video/mp4' : 'video/webm';
    const file = new File([lastExportBlob], `subsoccer-highlight.${ext}`, { type: mime });
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
        // Fallback: trigger direct download
        const url = URL.createObjectURL(lastExportBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `subsoccer-highlight.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
});

// Intercept direct download on mobile devices to prevent black screen / raw blob navigation
downloadLink.addEventListener('click', (e) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && navigator.canShare) {
        e.preventDefault();
        shareBtn.click();
    }
});
