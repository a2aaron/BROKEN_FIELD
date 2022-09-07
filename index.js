import { Program } from "./ast.js";
import { mutate_bytebeat, random_bytebeat } from "./randomize.js";
import { Recorder } from "./recording.js";
import { compileBytebeat, get_fragment_shader_source, get_vertex_shader_source, renderBytebeat } from "./shader.js";
import { getTypedElementById, h, rem_euclid, render_error_messages, RGBColor, unwrap } from "./util.js";

/**
 * @typedef {import("./ast.js").UBInfo} UBInfo
 */

// HTML elements we wish to attach event handlers to.
// HTML elements we wish to reference
const canvas = getTypedElementById(HTMLCanvasElement, "canvas");

const bytebeat_textarea = getTypedElementById(HTMLTextAreaElement, "input");
const wrap_value_input = getTypedElementById(HTMLInputElement, "wrapping-value");
const color_input = getTypedElementById(HTMLInputElement, "color");
const time_scale_input = getTypedElementById(HTMLInputElement, "time-scale");
const time_scale_display = getTypedElementById(HTMLElement, "time-scale-display");

const time_start_input = getTypedElementById(HTMLInputElement, "time-start");
const time_end_input = getTypedElementById(HTMLInputElement, "time-end");

const canvas_size_x_input = getTypedElementById(HTMLInputElement, "canvas-size-x");
const canvas_size_y_input = getTypedElementById(HTMLInputElement, "canvas-size-y");

const precision_selection = getTypedElementById(HTMLSelectElement, "shader-precision-select");

const restart_button = getTypedElementById(HTMLButtonElement, "restart-btn");
const randomize_button = getTypedElementById(HTMLButtonElement, "randomize-btn");
const mutate_button = getTypedElementById(HTMLButtonElement, "mutate-btn");
const simplify_button = getTypedElementById(HTMLButtonElement, "simplify-btn");

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
/** @type {Program | Error | null} */
let PARSE_INFO = null;

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
 */
export function render(gl) {
   const params = get_ui_parameters();

   if (BYTEBEAT_PROGRAM_INFO != null) {
      const now = Date.now();
      const delta_time = (now - LAST_FRAME_TIME) / 100.0;
      const time_scale = (Math.pow(2, params.time_scale * params.time_scale * 10.0) - 1) * Math.sign(params.time_scale);
      const frame_delta = delta_time * time_scale;
      CURRENT_FRAME = CURRENT_FRAME + frame_delta;
      if (params.time_end) {
         if (params.time_start > CURRENT_FRAME || params.time_end < CURRENT_FRAME) {
            CURRENT_FRAME = rem_euclid(CURRENT_FRAME - params.time_start, params.time_end - params.time_start) + params.time_start;
         }
      }

      CURRENT_FRAME = isFinite(CURRENT_FRAME) ? CURRENT_FRAME : 0;

      LAST_FRAME_TIME = now;
      const frame_int = Math.trunc(CURRENT_FRAME);

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
      time_start: parseInt(time_start_input.value),
      time_end: time_end_input.value != "" ? parseInt(time_end_input.value) : null,
      precision: /** @type {import("./shader.js").Precision} */ (precision_selection.value),
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
      width: params.width.toString(),
      height: params.height.toString(),
      time_start: params.time_start.toString(),
      time_end: params.time_end ? params.time_end.toString() : "",
      precision: params.precision.toString(),
   }
   return stringy_params;
}

/**
 * Set the UI from the given parameters.
 * @param {StringParameters} params 
 */
function set_ui(params) {
   set_bytebeat(params.bytebeat);
   wrap_value_input.value = params.wrap_value;
   time_scale_input.value = params.time_scale;
   color_input.value = params.color;
   canvas_size_x_input.value = params.width;
   canvas_size_y_input.value = params.height;
   time_start_input.value = params.time_start;
   time_end_input.value = params.time_end;
   precision_selection.value = params.precision;
}

/**
 * Sets the current bytebeat. This function does the following things
 * - updates the UI (bytebeat_textarea, shader_source_display)
 * - attempts to compile the given bytebeat, setting BYTEBEAT_PROGRAM_INFO on success
 * - displays error messages on compilation failure
 * - display UB detection messages
 * @param {string} bytebeat
 */
