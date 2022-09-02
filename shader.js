import { Program } from "./parse.js";
import { unwrap } from "./util.js";

/**
 * Get the fragment shader source code.
 * @param {string} bytebeat
 */
export function get_fragment_shader_source(bytebeat) {
    let [core, additional_variables] = parse_program(bytebeat);

    let variable_text = "";
    for (const var_text of additional_variables) {
        variable_text += `    ${var_text};\n`;
    }

    return `#version 300 es
precision highp float;
precision highp int;

uniform float wrap_value;
uniform int t, mx, my, kx, ky;
uniform float t_f, mx_f, my_f, kx_f, ky_f;

uniform vec3 color;
out vec4 fragColor;

void main() {
    float sx_f = gl_FragCoord.x - 0.5;
    float sy_f = gl_FragCoord.y - 0.5;
    int sx = int(sx_f);
    int sy = int(sy_f);
${variable_text}
    int value = ${core};
    value = value % int(wrap_value);
    value = value < 0 ? value + int(wrap_value) : value;
    float value_out = float(value) / (wrap_value - 1.0);
    fragColor = vec4(value_out * color, 1.0);
}`;
}

/**
 * Get the vertex shader source code.
 */
export function get_vertex_shader_source() {
    return `#version 300 es
in vec4 aVertexPosition;

void main() {
    gl_Position = aVertexPosition;
}`;
}

/**
 * Turn a bytebeat containing variables into a bytebeat core and its additional variables.
 * @param {string} bytebeat 
 * @returns {[string, string[]]}
 */
function parse_program(bytebeat) {
    let split = bytebeat.split(";");
    console.assert(split.length > 0);

    const core = split[split.length - 1].trim();
    if (split.length == 1) {
        return [core, []];
    }

    const additional_variables = split.slice(0, split.length - 1).map((x) => x.trim());

    return [core, additional_variables];
}

/**
 * Load the given shader into the given context.
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
        let msg = `An error occurred compiling the ${shader_name} shader: ${gl.getShaderInfoLog(shader)}\n\n=== Shader Source ===\n\n${source}`;
        gl.deleteShader(shader);
        throw new Error(msg);
    }

    return shader;
}

/**
 * Initialize a WebGLProgram from the given vertex and fragment shaders.
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
 * Initialize a WebGL buffers containing a square. The square will cover the entire canvas
 * and is where we render our Bytebeat art.
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
 * @typedef {{
 *      wrap_value: number,
 *      time: number,
 *      color: import("./util.js").RGBColor,
 *      mouse_x: number,
 *      mouse_y: number,
 *      keyboard_x: number,
 *      keyboard_y: number,
 *  }} BytebeatParams
 */

/**
 * Set the uniforms for the bytebeat. This function is mainly used to pass values like mouse position
 * into the shader.
 * @param {WebGL2RenderingContext} gl
 * @param {ProgramInfo} programInfo
 * @param {BytebeatParams} params
 */
function setUniforms(gl, programInfo, params) {
    gl.useProgram(programInfo.program);
    gl.uniform1f(programInfo.uniforms.wrap_value, params.wrap_value);
    gl.uniform3fv(programInfo.uniforms.color, params.color.toFloat());

    gl.uniform1i(programInfo.uniforms.time, Math.trunc(params.time));
    gl.uniform1f(programInfo.uniforms.time_float, params.time);

    gl.uniform1f(programInfo.uniforms.mouse_x_float, params.mouse_x);
    gl.uniform1i(programInfo.uniforms.mouse_x, Math.trunc(params.mouse_x));

    gl.uniform1f(programInfo.uniforms.mouse_y_float, params.mouse_y);
    gl.uniform1i(programInfo.uniforms.mouse_y, Math.trunc(params.mouse_y));

    gl.uniform1f(programInfo.uniforms.keyboard_x_float, params.keyboard_x);
    gl.uniform1i(programInfo.uniforms.keyboard_x, Math.trunc(params.keyboard_x));

    gl.uniform1f(programInfo.uniforms.keyboard_y_float, params.keyboard_y);
    gl.uniform1i(programInfo.uniforms.keyboard_y, Math.trunc(params.keyboard_y));
}

/**
 * Render the given bytebeat.
 * @param {WebGL2RenderingContext} gl 
 * @param {number} positionAttributeIndex 
 */
function render(gl, positionAttributeIndex) {
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
            positionAttributeIndex,
            numComponents,
            type,
            normalize,
            stride,
            offset);
        gl.enableVertexAttribArray(
            positionAttributeIndex);
    }

    {
        const offset = 0;
        const vertexCount = 4;
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
    }
}

/**
 * Compile a Bytebeat. This returns a ProgramInfo containing the program and it's various buffer
 * locations.
 * @param {WebGL2RenderingContext} gl the context to render with
 * @param {string} bytebeat the bytebeat to render
 * @return {typeof programInfo}
 * @throws {Error} Throws is the bytebeat cannot be compiled.
 * @typedef {ReturnType<typeof compileBytebeat>} ProgramInfo
 */
export function compileBytebeat(gl, bytebeat) {
    const vsSource = get_vertex_shader_source();
    const fsSource = get_fragment_shader_source(bytebeat);

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
        uniforms: {
            color: gl.getUniformLocation(shaderProgram, "color"),
            wrap_value: gl.getUniformLocation(shaderProgram, "wrap_value"),
            time: gl.getUniformLocation(shaderProgram, "t"),
            time_float: gl.getUniformLocation(shaderProgram, "t_f"),
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
        },
    };

    initBuffers(gl);

    return programInfo;
}

/**
 * Render the bytebeat with the given parameters
 * @param {WebGL2RenderingContext} gl
 * @param {ProgramInfo} programInfo
 * @param {BytebeatParams} params
 */
export function renderBytebeat(gl, programInfo, params) {
    setUniforms(gl, programInfo, params);
    render(gl, programInfo.attribs.position);
}