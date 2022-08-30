import { compileBytebeat, renderBytebeat } from "./shader.js";
import { getTypedElementById, unwrap } from "./util.js";


export class Recorder {
    /** @type {GIFRenderer | null} */
    #gif_recorder;

    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        /** @type {BlobPart[]} */
        this.video_chunks = [];

        const indicator = getTypedElementById(HTMLElement, "recording-indicator");
        this.indicator = new RecordingIndicator(indicator);

        const video = getTypedElementById(HTMLVideoElement, "video-display");
        const image = getTypedElementById(HTMLImageElement, "image-display");
        this.media_display = new MediaDisplay(image, video);

        this.canvas = canvas;

        this.recorder = new MediaRecorderWrapper(this.canvas.captureStream(), this.media_display);
        this.#gif_recorder = null;
    }

    is_recording() {
        return this.#gif_recorder?.is_rendering || this.recorder.is_recording;
    }

    start() {
        if (this.is_recording()) { return; }

        this.video_chunks = [];
        this.recorder.start();
        this.indicator.show("Recording WebM... (Press R to stop recording)");
    }

    stop() {
        if (!this.recorder.is_recording) { return; }

        this.indicator.hide();
        this.recorder.stop();
    }

    /**
     * Manually record a video between the start and end frames.
     * @param {import("./shader.js").BytebeatParams} params
     * @param {number} start_t
     * @param {number} end_t
     * @param {string} bytebeat
     * @param {number} width
     * @param {number} height
     * @param {number} delay
     */
    async manual_recording(bytebeat, params, start_t, end_t, width, height, delay) {
        // Abort the current recording in progress.
        if (this.is_recording()) {
            this.#gif_recorder?.abort();
        }

        this.#gif_recorder = new GIFRenderer(bytebeat, width, height, this.indicator, this.media_display);
        this.#gif_recorder.render(start_t, end_t, params, delay);
    }
}

class RecordingIndicator {
    /** 
     * Construct a new RecordingIndicator
     * @param {HTMLElement} element 
     */
    constructor(element) {
        this.indicator = element;
    }

    /**
     * Show a message on the indicator.
     * @param {string} msg
     */
    show(msg) {
        this.indicator.classList.remove("hidden");
        this.indicator.innerText = msg;
    }

    /**
     * Hide the indicator.
     */
    hide() {
        this.indicator.classList.add("hidden");
        this.indicator.innerText = "";
    }
}

class MediaDisplay {
    /**
     * Wrapper for the img/video display elements.
     * @param {HTMLImageElement} img_element The image element to show images in
     * @param {HTMLVideoElement} video_element The video element to show videos in
     */
    constructor(img_element, video_element) {
        this.img = img_element;
        this.video = video_element;
    }

    /**
     * @param {Blob | MediaSource} blob
     */
    show_video(blob) {
        this.video.src = URL.createObjectURL(blob);
        this.video.classList.remove("hidden");
        this.img.classList.add("hidden");
    }

    /**
     * @param {Blob | MediaSource} blob
     */
    show_image(blob) {
        this.img.src = URL.createObjectURL(blob);
        this.img.classList.remove("hidden");
        this.video.classList.add("hidden");
    }
}

class GIFRenderer {
    /**
     * @param {string} bytebeat
     * @param {number} width
     * @param {number} height
     * @param {RecordingIndicator} indicator
     * @param {MediaDisplay} display
     */
    constructor(bytebeat, width, height, indicator, display) {
        // Set up the canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl = unwrap(this.canvas.getContext("webgl2"));
        this.programInfo = compileBytebeat(this.gl, bytebeat);

        this.indicator = indicator;
        this.is_rendering = false;

        // Set up the gif.js GIF object
        // @ts-ignore (Can't import the GIF object for some reason)
        this.gif = new GIF(gif_settings(width, height));

        this.gif.on('finished', (/** @type {Blob} */ blob) => {
            this.indicator.hide();
            display.show_image(blob);
            this.is_rendering = false;
        })

        this.gif.on('abort', () => {
            this.indicator.hide();
            this.is_rendering = false;
        })

        this.gif.on('progress', (/** @type { number } */ progress) => {
            indicator.show(`Rendering to GIF... (Rendering - ${(progress * 100).toFixed(2)}%)`);
        })
    }

    /**
     * @param {number} start_t
     * @param {number} end_t
     * @param {import("./shader.js").BytebeatParams} params
     * @param {number} delay
     */
    async render(start_t, end_t, params, delay) {
        this.is_rendering = true;

        // Record all frames
        for (let i = start_t; i < end_t; i++) {
            if (this.aborted) {
                return;
            }
            params.time = i;
            renderBytebeat(this.gl, this.programInfo, params);
            this.gif.addFrame(this.canvas, { copy: true, delay });
            this.indicator.show(`Rendering to GIF... (Frame - ${i - start_t}/${end_t - start_t})`);
            await yieldToEventLoop();
        }

        this.gif.render();
    }

    abort() {
        if (this.is_rendering) {
            this.gif.abort();
            this.aborted = true;
        }
    }
}

class MediaRecorderWrapper {
    /**
     * @param {MediaStream} media_stream
     * @param {MediaDisplay} display
     */
    constructor(media_stream, display) {
        this.media_recorder = new MediaRecorder(media_stream, { videoBitsPerSecond: 1028 * 1000000 });
        /** @type {BlobPart[]} */
        this.video_chunks = [];
        this.display = display;
        this.is_recording = false;

        this.media_recorder.onstart = () => {
            this.video_chunks = [];
        }

        this.media_recorder.ondataavailable = (/** @type {BlobEvent} */ e) => {
            this.video_chunks.push(e.data);
        }

        this.media_recorder.onstop = () => {
            let blob = new Blob(this.video_chunks, { type: "video/webm" });
            this.display.show_video(blob);
        }

    }

    start() {
        this.media_recorder.start();
        this.is_recording = true;
    }

    stop() {
        this.media_recorder.stop();
        this.is_recording = false;
    }
}

/**
 * @param {any} width
 * @param {any} height
 */
function gif_settings(width, height) {
    return {
        quality: 0,
        background: "#000000",
        width,
        height,
        dither: false,
        repeat: 0, // repeat forever
        workers: 32,
    }
};

function yieldToEventLoop() {
    return new Promise((t, e) => setTimeout(t, 0));
}