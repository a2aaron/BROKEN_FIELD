import { mutate_bytebeat, random_bytebeat } from "./randomize.js";
import { Recorder } from "./recording.js";
import { compileBytebeat, renderBytebeat } from "./shader.js";
import { getTypedElementById, render_error_messages, RGBColor, unwrap } from "./util.js";

// HTML elements we wish to attach event handlers to.
// HTML elements we wish to reference
const canvas = getTypedElementById(HTMLCanvasElement, "canvas");

const bytebeat_textarea = getTypedElementById(HTMLTextAreaElement, "input");
const wrap_value_input = getTypedElementById(HTMLInputElement, "wrapping-value");
const color_input = getTypedElementById(HTMLInputElement, "color");
const time_scale_input = getTypedElementById(HTMLInputElement, "time-scale");
const time_scale_display = getTypedElementById(HTMLElement, "time-scale-display");

const canvas_size_x_input = getTypedElementById(HTMLInputElement, "canvas-size-x");
const canvas_size_y_input = getTypedElementById(HTMLInputElement, "canvas-size-y");

const restart_button = getTypedElementById(HTMLButtonElement, "restart-btn");
const randomize_button = getTypedElementById(HTMLButtonElement, "randomize-btn");
const mutate_button = getTypedElementById(HTMLButtonElement, "mutate-btn");
const share_button = getTypedElementById(HTMLButtonElement, "share-btn");
const share_display = getTypedElementById(HTMLElement, "share-confirm");

const screenshot_button = getTypedElementById(HTMLButtonElement, "screenshot-btn");
const screenshot_display = getTypedElementById(HTMLImageElement, "image-display");

const coord_display = getTypedElementById(HTMLElement, "coord-display");

const record_button = getTypedElementById(HTMLButtonElement, "video-encoding-manual-record-btn");

const gl = unwrap(canvas.getContext("webgl2"));

// Global variables for the current bytebeat. This contains things like the current mouse/keyboard
// values, as well the currently loaded bytebeat

/** @type {import("./shader.js").ProgramInfo | null} */
let BYTEBEAT_PROGRAM_INFO = null;

let MOUSE_X = 0;
let MOUSE_Y = 0;
let KEYBOARD_X = 0;
let KEYBOARD_Y = 0;
let CURRENT_FRAME = 0;
let LAST_FRAME_TIME = 0;

const recorder = new Recorder(canvas);

/**
 * Render the bytebeat, writing out to the `error-msg` element if an error occurs.
 * @param {WebGL2RenderingContext} gl
 * @param {boolean} should_recompile if true, then recompile the shader
 */
export function render_or_compile(gl, should_recompile) {
   const params = get_ui_parameters();
   if (should_recompile) {
      try {
         BYTEBEAT_PROGRAM_INFO = compileBytebeat(gl, params.bytebeat);
         LAST_FRAME_TIME = Date.now();
         render_error_messages();
      } catch (err) {
         // @ts-ignore
         render_error_messages(err);
      }
   }

   if (BYTEBEAT_PROGRAM_INFO != null) {
      const now = Date.now();
      const delta_time = (now - LAST_FRAME_TIME) / 100.0;
      const time_scale = (Math.pow(2, params.time_scale * params.time_scale * 10.0) - 1) * Math.sign(params.time_scale);
      const frame_delta = delta_time * time_scale;
      CURRENT_FRAME = Math.max(0, CURRENT_FRAME + frame_delta);
      LAST_FRAME_TIME = now;
      const frame_int = Math.round(CURRENT_FRAME);

      let bytebeat_parameters = get_bytebeat_parameters();
      renderBytebeat(gl, BYTEBEAT_PROGRAM_INFO, bytebeat_parameters);
      time_scale_display.innerText = `${time_scale.toFixed(2)}x (Frame: ${frame_int})`;
   }
}

/**
 * @returns {import("./shader.js").BytebeatParams}
 */
function get_bytebeat_parameters() {
   let ui_params = get_ui_parameters();
   return {
      color: ui_params.color,
      wrap_value: ui_params.wrap_value,
      time: CURRENT_FRAME,
      mouse_x: MOUSE_X,
      mouse_y: MOUSE_Y,
      keyboard_x: KEYBOARD_X,
      keyboard_y: KEYBOARD_Y
   }
}

