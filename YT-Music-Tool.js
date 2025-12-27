// ==UserScript==
// @name         YT Music Tool
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Audio tools and interface modifications for YouTube Music.
// @author       duckie (and Gemini 3 Pro)
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG_KEY = 'ytmToolsData';

    let audioCtx, source, gainNode, bassFilter;
    let videoElement = null;
    let initialized = false;
    let pipWindow = null;
    let panel = null;

    let config = {
        volume: 1,
        bass: 0,
        speed: 1,
        nightcore: false,
        darkMode: true,
        posX: '20px',
        posY: '80px'
    };

    function loadConfig() {
        const saved = localStorage.getItem(CONFIG_KEY);
        if (saved) {
            try { config = { ...config, ...JSON.parse(saved) }; } catch (e) {}
        }
    }
    function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }

    loadConfig();

    const cssText = `
        #ytm-float-btn {
            position: fixed; bottom: 30px; right: 30px;
            width: 50px; height: 50px;
            background: #111; border: 2px solid rgba(255,255,255,0.2);
            border-radius: 50%; cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.8);
            z-index: 2147483647 !important;
            display: flex; align-items: center; justify-content: center;
            font-size: 24px; transition: transform 0.2s;
            color: white; user-select: none;
        }
        #ytm-float-btn:hover { transform: scale(1.1); background: #000; border-color: #fff; }

        #ytm-panel {
            position: fixed; width: 300px;
            background: rgba(12, 12, 12, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid #333; border-radius: 12px;
            padding: 20px; z-index: 2147483647 !important;
            font-family: Roboto, Arial, sans-serif; color: #eee;
            box-shadow: 0 10px 40px rgba(0,0,0,1);
            display: none; top: 80px; right: 20px;
            transition: background 0.2s;
        }

        #ytm-panel.light {
            background: rgba(255, 255, 255, 0.98);
            color: #222;
            border: 1px solid #ccc;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        #ytm-panel.light .ytm-title { color: #222; }
        #ytm-panel.light .ytm-btn { background: #f0f0f0; color: #333; border: 1px solid #ccc; }
        #ytm-panel.light .ytm-btn:hover { background: #e0e0e0; }
        #ytm-panel.light .ytm-icon-btn { color: #555; }
        #ytm-panel.light .ytm-icon-btn:hover { color: #000; }
        #ytm-panel.light .ytm-sub { color: #666 !important; }
        #ytm-panel.light .ytm-box { background: #f0f0f0 !important; }

        #ytm-panel.pip {
            position: static;
            width: 100%;
            height: 100%;
            border: none;
            padding: 15px;
            box-sizing: border-box;
            border-radius: 0;
            overflow-y: auto;
        }
        #ytm-panel.pip.light { background: #fff; }

        .ytm-row { margin-bottom: 15px; }
        .ytm-flex { display: flex; justify-content: space-between; align-items: center; }
        .ytm-title { font-weight: bold; font-size: 14px; letter-spacing: 1px; color: #fff; }
        .ytm-btn { background: #333; border: 1px solid #444; color: white; padding: 10px 0; border-radius: 6px; cursor: pointer; flex: 1; margin: 0 4px; font-weight: bold; font-size: 14px; transition: 0.2s; }
        .ytm-btn:hover { background: #555; border-color: #666; }
        .ytm-icon-btn { background: none; border: none; color: #aaa; cursor: pointer; font-size: 18px; }
        .ytm-icon-btn:hover { color: white; }
        .ytm-sub { font-size: 12px; color: #ccc; }
        .ytm-box { background: #222; padding: 10px; border-radius: 8px; }

        input[type=range] { width: 100%; accent-color: #ff0000; cursor: pointer; margin-top: 5px; }
    `;

    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    document.head.appendChild(styleEl);

    function buildInterface() {
        if (document.getElementById('ytm-panel')) return;

        panel = document.createElement('div');
        panel.id = 'ytm-panel';
        panel.style.top = config.posY;
        panel.style.left = config.posX;
        if (!config.darkMode) panel.classList.add('light');

        const header = document.createElement('div');
        header.className = 'ytm-row ytm-flex';
        header.style.borderBottom = '1px solid #333';
        header.style.paddingBottom = '10px';
        header.style.cursor = 'move';

        const title = document.createElement('span');
        title.className = 'ytm-title';
        title.textContent = 'YT Music Tool';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ytm-icon-btn';
        closeBtn.textContent = '✕';
        closeBtn.onclick = () => panel.style.display = 'none';

        const pipBtn = document.createElement('button');
        pipBtn.className = 'ytm-icon-btn';
        pipBtn.textContent = '❐';
        pipBtn.title = "Popout Player";
        pipBtn.onclick = togglePip;

        const headRight = document.createElement('div');
        headRight.appendChild(pipBtn);
        headRight.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headRight);
        panel.appendChild(header);

        const createControl = (lbl, min, max, step, key, fmt) => {
            const div = document.createElement('div');
            div.className = 'ytm-row';
            const top = document.createElement('div');
            top.className = 'ytm-flex ytm-sub';
            const name = document.createElement('span'); name.textContent = lbl;
            const val = document.createElement('span'); val.textContent = fmt(config[key]);
            top.appendChild(name); top.appendChild(val);

            const input = document.createElement('input');
            input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = config[key];

            input.oninput = (e) => {
                config[key] = parseFloat(e.target.value);
                val.textContent = fmt(config[key]);
                updateAudio();
                saveConfig();
            };

            div.appendChild(top); div.appendChild(input);
            panel.appendChild(div);
            return { input, val };
        }

        window.ctrlVol = createControl('Volume', 0, 3, 0.05, 'volume', v => Math.round(v*100)+'%');
        window.ctrlBass = createControl('Bass', 0, 20, 1, 'bass', v => '+'+v+'dB');
        window.ctrlSpeed = createControl('Speed', 0.5, 2.5, 0.05, 'speed', v => v.toFixed(2)+'x');

        const mediaRow = document.createElement('div');
        mediaRow.className = 'ytm-row ytm-flex';
        const bPrev = document.createElement('button');
        bPrev.className = 'ytm-btn'; bPrev.textContent = '⏮';
        bPrev.onclick = () => document.querySelector('.previous-button')?.click();

        const bPlay = document.createElement('button');
        bPlay.className = 'ytm-btn'; bPlay.textContent = '⏯';
        bPlay.style.flex = '1.5';
        bPlay.onclick = () => { if(videoElement) videoElement.paused ? videoElement.play() : videoElement.pause(); };

        const bNext = document.createElement('button');
        bNext.className = 'ytm-btn'; bNext.textContent = '⏭';
        bNext.onclick = () => document.querySelector('.next-button')?.click();

        mediaRow.appendChild(bPrev); mediaRow.appendChild(bPlay); mediaRow.appendChild(bNext);
        panel.appendChild(mediaRow);

        const seekRow = document.createElement('div');
        seekRow.className = 'ytm-row ytm-flex';
        const bSeekBack = document.createElement('button');
        bSeekBack.className = 'ytm-btn'; bSeekBack.textContent = '⏪ -10s';
        bSeekBack.onclick = () => { if(videoElement) videoElement.currentTime -= 10; };
        const bSeekFwd = document.createElement('button');
        bSeekFwd.className = 'ytm-btn'; bSeekFwd.textContent = '+10s ⏩';
        bSeekFwd.onclick = () => { if(videoElement) videoElement.currentTime += 10; };
        seekRow.appendChild(bSeekBack); seekRow.appendChild(bSeekFwd);
        panel.appendChild(seekRow);

        const ncDiv = document.createElement('div');
        ncDiv.className = 'ytm-row ytm-flex ytm-box';
        const ncLbl = document.createElement('label');
        ncLbl.textContent = 'Nightcore Mode';
        ncLbl.style.fontWeight = 'bold'; ncLbl.style.fontSize = '13px';
        const ncCheck = document.createElement('input');
        ncCheck.type = 'checkbox'; ncCheck.checked = config.nightcore;
        ncCheck.style.transform = 'scale(1.5)';

        ncCheck.onchange = (e) => {
            const on = e.target.checked;
            config.nightcore = on;
            if (on) {
                config.speed = 1.25;
                if(config.bass === 0) config.bass = 3;
            } else {
                config.speed = 1.0;
                config.bass = 0;
            }
            refreshVisuals();
            updateAudio();
            saveConfig();
        };
        ncDiv.appendChild(ncLbl); ncDiv.appendChild(ncCheck);
        panel.appendChild(ncDiv);

        const bottomRow = document.createElement('div');
        bottomRow.className = 'ytm-flex';
        bottomRow.style.marginTop = '10px';

        const themeBtn = document.createElement('button');
        themeBtn.textContent = config.darkMode ? '☀ Light' : '☾ Dark';
        themeBtn.style.cssText = 'background:transparent; border:1px solid #555; color:inherit; padding:5px 10px; border-radius:4px; cursor:pointer;';
        themeBtn.onclick = () => {
            config.darkMode = !config.darkMode;
            config.darkMode ? panel.classList.remove('light') : panel.classList.add('light');
            themeBtn.textContent = config.darkMode ? '☀ Light' : '☾ Dark';
            saveConfig();
        };

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset All';
        resetBtn.style.cssText = 'background:#d32f2f; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;';
        resetBtn.onclick = () => {
            config.volume = 1; config.bass = 0; config.speed = 1; config.nightcore = false;
            ncCheck.checked = false;
            refreshVisuals();
            updateAudio();
            saveConfig();
        };
        bottomRow.appendChild(themeBtn); bottomRow.appendChild(resetBtn);
        panel.appendChild(bottomRow);

        document.body.appendChild(panel);

        let isDrag = false, dx=0, dy=0;
        header.onmousedown = (e) => { isDrag = true; dx = e.clientX - panel.offsetLeft; dy = e.clientY - panel.offsetTop; };
        document.onmousemove = (e) => {
            if(isDrag && !pipWindow) {
                panel.style.left = (e.clientX - dx)+'px';
                panel.style.top = (e.clientY - dy)+'px';
                config.posX = panel.style.left; config.posY = panel.style.top;
            }
        };
        document.onmouseup = () => { if(isDrag) { isDrag = false; saveConfig(); }};
    }

    function refreshVisuals() {
        if(window.ctrlVol) {
            window.ctrlVol.input.value = config.volume; window.ctrlVol.val.textContent = Math.round(config.volume*100)+'%';
            window.ctrlBass.input.value = config.bass; window.ctrlBass.val.textContent = '+'+config.bass+'dB';
            window.ctrlSpeed.input.value = config.speed; window.ctrlSpeed.val.textContent = config.speed.toFixed(2)+'x';
        }
    }

    setInterval(() => {
        let floatBtn = document.getElementById('ytm-float-btn');
        if (!floatBtn) {
            floatBtn = document.createElement('div');
            floatBtn.id = 'ytm-float-btn';
            floatBtn.textContent = '🎛️';
            floatBtn.onclick = () => {
                if(!panel) buildInterface();
                if(pipWindow) pipWindow.focus();
                else panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                initAudio();
            };
            document.body.appendChild(floatBtn);
        }
        if (!document.getElementById('ytm-panel')) buildInterface();

        const vid = document.querySelector('video');
        if (vid && vid !== videoElement) {
            initialized = false;
            initAudio();
        }

        if (videoElement && config.nightcore) {
            if (videoElement.preservesPitch !== false) {
                videoElement.preservesPitch = false;
                videoElement.mozPreservesPitch = false;
                videoElement.webkitPreservesPitch = false;
            }
        }
    }, 1000);

    function initAudio() {
        if (initialized) return;
        videoElement = document.querySelector('video');
        if (!videoElement) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            source = audioCtx.createMediaElementSource(videoElement);
            gainNode = audioCtx.createGain();
            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = 'lowshelf'; bassFilter.frequency.value = 200;

            source.connect(bassFilter); bassFilter.connect(gainNode); gainNode.connect(audioCtx.destination);

            initialized = true;
            updateAudio();

            videoElement.addEventListener('ratechange', () => {
                 if (Math.abs(videoElement.playbackRate - config.speed) > 0.01 && config.speed !== 1) {
                     videoElement.playbackRate = config.speed;
                 }
            });
            videoElement.addEventListener('loadeddata', updateAudio);
        } catch (e) {}
    }

    function updateAudio() {
        if (!initialized || !videoElement) return;
        gainNode.gain.value = config.volume;
        bassFilter.gain.value = config.bass;
        videoElement.playbackRate = config.speed;
        const p = !config.nightcore;
        videoElement.preservesPitch = p; videoElement.mozPreservesPitch = p; videoElement.webkitPreservesPitch = p;
    }

    async function togglePip() {
        if (!window.documentPictureInPicture) return alert("PiP not supported");
        if (pipWindow) { pipWindow.close(); return; }

        const panelHeight = panel.scrollHeight || 650;
        const finalWidth = 340;
        const finalHeight = panelHeight + 30;

        pipWindow = await window.documentPictureInPicture.requestWindow({ width: finalWidth, height: finalHeight });

        const s = pipWindow.document.createElement('style');
        s.textContent = cssText + "\nbody { margin: 0; padding: 0; background: #000; overflow: hidden; }";
        pipWindow.document.head.appendChild(s);

        pipWindow.document.body.appendChild(panel);
        panel.classList.add('pip');
        panel.style.display = 'block';

        refreshVisuals();

        pipWindow.addEventListener('pagehide', () => {
            panel.classList.remove('pip'); document.body.appendChild(panel);
            panel.style.display = 'none'; pipWindow = null;
        });
    }

})();