import { initEditor } from "./editor.js";
import { initUpdateCheck } from "./update-check.js";

const editor = initEditor();
initUpdateCheck(editor);