function set_bytebeat(bytebeat) {
   const shader_source_textarea = getTypedElementById(HTMLTextAreaElement, "shader-source-display");
   const ub_display = getTypedElementById(HTMLPreElement, "ub-check-display");
   const parse_info_display = getTypedElementById(HTMLPreElement, "parse-info-display");
   bytebeat_textarea.value = bytebeat;

   const [programInfo, fsSource, compile_type] = compileBytebeat(gl, bytebeat, get_ui_parameters().precision);
   shader_source_textarea.value = fsSource;
   const program = Program.parse(bytebeat);
   if (programInfo instanceof Error) {
      render_error_messages(programInfo);
      BYTEBEAT_PROGRAM_INFO = null;
      ub_display.innerText = "";
   } else {
      render_error_messages();
      BYTEBEAT_PROGRAM_INFO = programInfo;
      PARSE_INFO = program;
      LAST_FRAME_TIME = Date.now();

      let ub_info = PARSE_INFO instanceof Program ? PARSE_INFO.ub_info : null;
      ub_display.innerText = ub_info ? get_ub_message(ub_info) : "";
   }

   parse_info_display.innerText = `Compiled Shader Type: ${compile_type}`;
   if (program instanceof Error) {
      // @ts-ignore
      const stream = program.cause?.stream;
      parse_info_display.innerText += `\nInternal Parser ${program}\nDebug Info: ${stream}\n${JSON.stringify(program.cause, undefined, 2)}`;
   } else {
      parse_info_display.innerText += `\nParsed as: ${program.toString("pretty")}`;
   }

   /**
    * Turn a UBInfo into a useful user message.
    * @param {UBInfo} ub_info
    */
   function get_ub_message(ub_info) {
      let { type, location } = ub_info;
      let ub_reason = "";
      switch (type) {
         case "divide by zero":
            ub_reason = "A divide by zero occurs here. (The denominator of your program always evaluates to zero)"
            break;
         case "overwide left shift":
            ub_reason = "A left shift occurs here where the value is shifted left by more than 32 bits"
            break;
      }
      return `Warning: Your program has undefined behavior!
This might mean that your program might display differently or not work on other computers.
   
The following part of your program exhibits the undefined behavior:

   ${location.toString("pretty")}

The reason for the undefined behavior is: ${ub_reason}.`;
   }
}

/**
 * Set the coordinates display to the current MOUSE/KEYBOARD values.
 */
function update_coord_display() {
   coord_display.innerText = `Mouse: (${MOUSE_X.toFixed(0)}, ${MOUSE_Y.toFixed(0)})\nKeyboard: (${KEYBOARD_X}, ${KEYBOARD_Y})`;
}

/**
 * Randomize the color_input value to a random color with a value of 1.0.
 * A value of 1.0 ensures the chosen color is not too dark.
 */
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
   render(gl);
   canvas.toBlob((blob) => {
      if (blob) {
         recorder.media_display.show_image(blob);
      }
   }, 'png');
}

/**
 * Add a button to the Randomization History dropdown. This takes a StringParameters and not just
 * a single bytebeat string in order to preserve the color/time controls/etc.
 * @param {StringParameters} params */
function add_bytebeat_history(params) {
   const history_list = getTypedElementById(HTMLUListElement, "equation-history");
   const node = h("li", {}, clickable_bytebeat(params));
   history_list.prepend(node);

   /** 
    * Create a clickable button that sets the current UI parameters to `params` when clicked.
    * @param {StringParameters} params */
   function clickable_bytebeat(params) {
      let button_text = params.bytebeat;
      if (button_text.length > 70) {
         button_text = button_text.substring(0, 70) + "...";
      }
      let button = h("button", {},
         h("code", {}, button_text)
      );

      button.onclick = () => {
         set_ui(params);
         render(gl);
      }
      return button
   }
}


