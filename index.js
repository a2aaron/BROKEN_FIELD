import { getTypedElementById } from "./util.js";

const CANVAS = getTypedElementById(HTMLCanvasElement, "canvas");
const TEXTAREA = getTypedElementById(HTMLTextAreaElement, "input");
const CTX = CANVAS.getContext("2d");

if (CTX == null) {
   console.error("Expected canvas context, got null.");
} else {
   console.log("Using canvas with dimensions: ", CANVAS.width, CANVAS.height);
   CTX.imageSmoothingEnabled = false;
   CTX.font = '50px serif';
   CTX.fillText("nya", CANVAS.width / 2, CANVAS.height / 2);
}