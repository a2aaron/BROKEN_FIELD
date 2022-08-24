let ERROR_ELEMENT = document.getElementById("error-msg");

/**
 * Show the error messages associated with the given template.
 * @param {...Error} errors
 */
export function render_error_messages(...errors) {
    let message = "";

    for (let error of errors) {
        console.log(error);
        message += recursively_to_string(error);
        message += "\n\n";
    }

    if (ERROR_ELEMENT != null) {
        ERROR_ELEMENT.innerText = message.trimEnd();
    } else {
        console.log("error-msg element is missing!");
    }
}

/**
 * Transform an error to a string, recursing into the `causes` field if available.
 * @param {Error} err 
 * @return {string}
 */

export function recursively_to_string(err) {
    let string = err.message;
    if (err.cause) {
        string += recursively_to_string(err.cause);
    }
    return string;
}

/**
 * Yields pairs of (index, item) from an array.
 * @param {Array<T>} items An array of items
 * @returns {Generator<[number, T]>} a tuple of (index, item)
 * @template T
 */
export function* enumerate(items) {
    let i = 0;
    for (const item of items) {
        yield [i, item];
        i += 1;
    }
}

/**
 * Attempts to get an object from localStorage and parse it as JSON, falling back to a default value
 * if this fails.
 * @template T
 * @param {string} key the key in localStorage to look up
 * @param {T} fallback the fallback item to fall back to.
 * @returns {any | T} The parsed object from localStorage, or the fallback if that fails
 */
export function localStorageOrDefault(key, fallback) {
    let obj = localStorage.getItem(key);
    if (obj == null) {
        return fallback;
    }
    try {
        return JSON.parse(obj);
    } catch (err) {
        console.warn(err);
        return fallback;
    }
}

/** Constructs HTML elements
* @param {string} tag - The tag of the HTML element
* @param {object} attrs -A dictionary of the attributes of the element
* whose keys are the attribute names and the values are the attribute values.
* Note that the "value" key (a key whose name is literally "value") is
* special--this sets the `node.value` property instead of setting an attribute.
* @param {string | HTMLElement | Array<string | HTMLElement>} [body] - The body of the HTML element.
* @returns {HTMLElement} - The constructed HTML element
* You can recursively call `h` to achieve nested objects.
* Example:
* ```javascript
* h("div", { class: "foo" }, [
*   h("h1", { id: "bar" }, "Hello!"),
*   h("p", {}, "World!"),
* ])
* ```
* This produces the following HTML
* ```html
* <div class="foo">
*    <h1 id="bar">Hello!</h1>
*    <p>World!<p>
* </div>
* ```
*/
export function h(tag, attrs, body = []) {
    const element = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        // Special-case the value and have it set the actual node value
        if (k == "value") {
            // @ts-ignore
            element["value"] = v;
        } else {
            element.setAttribute(k, v);
        }
    }

    if (Array.isArray(body)) {
        element.append(...body);
    } else {
        element.append(body);
    }
    return element;
}

/**
 * @template ElementType
 * @param {any} object 
 * @param {Constructor<ElementType>} type The HTML element name to check for
 * @returns {asserts object is ElementType}
 */
export function assert_html_node(object, type) {
    if (!(object instanceof type)) {
        throw new Error(`expected ${object} to be HTML node of type ${type.name}. Got ${object.constructor.name} instead.`);
    }
}

/**
 * @template T
 * @typedef {new (...args: any[]) => T} Constructor
 */

/**
 * @template ElementType
 * @param {Constructor<ElementType>} ty
 * @param {string} id
 * @returns {ElementType}
 */
export function getTypedElementById(ty, id) {
    let element = document.getElementById(id);
    if (element == null) { throw new Error(`Element with id ${id} not found!`); }
    if (!(element instanceof ty)) {
        throw new Error(`Element with id ${id} is type ${element.constructor.name}, wanted ${ty}`);
    }
    return element;
}

export class RGBColor {
    /**
     * 
     * @param {number} r red channel, 0x00 to 0xFF range inclusive
     * @param {number} g green channel, 0x00 to 0xFF range inclusive
     * @param {number} b blue channel, 0x00 to 0xFF range inclusive
     */
    constructor(r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
    }

    /**
     * 
     * @param {string} hex_code 
     * @returns {RGBColor | null}
     */
    static fromHexCode(hex_code) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex_code);
        if (result) {
            return new RGBColor(parseInt(result[1], 16),
                parseInt(result[2], 16),
                parseInt(result[3], 16));
        } else {
            return null;
        }
    }

    /**
     * Turns an RGBColor into [0.0 - 1.0] float triple.
     * @returns {[number, number, number]}
     */
    toFloat() {
        return [this.r / 0xFF, this.g / 0xFF, this.b / 0xFF];
    }

    /**
     * Turn a RGBColor into a hex string. Does not include the #.
     * @returns {string}
     */
    toHexString() {
        return `${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`;
        /**
         * @param {number} c
         */
        function toHex(c) {
            var hex = c.toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        }
    }
}

/**
 * @template T
 * @param {T | null} x
 * @return {T}
 */
export function unwrap(x) {
    if (x == null) {
        throw new Error("Unwrapped a null value!");
    }
    return x;
}