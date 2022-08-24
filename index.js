import { getTypedElementById, render_error_messages, RGBColor, unwrap } from "./util.js";

// HTML elements we wish to attach event handlers to.
// HTML elements we wish to reference

const bytebeat_textarea = getTypedElementById(HTMLTextAreaElement, "input");
const wrap_value_input = getTypedElementById(HTMLInputElement, "wrapping-value");
const color_input = getTypedElementById(HTMLInputElement, "color");
const time_scale_input = getTypedElementById(HTMLInputElement, "time-scale");
const time_scale_display = getTypedElementById(HTMLElement, "time-scale-display");

const restart_button = getTypedElementById(HTMLButtonElement, "restart-btn");
const randomize_button = getTypedElementById(HTMLButtonElement, "randomize-btn");
const mutate_button = getTypedElementById(HTMLButtonElement, "mutate-btn");
const share_button = getTypedElementById(HTMLButtonElement, "share-btn");
const share_display = getTypedElementById(HTMLElement, "share-confirm");

const coord_display = getTypedElementById(HTMLElement, "coord-display");

// Global variables for the current bytebeat. This contains things like the current mouse/keyboard
// values, as well the currently loaded bytebeat

/**
 * @type {ProgramInfo | null}
 */
let BYTEBEAT_PROGRAM_INFO = null;
let MOUSE_X = 0;
let MOUSE_Y = 0;
let KEYBOARD_X = 0;
let KEYBOARD_Y = 0;

/**
 * Load the given shader into the given context
 * @param {WebGL2RenderingContext} gl the context to load the shader into
 * @param {number} type The type of shader being
 * compiled. This should be equal to gl.VERTEX_SHADER or gl.FRAGMENT_SHADER.
 * @param {string} source The source code of the shader to load.
 * @returns {WebGLShader} The compiled shader.
 * @throws {Error} Throws if the shader did not compile successfully.
 */
function loadShader(gl, type, source) {
   const shader = gl.createShader(type);
   if (shader == null) {
      throw new Error("Expected shader to be non-null!");
   }

   // Send the source to the shader object
   gl.shaderSource(shader, source);

   // Compile the shader program
   gl.compileShader(shader);

   // See if it compiled successfully
   if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      let shader_name = type == gl.VERTEX_SHADER ? "vertex" : "fragement";
      let msg = `An error occurred compiling the ${type} shader: ${gl.getShaderInfoLog(shader)}\n${source}`;
      gl.deleteShader(shader);
      throw new Error(msg);
   }

   return shader;
}

/**
 * 
 * @param {WebGL2RenderingContext} gl the context to load the program into
 * @param {string} vsSource The source of the vertex shader.
 * @param {string} fsSource The source of the fragment shader.
 * @returns {WebGLProgram} The compiled program.
 * @throws {Error} Throws if the program was unable to be compiled. 
 */
function initShaderProgram(gl, vsSource, fsSource) {
   const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
   const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

   // Create the shader program
   const shaderProgram = gl.createProgram();
   if (shaderProgram == null) {
      throw new Error("Expected gl.createProgram() to return a WebGLProgram, got null.");
   }

   gl.attachShader(shaderProgram, vertexShader);
   gl.attachShader(shaderProgram, fragmentShader);
   gl.linkProgram(shaderProgram);

   // If creating the shader program failed, alert
   if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      throw new Error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
   }

   return shaderProgram;
}

/**
 * Initialize a WebGL buffers containing a square.
 * @param {WebGL2RenderingContext} gl 
 * @returns {WebGLBuffer}
 */
function initBuffers(gl) {
   // Create a buffer for the square's positions.
   const positionBuffer = gl.createBuffer();
   if (positionBuffer == null) {
      throw new Error("Couldn't create a WebGLBuffer!");
   }

   // Select the positionBuffer as the one to apply buffer
   // operations to from here out.
   gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

   // Now create an array of positions for the square.
   const positions = [
      1.0, 1.0,
      -1.0, 1.0,
      1.0, -1.0,
      -1.0, -1.0,
   ];

   // Now pass the list of positions into WebGL to build the
   // shape. We do this by creating a Float32Array from the
   // JavaScript array, then use it to fill the current buffer.
   gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array(positions),
      gl.STATIC_DRAW);

   return positionBuffer;
}

/**
 * Draw the entire scene.
 * @param {WebGL2RenderingContext} gl 
 * @param {ProgramInfo} programInfo 
 */
function renderBytebeat(gl, programInfo) {
   // Set the clear color to solid black
   gl.clearColor(0.0, 0.0, 0.0, 1.0);
   // Set the clear value for the depth buffer
   gl.clearDepth(1.0);
   // Enable depth testing
   gl.enable(gl.DEPTH_TEST);
   // Set that near things obscure far things
   gl.depthFunc(gl.LEQUAL);

   // Clear the canvas before we start drawing on it.
   gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

   // Tell WebGL how to pull out the positions from the position
   // buffer into the vertexPosition attribute.
   {
      const numComponents = 2;  // pull out 2 values per iteration
      const type = gl.FLOAT;    // the data in the buffer is 32bit floats
      const normalize = false;  // don't normalize
      const stride = 0;         // how many bytes to get from one set of values to the next
      // 0 = use type and numComponents above
      const offset = 0;         // how many bytes inside the buffer to start from
      gl.vertexAttribPointer(
         programInfo.attribs.position,
         numComponents,
         type,
         normalize,
         stride,
         offset);
      gl.enableVertexAttribArray(
         programInfo.attribs.position);
   }

   {
      const offset = 0;
      const vertexCount = 4;
      gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
   }
}