/**
 * Return the user parameters in a nicely parsed state.
 * @returns {typeof parameters}
 * @typedef {ReturnType<typeof get_ui_parameters>} Parameters
 */
function get_ui_parameters() {
   const parameters = {
      bytebeat: bytebeat_textarea.value,
      wrap_value: parseFloat(wrap_value_input.value),
      color: RGBColor.fromHexCode(color_input.value) ?? new RGBColor(0x00, 0xFF, 0x00),
      time_scale: parseFloat(time_scale_input.value),
      width: parseInt(canvas_size_x_input.value),
      height: parseInt(canvas_size_y_input.value),
   };
   return parameters;
}

/**
 * Convert a Parameters object into a StringParameters.
 * @param {Parameters} params
 * @returns {typeof stringy_params}
 * @typedef {ReturnType<typeof params_to_string>} StringParameters
 */
function params_to_string(params) {
   const stringy_params = {
      bytebeat: params.bytebeat,
      color: "#" + params.color.toHexString(),
      wrap_value: params.wrap_value.toFixed(0),
      time_scale: params.time_scale.toFixed(2),
      width: canvas_size_x_input.value,
      height: canvas_size_y_input.value,
   }
   return stringy_params;
}

/**
 * Set the UI from the given parameters.
 * @param {StringParameters} params 
 */
function set_ui(params) {
   bytebeat_textarea.value = params.bytebeat;
   wrap_value_input.value = params.wrap_value;
   time_scale_input.value = params.time_scale;
   color_input.value = params.color;
   canvas_size_x_input.value = params.width;
   canvas_size_y_input.value = params.height;
}

function update_coord_display() {
   coord_display.innerText = `Mouse: (${MOUSE_X.toFixed(0)}, ${MOUSE_Y.toFixed(0)})\nKeyboard: (${KEYBOARD_X}, ${KEYBOARD_Y})`;
}

function randomize_color() {
   const hue = Math.random();
   const saturation = Math.random();
   let random_color = `#${RGBColor.fromHSV(hue, saturation, 1.0).toHexString()}`
   color_input.value = random_color;
}


/**
 * Take a screenshot and save it to the screenshot_display element.
 * @param {WebGL2RenderingContext} gl
 * @param {HTMLCanvasElement} canvas
 */
function take_screenshot(gl, canvas) {
   // Force a render. This is needed due to the way WebGL works.
   // See the links below for more information.
   // https://stackoverflow.com/questions/32556939/saving-canvas-to-image-via-canvas-todataurl-results-in-black-rectangle?noredirect=1&lq=1
   // https://webglfundamentals.org/webgl/lessons/webgl-tips.html
   render_or_compile(gl, false);
   const image_data = canvas.toDataURL('png');
   screenshot_display.src = image_data;
   recorder.show_video_element("image");
}

