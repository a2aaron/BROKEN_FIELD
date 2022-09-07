import { compileBytebeat, renderBytebeat } from "./shader.js";
import { getTypedElementById, unwrap } from "./util.js";


export class Recorder {
    /** @type {GIFRenderer | null} */
    #gif_recorder;
    /** @type {MediaRecorderWrapper} */
    #webm_recorder;

    /**
     * @param {HTMLCanvasElement} canvas The visible canvas to attach the WebM recorder to.
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

        this.#webm_recorder = new MediaRecorderWrapper(this.canvas.captureStream(), this.media_display);
        this.#gif_recorder = null;
    }

    is_recording() {
        return this.#gif_recorder?.is_rendering || this.#webm_recorder.is_recording;
    }

    start() {
        if (this.is_recording()) { return; }

        this.video_chunks = [];
        this.#webm_recorder.start();
        this.indicator.show("Recording WebM... (Press R to stop recording)");
    }

    stop() {
        if (!this.#webm_recorder.is_recording) { return; }

        this.indicator.hide();
        this.#webm_recorder.stop();
    }

    /**
     * Manually record a GIF.
     * @param {import("./shader.js").BytebeatParams} bytebeat_params
     * @param {import("./index.js").Parameters} ui_params
     * @param {number} start_t
     * @param {number} end_t
     * @param {number} delay
     */
    async manual_recording(bytebeat_params, ui_params, start_t, end_t, delay) {
        // Abort the current recording in progress.
        if (this.is_recording()) {
            this.#gif_recorder?.abort();
        }

        this.#gif_recorder = new GIFRenderer(this.indicator, this.media_display);
        this.#gif_recorder.render(bytebeat_params, ui_params, start_t, end_t, delay);
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

/**
 * Render a GIF asynchronously.
 */
class GIFRenderer {
    /**
     * @param {RecordingIndicator} indicator The indicator to display the current recording progress
     * @param {MediaDisplay} display The MediaDisplay to show the gif once rendered
     */
    constructor(indicator, display) {
        this.indicator = indicator;
        this.is_rendering = false;

        // Set up the gif.js GIF object
        // @ts-ignore (Can't import the GIF object for some reason)
        this.gif = new GIF(gif_settings());

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
     * Render the bytebeat with the given paremeters, canvas size, etc. This is an async method
     * and can be aborted by calling the `abort()` method.
     * @param {import("./shader.js").BytebeatParams} bytebeat_params
     * @param {import("./index.js").Parameters} ui_params
     * @param {number} delay
     * @param {number} start_t
     * @param {number} end_t
     */
    async render(bytebeat_params, ui_params, start_t, end_t, delay) {
        // Set up the canvas
        let canvas = document.createElement("canvas");
        canvas.width = ui_params.width;
        canvas.height = ui_params.height;
        let gl = unwrap(canvas.getContext("webgl2"));
        let [programInfo, _fsSource, _parseType] = compileBytebeat(gl, ui_params.bytebeat, ui_params.precision);
        if (programInfo instanceof Error) {
            this.indicator.show("Can't render--invalid bytebeat!");
            return;
        }
        this.is_rendering = true;

        // Record all frames
        for (let i = start_t; i < end_t; i++) {
            if (this.aborted) {
                return;
            }
            bytebeat_params.time = i;
            renderBytebeat(gl, programInfo, bytebeat_params);
            this.gif.addFrame(canvas, { copy: true, delay });
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

/**
 * Attaches a MediaRecorder to the given MediaStream and displays the recording in a MediaDisplay
 */
class MediaRecorderWrapper {
    /**
     * @param {MediaStream} media_stream the MediaStream to attach to
     * @param {MediaDisplay} display the MediaDisplay to display the WebM once recorded.
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

function gif_settings() {
    return {
        quality: 0,
        background: "#000000",
        dither: false,
        repeat: 0, // repeat forever
        workers: 32,
    }
};

function yieldToEventLoop() {
    return new Promise((t, e) => setTimeout(t, 0));
}