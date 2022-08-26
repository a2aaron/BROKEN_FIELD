import { getTypedElementById } from "./util.js";

export class Recorder {
    /** @type {"webm" | "gif" | null} */
    #current_recording;
    /**
     * @param {HTMLCanvasElement} canvas 
     */
    constructor(canvas) {
        this.media_recorder = new MediaRecorder(canvas.captureStream());

        /** @type {BlobPart[]} */
        this.video_chunks = [];

        this.recording_indicator = getTypedElementById(HTMLElement, "recording-indicator");
        this.video_display_webm = getTypedElementById(HTMLVideoElement, "video-display-webm");
        this.video_display_gif = getTypedElementById(HTMLImageElement, "video-display-gif");

        this.encoding_selector = getTypedElementById(HTMLSelectElement, "video-encoding");

        this.media_recorder.ondataavailable = (/** @type {BlobEvent} */ e) => {
            this.video_chunks.push(e.data);
        }

        this.media_recorder.onstop = () => {
            let encoding = this.encoding_selector.value;
            const blob = new Blob(this.video_chunks);
            this.video_display_webm.src = URL.createObjectURL(blob);
        }

        this.#current_recording = null;
    }

    is_recording() {
        return this.#current_recording == "gif" || this.#current_recording == "webm";
    }

    start() {
        this.video_chunks = [];
        this.recording_indicator.classList.remove("hidden");
        if (this.encoding_selector.options[this.encoding_selector.selectedIndex].value == "webm") {
            this.media_recorder.start();
            this.#current_recording = "webm";
        } else {
            this.#current_recording = "gif";
        }
    }

    stop() {
        this.recording_indicator.classList.add("hidden");

        if (this.#current_recording == "webm") {
            this.media_recorder.stop();
            console.log("webm end");
            this.video_display_webm.classList.remove("hidden");
            this.video_display_gif.classList.add("hidden");
        } else if (this.#current_recording == "gif") {
            console.log("gif end");

            this.video_display_gif.classList.remove("hidden");
            this.video_display_webm.classList.add("hidden");
        }
        this.#current_recording = null;
    }
}