/**
 * Render a bytebeat equation.
 * @param {WebGL2RenderingContext} gl the context to render with
 * @param {string} bytebeat the bytebeat to render
 * @param {number} init_frame the initial t value to use
 * @return {typeof programInfo}
 * @typedef {ReturnType<typeof compileBytebeat>} ProgramInfo
 */
function compileBytebeat(gl, bytebeat, init_frame) {
   const vsSource = `#version 300 es
   in vec4 aVertexPosition;

   void main() {
      gl_Position = aVertexPosition;
   }`;

   const fsSource = `#version 300 es
   precision mediump float;

   uniform float wrap_value;
   uniform int t;
   uniform float t_f;

   uniform int mx;
   uniform int my;
   uniform float mx_f;
   uniform float my_f;

   uniform int kx;
   uniform int ky;
   uniform float kx_f;
   uniform float ky_f;

   uniform vec3 color;
   out vec4 fragColor;

   void main() {
     float sx_f = gl_FragCoord.x - 0.5;
     float sy_f = gl_FragCoord.y - 0.5;
     int sx = int(sx_f);
     int sy = int(sy_f);
     int value = ${bytebeat};
     float value_out = float(value % int(wrap_value)) / wrap_value;
     fragColor = vec4(value_out * color, 1.0);
   }`;

   const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

   // programInfo contains the attribute and uniform locations, which is how we can interact with
   // the shader. (See the vertex shader for where these are used).
   // An attribute is a variable in the vertex shader and is available to JS. It is usually used for
   // model data, vertex coordinates, color information, etc. 
   // A varying is a variable that is declared by the vertex shader and passed to the fragment shader.
   // A uniform is a variable set up by JS, but remains constant across the whole frame. This usually
   // stores "global" information, like lighting information. It is available to the vertex and
   // fragment shader.
   // See also: https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Data
   const programInfo = {
      program: shaderProgram,
      last_time: Date.now(),
      frame: init_frame,
      uniforms: {
         color: gl.getUniformLocation(shaderProgram, "color"),
         wrap_value: gl.getUniformLocation(shaderProgram, "wrap_value"),
         time: gl.getUniformLocation(shaderProgram, "t"),
         time_float: gl.getUniformLocation(shaderProgram, "tf"),
         mouse_x: gl.getUniformLocation(shaderProgram, "mx"),
         mouse_y: gl.getUniformLocation(shaderProgram, "my"),
         mouse_x_float: gl.getUniformLocation(shaderProgram, "mx_f"),
         mouse_y_float: gl.getUniformLocation(shaderProgram, "my_f"),
         keyboard_x: gl.getUniformLocation(shaderProgram, "kx"),
         keyboard_y: gl.getUniformLocation(shaderProgram, "ky"),
         keyboard_x_float: gl.getUniformLocation(shaderProgram, "kx_f"),
         keyboard_y_float: gl.getUniformLocation(shaderProgram, "ky_f"),
      },
      attribs: {
         position: unwrap(gl.getAttribLocation(shaderProgram, "aVertexPosition")),
      }
   };

   initBuffers(gl);

   return programInfo;
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {ProgramInfo} programInfo
 * @param {number} wrap_value
 * @param {number} time
 * @param {import("./util.js").RGBColor} color
 * @param {number} mouse_x
 * @param {number} mouse_y
 * @param {number} keyboard_x
 * @param {number} keyboard_y
 */
function setUniforms(gl, programInfo, wrap_value, color, time, mouse_x, mouse_y, keyboard_x, keyboard_y) {
   gl.useProgram(programInfo.program);
   gl.uniform1f(programInfo.uniforms.wrap_value, wrap_value)
   gl.uniform3fv(programInfo.uniforms.color, color.toFloat());

   gl.uniform1i(programInfo.uniforms.time, Math.trunc(time));
   gl.uniform1f(programInfo.uniforms.time_float, time);

   gl.uniform1f(programInfo.uniforms.mouse_x_float, mouse_x);
   gl.uniform1i(programInfo.uniforms.mouse_x, Math.trunc(mouse_x));

   gl.uniform1f(programInfo.uniforms.mouse_y_float, mouse_y);
   gl.uniform1i(programInfo.uniforms.mouse_y, Math.trunc(mouse_y));

   gl.uniform1f(programInfo.uniforms.keyboard_x_float, keyboard_x);
   gl.uniform1i(programInfo.uniforms.keyboard_x, Math.trunc(keyboard_x));

   gl.uniform1f(programInfo.uniforms.keyboard_y_float, keyboard_y);
   gl.uniform1i(programInfo.uniforms.keyboard_y, Math.trunc(keyboard_y));
}

/**
 * Render the bytebeat, writing out to the `error-msg` element if an error occurs.
 * @param {WebGL2RenderingContext} gl
 * @param {boolean} should_recompile if true, then recompile the shader
 */
function on_event(gl, should_recompile) {
   const params = get_parameters();
   if (should_recompile) {
      try {
         BYTEBEAT_PROGRAM_INFO = compileBytebeat(gl, params.bytebeat, BYTEBEAT_PROGRAM_INFO?.frame ?? 0);
         render_error_messages();
      } catch (err) {
         // @ts-ignore
         render_error_messages(err);
      }
   }

   if (BYTEBEAT_PROGRAM_INFO != null) {
      const now = Date.now();
      const delta_time = (now - BYTEBEAT_PROGRAM_INFO.last_time) / 100.0;
      const time_scale = (Math.pow(2, params.time_scale * params.time_scale * 10.0) - 1) * Math.sign(params.time_scale);
      const frame_delta = delta_time * time_scale;
      BYTEBEAT_PROGRAM_INFO.frame = Math.max(0, BYTEBEAT_PROGRAM_INFO.frame + frame_delta);
      BYTEBEAT_PROGRAM_INFO.last_time = now;
      const frame_int = Math.round(BYTEBEAT_PROGRAM_INFO.frame);
      setUniforms(gl, BYTEBEAT_PROGRAM_INFO, params.wrap_value, params.color, BYTEBEAT_PROGRAM_INFO.frame,
         MOUSE_X, MOUSE_Y, KEYBOARD_X, KEYBOARD_Y);
      renderBytebeat(gl, BYTEBEAT_PROGRAM_INFO);
      time_scale_display.innerText = `${time_scale.toFixed(2)}x (Frame: ${frame_int})`;
   }
}


/**
 * Return the user parameters in a nicely parsed state.
 * @returns {typeof parameters}
 * @typedef {ReturnType<typeof get_parameters>} Parameters
 */
function get_parameters() {
   const parameters = {
      bytebeat: bytebeat_textarea.value,
      wrap_value: parseFloat(wrap_value_input.value),
      color: RGBColor.fromHexCode(color_input.value) ?? new RGBColor(0x00, 0xFF, 0x00),
      time_scale: parseFloat(time_scale_input.value),
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
}

function update_coord_display() {
   coord_display.innerText = `Mouse: (${MOUSE_X.toFixed(0)}, ${MOUSE_Y.toFixed(0)})\nKeyboard: (${KEYBOARD_X}, ${KEYBOARD_Y})`;
}

function main() {
   const canvas = getTypedElementById(HTMLCanvasElement, "canvas");
   const gl = unwrap(canvas.getContext("webgl2"));

   bytebeat_textarea.addEventListener("input", () => on_event(gl, true));
   wrap_value_input.addEventListener("input", () => on_event(gl, false));
   color_input.addEventListener("input", () => on_event(gl, false));
   time_scale_input.addEventListener("input", () => {
      on_event(gl, false);
   });

   restart_button.addEventListener("click", () => {
      if (BYTEBEAT_PROGRAM_INFO) {
         BYTEBEAT_PROGRAM_INFO.frame = 0;
      }
      KEYBOARD_X = 0;
      KEYBOARD_Y = 0;
      on_event(gl, false);
      update_coord_display();
   })

   randomize_button.addEventListener("click", () => {
      const colors = [
         "#FFFFFF",
         "#0000FF",
         "#00FF00",
         "#FF0000",
         "#FFFF00",
         "#FF00FF",
         "#00FFFF"];
      let random_color = colors[Math.floor(Math.random() * colors.length)];
      color_input.value = random_color;
      on_event(gl, true);
   })

   mutate_button.addEventListener("click", () => {
      alert("TODO!");
      on_event(gl, true);
   })

   share_button.addEventListener("click", () => {
      const params = get_parameters();
      const stringy_params = {
         bytebeat: btoa(params.bytebeat),
         color: params.color.toHexString(),
         wrap_value: params.wrap_value.toFixed(0),
         time_scale: params.time_scale.toFixed(2),
      }
      const url = new URL(window.location.href);
      url.search = new URLSearchParams(stringy_params).toString();
      navigator.clipboard.writeText(url.toString());
      share_display.innerText = "Copied!";
      share_display.style.animation = "none";
      share_display.offsetHeight;
      share_display.style.animation = "fadeOut 1s forwards";
   })

   // Handle mouse movements on the canvas
   canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      MOUSE_X = ((event.clientX - rect.left) / (rect.right - rect.left)) * canvas.width;
      MOUSE_Y = ((event.clientY - rect.top) / (rect.bottom - rect.top)) * canvas.height;

      update_coord_display();
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
            bytebeat = atob(bytebeat);
         } catch (e) {
            console.log(`bytebeat is not valid base64, assuming it's a raw bytebeat instead`);
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
      };
      set_ui(string_params);
   }

   on_event(gl, true);
   animation_loop();
   update_coord_display();

   function animation_loop() {
      on_event(gl, false);
      requestAnimationFrame(animation_loop);
   }
}

main();