function main() {
   bytebeat_textarea.addEventListener("input", () => render_or_compile(gl, true));
   wrap_value_input.addEventListener("input", () => render_or_compile(gl, false));
   color_input.addEventListener("input", () => render_or_compile(gl, false));
   time_scale_input.addEventListener("input", () => {
      render_or_compile(gl, false);
   });

   canvas_size_x_input.addEventListener("input", () => {
      canvas.width = parseInt(canvas_size_x_input.value);
      gl.viewport(0, 0, canvas.width, canvas.height);
   })

   canvas_size_y_input.addEventListener("input", () => {
      canvas.height = parseInt(canvas_size_y_input.value);
      gl.viewport(0, 0, canvas.width, canvas.height);
   })

   restart_button.addEventListener("click", () => {
      CURRENT_FRAME = 0;
      KEYBOARD_X = 0;
      KEYBOARD_Y = 0;
      render_or_compile(gl, false);
      update_coord_display();
   })

   randomize_button.addEventListener("click", () => {
      randomize_color();

      bytebeat_textarea.value = random_bytebeat();
      render_or_compile(gl, true);
   })

   mutate_button.addEventListener("click", () => {
      bytebeat_textarea.value = mutate_bytebeat(bytebeat_textarea.value);
      render_or_compile(gl, true);
   })

   share_button.addEventListener("click", () => {
      const params = get_ui_parameters();
      const stringy_params = {
         bytebeat: btoa(params.bytebeat),
         color: params.color.toHexString(),
         wrap_value: params.wrap_value.toFixed(0),
         time_scale: params.time_scale.toFixed(2),
         width: params.width.toString(),
         height: params.height.toString(),
      }
      const url = new URL(window.location.href);
      url.search = new URLSearchParams(stringy_params).toString();
      navigator.clipboard.writeText(url.toString());
      share_display.innerText = "Copied!";
      share_display.style.animation = "none";
      share_display.offsetHeight;
      share_display.style.animation = "fadeOut 1s forwards";
   })

   screenshot_button.addEventListener("click", () => {
      take_screenshot(gl, canvas);
   })

   // Handle mouse movements on the canvas
   canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      MOUSE_X = ((event.clientX - rect.left) / (rect.right - rect.left)) * canvas.width;
      MOUSE_Y = canvas.height - (((event.clientY - rect.top) / (rect.bottom - rect.top)) * canvas.height);

      update_coord_display();
   })

   // Take a screenshot on mouse press.
   canvas.addEventListener("click", () => take_screenshot(gl, canvas));

   // Start or stop recording
   canvas.addEventListener("keydown", (event) => {
      if (event.key == "r" || event.key == "R") {
         if (recorder.is_recording()) {
            recorder.stop();
         } else {
            if (event.shiftKey) {
               CURRENT_FRAME = 0;
            }
            recorder.start();
         }
      }
   })

   record_button.addEventListener("click", () => {
      const start_t_input = getTypedElementById(HTMLInputElement, "video-encoding-start-frame");
      const end_t_input = getTypedElementById(HTMLInputElement, "video-encoding-end-frame");

      const start_t = parseInt(start_t_input.value);
      const end_t = parseInt(end_t_input.value);

      if (BYTEBEAT_PROGRAM_INFO != null) {
         let { bytebeat, height, width } = get_ui_parameters();
         // seems that browsers throttle anything under 20ms/frame.
         recorder.manual_recording(bytebeat, get_bytebeat_parameters(), start_t, end_t, height, width, 20);
      } else {
         console.log("Couldn't record--BYTEBEAT_PROGRAM_INFO is null!");
      }
   })

   // Handle arrow keys
   window.addEventListener("keydown", (event) => {
      if (event.key == "ArrowLeft") {
         KEYBOARD_X -= 1;
      } else if (event.key == "ArrowRight") {
         KEYBOARD_X += 1;
      } else if (event.key == "ArrowUp") {
         KEYBOARD_Y += 1;
      } else if (event.key == "ArrowDown") {
         KEYBOARD_Y -= 1;
      }

      update_coord_display();
   })


   // Set the UI from the URL
   {
      let params = new URLSearchParams(window.location.search);
      let bytebeat = params.get("bytebeat");
      if (bytebeat) {
         try {
            let decoded = atob(bytebeat);
            // Check that the string is valid ASCII
            // Almost every valid program is probably going to be ASCII
            if (/^[\x00-\x7F]*$/.test(decoded)) {
               bytebeat = decoded;
            } else {
               console.log(`bytebeat is not valid ASCII when decoded as base64, assuming it's a raw bytebeat instead`);
            }
         } catch (e) {
            console.log(`bytebeat is not encoded as valid base64, assuming it's a raw bytebeat instead`);
         }
      } else {
         bytebeat = "(sx ^ sy) + t";
      }
      let color = params.get("color");
      let string_params = {
         bytebeat,
         color: color ? `#${color}` : "#00FF00",
         wrap_value: params.get("wrap_value") ?? "256",
         time_scale: params.get("time_scale") ?? "0.5",
         width: params.get("width") ?? "1024",
         height: params.get("height") ?? "1024",
      };
      set_ui(string_params);
   }
   canvas.width = parseInt(canvas_size_x_input.value);
   canvas.height = parseInt(canvas_size_y_input.value);
   gl.viewport(0, 0, canvas.width, canvas.height);

   render_or_compile(gl, true);
   animation_loop();
   update_coord_display();

   function animation_loop() {
      render_or_compile(gl, false);
      requestAnimationFrame(animation_loop);
   }
}

main();