function main() {
   bytebeat_textarea.addEventListener("input", () => {
      set_bytebeat(bytebeat_textarea.value);
   });
   wrap_value_input.addEventListener("input", () => render(gl));
   color_input.addEventListener("input", () => render(gl));
   time_scale_input.addEventListener("input", () => render(gl));

   precision_selection.addEventListener("input", () => set_bytebeat(bytebeat_textarea.value));

   canvas_size_x_input.addEventListener("input", () => {
      canvas.width = parseInt(canvas_size_x_input.value);
      gl.viewport(0, 0, canvas.width, canvas.height);
   })

   canvas_size_y_input.addEventListener("input", () => {
      canvas.height = parseInt(canvas_size_y_input.value);
      gl.viewport(0, 0, canvas.width, canvas.height);
   })

   restart_button.addEventListener("click", () => {
      CURRENT_FRAME = get_ui_parameters().time_start;
      KEYBOARD_X = 0;
      KEYBOARD_Y = 0;
      render(gl);
      update_coord_display();
   })

   randomize_button.addEventListener("click", () => {
      add_bytebeat_history(params_to_string(get_ui_parameters()));

      randomize_color();
      set_bytebeat(random_bytebeat());
   })

   mutate_button.addEventListener("click", () => {
      add_bytebeat_history(params_to_string(get_ui_parameters()));

      set_bytebeat(mutate_bytebeat(bytebeat_textarea.value));
   })

   simplify_button.addEventListener("click", () => {
      if (PARSE_INFO instanceof Program) {
         let simple = PARSE_INFO.simplify().toString("pretty");
         if (bytebeat_textarea.value != simple) {
            add_bytebeat_history(params_to_string(get_ui_parameters()));
            set_bytebeat(simple);
         }
      } else {
         console.log(PARSE_INFO);
      }
   });

   share_button.addEventListener("click", () => {
      const params = get_ui_parameters();

      let bytebeat = params.bytebeat;
      if (getTypedElementById(HTMLInputElement, "share-link-whitespace").checked) {
         const program = Program.parse(bytebeat);
         if (program instanceof Program) {
            bytebeat = program.toString("minimal");
         } else {
            bytebeat = bytebeat.replaceAll(" ", "");

         }
      }

      let stringy_params = {
         bytebeat: btoa(bytebeat),
      };

      add_if_not_default("color", params.color.toHexString(), "00ff00");
      add_if_not_default("start", params.time_start.toString(), "0");
      add_if_not_default("end", params.time_end == null ? "" : params.time_end.toString(), "");
      add_if_not_default("width", params.width, "1024");
      add_if_not_default("height", params.height, "1024");
      add_if_not_default("wrap_value", params.wrap_value, "256");
      add_if_not_default("time_scale", params.time_scale.toFixed(2), "0.50");
      add_if_not_default("precision", params.precision, "highp");

      // in case im on localhost
      let href = window.location.href.includes("localhost") ? "https://a2aaron.github.io/BROKEN_FIELD/" : window.location.href;
      const url = new URL(href);
      url.search = new URLSearchParams(stringy_params).toString();
      navigator.clipboard.writeText(url.toString());
      share_display.innerText = "Copied!";
      share_display.style.animation = "none";
      share_display.offsetHeight;
      share_display.style.animation = "fadeOut 1s forwards";

      /**
       * @param {string} key_name
       * @param {any} value
       * @param {any} default_value
       */
      function add_if_not_default(key_name, value, default_value) {
         if (value != default_value) {
            // @ts-ignore
            stringy_params[key_name] = value;
         }
      }
   })

   screenshot_button.addEventListener("click", () => take_screenshot(gl, canvas))
   // Take a screenshot on mouse press.
   canvas.addEventListener("click", () => take_screenshot(gl, canvas));

   // Handle mouse movements on the canvas
   canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      MOUSE_X = ((event.clientX - rect.left) / (rect.right - rect.left)) * canvas.width;
      MOUSE_Y = canvas.height - (((event.clientY - rect.top) / (rect.bottom - rect.top)) * canvas.height);

      update_coord_display();
   })

   // Start or stop recording
   canvas.addEventListener("keydown", (event) => {
      if (event.key == "r" || event.key == "R") {
         if (recorder.is_recording()) {
            recorder.stop();
         } else {
            if (event.shiftKey) {
               CURRENT_FRAME = get_ui_parameters().time_start;
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
         // seems that browsers throttle anything under 20ms/frame.
         recorder.manual_recording(get_bytebeat_parameters(), get_ui_parameters(), start_t, end_t, 20);
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
         time_start: params.get("start") ?? "0",
         time_end: params.get("end") ?? "",
         time_loop: params.get("loop") ?? "none",
         precision: params.get("precision") ?? "highp",
      };
      set_ui(string_params);
   }
   canvas.width = parseInt(canvas_size_x_input.value);
   canvas.height = parseInt(canvas_size_y_input.value);
   gl.viewport(0, 0, canvas.width, canvas.height);

   CURRENT_FRAME = get_ui_parameters().time_start;

   set_bytebeat(bytebeat_textarea.value);
   render(gl);
   animation_loop();
   update_coord_display();

   // Set the fragment/vertex shader source displays at the bottom of the page.
   getTypedElementById(HTMLPreElement, "fragment-shader-source").innerText = get_fragment_shader_source("${bytebeat}", [], "highp");
   getTypedElementById(HTMLPreElement, "vertex-shader-source").innerText = get_vertex_shader_source();

   function animation_loop() {
      render(gl);
      requestAnimationFrame(animation_loop);
   }
}

main();
