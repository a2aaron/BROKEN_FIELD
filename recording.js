// import * as gif_js from "./gifjs/gif.js";
import { compileBytebeat, renderBytebeat } from "./shader.js";
import { getTypedElementById, unwrap } from "./util.js";

// debugger;

export class Recorder {
    /** @type {"webm" | "gif" | null} */
    #current_recording;
    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        /** @type {BlobPart[]} */
        this.video_chunks = [];
        this.recording_indicator = getTypedElementById(HTMLElement, "recording-indicator");
        this.video_display_webm = getTypedElementById(HTMLVideoElement, "video-display-webm");
        this.video_display_gif = getTypedElementById(HTMLImageElement, "video-display-gif");
        this.encoding_selector = getTypedElementById(HTMLSelectElement, "video-encoding");

        this.recorder = new MediaRecorderWrapper(canvas.captureStream(), this.video_display_webm);

        this.#current_recording = null;
    }

    is_recording() {
        return this.#current_recording == "gif" || this.#current_recording == "webm";
    }

    start() {
        this.video_chunks = [];
        this.#show_recording_indicator("Recording... (Press R to stop recording)");
        if (this.#selected_format() == "webm") {
            this.recorder.start();
            this.#current_recording = "webm";
        } else {
            this.#current_recording = "gif";
        }
    }

    stop() {
        if (this.#current_recording == null) { return; }

        this.#hide_recording_indicator();

        if (this.#current_recording == "webm") {
            this.recorder.stop();

        } else if (this.#current_recording == "gif") {
        }

        this.#show_video_element(this.#current_recording);
        this.#current_recording = null;
    }

    /**
     * Manually record a video between the start and end frames.
     * @param {import("./shader.js").BytebeatParams} params
     * @param {number} start_t
     * @param {number} end_t
     * @param {string} bytebeat
     */
    manual_recording(bytebeat, params, start_t, end_t) {
        this.#current_recording = this.#selected_format();

        if (this.#selected_format() == "webm") {
        } else {
            let canvas = document.createElement("canvas");
            canvas.width = 1024;
            canvas.height = 1024;
            let gl = unwrap(canvas.getContext("webgl2"));
            let programInfo = compileBytebeat(gl, bytebeat);

            let gif = new GIF({
                quality: 0,
                background: "#000000",
                width: 1024,
                height: 1024,
                dither: false,
                repeat: 0, // repeat forever
            });

            for (let i = start_t; i <= end_t; i++) {
                params.time = i;
                renderBytebeat(gl, programInfo, params);
                gif.addFrame(canvas, { copy: true, delay: 10 });

                this.#show_recording_indicator(`Recording... (Frame ${i - start_t}/${end_t - start_t})`);
            }

            gif.on('finished', (/** @type {Blob} */ blob) => {
                this.video_display_gif.src = URL.createObjectURL(blob);
                this.#hide_recording_indicator();
            })

            this.#show_recording_indicator(`Rendering... (Rendering to GIF...)`);
            gif.render();


        }

        this.#show_video_element(this.#selected_format());
        this.#current_recording = null;
    }

    /**
     * @param {"webm" | "gif"} format
     */
    #show_video_element(format) {
        if (format == "webm") {
            this.video_display_webm.classList.remove("hidden");
            this.video_display_gif.classList.add("hidden");
        } else if (format == "gif") {
            this.video_display_gif.classList.remove("hidden");
            this.video_display_webm.classList.add("hidden");
        }
    }

    /**
     * @returns {"webm" | "gif"}
     */
    #selected_format() {
        let value = this.encoding_selector.options[this.encoding_selector.selectedIndex].value;
        if (value == "webm" || value == "gif") {
            return value;
        } else {
            throw new Error("Invalid video format selection.");
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

    /**
     * @param {BlobPart[]} blobParts
     */
    #output_webm(blobParts) {
        const blob = new Blob(blobParts, { type: "video/webm" });
        console.log(blobParts, blob, this.video_chunks);
        this.video_display_webm.src = URL.createObjectURL(blob);
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