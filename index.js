import { getTypedElementById, hexToRgb, render_error_messages, unwrap } from "./util.js";

const bytebeat_textarea = getTypedElementById(HTMLTextAreaElement, "input");
const wrap_value_input = getTypedElementById(HTMLInputElement, "wrapping-value");
const color_input = getTypedElementById(HTMLInputElement, "color");
const time_scale_input = getTypedElementById(HTMLInputElement, "time-scale");
const time_scale_display = getTypedElementById(HTMLElement, "time-scale-display");
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
 * @return {typeof programInfo}
 * @typedef {ReturnType<typeof compileBytebeat>} ProgramInfo
 */
function compileBytebeat(gl, bytebeat) {
   const vsSource = `#version 300 es
   in vec4 aVertexPosition;

   void main() {
      gl_Position = aVertexPosition;
   }`;

   const fsSource = `#version 300 es
   precision mediump float;

   uniform float wrap_value;
   uniform int t;

   uniform vec3 color;
   out vec4 fragColor;

   void main() {
     int sx = int(gl_FragCoord.x - 0.5);
     int sy = int(gl_FragCoord.y - 0.5);
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
      frame: 0,
      uniforms: {
         color: gl.getUniformLocation(shaderProgram, "color"),
         wrap_value: gl.getUniformLocation(shaderProgram, "wrap_value"),
         time: gl.getUniformLocation(shaderProgram, "t"),
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
 */
function setUniforms(gl, programInfo, wrap_value, color, time) {
   gl.useProgram(programInfo.program);
   gl.uniform1f(programInfo.uniforms.wrap_value, wrap_value)
   gl.uniform3fv(programInfo.uniforms.color, [color.r, color.g, color.b]);
   gl.uniform1i(programInfo.uniforms.time, time);
}


/**
 * @type {ProgramInfo | null}
 */
let BYTEBEAT_PROGRAM_INFO = null;

/**
 * Render the bytebeat, writing out to the `error-msg` element if an error occurs.
 * @param {WebGL2RenderingContext} gl
 * @param {boolean} should_recompile if true, then recompile the shader
 */
function on_event(gl, should_recompile) {
   const wrap_value = parseFloat(wrap_value_input.value);
   const color = hexToRgb(color_input.value) ?? { r: 0.0, g: 1.0, b: 1.0 };
   if (should_recompile) {
      try {
         const bytebeat = bytebeat_textarea.value;
         BYTEBEAT_PROGRAM_INFO = compileBytebeat(gl, bytebeat);
         render_error_messages();
      } catch (err) {
         // @ts-ignore
         render_error_messages(err);
      }
   }

   if (BYTEBEAT_PROGRAM_INFO != null) {
      const now = Date.now();
      const delta_time = (now - BYTEBEAT_PROGRAM_INFO.last_time) / 100.0;
      console.log(delta_time);
      let time_scale = parseFloat(time_scale_input.value);
      time_scale = (Math.pow(2, time_scale * time_scale * 10.0) - 1) * Math.sign(time_scale);
      const frame_delta = delta_time * time_scale;
      BYTEBEAT_PROGRAM_INFO.frame = Math.max(0, BYTEBEAT_PROGRAM_INFO.frame + frame_delta);
      BYTEBEAT_PROGRAM_INFO.last_time = now;
      const frame_int = Math.round(BYTEBEAT_PROGRAM_INFO.frame);

      setUniforms(gl, BYTEBEAT_PROGRAM_INFO, wrap_value, color, frame_int);
      renderBytebeat(gl, BYTEBEAT_PROGRAM_INFO);
      time_scale_display.innerText = `${time_scale.toFixed(2)}x (Frame: ${frame_int})`;
   }
}

function update_frame() {
   if (BYTEBEAT_PROGRAM_INFO == null) {
      return 0;
   }

}

function main() {
   const canvas = getTypedElementById(HTMLCanvasElement, "canvas");
   const gl = unwrap(canvas.getContext("webgl2"));

   console.log("Using canvas with dimensions: ", canvas.width, canvas.height);

   bytebeat_textarea.addEventListener("input", () => on_event(gl, true));
   wrap_value_input.addEventListener("input", () => on_event(gl, false));
   color_input.addEventListener("input", () => on_event(gl, false));
   time_scale_input.addEventListener("input", () => {
      on_event(gl, false);
   });
   on_event(gl, true);

   animation_loop();

   function animation_loop() {
      on_event(gl, false);
      requestAnimationFrame(animation_loop);
   }
}

main();
