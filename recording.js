import { compileBytebeat, renderBytebeat } from "./shader.js";
import { getTypedElementById, unwrap } from "./util.js";


export class Recorder {
    /** @type {"webm" | "gif" | null} */
    #current_recording;
    /** @type {import("./gif.js") | null} */
    #gif_recorder;

    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        /** @type {BlobPart[]} */
        this.video_chunks = [];
        this.recording_indicator = getTypedElementById(HTMLElement, "recording-indicator");
        this.video_display = getTypedElementById(HTMLVideoElement, "video-display");
        this.image_display = getTypedElementById(HTMLImageElement, "image-display");

        this.canvas = canvas;

        this.recorder = new MediaRecorderWrapper(this.canvas.captureStream(), this.video_display);

        this.#current_recording = null;
        this.#gif_recorder = null;
    }

    is_recording() {
        return this.#current_recording == "gif" || this.#current_recording == "webm";
    }

    start() {
        if (this.is_recording()) { return; }

        this.video_chunks = [];
        this.recorder.start();
        this.#show_recording_indicator("Recording WebM... (Press R to stop recording)");
        this.#current_recording = "webm";
    }

    stop() {
        if (this.#current_recording != "webm") { return; }

        this.#hide_recording_indicator();
        this.recorder.stop();
        this.show_video_element("video");
        this.#current_recording = null;
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
        if (this.is_recording()) {
            this.#gif_recorder?.abort();
            return;
        }

        this.#current_recording = "gif";

        // Set up the canvas
        let canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        let gl = unwrap(canvas.getContext("webgl2"));
        let programInfo = compileBytebeat(gl, bytebeat);

        // Set up the gif.js GIF object
        // @ts-ignore (Can't import the GIF object for some reason)
        this.#gif_recorder = new GIF(gif_settings(width, height));

        this.#gif_recorder.on('finished', (/** @type {Blob} */ blob) => {
            this.#hide_recording_indicator();

            this.image_display.src = URL.createObjectURL(blob);
            this.show_video_element("image");
            this.#current_recording = null;
        })

        this.#gif_recorder.on('abort', () => {
            this.#hide_recording_indicator();
            this.#current_recording = null;
        })

        this.#gif_recorder.on('progress', (/** @type { number } */ progress) => {
            this.#show_recording_indicator(`Rendering to GIF... (Rendering - ${(progress * 100).toFixed(2)}%)`);
        })

        // Record all frames
        for (let i = start_t; i < end_t; i++) {
            params.time = i;
            renderBytebeat(gl, programInfo, params);
            this.#gif_recorder.addFrame(canvas, { copy: true, delay });
            this.#show_recording_indicator(`Rendering to GIF... (Frame - ${i - start_t}/${end_t - start_t})`);
            await yieldToEventLoop();
        }

        this.#gif_recorder.render();
    }

    /**
     * @param {"video" | "image"} format
     */
    show_video_element(format) {
        if (format == "video") {
            this.video_display.classList.remove("hidden");
            this.image_display.classList.add("hidden");
        } else if (format == "image") {
            this.video_display.classList.add("hidden");
            this.image_display.classList.remove("hidden");
        }
    }

    /**
     * @param {string} msg
     */
    #show_recording_indicator(msg) {
        this.recording_indicator.classList.remove("hidden");
        this.recording_indicator.innerText = msg;
    }

    #hide_recording_indicator() {
        this.recording_indicator.classList.add("hidden");
    }
}

class MediaRecorderWrapper {
    /**
     * @param {MediaStream} media_stream
     * @param {HTMLVideoElement} video_element
     */
    constructor(media_stream, video_element) {
        this.media_recorder = new MediaRecorder(media_stream, { videoBitsPerSecond: 1028 * 1000000 });
        /** @type {BlobPart[]} */
        this.video_chunks = [];
        this.video_element = video_element;

        this.media_recorder.onstart = () => {
            this.video_chunks = [];
        }

        this.media_recorder.ondataavailable = (/** @type {BlobEvent} */ e) => {
            this.video_chunks.push(e.data);
        }

        this.media_recorder.onstop = () => {
            let blob = new Blob(this.video_chunks, { type: "video/webm" });
            this.video_element.src = URL.createObjectURL(blob);
        }
    }

    start() {
        this.media_recorder.start();
    }

    stop() {
        this.media_recorder.stop();
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