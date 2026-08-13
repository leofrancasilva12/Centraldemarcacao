// Definições de tipo (JSDoc) para o modelo de dados do editor. Não gera
// nenhum código — servem só para checkJs (tsc) e autocomplete no editor.
// @ts-check

/**
 * @typedef {Object} TextField
 * @property {string} id
 * @property {"text"} type
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} size
 * @property {string} font
 * @property {string} weight
 * @property {"start"|"middle"|"end"} align
 * @property {number} rotation
 * @property {number} spacing
 * @property {boolean} uppercase
 */

/**
 * @typedef {Object} ImageField
 * @property {string} id
 * @property {"image"} type
 * @property {string} src
 * @property {string} originalSrc
 * @property {string} name
 * @property {number} naturalW
 * @property {number} naturalH
 * @property {number} bgTolerance
 * @property {number} bgFeather
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} rotation
 * @property {boolean} flipH
 * @property {boolean} flipV
 */

/**
 * @typedef {Object} ShapeField
 * @property {string} id
 * @property {"shape"} type
 * @property {"line"|"rect"|"frame"} shape
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} rotation
 * @property {number} stroke
 */

/**
 * @typedef {Object} CodeField
 * @property {string} id
 * @property {"code"} type
 * @property {"qr"|"code128"|"code39"} codeKind
 * @property {string} data
 * @property {boolean} showText
 * @property {boolean} quiet
 * @property {"L"|"M"|"Q"|"H"} qrEcl
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} rotation
 * @property {{key:string, value:*}} [_cache]
 */

/** @typedef {TextField|ImageField|ShapeField|CodeField} Field */

/**
 * @typedef {Object} EditorState
 * @property {number} plateW
 * @property {number} plateH
 * @property {Field[]} fields
 * @property {string[]} selectedIds
 * @property {number} zoom
 * @property {string|null} activeTemplateId
 */

/**
 * @typedef {Object} Template
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt
 * @property {number} plateW
 * @property {number} plateH
 * @property {Field[]} fields
 */

export {};
